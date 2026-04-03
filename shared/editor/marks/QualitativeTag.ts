import type { MarkSpec } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { EditorStyleHelper } from "../styles/EditorStyleHelper";
import Mark from "./Mark";

/**
 * Mark for qualitative text coding anchors in documents.
 */
export default class QualitativeTag extends Mark {
    get name() {
        return "qualitativeTag";
    }

    get schema(): MarkSpec {
        return {
            excludes: "",
            attrs: {
                id: {},
                userId: {},
                tagId: {},
                tagCode: {},
                color: {},
            },
            inclusive: false,
            parseDOM: [
                {
                    tag: `.${EditorStyleHelper.qualitativeTag}`,
                    getAttrs: (dom: HTMLSpanElement) => {
                        const documentId = dom.getAttribute("data-document-id");
                        if (documentId && documentId !== this.editor?.props.id) {
                            return false;
                        }

                        return {
                            id: dom.getAttribute("id")?.replace("qualitative-tag-", ""),
                            userId: dom.getAttribute("data-user-id"),
                            tagId: dom.getAttribute("data-tag-id"),
                            tagCode: dom.getAttribute("data-tag-code"),
                            color: dom.getAttribute("data-tag-color"),
                        };
                    },
                },
            ],
            toDOM: (node) => [
                "span",
                {
                    class: EditorStyleHelper.qualitativeTag,
                    id: `qualitative-tag-${node.attrs.id}`,
                    "data-user-id": node.attrs.userId,
                    "data-tag-id": node.attrs.tagId,
                    "data-tag-code": node.attrs.tagCode,
                    "data-tag-color": node.attrs.color,
                    "data-document-id": this.editor?.props.id,
                    style: `--qualitative-tag-color: ${node.attrs.color};`,
                },
                0,
            ],
        };
    }

    get allowInReadOnly() {
        return true;
    }

    toMarkdown() {
        return {
            open: "",
            close: "",
            mixable: true,
            expelEnclosingWhitespace: true,
        };
    }

    get plugins(): Plugin[] {
        return [
            new Plugin({
                props: {
                    handleDOMEvents: {
                        mousedown: (_view, event: MouseEvent) => {
                            if (!(event.target instanceof HTMLElement)) {
                                return false;
                            }

                            const tag = event.target.closest(
                                `.${EditorStyleHelper.qualitativeTag}`
                            ) as HTMLElement | null;

                            if (!tag) {
                                return false;
                            }

                            const rect = tag.getBoundingClientRect();
                            const removeZoneWidth = 18;
                            const inRemoveZone =
                                event.clientX >= rect.right - removeZoneWidth;

                            if (!inRemoveZone) {
                                return false;
                            }

                            const tagId = tag.id.replace("qualitative-tag-", "");
                            if (!tagId) {
                                return false;
                            }

                            event.preventDefault();
                            event.stopPropagation();
                            this.editor?.removeQualitativeTag(tagId);
                            return true;
                        },
                    },
                },
            }),
        ];
    }
}
