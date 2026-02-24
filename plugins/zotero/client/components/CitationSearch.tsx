import { observer } from "mobx-react";
import { SearchIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Modal from "~/components/Modal";
import Scrollable from "~/components/Scrollable";
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

type Props = {
    /** Whether the search dialog is currently open. */
    isOpen: boolean;
    /** Called when the dialog should be closed without inserting anything. */
    onClose: () => void;
    /**
     * Called when the user selects an item to insert.
     *
     * @param key - Zotero item key.
     * @param text - formatted inline citation label, e.g. "Smith et al., 2020".
     * @param title - full article/book title used as a tooltip.
     */
    onSelect: (key: string, text: string, title: string) => void;
};

/**
 * A search dialog that queries the Zotero library via the Outline server proxy
 * and lets the user pick an item to insert as an inline citation.
 */
function CitationSearch({ isOpen, onClose, onSelect }: Props) {
    const { t } = useTranslation();
    const [query, setQuery] = React.useState("");
    const [items, setItems] = React.useState<ZoteroItem[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Focus input when dialog opens
    React.useEffect(() => {
        if (isOpen) {
            setQuery("");
            setItems([]);
            setError(null);
            setSelectedIndex(0);
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

    const performSearch = async (q: string) => {
        setLoading(true);
        setError(null);
        try {
            const data = await client.get<{ data: ZoteroItem[] }>(
                "/zotero.search",
                { q, limit: 20 }
            );
            setItems(data.data ?? []);
            setSelectedIndex(0);
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

    /**
     * Formats the inline citation label from item data.
     * Uses pre-computed citation if available, otherwise builds it from creators
     * and date.
     *
     * @param item - Zotero item.
     * @returns formatted label, e.g. "Smith et al., 2020".
     */
    const formatCitationLabel = (item: ZoteroItem): string => {
        if (item.citation) {
            return item.citation;
        }

        const creators = item.data.creators ?? [];
        const authors = creators.filter(
            (c) => c.creatorType === "author" || creators.length === 1
        );

        let authorPart: string;

        if (authors.length === 0) {
            authorPart = t("Unknown Author");
        } else if (authors.length === 1) {
            authorPart = authors[0].lastName ?? authors[0].name ?? "";
        } else if (authors.length === 2) {
            const a = authors[0].lastName ?? authors[0].name ?? "";
            const b = authors[1].lastName ?? authors[1].name ?? "";
            authorPart = `${a} & ${b}`;
        } else {
            authorPart = `${authors[0].lastName ?? authors[0].name ?? ""} et al.`;
        }

        const year = item.data.date
            ? new Date(item.data.date).getFullYear() ||
            item.data.date.slice(0, 4)
            : "";

        return year ? `${authorPart}, ${year}` : authorPart;
    };

    const handleSelect = React.useCallback(
        (item: ZoteroItem) => {
            const text = formatCitationLabel(item);
            const title = item.data.title ?? "";
            onSelect(item.key, text, title);
        },
        [onSelect]
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedIndex((i) => Math.max(i - 1, 0));
                break;
            case "Enter":
                e.preventDefault();
                if (items[selectedIndex]) {
                    handleSelect(items[selectedIndex]);
                }
                break;
            case "Escape":
                onClose();
                break;
            default:
                break;
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onRequestClose={onClose}
            title={t("Search Zotero")}
            width={540}
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

                <Scrollable shadow style={{ maxHeight: 360 }}>
                    {loading && <StatusText>{t("Searching…")}</StatusText>}
                    {!loading && query && items.length === 0 && !error && (
                        <StatusText>{t("No results found.")}</StatusText>
                    )}
                    {!loading &&
                        items.map((item, index) => (
                            <ResultItem
                                key={item.key}
                                selected={index === selectedIndex}
                                onClick={() => handleSelect(item)}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                <ResultTitle>{item.data.title ?? item.key}</ResultTitle>
                                <ResultMeta>
                                    {formatCitationLabel(item)}
                                    {item.data.publicationTitle
                                        ? ` — ${item.data.publicationTitle}`
                                        : ""}
                                </ResultMeta>
                            </ResultItem>
                        ))}
                </Scrollable>

                {!query && (
                    <HintText>{t("Type to search your Zotero library…")}</HintText>
                )}
            </Container>
        </Modal>
    );
}

const Container = styled.div`
  padding: 0 0 8px;
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

const ResultItem = styled.div<{ selected: boolean }>`
  padding: 10px 16px;
  cursor: pointer;
  border-radius: 4px;
  background: ${({ selected }) => (selected ? s("listActiveBackground") : "transparent")};

  &:hover {
    background: ${s("listActiveBackground")};
  }
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

export default observer(CitationSearch);
