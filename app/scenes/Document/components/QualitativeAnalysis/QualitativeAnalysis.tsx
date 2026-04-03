import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useRouteMatch } from "react-router-dom";
import { toast } from "sonner";
import styled from "styled-components";
import { v4 as uuidv4 } from "uuid";
import { PlusIcon } from "outline-icons";
import ButtonSmall from "~/components/ButtonSmall";
import Input from "~/components/Input";
import Flex from "~/components/Flex";
import NudeButton from "~/components/NudeButton";
import { SwatchButton } from "~/components/SwatchButton";
import useCurrentUser from "~/hooks/useCurrentUser";
import { useDocumentContext } from "~/components/DocumentContext";
import useStores from "~/hooks/useStores";
import { sidebarAppearDuration } from "~/styles/animations";
import Sidebar from "../SidebarLayout";

type SelectedTagMark = {
    id: string;
    tagId: string;
    tagCode: string;
    color: string;
};

type TaggedSnippet = SelectedTagMark & {
    text: string;
    from: number;
    to: number;
};

type TagDraft = {
    name: string;
    code: string;
    description: string;
    color: string;
};

/**
 * Sidebar panel for qualitative coding workflows.
 */
function QualitativeAnalysis() {
    const { t } = useTranslation();
    const { ui, documents, qualitativeTags } = useStores();
    const user = useCurrentUser({ rejectOnEmpty: false });
    const { editor } = useDocumentContext();
    const match = useRouteMatch<{ documentSlug: string }>();
    const documentModel = documents.get(match.params.documentSlug);
    const [name, setName] = React.useState("");
    const [showCreateForm, setShowCreateForm] = React.useState(false);
    const [isCreating, setIsCreating] = React.useState(false);
    const [selectionTags, setSelectionTags] = React.useState<SelectedTagMark[]>([]);
    const [taggedSnippets, setTaggedSnippets] = React.useState<TaggedSnippet[]>([]);
    const [editingTagId, setEditingTagId] = React.useState<string | null>(null);
    const [editDraft, setEditDraft] = React.useState<TagDraft | null>(null);
    const refreshSelectionFrame = React.useRef<number | null>(null);
    const snippetRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const listRef = React.useRef<HTMLDivElement | null>(null);
    const selectionSignatureRef = React.useRef("");
    const snippetSignatureRef = React.useRef("");

    React.useEffect(() => {
        if (!documentModel?.collectionId) {
            return;
        }

        void qualitativeTags.fetchPage({ collectionId: documentModel.collectionId });
    }, [documentModel?.collectionId, qualitativeTags]);

    const refreshSelection = React.useCallback(() => {
        if (!editor) {
            setSelectionTags([]);
            setTaggedSnippets([]);
            selectionSignatureRef.current = "";
            snippetSignatureRef.current = "";
            return;
        }

        const nextSelection = editor.getSelectedQualitativeTags();
        const nextSelectionSignature = nextSelection
            .map((mark) => mark.id)
            .join("|");

        if (nextSelectionSignature !== selectionSignatureRef.current) {
            selectionSignatureRef.current = nextSelectionSignature;
            setSelectionTags(nextSelection);
        }

        const nextSnippets = editor.getQualitativeTagSnippets();
        const nextSnippetSignature = nextSnippets
            .map((snippet) => `${snippet.id}:${snippet.from}:${snippet.to}:${snippet.text}`)
            .join("|");

        if (nextSnippetSignature !== snippetSignatureRef.current) {
            snippetSignatureRef.current = nextSnippetSignature;
            setTaggedSnippets(nextSnippets);
        }
    }, [editor]);

    React.useEffect(() => {
        const focusedId = selectionTags[0]?.id;
        if (!focusedId) {
            return;
        }

        const item = snippetRefs.current[focusedId];
        const list = listRef.current;

        if (!item || !list) {
            return;
        }

        const itemRect = item.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const fullyVisible =
            itemRect.top >= listRect.top && itemRect.bottom <= listRect.bottom;

        if (!fullyVisible) {
            item.scrollIntoView({
                block: "center",
                behavior: "smooth",
            });
        }
    }, [selectionTags]);

    const tags = documentModel?.collectionId
        ? qualitativeTags.inCollection(documentModel.collectionId)
        : [];

    const groupedSnippets = React.useMemo(() => {
        const grouped = new Map<
            string,
            {
                tagId: string;
                tagName: string;
                tagCode: string;
                color: string;
                snippets: TaggedSnippet[];
            }
        >();
        const tagOrder = new Map(tags.map((tag, index) => [tag.id, index]));
        const tagById = new Map(tags.map((tag) => [tag.id, tag]));

        taggedSnippets.forEach((snippet) => {
            const existing = grouped.get(snippet.tagId);

            if (existing) {
                existing.snippets.push(snippet);
                return;
            }

            grouped.set(snippet.tagId, {
                tagId: snippet.tagId,
                tagName: tagById.get(snippet.tagId)?.name ?? snippet.tagCode,
                tagCode: snippet.tagCode,
                color: snippet.color,
                snippets: [snippet],
            });
        });

        return Array.from(grouped.values()).sort((left, right) => {
            const leftOrder = tagOrder.get(left.tagId) ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = tagOrder.get(right.tagId) ?? Number.MAX_SAFE_INTEGER;

            if (leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }

            return left.tagCode.localeCompare(right.tagCode);
        });
    }, [taggedSnippets, tags]);

    const scheduleRefreshSelection = React.useCallback(() => {
        if (refreshSelectionFrame.current !== null) {
            window.cancelAnimationFrame(refreshSelectionFrame.current);
        }

        refreshSelectionFrame.current = window.requestAnimationFrame(() => {
            refreshSelectionFrame.current = null;
            refreshSelection();
        });
    }, [refreshSelection]);

    React.useEffect(() => {
        scheduleRefreshSelection();
        window.document.addEventListener("selectionchange", scheduleRefreshSelection);

        return () => {
            window.document.removeEventListener("selectionchange", scheduleRefreshSelection);

            if (refreshSelectionFrame.current !== null) {
                window.cancelAnimationFrame(refreshSelectionFrame.current);
                refreshSelectionFrame.current = null;
            }
        };
    }, [scheduleRefreshSelection]);

    const selectedTag = editingTagId
        ? qualitativeTags.get(editingTagId)
        : undefined;

    React.useEffect(() => {
        if (!selectedTag) {
            return;
        }

        setEditDraft({
            name: selectedTag.name,
            code: selectedTag.code,
            description: selectedTag.description ?? "",
            color: selectedTag.color,
        });
    }, [selectedTag]);

    const handleCreateTag = React.useCallback(async () => {
        if (!documentModel?.collectionId) {
            toast.error(t("Tag creation requires a document inside a collection"));
            return;
        }

        if (!name.trim()) {
            return;
        }

        setIsCreating(true);

        try {
            await qualitativeTags.create({
                collectionId: documentModel.collectionId,
                name: name.trim(),
            });

            toast.success(t("Tag created"));
            setName("");
            setShowCreateForm(false);
        } catch (_err) {
            toast.error(t("Could not create tag"));
        } finally {
            setIsCreating(false);
        }
    }, [documentModel?.collectionId, name, qualitativeTags, t]);

    const handleCreateSubmit = React.useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();

            if (!isCreating && name.trim()) {
                void handleCreateTag();
            }
        },
        [handleCreateTag, isCreating, name]
    );

    const handleNameKeyDown = React.useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.nativeEvent.isComposing) {
                return;
            }

            if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();

                if (!isCreating && name.trim()) {
                    void handleCreateTag();
                }
            }
        },
        [handleCreateTag, isCreating, name]
    );

    const handleApplyTag = React.useCallback(
        (tagId: string, code: string, color: string) => {
            if (!editor || !user?.id) {
                return;
            }

            const didApply = editor.addQualitativeTag({
                id: uuidv4(),
                userId: user.id,
                tagId,
                tagCode: code,
                color,
            });

            if (didApply) {
                refreshSelection();
            }
        },
        [editor, refreshSelection, user?.id]
    );

    const beginEditTag = React.useCallback(
        (tagId: string) => {
            const tag = qualitativeTags.get(tagId);
            if (!tag) {
                return;
            }

            setEditingTagId(tag.id);
            setEditDraft({
                name: tag.name,
                code: tag.code,
                description: tag.description ?? "",
                color: tag.color,
            });
            setShowCreateForm(false);
        },
        [qualitativeTags]
    );

    const handleSaveTag = React.useCallback(async () => {
        if (!selectedTag || !editDraft) {
            return;
        }

        try {
            const updated = await qualitativeTags.update({
                id: selectedTag.id,
                name: editDraft.name.trim(),
                code: editDraft.code.trim(),
                description: editDraft.description.trim() || null,
                color: editDraft.color,
            });

            editor?.updateQualitativeTagByTagId(selectedTag.id, {
                tagCode: updated.code,
                color: updated.color,
            });
            refreshSelection();
            toast.success(t("Tag updated"));
            setEditingTagId(null);
            setEditDraft(null);
        } catch (_err) {
            toast.error(t("Could not update tag"));
        }
    }, [editDraft, editor, qualitativeTags, refreshSelection, selectedTag, t]);

    const handleDeleteTag = React.useCallback(async () => {
        if (!selectedTag) {
            return;
        }

        const confirmed = window.confirm(t("Delete this tag?"));
        if (!confirmed) {
            return;
        }

        try {
            await qualitativeTags.delete(selectedTag);
            editor?.removeQualitativeTagByTagId(selectedTag.id);
            refreshSelection();
            toast.success(t("Tag deleted"));
            setEditingTagId(null);
            setEditDraft(null);
        } catch (_err) {
            toast.error(t("Could not delete tag"));
        }
    }, [editor, qualitativeTags, refreshSelection, selectedTag, t]);

    const handleRemoveSelectedTag = React.useCallback(
        (id: string) => {
            if (!editor) {
                return;
            }

            editor.removeQualitativeTag(id);
            refreshSelection();
        },
        [editor, refreshSelection]
    );

    const handleFocusSnippet = React.useCallback(
        (snippet: TaggedSnippet) => {
            if (!editor) {
                return;
            }

            const marker = window.document.getElementById(
                `qualitative-tag-${snippet.id}`
            );

            const scrollToMarkerWithRetry = (attempt = 0) => {
                const current = window.document.getElementById(
                    `qualitative-tag-${snippet.id}`
                );

                if (current) {
                    current.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                    });
                    return;
                }

                if (attempt >= 10) {
                    return;
                }

                window.setTimeout(() => {
                    scrollToMarkerWithRetry(attempt + 1);
                }, 80);
            };

            if (marker) {
                editor.focusQualitativeTagSnippet(snippet.from, snippet.to);
                marker.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
                scheduleRefreshSelection();
                return;
            }

            editor.focusQualitativeTagSnippet(snippet.from, snippet.to);
            window.setTimeout(scrollToMarkerWithRetry, sidebarAppearDuration);
            scheduleRefreshSelection();
        },
        [editor, scheduleRefreshSelection]
    );

    return (
        <Sidebar
            title={t("Qualitative analysis / Kvalitativ elemzes")}
            onClose={() => ui.set({ qualitativeAnalysisExpanded: false })}
            scrollable={false}
        >
            <Container column>
                <Section>
                    <HeaderRow align="center" justify="space-between">
                        <SectionTitle>{t("Tag cloud")}</SectionTitle>
                        <ButtonSmall
                            icon={<PlusIcon />}
                            onClick={() => setShowCreateForm((prev) => !prev)}
                        >
                            {t("New tag")}
                        </ButtonSmall>
                    </HeaderRow>

                    {showCreateForm && (
                        <CreateRow onSubmit={handleCreateSubmit}>
                            <Input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                onKeyDown={handleNameKeyDown}
                                placeholder={t("Tag name")}
                                autoFocus
                            />
                            <HiddenSubmit type="submit" aria-hidden />
                        </CreateRow>
                    )}

                    {selectedTag && editDraft && (
                        <EditPanel>
                            <EditHeader align="center" justify="space-between">
                                <SectionTitle>{t("Edit tag")}</SectionTitle>
                                <ButtonSmall onClick={() => { setEditingTagId(null); setEditDraft(null); }}>
                                    {t("Cancel")}
                                </ButtonSmall>
                            </EditHeader>
                            <EditGrid>
                                <FormField>
                                    <FieldLabel htmlFor="qualitative-tag-name">
                                        {t("Name")}
                                    </FieldLabel>
                                    <FieldInput
                                        id="qualitative-tag-name"
                                        value={editDraft.name}
                                        onChange={(event) =>
                                            setEditDraft((draft) =>
                                                draft
                                                    ? { ...draft, name: event.target.value }
                                                    : draft
                                            )
                                        }
                                    />
                                </FormField>
                                <FormField>
                                    <FieldLabel htmlFor="qualitative-tag-code">
                                        {t("Code")}
                                    </FieldLabel>
                                    <FieldInput
                                        id="qualitative-tag-code"
                                        value={editDraft.code}
                                        onChange={(event) =>
                                            setEditDraft((draft) =>
                                                draft
                                                    ? { ...draft, code: event.target.value }
                                                    : draft
                                            )
                                        }
                                    />
                                </FormField>
                                <FormField>
                                    <FieldLabel htmlFor="qualitative-tag-description">
                                        {t("Description")}
                                    </FieldLabel>
                                    <FieldInput
                                        id="qualitative-tag-description"
                                        value={editDraft.description}
                                        onChange={(event) =>
                                            setEditDraft((draft) =>
                                                draft
                                                    ? { ...draft, description: event.target.value }
                                                    : draft
                                            )
                                        }
                                    />
                                </FormField>
                                <Field>
                                    <ColorRow align="center" gap={8}>
                                        <span>{t("Color")}</span>
                                        <SwatchButton
                                            color={editDraft.color}
                                            onChange={(color) =>
                                                setEditDraft((draft) =>
                                                    draft ? { ...draft, color } : draft
                                                )
                                            }
                                            pickerInModal={false}
                                        />
                                    </ColorRow>
                                </Field>
                            </EditGrid>
                            <EditActions align="center" justify="space-between">
                                <ButtonSmall onClick={handleSaveTag}>
                                    {t("Save")}
                                </ButtonSmall>
                                <ButtonSmall danger onClick={handleDeleteTag}>
                                    {t("Delete")}
                                </ButtonSmall>
                            </EditActions>
                        </EditPanel>
                    )}

                    <TagCloud>
                        {tags.map((tag) => (
                            <TagCard key={tag.id} style={{ borderColor: tag.color }}>
                                <TagButton
                                    type="button"
                                    onClick={() => handleApplyTag(tag.id, tag.code, tag.color)}
                                    style={{ color: tag.color }}
                                >
                                    <strong>{tag.code}</strong> {tag.name}
                                </TagButton>
                                <TagActions>
                                    <SmallActionButton type="button" onClick={() => beginEditTag(tag.id)}>
                                        {t("Edit")}
                                    </SmallActionButton>
                                </TagActions>
                            </TagCard>
                        ))}
                    </TagCloud>
                </Section>

                <Section>
                    <SectionTitle>{t("Selected text tags")}</SectionTitle>
                    {groupedSnippets.length === 0 ? (
                        <Hint>{t("No tagged text snippets yet.")}</Hint>
                    ) : (
                        <GroupedSnippetList ref={listRef}>
                            {groupedSnippets.map((group) => (
                                <TagGroup key={group.tagId}>
                                    <TagGroupHeader>
                                        <TagGroupTitleRow>
                                            <TagGroupTitle>{group.tagName}</TagGroupTitle>
                                            <SelectionBadge style={{ background: group.color }}>
                                                {group.tagCode}
                                            </SelectionBadge>
                                        </TagGroupTitleRow>
                                    </TagGroupHeader>
                                    <TagGroupItems>
                                        {group.snippets.map((snippet) => {
                                            const isFocused = selectionTags.some(
                                                (selected) => selected.id === snippet.id
                                            );

                                            return (
                                                <TagSnippetItem
                                                    key={snippet.id}
                                                    ref={(el) => {
                                                        snippetRefs.current[snippet.id] = el;
                                                    }}
                                                    $focused={isFocused}
                                                    align="center"
                                                    justify="space-between"
                                                    onClick={() => handleFocusSnippet(snippet)}
                                                >
                                                    <SnippetText>{snippet.text}</SnippetText>
                                                    <NudeButton
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleRemoveSelectedTag(snippet.id);
                                                        }}
                                                    >
                                                        x
                                                    </NudeButton>
                                                </TagSnippetItem>
                                            );
                                        })}
                                    </TagGroupItems>
                                </TagGroup>
                            ))}
                        </GroupedSnippetList>
                    )}
                </Section>
            </Container>
        </Sidebar>
    );
}

