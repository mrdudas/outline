import { action, observable } from "mobx";
import { DOMParser as ProseDOMParser } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import Extension from "@shared/editor/lib/Extension";
import type { CommandFactory, WidgetProps } from "@shared/editor/lib/Extension";
import { client } from "~/utils/ApiClient";
import CitationSearch from "../components/CitationSearch";

type ZoteroState = {
    /** Whether the citation picker dialog is currently open. */
    open: boolean;
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
    protected state: ZoteroState = observable({
        open: false,
    });

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
     * Inserts a Citation node for the selected Zotero item at the saved cursor
     * position. Called by the CitationSearch component on item selection.
     *
     * @param key - Zotero item key.
     * @param text - formatted inline citation label (e.g. "Smith et al., 2020").
     * @param title - article or book title (used as tooltip).
     */
    public insertCitationNode(key: string, text: string, title: string) {
        const { view } = this.editor;
        const { state } = view;
        const citationType = state.schema.nodes.citation;

        if (!citationType) {
            return;
        }

        const node = citationType.create({ key, text, title });
        const tr = state.tr.replaceSelectionWith(node);
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
                { keys }
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
            tr.replaceRange(existingRange.from, existingRange.to, fragment.content);
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
        <CitationSearch
            isOpen={this.state.open}
            onClose={action(() => {
                this.state.open = false;
            })}
            onSelect={(key, text, title) => {
                action(() => {
                    this.state.open = false;
                })();
                this.insertCitationNode(key, text, title);
            }}
        />
    );
}
