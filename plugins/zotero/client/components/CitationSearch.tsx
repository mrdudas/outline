import { observer } from "mobx-react";
import { CheckmarkIcon, SearchIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Modal from "~/components/Modal";
import Scrollable from "~/components/Scrollable";
import Button from "~/components/Button";
import { client } from "~/utils/ApiClient";

/** A Zotero item as returned by the server proxy `GET /api/zotero.search`. */
export interface ZoteroItem {
    key: string;
    /** Full item data object from the Zotero API. */
    data: {
        title?: string;
        date?: string;
        itemType?: string;
        creators?: Array<{
            firstName?: string;
            lastName?: string;
            name?: string;
            creatorType?: string;
        }>;
        publicationTitle?: string;
        publisher?: string;
        DOI?: string;
    };
    /** Pre-formatted single-line citation label returned by the server (optional). */
    citation?: string;
}

/** How the citation is rendered in the text body. */
export type CitationMode = "parenthetical" | "narrative";

/** Data for a single selected citation ready to be inserted. */
export interface SelectedCitation {
    key: string;
    /** Formatted inline citation label (mode-aware). */
    text: string;
    /** Full article or book title used as a tooltip. */
    title: string;
}

type Props = {
    /** Whether the search dialog is currently open. */
    isOpen: boolean;
    /** Called when the dialog should be closed without inserting anything. */
    onClose: () => void;
    /**
     * Called when the user confirms their selection.
     *
     * @param items - one or more selected citations with pre-formatted labels.
     * @param mode - the citation mode chosen by the user.
     */
    onSelect: (items: SelectedCitation[], mode: CitationMode) => void;
};

/** Returns the author portion of an APA-style in-text citation. */
function buildAuthorPart(item: ZoteroItem): string {
    const creators = item.data.creators ?? [];
    const authors = creators.filter(
        (c) => c.creatorType === "author" || creators.length === 1
    );

    if (authors.length === 0) {
        return "Unknown Author";
    }
    if (authors.length === 1) {
        return authors[0].lastName ?? authors[0].name ?? "";
    }
    if (authors.length === 2) {
        const a = authors[0].lastName ?? authors[0].name ?? "";
        const b = authors[1].lastName ?? authors[1].name ?? "";
        return `${a} & ${b}`;
    }
    return `${authors[0].lastName ?? authors[0].name ?? ""} et al.`;
}

/** Returns the year portion of an in-text citation. */
function buildYearPart(item: ZoteroItem): string {
    if (!item.data.date) {
        return "";
    }
    return (
        String(new Date(item.data.date).getFullYear() || "") ||
        item.data.date.slice(0, 4) ||
        ""
    );
}

/**
 * Formats the inline citation label for a Zotero item according to the
 * chosen mode.
 *
 * - **parenthetical** – `(Smith et al., 2020)` – placed inside parentheses,
 *   e.g. `…more research is needed (Smith et al., 2020).`
 * - **narrative** – `Smith et al. (2020)` – author name is part of the
 *   sentence, e.g. `…as Smith et al. (2020) demonstrated.`
 *
 * @param item - Zotero item.
 * @param mode - citation mode.
 * @returns formatted label string.
 */
export function formatCitationLabel(
    item: ZoteroItem,
    mode: CitationMode
): string {
    const author = buildAuthorPart(item);
    const year = buildYearPart(item);

    if (mode === "narrative") {
        return year ? `${author} (${year})` : author;
    }

    // parenthetical
    return year ? `(${author}, ${year})` : `(${author})`;
}

/**
 * A search dialog that queries the Zotero library via the Outline server proxy
 * and lets the user pick one or more items to insert as inline citations.
 *
 * Supports two insertion modes (narrative / parenthetical) and multi-select.
 */
function CitationSearch({ isOpen, onClose, onSelect }: Props) {
    const { t } = useTranslation();
    const [query, setQuery] = React.useState("");
    const [items, setItems] = React.useState<ZoteroItem[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [highlightIndex, setHighlightIndex] = React.useState(0);
    const [checkedKeys, setCheckedKeys] = React.useState<Set<string>>(
        new Set()
    );
    const [mode, setMode] = React.useState<CitationMode>("parenthetical");
    const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Reset state every time the dialog opens
    React.useEffect(() => {
        if (isOpen) {
            setQuery("");
            setItems([]);
            setError(null);
            setHighlightIndex(0);
            setCheckedKeys(new Set());
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Debounced search
    React.useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        if (!query.trim()) {
            setItems([]);
            return;
        }
        debounceRef.current = setTimeout(() => {
            void performSearch(query);
        }, 300);
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query]);

    /**
     * Sends a search request to the server proxy and updates the result list.
     *
     * @param q - search query to forward to the Zotero API.
     */
    const performSearch = async (q: string) => {
        setLoading(true);
        setError(null);
        try {
            const data = await client.get<{ data: ZoteroItem[] }>(
                "/zotero.search",
                { q, limit: 20 }
            );
            setItems(data.data ?? []);
            setHighlightIndex(0);
            setCheckedKeys(new Set());
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : t("Failed to search Zotero. Check your settings.")
            );
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    /** Toggles the checked state of an item. */
    const toggleCheck = React.useCallback((key: string) => {
        setCheckedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    /**
     * Confirms the selection and calls the parent callback.
     * Uses the currently checked items; if none are checked, uses the
     * highlighted item instead.
     */
    const handleConfirm = React.useCallback(() => {
        let targets: ZoteroItem[];

        if (checkedKeys.size > 0) {
            targets = items.filter((item) => checkedKeys.has(item.key));
        } else if (items[highlightIndex]) {
            targets = [items[highlightIndex]];
        } else {
            return;
        }

        const selected: SelectedCitation[] = targets.map((item) => ({
            key: item.key,
            text: formatCitationLabel(item, mode),
            title: item.data.title ?? "",
        }));

        onSelect(selected, mode);
    }, [checkedKeys, items, highlightIndex, mode, onSelect]);

    /**
     * Handles keyboard navigation within the dialog.
     *
     * - Arrow keys move the highlight
     * - Space toggles the highlighted item's checkbox
     * - Enter confirms the selection
     * - Escape closes the dialog
     *
     * @param e - React keyboard event.
     */
    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setHighlightIndex((i) => Math.min(i + 1, items.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setHighlightIndex((i) => Math.max(i - 1, 0));
                break;
            case " ":
                e.preventDefault();
                if (items[highlightIndex]) {
                    toggleCheck(items[highlightIndex].key);
                }
                break;
            case "Enter":
                e.preventDefault();
                handleConfirm();
                break;
            case "Escape":
                onClose();
                break;
            default:
                break;
        }
    };

    const hasItems = items.length > 0;

    return (
        <Modal
            isOpen={isOpen}
            onRequestClose={onClose}
            title={t("Search Zotero")}
            width={560}
        >
            <Container onKeyDown={handleKeyDown}>
                <SearchRow>
                    <SearchIcon color="currentColor" size={20} />
                    <SearchInput
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("Search by title, author, keyword…")}
                        aria-label={t("Search Zotero")}
                        autoComplete="off"
                    />
                </SearchRow>

                {error && <ErrorText>{error}</ErrorText>}

                <Scrollable shadow style={{ maxHeight: 340 }}>
                    {loading && <StatusText>{t("Searching…")}</StatusText>}
                    {!loading && query && items.length === 0 && !error && (
                        <StatusText>{t("No results found.")}</StatusText>
                    )}
                    {!loading &&
                        items.map((item, index) => {
                            const checked = checkedKeys.has(item.key);
                            return (
                                <ResultItem
                                    key={item.key}
                                    highlighted={index === highlightIndex}
                                    checked={checked}
                                    onClick={() => toggleCheck(item.key)}
                                    onMouseEnter={() =>
                                        setHighlightIndex(index)
                                    }
                                >
                                    <CheckBox
                                        aria-checked={checked}
                                        role="checkbox"
                                    >
                                        {checked && (
                                            <CheckmarkIcon
                                                size={14}
                                                color="currentColor"
                                            />
                                        )}
                                    </CheckBox>
                                    <ResultBody>
                                        <ResultTitle>
                                            {item.data.title ?? item.key}
                                        </ResultTitle>
                                        <ResultMeta>
                                            {formatCitationLabel(item, mode)}
                                            {item.data.publicationTitle
                                                ? ` — ${item.data.publicationTitle}`
                                                : ""}
                                        </ResultMeta>
                                    </ResultBody>
                                </ResultItem>
                            );
                        })}
                </Scrollable>

                {!query && (
                    <HintText>
                        {t("Type to search your Zotero library…")}
                    </HintText>
                )}

                <Footer>
                    <ModeToggle>
                        <ModeButton
                            active={mode === "parenthetical"}
                            onClick={() => setMode("parenthetical")}
                            type="button"
                            title={t("Parenthetical: (Smith et al., 2020)")}
                        >
                            {t("Parenthetical")}
                        </ModeButton>
                        <ModeButton
                            active={mode === "narrative"}
                            onClick={() => setMode("narrative")}
                            type="button"
                            title={t("Narrative: Smith et al. (2020)")}
                        >
                            {t("Narrative")}
                        </ModeButton>
                    </ModeToggle>

                    <FooterRight>
                        {checkedKeys.size > 0 && (
                            <SelectionCount>
                                {checkedKeys.size}{" "}
                                {t("selected")}
                            </SelectionCount>
                        )}
                        <Button
                            onClick={handleConfirm}
                            disabled={!hasItems}
                            type="button"
                        >
                            {t("Insert")}
                        </Button>
                    </FooterRight>
                </Footer>
            </Container>
        </Modal>
    );
}

const Container = styled.div`
  padding: 0;
`;

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid ${s("divider")};
  color: ${s("textTertiary")};
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: ${s("text")};

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

const ResultItem = styled.div<{ highlighted: boolean; checked: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 16px;
  cursor: pointer;
  border-radius: 4px;
  background: ${({ highlighted, checked }) =>
        checked
            ? s("listActiveBackground")
            : highlighted
            ? s("listHoverBackground")
            : "transparent"};

  &:hover {
    background: ${s("listHoverBackground")};
  }
`;

const CheckBox = styled.div`
  width: 16px;
  height: 16px;
  min-width: 16px;
  border: 1.5px solid ${s("textTertiary")};
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  background: transparent;

  &[aria-checked="true"] {
    background: ${s("accent")};
    border-color: ${s("accent")};
    color: ${s("accentText")};
  }
`;

const ResultBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const ResultTitle = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${s("text")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ResultMeta = styled.div`
  font-size: 12px;
  color: ${s("textTertiary")};
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StatusText = styled.div`
  padding: 16px;
  text-align: center;
  color: ${s("textTertiary")};
  font-size: 14px;
`;

const ErrorText = styled.div`
  padding: 8px 16px;
  color: ${s("danger")};
  font-size: 13px;
`;

const HintText = styled.div`
  padding: 16px;
  text-align: center;
  color: ${s("textTertiary")};
  font-size: 13px;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 12px;
  border-top: 1px solid ${s("divider")};
  gap: 8px;
`;

const ModeToggle = styled.div`
  display: flex;
  gap: 2px;
  background: ${s("secondaryBackground")};
  border-radius: 6px;
  padding: 2px;
`;

const ModeButton = styled.button<{ active: boolean }>`
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  background: ${({ active }) => (active ? s("background") : "transparent")};
  color: ${({ active }) => (active ? s("text") : s("textSecondary"))};
  font-weight: ${({ active }) => (active ? 500 : 400)};
  box-shadow: ${({ active }) =>
        active ? "0 1px 2px rgba(0,0,0,0.1)" : "none"};
  transition: background 0.15s, color 0.15s;
`;

const FooterRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SelectionCount = styled.span`
  font-size: 12px;
  color: ${s("textTertiary")};
`;

export default observer(CitationSearch);