const Container = styled(Flex)`
  height: 100%;
  padding: 16px;
  gap: 16px;
`;

const Section = styled(Flex)`
  flex-direction: column;
  gap: 10px;
`;

const HeaderRow = styled(Flex)``;

const CreateRow = styled.form`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const EditPanel = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px;
    border: 1px solid ${(props) => props.theme.divider};
    border-radius: 10px;
    background: ${(props) => props.theme.backgroundSecondary};
`;

const EditHeader = styled(Flex)``;

const EditGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;

    > * {
        width: 100%;
    }
`;

const Field = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 78px;
`;

const FormField = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const FieldLabel = styled.label`
    font-size: 13px;
    font-weight: 600;
    color: ${(props) => props.theme.textSecondary};
`;

const FieldInput = styled.input`
    width: 100%;
    height: 36px;
    padding: 8px 10px;
    border: 1px solid ${(props) => props.theme.inputBorder};
    border-radius: 6px;
    background: ${(props) => props.theme.background};
    color: ${(props) => props.theme.text};
    font-size: 14px;

    &:focus {
        outline: none;
        border-color: ${(props) => props.theme.inputBorderFocused};
    }
`;

const ColorRow = styled(Flex)`
    align-items: center;
    justify-content: space-between;
    width: 100%;

    > span {
        flex: 1;
    }
`;

