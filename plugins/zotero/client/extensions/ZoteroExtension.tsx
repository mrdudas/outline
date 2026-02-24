import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Fragment, Slice } from "prosemirror-model";
import { DOMParser as ProseDOMParser } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import Extension from "@shared/editor/lib/Extension";
import type { CommandFactory, WidgetProps } from "@shared/editor/lib/Extension";
import { IntegrationType, IntegrationService } from "@shared/types";
import * as React from "react";
import { client } from "~/utils/ApiClient";
import useCurrentUser from "~/hooks/useCurrentUser";
import useStores from "~/hooks/useStores";
import type { SelectedCitation, CitationMode } from "../components/CitationSearch";
import CitationSearch from "../components/CitationSearch";

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
    private async fetchAndInsertBibliography(
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
     * Parses the bibliography HTML and inserts / replaces the bibliography block.
     *
     * @param html - XHTML bibliography returned by the Zotero API.
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

        const fragment = ProseDOMParser.fromSchema(schema).parse(container);

        // Try to locate an existing bibliography block by the anchor comment
        const existingRange = this.findBibliographyRange(freshState);
        const tr = freshState.tr;

        if (existingRange) {
            tr.replaceRange(
                existingRange.from,
                existingRange.to,
                new Slice(fragment.content, 0, 0)
            );
        } else {
            // Insert at the current cursor (saved before the async gap)
            const insertFrom = state.selection.to;
            tr.insert(insertFrom, fragment.content);
        }

        dispatch(tr);
        this.editor.view.focus();
    }

    /**
     * Finds the position range of an existing bibliography block in the document.
     * Identifies it by looking for a `data-zotero-bibliography` attribute on a
     * paragraph or div node.
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
            if (node.attrs?.["data-zotero-bibliography"]) {
                result = { from: pos, to: pos + node.nodeSize };
                return false;
            }
            return true;
        });
        return result;
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
    widget = (_props: WidgetProps) => (
        <CitationWidget extension={this} />
    );
}

type CitationWidgetProps = {
    extension: ZoteroExtension;
};

/**
 * Inner React component that is allowed to call hooks.
 * Reads the Zotero integration settings and syncs them into the extension
 * observable state, then renders the CitationSearch dialog.
 */
const CitationWidget = observer(function CitationWidget({ extension }: CitationWidgetProps) {
    const { integrations } = useStores();
    const user = useCurrentUser();

    React.useEffect(() => {
        const integration = integrations.orderedData.find(
            (i) =>
                i.type === IntegrationType.LinkedAccount &&
                i.service === IntegrationService.Zotero &&
                (i as any).userId === user.id
        );
        const settings = ((integration?.settings as any)?.zotero) as ZoteroSettings | undefined;
        action(() => {
            extension.state.style = settings?.defaultStyle ?? "apa";
            extension.state.locale = settings?.defaultLocale ?? "en-US";
        })();
    }, [integrations.orderedData, user.id, extension]);

    return (
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
    );
});
