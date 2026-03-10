import { setBlockType } from "prosemirror-commands";
import type {
  NodeSpec,
  NodeType,
  Node as ProsemirrorNode,
} from "prosemirror-model";
import type { Command } from "prosemirror-state";
import deleteEmptyFirstParagraph from "../commands/deleteEmptyFirstParagraph";
import type { CommandFactory } from "../lib/Extension";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import Node from "./Node";
import { EditorStyleHelper } from "../styles/EditorStyleHelper";

const VALID_ALIGN_VALUES = ["left", "right", "center", "justify"] as const;
type TextAlign = (typeof VALID_ALIGN_VALUES)[number] | null;

export default class Paragraph extends Node {
  get name() {
    return "paragraph";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        textAlign: {
          default: null,
        },
      },
      content: "inline*",
      group: "block",
      parseDOM: [
        {
          tag: "p",
          getAttrs: (dom) => {
            if (!(dom instanceof HTMLElement)) {
              return false;
            }

            // We must suppress image captions from being parsed as a separate paragraph.
            if (dom.classList.contains(EditorStyleHelper.imageCaption)) {
              return false;
            }

            const textAlign = dom.style.textAlign as TextAlign;
            return {
              textAlign: VALID_ALIGN_VALUES.includes(
                textAlign as (typeof VALID_ALIGN_VALUES)[number]
              )
                ? textAlign
                : null,
            };
          },
        },
      ],
      toDOM: (node) => [
        "p",
        {
          dir: "auto",
          ...(node.attrs.textAlign
            ? { style: `text-align: ${node.attrs.textAlign}` }
            : {}),
        },
        0,
      ],
    };
  }

  keys({ type }: { type: NodeType }) {
    return {
      "Shift-Ctrl-0": setBlockType(type),
      Backspace: deleteEmptyFirstParagraph,
    };
  }

  commands({ type }: { type: NodeType }): Record<string, CommandFactory> {
    return {
      paragraph: () => setBlockType(type),
      /**
       * Sets the text alignment of all paragraph nodes within the current selection.
       *
       * @param attrs.value the alignment value to apply, or null to reset to default.
       * @returns true if any nodes were updated.
       */
      setTextAlign:
        ({
          value,
        }: {
          value: TextAlign;
        }): Command =>
          (state, dispatch) => {
            const { tr, selection } = state;
            const { from, to } = selection;
            let changed = false;

            state.doc.nodesBetween(from, to, (node, pos) => {
              if (node.type !== type) {
                return true;
              }
              const newAlign: TextAlign = value || null;
              if (node.attrs.textAlign !== newAlign) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  textAlign: newAlign,
                });
                changed = true;
              }
              return false;
            });

            if (changed) {
              dispatch?.(tr);
            }
            return changed;
          },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    // render empty paragraphs as hard breaks to ensure that newlines are
    // persisted between reloads (this breaks from markdown tradition)
    if (
      node.textContent.trim() === "" &&
      node.childCount === 0 &&
      !state.inTable
    ) {
      state.write(state.options.softBreak ? "\n" : "\\\n");
    } else {
      state.renderInline(node);
      state.closeBlock(node);
    }
  }

  parseMarkdown() {
    return { block: "paragraph" };
  }
}