const EditActions = styled(Flex)``;

const HiddenSubmit = styled.button`
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    clip: rect(0 0 0 0);
    overflow: hidden;
`;

const SectionTitle = styled.div`
  font-weight: 600;
`;

const TagCloud = styled(Flex)`
  max-height: 46vh;
  overflow-y: auto;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
`;

const TagCard = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border: 1px solid;
    border-radius: 999px;
`;

const TagButton = styled.button`
    border: 0;
  background: transparent;
    padding: 0;
  font-size: 12px;
  cursor: var(--pointer);
`;

const TagActions = styled.div`
    display: inline-flex;
    gap: 4px;
`;

const SmallActionButton = styled.button`
    border: 0;
    background: transparent;
    color: ${(props) => props.theme.textTertiary};
    cursor: var(--pointer);
    font-size: 11px;
    padding: 0;

    &:hover {
        color: ${(props) => props.theme.text};
    }
`;

const GroupedSnippetList = styled(Flex)`
    flex-direction: column;
    gap: 10px;
    max-height: 34vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 4px;
`;

const TagGroup = styled.div`
    border: 1px solid ${(props) => props.theme.divider};
    border-radius: 10px;
    overflow: visible;
    background: ${(props) => props.theme.background};
`;

const TagGroupHeader = styled.div`
    padding: 10px 12px 8px;
    border-bottom: 1px solid ${(props) => props.theme.divider};
    background: ${(props) => props.theme.background};
`;

const TagGroupTitleRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
`;

const TagGroupTitle = styled.div`
    min-width: 0;
    font-size: 14px;
    font-weight: 600;
    color: ${(props) => props.theme.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const TagGroupItems = styled.div`
    display: flex;
    flex-direction: column;
    overflow: visible;
    max-height: none;
`;

const TagSnippetItem = styled(Flex) <{ $focused: boolean }>`
    border-top: 1px solid ${(props) => props.theme.divider};
    padding: 8px;
    background: ${(props) =>
        props.$focused ? props.theme.backgroundSecondary : props.theme.background};

    &:first-child {
        border-top: 0;
    }
    gap: 8px;
`;

const SnippetText = styled.div`
    flex: 1;
    font-size: 13px;
    color: ${(props) => props.theme.text};
    line-height: 1.45;
    padding-right: 8px;
    white-space: normal;
    overflow: visible;
    text-overflow: initial;
    word-break: break-word;
`;

const SelectionBadge = styled.span`
  display: inline-flex;
  align-items: center;
  color: #ffffff;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
`;

const Hint = styled.div`
  color: ${(props) => props.theme.textTertiary};
  font-size: 13px;
`;

export default observer(QualitativeAnalysis);
