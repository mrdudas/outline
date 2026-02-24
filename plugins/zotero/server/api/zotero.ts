import Router from "koa-router";
import {
    IntegrationService,
    IntegrationType,
    type IntegrationSettings,
} from "@shared/types";
import {
    NotFoundError,
    InvalidRequestError,
} from "@server/errors";
import auth from "@server/middlewares/authentication";
import validate from "@server/middlewares/validate";
import { Integration } from "@server/models";
import type { APIContext } from "@server/types";
import * as T from "./schema";

const router = new Router();

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Retrieves and validates the Zotero integration settings for the current
 * user. Throws a NotFoundError when not configured.
 *
 * @param userId - the authenticated user's id.
 * @returns the Zotero settings object.
 */
async function requireZoteroSettings(userId: string) {
    const integration = await Integration.findOne({
        where: {
            userId,
            service: IntegrationService.Zotero,
            type: IntegrationType.LinkedAccount,
        },
    });

    const settings = (
        integration?.settings as IntegrationSettings<IntegrationType.LinkedAccount>
    )?.zotero;

    if (!integration || !settings?.url || !settings?.apiKey || !settings?.userId) {
        throw NotFoundError(
            "Zotero is not connected. Go to Settings → Account → Zotero."
        );
    }

    return settings;
}

// ---------------------------------------------------------------------------
// GET /api/zotero.search
// ---------------------------------------------------------------------------

/**
 * GET /api/zotero.search
 *
 * Proxies a search request to the Zotero Web API on behalf of the
 * authenticated user. Requires a saved Zotero integration (API key,
 * user ID and base URL).
 *
 * Query params: `q` (string), `limit` (number, default 20), `style`
 * (CSL style name, default "apa").
 *
 * Returns `{ data: ZoteroItem[] }` where each item has `key`, `data`
 * (raw Zotero item fields) and an optional pre-formatted `citation` string.
 */
router.get(
    "zotero.search",
    auth(),
    validate(T.ZoteroSearchSchema),
    async (ctx: APIContext<T.ZoteroSearchReq>) => {
        const { q, limit } = ctx.input.query;
        const { user } = ctx.state.auth;

        const settings = await requireZoteroSettings(user.id);

        const base = settings.url.replace(/\/+$/, "");
        const zoteroUrl = new URL(`${base}/users/${settings.userId}/items`);
        zoteroUrl.searchParams.set("q", q);
        zoteroUrl.searchParams.set("limit", String(limit));
        zoteroUrl.searchParams.set("qmode", "titleCreatorYear");
        zoteroUrl.searchParams.set("include", "data");
        zoteroUrl.searchParams.set("v", "3");

        const res = await fetch(zoteroUrl.toString(), {
            headers: {
                "Zotero-API-Key": settings.apiKey,
                "Zotero-API-Version": "3",
                Accept: "application/json",
            },
        });

        if (!res.ok) {
            throw InvalidRequestError(
                `Zotero API returned ${res.status}: ${await res.text()}`
            );
        }

        const rawItems = (await res.json()) as Array<{
            key: string;
            data: Record<string, unknown>;
            citation?: string;
        }>;

        ctx.body = {
            data: rawItems.map((item) => ({
                key: item.key,
                data: item.data,
                // Zotero returns citation as an HTML fragment; strip tags for plain text
                citation: item.citation
                    ? item.citation.replace(/<[^>]+>/g, "").trim()
                    : undefined,
            })),
        };
    }
);

// ---------------------------------------------------------------------------
// POST /api/zotero.bibliography
// ---------------------------------------------------------------------------

type ZoteroCreator = {
    firstName?: string;
    lastName?: string;
    name?: string;
    creatorType?: string;
};

type ZoteroItemData = {
    title?: string;
    date?: string;
    itemType?: string;
    creators?: ZoteroCreator[];
    publicationTitle?: string;
    journalAbbreviation?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    publisher?: string;
    place?: string;
    DOI?: string;
    url?: string;
};

