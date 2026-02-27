import { observer } from "mobx-react";
import { CloseIcon, SearchIcon } from "outline-icons";
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
    /** How the citation is rendered: "parenthetical" or "narrative". */
    mode: CitationMode;
}

type Props = {
    /** Whether the search dialog is currently open. */
    isOpen: boolean;
    /** Called when the dialog should be closed without inserting anything. */
    onClose: () => void;
    /**
     * Called when the user confirms their selection.
     *
     * @param items - one or more selected citations, sorted alphabetically by author.
     * @param mode - the citation mode chosen by the user.
     */
    onSelect: (items: SelectedCitation[], mode: CitationMode) => void;
    /** BCP-47 locale used to localise citation terms such as "et al.". */
    locale?: string;
};

/** Returns the first author's last name for sorting and label building. */
function firstAuthorLastName(item: ZoteroItem): string {
    const creators = item.data.creators ?? [];
    const authors = creators.filter(
        (c) => c.creatorType === "author" || creators.length === 1
    );
    if (authors.length === 0) {
        return "Unknown";
    }
    return authors[0].lastName ?? authors[0].name ?? "Unknown";
}

/**
 * Locale-specific terms used in citation labels.
 * Keys are BCP-47 locale tags or IETF language prefix matches.
 */
export interface LocaleTerms {
    /** Abbreviation for "and others" (Latin "et alii"). */
    etAl: string;
    /** Conjunction between two author names. */
    and: string;
}

/**
 * Known locale overrides. Most locales keep Latin "et al." / "&";
 * exceptions are listed here.
 */
const LOCALE_TERMS: Record<string, LocaleTerms> = {
    "hu": { etAl: "és mtsai.", and: "és" },
    "pl": { etAl: "i in.",     and: "i"  },
    "nl": { etAl: "et al.",    and: "en" },
    "de": { etAl: "et al.",    and: "&"  },
    "fr": { etAl: "et al.",    and: "&"  },
    "es": { etAl: "et al.",    and: "y"  },
    "pt": { etAl: "et al.",    and: "e"  },
    "it": { etAl: "et al.",    and: "e"  },
    "sv": { etAl: "et al.",    and: "&"  },
    "fi": { etAl: "ym.",       and: "ja" },
    "ro": { etAl: "et al.",    and: "și" },
    "cs": { etAl: "et al.",    and: "a"  },
    "sk": { etAl: "et al.",    and: "a"  },
    "hr": { etAl: "i sur.",    and: "i"  },
};

const DEFAULT_TERMS: LocaleTerms = { etAl: "et al.", and: "&" };

/**
 * Returns locale-specific citation terms for a given BCP-47 locale tag.
 * Matches on the language subtag (first two letters) so "hu-HU" matches "hu".
 *
 * @param locale - BCP-47 locale tag (e.g. "hu-HU", "en-US").
 * @returns locale terms for et al. and the "and" conjunction.
 */
export function getLocaleTerms(locale: string | undefined | null): LocaleTerms {
    if (!locale) {
        return DEFAULT_TERMS;
    }
    const lang = locale.split("-")[0].toLowerCase();
    return LOCALE_TERMS[lang] ?? DEFAULT_TERMS;
}

/** Returns the author portion of an APA-style in-text citation. */
function buildAuthorPart(item: ZoteroItem, terms: LocaleTerms = DEFAULT_TERMS): string {
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
        return `${a} ${terms.and} ${b}`;
    }
    return `${authors[0].lastName ?? authors[0].name ?? ""} ${terms.etAl}`;
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
 * chosen mode and locale.
 *
 * - **parenthetical** – `Smith et al., 2020` – CSS wraps groups in parens.
 * - **narrative** – `Smith et al. (2020)` – author name part of the sentence.
 *
 * @param item - Zotero item.
 * @param mode - citation mode.
 * @param locale - optional BCP-47 locale for localized terms (e.g. "hu-HU").
 * @returns formatted label string.
 */
