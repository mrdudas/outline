import type { Token } from "markdown-it";
import type { NodeSpec, Node as ProsemirrorNode } from "prosemirror-model";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import Node from "./Node";

/**
 * Zotero inline citation node.
 *
 * Stores a reference to a Zotero library item. In documents, citations are
 * represented as inline atoms that display a formatted citation label. In
 * markdown they are encoded as links with a `zotero://` scheme, e.g.:
 *
 *   [Smith et al., 2020](zotero://ITEM_KEY)
 */
export default class Citation extends Node {
    get name() {
        return "citation";
    }

    get schema(): NodeSpec {
        return {
            attrs: {
                /** Zotero item key, e.g. "ABCD1234" */
                key: {},
                /** Formatted inline citation label, e.g. "Smith et al., 2020" */
                text: { default: "" },
                /** Article or book title, used as a tooltip */
                title: { default: "" },
            },
            inline: true,
            marks: "",
            group: "inline",
            atom: true,
            parseDOM: [
                {
                    tag: "span.citation",
                    priority: 100,
                    getAttrs: (dom: HTMLElement) => {
                        const key = dom.dataset.key;
                        if (!key) {
                            return false;
                        }
                        return {
                            key,
                            text: dom.dataset.text ?? "",
                            title: dom.dataset.title ?? "",
                        };
                    },
                },
            ],
            toDOM: (node: ProsemirrorNode) => [
                "span",
                {
                    class: "citation",
                    "data-key": node.attrs.key,
                    "data-text": node.attrs.text,
                    "data-title": node.attrs.title,
                    title: node.attrs.title || undefined,
                },
                `[${node.attrs.text || node.attrs.key}]`,
            ],
        };
    }

    get rulePlugins() {
        return [citationRule];
    }

    toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
        const label = node.attrs.text || node.attrs.key;
        state.write(`[${label}](zotero://${node.attrs.key})`);
    }

    parseMarkdown() {
        return {
            node: "citation",
            getAttrs: (tok: Token) => ({
                key: tok.attrGet("key"),
                text: tok.attrGet("text"),
                title: tok.attrGet("title"),
            }),
        };
    }
}

/**
 * A markdown-it rule that converts inline links with a `zotero://` href into
 * citation tokens so that the editor can render them as Citation nodes.
 *
 * @param md - the markdown-it instance to augment.
 */
function citationRule(md: any) {
    const ZOTERO_RE = /^zotero:\/\/([A-Z0-9]+)$/i;

    /**
     * Core rule that walks inline token children and replaces any `link_open`
     * …`link_close` group whose href matches the zotero:// scheme with a single
     * `citation` token.
     */
    function parseCitations(state: any) {
        for (let i = 0; i < state.tokens.length; i++) {
            const blockTok = state.tokens[i];
            if (!(blockTok.type === "inline" && blockTok.children)) {
                continue;
            }

            const children = blockTok.children;
            const newChildren = [];

            for (let j = 0; j < children.length; j++) {
                const tok = children[j];

                if (tok.type !== "link_open") {
                    newChildren.push(tok);
                    continue;
                }

                const href = tok.attrGet("href") ?? "";
                const match = ZOTERO_RE.exec(href);

                if (!match) {
                    newChildren.push(tok);
                    continue;
                }

                // Next token should be the link text, then link_close
                const textTok = children[j + 1];
                const closeTok = children[j + 2];

                if (
                    !textTok ||
                    textTok.type !== "text" ||
                    !closeTok ||
                    closeTok.type !== "link_close"
                ) {
                    newChildren.push(tok);
                    continue;
                }

                const key = match[1];
                const text = textTok.content;

                const citationTok = new state.Token("citation", "", 0);
                citationTok.attrSet("key", key);
                citationTok.attrSet("text", text);
                citationTok.attrSet("title", "");
                newChildren.push(citationTok);

                // Skip the text and close tokens we consumed
                j += 2;
            }

            blockTok.children = newChildren;
        }
    }

    md.core.ruler.push("citation", parseCitations);

    // Renderer for HTML output (used in read-only views / email)
    md.renderer.rules["citation"] = (tokens: any[], idx: number) => {
        const tok = tokens[idx];
        const key = tok.attrGet("key") ?? "";
        const text = tok.attrGet("text") ?? key;
        const title = tok.attrGet("title") ?? "";
        return `<span class="citation" data-key="${key}" data-text="${text}" data-title="${title}">[${text}]</span>`;
    };
}