/**
 * Formats a single Zotero item as a plain-text APA-like bibliography entry.
 * Used as fallback when the Zotero server does not support citeproc
 * (`format=bib` returns 500 on many self-hosted instances).
 *
 * @param data - raw Zotero item data fields.
 * @returns HTML paragraph string for the reference.
 */
function formatBibEntry(data: ZoteroItemData): string {
    const escape = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const creators = data.creators ?? [];
    const authors = creators.filter(
        (c) => c.creatorType === "author" || creators.length === 1
    );

    let authorStr = "";
    if (authors.length === 0) {
        authorStr = "Unknown Author";
    } else {
        authorStr = authors
            .map((a) => {
                if (a.lastName && a.firstName) {
                    return `${a.lastName}, ${a.firstName.charAt(0)}.`;
                }
                return a.lastName ?? a.name ?? "Unknown";
            })
            .join(", & ");
    }

    const year = data.date
        ? new Date(data.date).getFullYear() || data.date.slice(0, 4)
        : "n.d.";

    const title = data.title ? escape(data.title) : "Untitled";

    const parts: string[] = [`${escape(authorStr)} (${year}). ${title}.`];

    const journal = data.publicationTitle ?? data.journalAbbreviation;
    if (journal) {
        let journalPart = `<em>${escape(journal)}</em>`;
        if (data.volume) {
            journalPart += `, <em>${escape(data.volume)}</em>`;
            if (data.issue) {
                journalPart += `(${escape(data.issue)})`;
            }
        }
        if (data.pages) {
            journalPart += `, ${escape(data.pages)}`;
        }
        parts.push(journalPart + ".");
    } else if (data.publisher) {
        const pub = data.place
            ? `${escape(data.place)}: ${escape(data.publisher)}`
            : escape(data.publisher);
        parts.push(`${pub}.`);
    }

    if (data.DOI) {
        parts.push(`https://doi.org/${escape(data.DOI)}`);
    } else if (data.url) {
        parts.push(escape(data.url));
    }

    return `<p>${parts.join(" ")}</p>`;
}

/**
 * POST /api/zotero.bibliography
 *
 * Fetches the requested items as JSON from the Zotero API, then formats
 * them into an APA-like HTML bibliography server-side. This approach works
 * with both the Zotero cloud API and self-hosted instances that do not have
 * the citeproc endpoint enabled.
 *
 * Body params: `keys` (string[], max 50).
 *
 * Returns `{ data: { bibliography: string } }` where `bibliography` is an
 * HTML string that can be inserted directly into the document.
 */
router.post(
    "zotero.bibliography",
    auth(),
    validate(T.ZoteroBibliographySchema),
    async (ctx: APIContext<T.ZoteroBibliographyReq>) => {
        const { keys } = ctx.input.body;
        const { user } = ctx.state.auth;

        const settings = await requireZoteroSettings(user.id);

        const base = settings.url.replace(/\/+$/, "");
        const zoteroUrl = new URL(`${base}/users/${settings.userId}/items`);
        zoteroUrl.searchParams.set("itemKey", keys.join(","));
        zoteroUrl.searchParams.set("include", "data");
        zoteroUrl.searchParams.set("v", "3");

        const res = await fetch(zoteroUrl.toString(), {
            headers: {
                "Zotero-API-Key": settings.apiKey,
                "Zotero-API-Version": "3",
                Accept: "application/json",
            },
        });

        if (!res.ok) {
            throw InvalidRequestError(
                `Zotero API returned ${res.status}: ${await res.text()}`
            );
        }

        const rawItems = (await res.json()) as Array<{
            key: string;
            data: ZoteroItemData;
        }>;

        // Preserve the order requested by the client
        const keyOrder = new Map(keys.map((k, i) => [k, i]));
        const sorted = [...rawItems].sort(
            (a, b) => (keyOrder.get(a.key) ?? 0) - (keyOrder.get(b.key) ?? 0)
        );

        const entries = sorted.map((item) => formatBibEntry(item.data));
        const html = `<div data-zotero-bibliography="1">\n${entries.join("\n")}\n</div>`;

        ctx.body = {
            data: { bibliography: html },
        };
    }
);

export default router;