export function formatCitationLabel(
    item: ZoteroItem,
    mode: CitationMode,
    locale?: string | null
): string {
    const terms = getLocaleTerms(locale);
    const author = buildAuthorPart(item, terms);
    const year = buildYearPart(item);

    if (mode === "narrative") {
        return year ? `${author} (${year})` : author;
    }
    // Parenthetical: no outer parens – CSS adds them when rendering the node
    // (and groups consecutive citations: "Smith, 2020; Jones, 2021").
    return year ? `${author}, ${year}` : author;
}

/**
 * All unique "et al." and "and" terms across every known locale, used for
 * replacing localised terms in existing citation node text when the locale changes.
 */
const ALL_ET_AL_TERMS = [
    ...new Set([DEFAULT_TERMS.etAl, ...Object.values(LOCALE_TERMS).map((t) => t.etAl)]),
];
const ALL_AND_TERMS = [
    ...new Set([DEFAULT_TERMS.and, ...Object.values(LOCALE_TERMS).map((t) => t.and)]),
];

/**
 * Rewrites a stored citation label text so that its locale-specific terms
 * ("et al.", "és mtsai.", "i in.", the author conjunction) match the given
 * target locale. Used when the document language changes and existing citation
 * nodes need to be updated.
 *
 * The replacement is order-safe because we replace whole tokens surrounded by
 * word-boundaries / known punctuation rather than arbitrary substrings.
 *
 * @param text - current citation node text attr, e.g. `"Palatinus et al., 2022"`.
 * @param newLocale - target BCP-47 locale, e.g. `"hu-HU"`.
 * @returns rewritten text, e.g. `"Palatinus és mtsai., 2022"`.
 */
export function rewriteCitationText(text: string, newLocale: string | undefined | null): string {
    const newTerms = getLocaleTerms(newLocale);
    let result = text;

    // Replace et al. variants (the string may end with punctuation directly after)
    for (const old of ALL_ET_AL_TERMS) {
        if (old !== newTerms.etAl) {
            result = result.split(old).join(newTerms.etAl);
        }
    }

    // Replace "and" conjunction only when it appears as ` X ` surrounded by spaces
    // (author separator), to avoid touching years or title words.
    for (const old of ALL_AND_TERMS) {
        if (old !== newTerms.and) {
            // Only replace the pattern " old " to avoid false positives
            result = result.split(` ${old} `).join(` ${newTerms.and} `);
        }
    }

    return result;
}

/**
 * A tag/chip-based search dialog that queries the Zotero library via the
 * Outline server proxy. Selected items appear as removable chips inside the
 * search input area; searching remains active after each selection so
 * multiple references can be picked without re-opening the dialog.
 *
 * On insert the selected items are sorted alphabetically by first-author
 * last name (APA7 convention for multiple works in one parenthesis).
 */
