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
        const { q, limit, style } = ctx.input.query;
        const { user } = ctx.state.auth;

        const settings = await requireZoteroSettings(user.id);

        const zoteroUrl = new URL(
            `/users/${settings.userId}/items`,
            settings.url.endsWith("/") ? settings.url : settings.url + "/"
        );
        zoteroUrl.searchParams.set("q", q);
        zoteroUrl.searchParams.set("limit", String(limit));
        zoteroUrl.searchParams.set("qmode", "titleCreatorYear");
        // Request both raw data and pre-formatted individual citations
        zoteroUrl.searchParams.set("include", `data,citation`);
        zoteroUrl.searchParams.set("style", style);
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

/**
 * POST /api/zotero.bibliography
 *
 * Fetches a formatted bibliography for the given item keys from the
 * Zotero Web API and returns the raw XHTML fragment produced by Zotero.
 *
 * Body params: `keys` (string[], max 50), `style` (CSL style name,
 * default "apa"), `locale` (IETF tag, default "en-US").
 *
 * Returns `{ data: { bibliography: string } }` where `bibliography` is
 * the XHTML string that can be inserted directly into the document.
 */
router.post(
    "zotero.bibliography",
    auth(),
    validate(T.ZoteroBibliographySchema),
    async (ctx: APIContext<T.ZoteroBibliographyReq>) => {
        const { keys, style, locale } = ctx.input.body;
        const { user } = ctx.state.auth;

        const settings = await requireZoteroSettings(user.id);

        const zoteroUrl = new URL(
            `/users/${settings.userId}/items`,
            settings.url.endsWith("/") ? settings.url : settings.url + "/"
        );
        zoteroUrl.searchParams.set("itemKey", keys.join(","));
        zoteroUrl.searchParams.set("format", "bib");
        zoteroUrl.searchParams.set("style", style);
        zoteroUrl.searchParams.set("locale", locale);
        zoteroUrl.searchParams.set("v", "3");

        const res = await fetch(zoteroUrl.toString(), {
            headers: {
                "Zotero-API-Key": settings.apiKey,
                "Zotero-API-Version": "3",
                Accept: "text/html",
            },
        });

        if (!res.ok) {
            throw InvalidRequestError(
                `Zotero API returned ${res.status}: ${await res.text()}`
            );
        }

        const html = await res.text();

        ctx.body = {
            data: { bibliography: html },
        };
    }
);

export default router;
