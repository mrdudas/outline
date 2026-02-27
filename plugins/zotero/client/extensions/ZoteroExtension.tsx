import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Fragment } from "prosemirror-model";
import { DOMParser as ProseDOMParser } from "prosemirror-model";
import type { Command, EditorState, Plugin as PMPlugin } from "prosemirror-state";
import { NodeSelection, Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import Extension from "@shared/editor/lib/Extension";
import type { CommandFactory, WidgetProps } from "@shared/editor/lib/Extension";
import { IntegrationType, IntegrationService } from "@shared/types";
import * as React from "react";
import styled from "styled-components";
import { s } from "@shared/styles";
import { client } from "~/utils/ApiClient";
import useCurrentUser from "~/hooks/useCurrentUser";
import useStores from "~/hooks/useStores";
import type { SelectedCitation, CitationMode } from "../components/CitationSearch";
import CitationSearch from "../components/CitationSearch";
import CitationPopover from "../components/CitationPopover";

/** Maps ISO 639-1 language codes to default CSL locale BCP-47 tags. */
const ISO_TO_CSL_LOCALE: Record<string, string> = {
    af: "af-ZA", ar: "ar", bg: "bg-BG", ca: "ca-AD",
    cs: "cs-CZ", cy: "cy-GB", da: "da-DK", de: "de-DE",
    el: "el-GR", en: "en-US", es: "es-ES", et: "et-EE",
    eu: "eu", fa: "fa-IR", fi: "fi-FI", fr: "fr-FR",
    he: "he-IL", hr: "hr-HR", hu: "hu-HU", id: "id-ID",
    is: "is-IS", it: "it-IT", ja: "ja-JP", ko: "ko-KR",
    lt: "lt-LT", lv: "lv-LV", mn: "mn-MN", nb: "nb-NO",
    nl: "nl-NL", nn: "nn-NO", pl: "pl-PL", pt: "pt-PT",
    ro: "ro-RO", ru: "ru-RU", sk: "sk-SK", sl: "sl-SI",
    sq: "sq-AL", sr: "sr-RS", sv: "sv-SE", th: "th-TH",
    tr: "tr-TR", uk: "uk-UA", vi: "vi-VN", zh: "zh-CN",
};

/**
 * Maps an ISO 639-1 language code to the default CSL/BCP-47 locale tag.
 * Falls back to constructing "xx-XX" or "en-US" for unknown codes.
 *
 * @param lang - ISO 639-1 language code, e.g. "hu".
 * @returns BCP-47 locale tag, e.g. "hu-HU".
 */
function langToCSLLocale(lang: string | undefined | null): string {
    if (!lang) {
        return "en-US";
    }
    const lower = lang.toLowerCase();
    return ISO_TO_CSL_LOCALE[lower] ?? `${lower}-${lower.toUpperCase()}`;
}

type ZoteroSettings = {
    defaultStyle?: string;
    defaultLocale?: string;
};

type ZoteroState = {
    /** Whether the citation picker dialog is currently open. */
    open: boolean;
    /** Default CSL style for bibliography generation (from integration settings). */
    style: string;
    /** Default locale for bibliography formatting (from integration settings). */
    locale: string;
    /**
     * When a citation node is selected (NodeSelection), stores its document
     * position and current mode so the popover can be rendered.
     */
    selectedCitation: { pos: number; mode: CitationMode } | null;
    /** When the cursor is inside the bibliography block, stores its document position. */
    selectedBibliographyPos: number | null;
};

/**
 * Editor extension that adds Zotero citation integration.
 *
 * Provides two commands:
 * - `insertCitation` – opens a search dialog to pick a Zotero item and
 *   inserts an inline citation node at the current cursor position.
 * - `insertBibliography` – scans the document for all citation nodes,
 *   fetches a formatted bibliography from the server proxy and inserts it
 *   (or refreshes an existing bibliography block) at the current cursor.
 */
export default class ZoteroExtension extends Extension {
    get name() {
        return "zotero";
    }

    /** Observable state shared with the CitationSearch widget. */
    public state: ZoteroState = observable({
        open: false,
        style: "apa",
        locale: "en-US",
        selectedCitation: null,
        selectedBibliographyPos: null,
    });

    /**
     * Returns the two editor commands exposed by this extension.
     *
     * - `insertCitation` – opens the citation search dialog.
     * - `insertBibliography` – collects all citation keys from the document
     *   and inserts / refreshes a formatted bibliography block.
     *
     * @returns map of command name → factory function.
     */
    commands(): Record<string, CommandFactory> {
        return {
            insertCitation: (): Command => (_state, dispatch) => {
                if (!dispatch) {
                    return true;
                }
                action(() => {
                    this.state.open = true;
                })();
                return true;
            },

            insertBibliography: (): Command => (state, dispatch) => {
                if (!dispatch) {
                    return true;
                }
                void this.fetchAndInsertBibliography(state, dispatch);
                return true;
            },
        };
    }

    /**
     * ProseMirror plugins registered by this extension.
     *
     * Adds a view-plugin that tracks when either:
     * - a `citation` node is selected (NodeSelection) → shows the inline
     *   mode-toggle / delete popover, or
     * - the cursor is inside a `zoteroBibliography` block → shows the
     *   Refresh button.
     *
     * @returns array with a single view-tracking plugin.
     */
    get plugins(): PMPlugin[] {
        const ext = this;
        return [
            new Plugin({
                view() {
                    return {
                        update(editorView: EditorView) {
                            const { selection } = editorView.state;
                            if (
                                selection instanceof NodeSelection &&
                                selection.node.type.name === "citation"
                            ) {
                                action(() => {
                                    ext.state.selectedCitation = {
                                        pos: selection.from,
                                        mode: selection.node.attrs
                                            .mode as CitationMode,
                                    };
                                    ext.state.selectedBibliographyPos = null;
                                })();
                            } else {
                                let bibPos: number | null = null;
                                const { $from } = selection;
                                for (let d = $from.depth; d >= 0; d--) {
                                    const ancestor = $from.node(d);
                                    if (
                                        ancestor.type.name ===
                                        "zoteroBibliography"
                                    ) {
                                        bibPos = $from.before(d);
                                        break;
                                    }
                                }
                                action(() => {
                                    ext.state.selectedCitation = null;
                                    ext.state.selectedBibliographyPos = bibPos;
                                })();
                            }
                        },
                        destroy() {
                            action(() => {
                                ext.state.selectedCitation = null;
                                ext.state.selectedBibliographyPos = null;
                            })();
                        },
                    };
                },
            }),
        ];
    }

    /**
     * Inserts one or more Citation nodes for the selected Zotero items at the
     * current cursor position. Multiple items are inserted as separate inline
     * nodes within a single transaction.
     *
     * @param items - array of citations to insert.
     */
    public insertCitationNodes(items: SelectedCitation[]) {
        const { view } = this.editor;
        const freshState = view.state;
        const schema = freshState.schema;
        const citationType = schema.nodes.citation;

        if (!citationType || items.length === 0) {
            return;
        }

        const nodes = items.map(({ key, text, title, mode }) =>
            citationType.create({ key, text, title, mode: mode ?? "parenthetical" })
        );

        const { from, to } = freshState.selection;
        const frag = Fragment.from(nodes);
        const tr = freshState.tr.replaceWith(from, to, frag);
        view.dispatch(tr);
        view.focus();
    }

    /**
     * Collects all citation keys from the document, calls the server bibliography
     * proxy, then inserts/refreshes the bibliography block at the current cursor.
     *
     * @param state - the current editor state.
     * @param dispatch - the ProseMirror dispatch function.
     */
    public async fetchAndInsertBibliography(
        state: EditorState,
        dispatch: (tr: ReturnType<EditorState["tr"]["replaceSelectionWith"]>) => void
    ) {
        const keys = this.collectCitationKeys(state);

        if (keys.length === 0) {
            return;
        }

        let html: string;

        try {
            const data = await client.post<{ data: { bibliography: string } }>(
                "/zotero.bibliography",
                { keys, style: this.state.style, locale: this.state.locale }
            );
            html = data.data.bibliography;
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[Zotero] Failed to fetch bibliography:", err);
            return;
        }

        this.insertBibliographyHtml(html, state, dispatch);
    }

    /**
     * Parses the bibliography HTML, wraps it in a `zoteroBibliography` block
     * node, and inserts or replaces the existing block.
     *
     * @param html - HTML bibliography returned by the Zotero API.
     * @param state - current editor state at call time.
     * @param dispatch - dispatch function.
     */
    private insertBibliographyHtml(
        html: string,
        state: EditorState,
        dispatch: (tr: any) => void
    ) {
        const container = document.createElement("div");
        container.innerHTML = html;

        // Re-read fresh state so positions are accurate after the async gap.
        const freshState = this.editor.view.state;
        const schema = freshState.schema;

        const innerFrag = ProseDOMParser.fromSchema(schema).parse(container);
        const bibType = schema.nodes.zoteroBibliography;

        const bibNode = bibType
            ? bibType.create(
                { style: this.state.style, locale: this.state.locale },
                innerFrag.content
            )
            : innerFrag.content; // fallback: insert raw nodes when schema is missing

        const existingRange = this.findBibliographyRange(freshState);
        const tr = freshState.tr;

        if (existingRange) {
            if (bibType) {
                tr.replaceWith(existingRange.from, existingRange.to, bibNode as any);
            }
        } else {
            const insertFrom = state.selection.to;
            tr.insert(insertFrom, bibNode as any);
        }

        dispatch(tr);
        this.editor.view.focus();
    }

    /**
     * Finds the position range of the `zoteroBibliography` block node.
     *
     * @param state - editor state to search.
     * @returns `{ from, to }` node position range, or undefined.
     */
    private findBibliographyRange(
        state: EditorState
    ): { from: number; to: number } | undefined {
        let result: { from: number; to: number } | undefined;
        state.doc.descendants((node, pos) => {
            if (result) {
                return false;
            }
            if (node.type.name === "zoteroBibliography") {
                result = { from: pos, to: pos + node.nodeSize };
                return false;
            }
            return true;
        });
        return result;
    }

    /**
     * Changes the mode of a citation node in the document, updating both the
     * `mode` attribute and the stored label text.
     *
     * @param pos - position of the citation node in the document.
     * @param newMode - target mode ("parenthetical" or "narrative").
     */
    public toggleCitationMode(pos: number, newMode: CitationMode) {
        const { view } = this.editor;
        const state = view.state;
        const node = state.doc.nodeAt(pos);
        if (!node || node.type.name !== "citation") {
            return;
        }
        const currentMode = node.attrs.mode as CitationMode;
        const newText = convertTextBetweenModes(
            node.attrs.text as string,
            currentMode,
            newMode
        );
        const tr = state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            mode: newMode,
            text: newText,
        });
        view.dispatch(tr);
        view.focus();
    }

    /**
     * Removes the citation node at the given document position.
     *
     * @param pos - position of the citation node in the document.
     */
    public deleteCitation(pos: number) {
        const { view } = this.editor;
        const state = view.state;
        const node = state.doc.nodeAt(pos);
        if (!node || node.type.name !== "citation") {
            return;
        }
        const tr = state.tr.delete(pos, pos + node.nodeSize);
        view.dispatch(tr);
        view.focus();
    }

    /**
     * Re-fetches the bibliography from the server and replaces the existing
     * bibliography block in the document.
     */
    public refreshBibliography() {
        const { view } = this.editor;
        void this.fetchAndInsertBibliography(view.state, view.dispatch.bind(view));
    }

    /**
     * Walks the document and collects the keys of all inline Citation nodes.
     *
     * @param state - editor state.
     * @returns array of unique Zotero item keys.
     */
    private collectCitationKeys(state: EditorState): string[] {
        const keys: string[] = [];
        const seen = new Set<string>();

        state.doc.descendants((node) => {
            if (node.type.name === "citation") {
                const key = node.attrs.key as string;
                if (key && !seen.has(key)) {
                    seen.add(key);
                    keys.push(key);
                }
            }
            return true;
        });

        return keys;
    }

    /** Rendered inside the editor to host the citation search overlay. */
    widget = (_props: WidgetProps) => <CitationWidget extension={this} />;
}

