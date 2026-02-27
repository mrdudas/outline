import type { NodeSpec, Node as ProsemirrorNode } from "prosemirror-model";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import Node from "./Node";

/**
 * Zotero bibliography block node.
 *
 * A block-level container whose children are the formatted bibliography
 * entries (paragraphs and lists) generated from the Zotero API.  The node
 * remembers the CSL style and locale used so that it can be refreshed in
 * place without re-entering settings.
 *
 * In markdown, the bibliography block is **not** preserved – it is designed
 * to be regenerated from the inline citation nodes at any time.
 */
export default class ZoteroBibliography extends Node {
    get name() {
        return "zoteroBibliography";
    }

    get schema(): NodeSpec {
        return {
            group: "block",
            content: "block+",
            attrs: {
                /** CSL style identifier used to generate this bibliography. */
                style: { default: "apa" },
                /** BCP-47 locale used to generate this bibliography. */
                locale: { default: "en-US" },
            },
            parseDOM: [
                {
                    tag: "div[data-zotero-bibliography]",
                    getAttrs: (dom: HTMLElement) => ({
                        style: dom.dataset.style ?? "apa",
                        locale: dom.dataset.locale ?? "en-US",
                    }),
                },
            ],
            toDOM: (node: ProsemirrorNode) => [
                "div",
                {
                    "data-zotero-bibliography": "true",
                    "data-style": node.attrs.style,
                    "data-locale": node.attrs.locale,
                    class: "zotero-bibliography",
                },
                0,
            ],
        };
    }

    /**
     * Bibliography is always regenerated from citation nodes; it is not
     * round-tripped through markdown.
     *
     * @param _state - markdown serializer state (unused).
     * @param _node - the bibliography node (unused).
     */
    toMarkdown(_state: MarkdownSerializerState, _node: ProsemirrorNode) {
        // Intentionally empty – the block is ephemeral in markdown.
    }
}