function CitationSearch({ isOpen, onClose, onSelect, locale }: Props) {
    const { t } = useTranslation();
    const [query, setQuery] = React.useState("");
    const [results, setResults] = React.useState<ZoteroItem[]>([]);
    /** Ordered list of selected items (insertion order kept, sorted on confirm). */
    const [selected, setSelected] = React.useState<ZoteroItem[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [highlightIndex, setHighlightIndex] = React.useState(0);
    const [mode, setMode] = React.useState<CitationMode>("parenthetical");
    const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Track whether the dropdown is visible
    const dropdownOpen = query.trim().length > 0;

    // Reset state every time the dialog opens
    React.useEffect(() => {
        if (isOpen) {
            setQuery("");
            setResults([]);
            setSelected([]);
            setError(null);
            setHighlightIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Debounced search
    React.useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        if (!query.trim()) {
            setResults([]);
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
            setResults(data.data ?? []);
            setHighlightIndex(0);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : t("Failed to search Zotero. Check your settings.")
            );
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Adds an item to the selection (if not already present), then clears the
     * search query so the user can immediately search for another reference.
     *
     * @param item - Zotero item to add.
     */
    const addItem = React.useCallback((item: ZoteroItem) => {
        setSelected((prev) => {
            if (prev.some((s) => s.key === item.key)) {
                return prev;
            }
            return [...prev, item];
        });
        setQuery("");
        setResults([]);
        setTimeout(() => inputRef.current?.focus(), 0);
    }, []);

    /**
     * Removes an item from the selection.
     *
     * @param key - Zotero item key to remove.
     */
    const removeItem = React.useCallback((key: string) => {
        setSelected((prev) => prev.filter((i) => i.key !== key));
        setTimeout(() => inputRef.current?.focus(), 0);
    }, []);

    /**
     * Confirms the selection, sorts by first-author last name (A→Z), and
     * calls the parent callback.
     */
    const handleConfirm = React.useCallback(() => {
        if (selected.length === 0) {
            return;
        }

        const sorted = [...selected].sort((a, b) =>
            firstAuthorLastName(a).localeCompare(
                firstAuthorLastName(b),
                undefined,
                { sensitivity: "base" }
            )
        );

        const citations: SelectedCitation[] = sorted.map((item) => ({
            key: item.key,
            text: formatCitationLabel(item, mode, locale),
            title: item.data.title ?? "",
            mode,
        }));

        onSelect(citations, mode);
    }, [selected, mode, onSelect]);

    /**
     * Keyboard handler for the input field.
     *
     * - `ArrowDown/Up` – navigate dropdown
     * - `Enter` – add highlighted result or confirm if no dropdown
     * - `Backspace` on empty input – remove last chip
     * - `Escape` – close
     *
     * @param e - React keyboard event.
     */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setHighlightIndex((i) =>
                    Math.min(i + 1, results.length - 1)
                );
                break;
            case "ArrowUp":
                e.preventDefault();
                setHighlightIndex((i) => Math.max(i - 1, 0));
                break;
            case "Enter":
                e.preventDefault();
                if (dropdownOpen && results[highlightIndex]) {
                    addItem(results[highlightIndex]);
                } else if (!dropdownOpen) {
                    handleConfirm();
                }
                break;
            case "Backspace":
                if (query === "" && selected.length > 0) {
                    removeItem(selected[selected.length - 1].key);
                }
                break;
            case "Escape":
                if (dropdownOpen) {
                    setQuery("");
                } else {
                    onClose();
                }
                break;
            default:
                break;
        }
    };

    /** Short chip label: first author + year, no parentheses. */
    const chipLabel = (item: ZoteroItem): string => {
        const author = firstAuthorLastName(item);
        const year = buildYearPart(item);
        return year ? `${author}, ${year}` : author;
    };

    return (
        <Modal
            isOpen={isOpen}
            onRequestClose={onClose}
            title={t("Search Zotero")}
            width={560}
        >
            <Container>
                {/* Tag input area */}
                <InputArea
                    onClick={() => inputRef.current?.focus()}
                    hasChips={selected.length > 0}
                >
                    {selected.length === 0 && !query && (
                        <SearchIconWrapper>
                            <SearchIcon color="currentColor" size={18} />
                        </SearchIconWrapper>
                    )}
                    {selected.map((item) => (
                        <Chip key={item.key} title={item.data.title}>
                            <ChipLabel>{chipLabel(item)}</ChipLabel>
                            <ChipRemove
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeItem(item.key);
                                }}
                                aria-label={t("Remove")}
                                type="button"
                            >
                                <CloseIcon size={12} color="currentColor" />
                            </ChipRemove>
                        </Chip>
                    ))}
                    <InlineInput
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            selected.length === 0
                                ? t("Search by title, author, keyword…")
                                : t("Add another…")
                        }
                        aria-label={t("Search Zotero")}
                        autoComplete="off"
                    />
                </InputArea>

                {error && <ErrorText>{error}</ErrorText>}

                {/* Dropdown results */}
                {dropdownOpen && (
                    <DropdownWrapper>
                        <Scrollable shadow style={{ maxHeight: 280 }}>
                            {loading && (
                                <StatusText>{t("Searching…")}</StatusText>
                            )}
                            {!loading && results.length === 0 && !error && (
                                <StatusText>
                                    {t("No results found.")}
                                </StatusText>
                            )}
                            {!loading &&
                                results.map((item, index) => {
                                    const alreadySelected = selected.some(
                                        (s) => s.key === item.key
                                    );
                                    return (
                                        <ResultItem
                                            key={item.key}
                                            highlighted={
                                                index === highlightIndex
                                            }
                                            selected={alreadySelected}
                                            onMouseDown={(e) => {
                                                // Use mousedown so the input doesn't lose focus
                                                e.preventDefault();
                                                if (!alreadySelected) {
                                                    addItem(item);
                                                } else {
                                                    removeItem(item.key);
                                                }
                                            }}
                                            onMouseEnter={() =>
                                                setHighlightIndex(index)
                                            }
                                        >
                                            <SelectedDot visible={alreadySelected} />
                                            <ResultBody>
                                                <ResultTitle>
                                                    {item.data.title ?? item.key}
                                                </ResultTitle>
                                                <ResultMeta>
                                                    {formatCitationLabel(
                                                        item,
                                                        mode,
                                                        locale
                                                    )}
                                                    {item.data.publicationTitle
                                                        ? ` — ${item.data.publicationTitle}`
                                                        : ""}
                                                </ResultMeta>
                                            </ResultBody>
                                        </ResultItem>
                                    );
                                })}
                        </Scrollable>
                    </DropdownWrapper>
                )}

                {!dropdownOpen && selected.length === 0 && (
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

                    <Button
                        onClick={handleConfirm}
                        disabled={selected.length === 0}
                        type="button"
                    >
                        {selected.length > 1
                            ? t("Insert {{n}} citations", {
                                n: selected.length,
                            })
                            : t("Insert")}
                    </Button>
                </Footer>
            </Container>
        </Modal>
    );
}

const Container = styled.div`
  padding: 0;
`;

const InputArea = styled.div<{ hasChips: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: ${({ hasChips }) => (hasChips ? "10px 12px" : "10px 16px")};
  border-bottom: 1px solid ${s("divider")};
  cursor: text;
  min-height: 48px;
`;

const SearchIconWrapper = styled.span`
  color: ${s("textTertiary")};
  display: flex;
  align-items: center;
  flex-shrink: 0;
`;

const Chip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 8px;
  background: ${s("accent")};
  color: ${s("accentText")};
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  max-width: 220px;
  white-space: nowrap;
`;

const ChipLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChipRemove = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
  opacity: 0.8;
  flex-shrink: 0;

  &:hover {
    opacity: 1;
  }
`;

const InlineInput = styled.input`
  flex: 1;
  min-width: 140px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: ${s("text")};

  &::placeholder {
    color: ${s("placeholder")};
  }
`;

const DropdownWrapper = styled.div`
  border-bottom: 1px solid ${s("divider")};
`;

const ResultItem = styled.div<{ highlighted: boolean; selected: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 16px;
  cursor: pointer;
  background: ${({ highlighted }) =>
        highlighted ? s("listItemHoverBackground") : "transparent"};
  opacity: ${({ selected }) => (selected ? 0.55 : 1)};

  &:hover {
    background: ${s("listItemHoverBackground")};
  }
`;

const SelectedDot = styled.div<{ visible: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${s("accent")};
  margin-top: 6px;
  flex-shrink: 0;
  opacity: ${({ visible }) => (visible ? 1 : 0)};
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
  background: ${s("backgroundSecondary")};
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

export default observer(CitationSearch);
