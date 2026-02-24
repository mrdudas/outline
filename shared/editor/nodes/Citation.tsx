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
                /** How the citation is rendered: "parenthetical" (default) or "narrative" */
                mode: { default: "parenthetical" },
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
                        const text = dom.dataset.text ?? "";
                        const storedMode = dom.dataset.mode;
                        const mode =
                            storedMode ??
                            (/\s\(\d{4}\)\s*$/.test(text)
                                ? "narrative"
                                : "parenthetical");
                        return {
                            key,
                            text,
                            title: dom.dataset.title ?? "",
                            mode,
                        };
                    },
                },
            ],
            toDOM: (node: ProsemirrorNode) => {
                const rawText = node.attrs.text || node.attrs.key;
                // Strip outer parens from old-format parenthetical labels,
                // e.g. "(Smith, 2020)" → "Smith, 2020"  (CSS adds them back).
                const isParenthetical = node.attrs.mode === "parenthetical";
                const displayText =
                    isParenthetical && /^\(.+\)$/.test(rawText)
                        ? rawText.slice(1, -1)
                        : rawText;
                return [
                    "span",
                    {
                        class: "citation",
                        "data-key": node.attrs.key,
                        "data-text": node.attrs.text,
                        "data-title": node.attrs.title,
                        "data-mode": node.attrs.mode ?? "parenthetical",
                        title: node.attrs.title || undefined,
                    },
                    displayText,
                ];
            },
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
            getAttrs: (tok: Token) => {
                const text = tok.attrGet("text") ?? "";
                const storedMode = tok.attrGet("mode");
                const mode =
                    storedMode ??
                    (/\s\(\d{4}\)\s*$/.test(text)
                        ? "narrative"
                        : "parenthetical");
                return {
                    key: tok.attrGet("key"),
                    text,
                    title: tok.attrGet("title"),
                    mode,
                };
            },
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

                const isNarrative = /\s\(\d{4}\)\s*$/.test(text);
                const citationTok = new state.Token("citation", "", 0);
                citationTok.attrSet("key", key);
                citationTok.attrSet("text", text);
                citationTok.attrSet("title", "");
                citationTok.attrSet(
                    "mode",
                    isNarrative ? "narrative" : "parenthetical"
                );
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
        const rawText = tok.attrGet("text") ?? key;
        const mode = tok.attrGet("mode") ?? "parenthetical";
        const title = tok.attrGet("title") ?? "";
        // Strip outer parens from old-format parenthetical labels for CSS grouping.
        const displayText =
            mode === "parenthetical" && /^\(.+\)$/.test(rawText)
                ? rawText.slice(1, -1)
                : rawText;
        return `<span class="citation" data-key="${key}" data-text="${rawText}" data-title="${title}" data-mode="${mode}">${displayText}</span>`;
    };
}
