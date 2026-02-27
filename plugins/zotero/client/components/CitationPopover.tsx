import { TrashIcon } from "outline-icons";
import type { EditorView } from "prosemirror-view";
import * as React from "react";
import styled from "styled-components";
import { depths, s } from "@shared/styles";
import { Portal } from "~/components/Portal";
import { useTranslation } from "react-i18next";
import type { CitationMode } from "./CitationSearch";

interface Props {
    /** Position of the citation node in the ProseMirror document. */
    pos: number;
    /** Current citation mode. */
    mode: CitationMode;
    /** The ProseMirror editor view (for coordinate lookup). */
    view: EditorView;
    /** Called when the user selects a new mode. */
    onSetMode: (mode: CitationMode) => void;
    /** Called when the user clicks delete. */
    onDelete: () => void;
}

/**
 * A small floating toolbar that appears above a selected citation node.
 * Provides mode toggle (parenthetical ↔ narrative) and delete actions.
 *
 * @param props - component props.
 */
export default function CitationPopover({
    pos,
    mode,
    view,
    onSetMode,
    onDelete,
}: Props) {
    const { t } = useTranslation();
    const ref = React.useRef<HTMLDivElement>(null);
    const [style, setStyle] = React.useState<React.CSSProperties>({
        position: "fixed",
        top: -9999,
        left: -9999,
        opacity: 0,
    });

    React.useLayoutEffect(() => {
        if (!ref.current) {
            return;
        }
        try {
            const coords = view.coordsAtPos(pos);
            const menuHeight = ref.current.offsetHeight || 36;
            const menuWidth = ref.current.offsetWidth || 200;
            const top = Math.max(8, coords.top - menuHeight - 8);
            const left = Math.min(
                window.innerWidth - menuWidth - 8,
                Math.max(8, coords.left - menuWidth / 2)
            );
            setStyle({
                position: "fixed",
                top,
                left,
                opacity: 1,
                zIndex: depths.editorToolbar,
            });
        } catch {
            // position out of view if coord lookup fails
        }
    }, [pos, view]);

    return (
        <Portal>
            <Wrapper ref={ref} style={style}>
                <ModeButton
                    active={mode === "parenthetical"}
                    onClick={() => onSetMode("parenthetical")}
                    title={t("Parenthetical: (Smith, 2020)")}
                >
                    {t("Parenthetical")}
                </ModeButton>
                <ModeButton
                    active={mode === "narrative"}
                    onClick={() => onSetMode("narrative")}
                    title={t("Narrative: Smith (2020)")}
                >
                    {t("Narrative")}
                </ModeButton>
                <Divider />
                <DeleteButton
                    onClick={onDelete}
                    title={t("Remove citation")}
                >
                    <TrashIcon size={15} />
                </DeleteButton>
            </Wrapper>
        </Portal>
    );
}

const Wrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
    background: ${s("menuBackground")};
    box-shadow: ${s("menuShadow")};
    border-radius: 6px;
    padding: 4px 6px;
    pointer-events: all;
    transition:
        opacity 150ms ease,
        transform 150ms ease;
    z-index: ${depths.editorToolbar};

    @media print {
        display: none;
    }
`;

const ModeButton = styled.button<{ active: boolean }>`
    border: none;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 12px;
    cursor: pointer;
    background: ${({ active }) =>
        active ? s("backgroundSecondary") : "transparent"};
    color: ${({ active }) => (active ? s("accent") : s("textTertiary"))};
    font-weight: ${({ active }) => (active ? 600 : 400)};

    &:hover {
        background: ${s("listItemHoverBackground")};
        color: ${s("text")};
    }
`;

const Divider = styled.div`
    width: 1px;
    height: 18px;
    background: ${s("divider")};
    margin: 0 2px;
    flex-shrink: 0;
`;

const DeleteButton = styled.button`
    border: none;
    padding: 3px 5px;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
    color: ${s("textTertiary")};
    display: flex;
    align-items: center;

    &:hover {
        color: ${s("danger")};
        background: ${s("listItemHoverBackground")};
    }
`;