/**
 * Converts the stored citation label between parenthetical and narrative modes.
 *
 * @param text - current label text.
 * @param fromMode - current mode.
 * @param toMode - target mode.
 * @returns reformatted label text.
 */
function convertTextBetweenModes(
    text: string,
    fromMode: CitationMode,
    toMode: CitationMode
): string {
    if (fromMode === toMode) {
        return text;
    }
    if (fromMode === "parenthetical" && toMode === "narrative") {
        // "Smith, 2020" → "Smith (2020)"
        const match = /^(.+),\s*(\d{4})$/.exec(text);
        if (match) {
            return `${match[1]} (${match[2]})`;
        }
        return text;
    }
    // narratve → parenthetical: "Smith (2020)" → "Smith, 2020"
    const match = /^(.+?)\s+\((\d{4})\)$/.exec(text);
    if (match) {
        return `${match[1]}, ${match[2]}`;
    }
    return text;
}

type CitationWidgetProps = {
    extension: ZoteroExtension;
};

/**
 * Inner React component that is allowed to call hooks.
 * Reads the Zotero integration settings and syncs them into the extension
 * observable state, then renders the CitationSearch dialog, the citation
 * mode-toggle/delete popover, and the bibliography refresh button.
 */
const CitationWidget = observer(function CitationWidget({ extension }: CitationWidgetProps) {
    const { integrations, documents } = useStores();
    const user = useCurrentUser();

    // Sync integration settings and document language into state.style / state.locale.
    // Priority for locale: explicit integration default → document language → "en-US".
    React.useEffect(() => {
        const integration = integrations.orderedData.find(
            (i) =>
                i.type === IntegrationType.LinkedAccount &&
                i.service === IntegrationService.Zotero &&
                (i as any).userId === user.id
        );
        const settings = ((integration?.settings as any)?.zotero) as ZoteroSettings | undefined;
        const docLang = documents.active?.language;
        action(() => {
            extension.state.style = settings?.defaultStyle ?? "apa";
            extension.state.locale =
                settings?.defaultLocale ||
                (docLang ? langToCSLLocale(docLang) : "en-US");
        })();
    }, [integrations.orderedData, documents.active?.language, user.id, extension]);

    // When the cursor enters a bibliography block, sync its stored locale into state
    // so subsequent refreshes use the locale previously saved in that block.
    React.useEffect(() => {
        const bibPos = extension.state.selectedBibliographyPos;
        if (bibPos === null) {
            return;
        }
        const { view } = extension.editor;
        if (!view) {
            return;
        }
        const node = view.state.doc.nodeAt(bibPos);
        if (node?.type.name === "zoteroBibliography" && node.attrs.locale) {
            action(() => {
                extension.state.locale = node.attrs.locale as string;
            })();
        }
    }, [extension.state.selectedBibliographyPos, extension]);

    // Local state for the locale field shown inside the refresh bar.
    const [localeInput, setLocaleInput] = React.useState(extension.state.locale);
    React.useEffect(() => {
        setLocaleInput(extension.state.locale);
    }, [extension.state.locale]);

    const handleRefresh = React.useCallback(() => {
        action(() => {
            extension.state.locale = localeInput;
        })();
        extension.refreshBibliography();
    }, [extension, localeInput]);

    const sel = extension.state.selectedCitation;

    return (
        <>
            <CitationSearch
                isOpen={extension.state.open}
                onClose={action(() => {
                    extension.state.open = false;
                })}
                onSelect={(items: SelectedCitation[], _mode: CitationMode) => {
                    action(() => {
                        extension.state.open = false;
                    })();
                    extension.insertCitationNodes(items);
                }}
            />
            {sel !== null && (
                <CitationPopover
                    pos={sel.pos}
                    mode={sel.mode}
                    view={extension.editor.view}
                    onSetMode={(newMode) => {
                        extension.toggleCitationMode(sel.pos, newMode);
                        action(() => {
                            extension.state.selectedCitation = {
                                pos: sel.pos,
                                mode: newMode,
                            };
                        })();
                    }}
                    onDelete={() => {
                        extension.deleteCitation(sel.pos);
                    }}
                />
            )}
            {extension.state.selectedBibliographyPos !== null && (
                <BibliographyRefreshBar>
                    <LocaleInput
                        value={localeInput}
                        onChange={(e) => setLocaleInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                handleRefresh();
                            }
                        }}
                        title="Bibliography locale (e.g. hu-HU)"
                        aria-label="Bibliography locale"
                        spellCheck={false}
                    />
                    <RefreshButton onClick={handleRefresh}>
                        ↻ Refresh
                    </RefreshButton>
                </BibliographyRefreshBar>
            )}
        </>
    );
});

const BibliographyRefreshBar = styled.div`
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    pointer-events: all;

    @media print {
        display: none;
    }
`;

const LocaleInput = styled.input`
    background: transparent;
    border: none;
    border-bottom: 1px solid ${s("divider")};
    color: ${s("text")};
    font-size: 12px;
    padding: 2px 4px;
    width: 80px;
    outline: none;
    text-align: center;

    &:focus {
        border-bottom-color: ${s("accent")};
    }
`;

const RefreshButton = styled.button`
    background: ${s("menuBackground")};
    box-shadow: ${s("menuShadow")};
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 13px;
    cursor: pointer;
    color: ${s("text")};
    white-space: nowrap;

    &:hover {
        background: ${s("listItemHoverBackground")};
    }
`;
