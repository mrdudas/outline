import fs from "node:fs";
import FormData from "form-data";
import Router from "koa-router";
import mime from "mime-types";
import documentLoader from "@server/commands/documentLoader";
import auth from "@server/middlewares/authentication";
import multipart from "@server/middlewares/multipart";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import { Attachment } from "@server/models";
import { authorize } from "@server/policies";
import FileStorage from "@server/storage/files";
import type { APIContext } from "@server/types";
import fetch from "@server/utils/fetch";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import env from "../env";
import * as T from "./schema";

const router = new Router();

/** Returns a stable team-scoped username for the engine. */
function teamUserName(teamId: string) {
    return `team_${teamId.replace(/-/g, "")}`;
}

function engineHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (env.DOCEXPORT_ENGINE_API_KEY) {
        h["Authorization"] = `Bearer ${env.DOCEXPORT_ENGINE_API_KEY}`;
    }
    return h;
}

/**
 * Converts a single image src to a base64 data URI.
 * Handles Outline attachment redirect URLs (/api/attachments.redirect?id=...)
 * and direct external URLs.
 *
 * @param src - The image src attribute value.
 * @returns The base64 data URI, or the original src if conversion fails.
 */
async function srcToDataUri(src: string): Promise<string> {
    // Already embedded
    if (src.startsWith("data:")) {
        return src;
    }

    try {
        // Outline internal attachment: /api/attachments.redirect?id=UUID
        const redirectMatch = src.match(/\/api\/attachments\.redirect\?id=([^&]+)/);
        if (redirectMatch) {
            const id = decodeURIComponent(redirectMatch[1]);
            const attachment = await Attachment.findByPk(id);
            if (attachment) {
                const buffer = await FileStorage.getFileBuffer(attachment.key);
                const mimeType =
                    attachment.contentType ??
                    (mime.lookup(attachment.key) || "application/octet-stream");
                return `data:${mimeType};base64,${buffer.toString("base64")}`;
            }
        }

        // External or direct storage URL: fetch it
        const response = await fetch(src, { method: "GET" });
        if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            const mimeType =
                response.headers.get("content-type")?.split(";")[0] ?? "image/png";
            return `data:${mimeType};base64,${buffer.toString("base64")}`;
        }
    } catch {
        // Return original src if anything fails — better than crashing the export
    }

    return src;
}

/**
 * Deep-walks a ProseMirror JSON node and embeds all image srcs as base64 data URIs.
 *
 * @param node - The ProseMirror node to process.
 * @returns The same node structure with image srcs replaced by data URIs.
 */
async function embedImages(node: any): Promise<any> {
    if (!node || typeof node !== "object") {
        return node;
    }

    if (node.type === "image" && node.attrs?.src) {
        return {
            ...node,
            attrs: {
                ...node.attrs,
                src: await srcToDataUri(node.attrs.src),
            },
        };
    }

    if (Array.isArray(node.content)) {
        return {
            ...node,
            content: await Promise.all(node.content.map(embedImages)),
        };
    }

    return node;
}


router.post(
    "docexport.templates.list",
    rateLimiter(RateLimiterStrategy.OneHundredPerMinute),
    auth(),
    async (ctx: APIContext) => {
        const { user } = ctx.state.auth;
        const userName = teamUserName(user.teamId);
        const engineUrl = env.DOCEXPORT_ENGINE_URL!;

        const response = await fetch(`${engineUrl}/templates/${userName}`, {
            method: "GET",
            headers: engineHeaders(),
        });

        if (!response.ok) {
            ctx.body = { data: { templates: [] } };
            return;
        }

        const data = (await response.json()) as { templates: string[] };
        ctx.body = { data: { templates: data.templates ?? [] } };
    }
);

router.post(
    "docexport.templates.upload",
    rateLimiter(RateLimiterStrategy.TenPerMinute),
    auth(),
    multipart({ maximumFileSize: 10 * 1024 * 1024 }),
    validate(T.DocExportUploadTemplateSchema),
    async (ctx: APIContext<T.DocExportUploadTemplateReq>) => {
        const { templateName } = ctx.input.body;
        const { user } = ctx.state.auth;
        const file = ctx.input.file;

        if (!file) {
            ctx.throw(400, "No file provided");
            return;
        }

        const userName = teamUserName(user.teamId);
        const engineUrl = env.DOCEXPORT_ENGINE_URL!;

        const form = new FormData();
        form.append("template_name", templateName);
        form.append("file", fs.createReadStream(file.filepath), {
            filename: file.originalFilename ?? `${templateName}.docx`,
            contentType:
                file.mimetype ??
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

        const response = await fetch(`${engineUrl}/templates/${userName}`, {
            method: "POST",
            headers: {
                ...engineHeaders(),
                ...form.getHeaders(),
            },
            body: form,
        });

        if (!response.ok) {
            const text = await response.text();
            ctx.throw(502, `Engine error: ${text}`);
            return;
        }

        ctx.body = { success: true };
    }
);

router.post(
    "docexport.convert",
    rateLimiter(RateLimiterStrategy.TenPerMinute),
    auth(),
    validate(T.DocExportConvertSchema),
    async (ctx: APIContext<T.DocExportConvertReq>) => {
        const { id, format, templateName } = ctx.input.body;
        const { user } = ctx.state.auth;

        const document = await documentLoader({
            id,
            user,
            includeState: false,
        });

        authorize(user, "download", document);

        const content = document.content
            ? await embedImages(document.content)
            : document.content;

        const userName = teamUserName(user.teamId);
        const engineUrl = env.DOCEXPORT_ENGINE_URL!;

        const response = await fetch(`${engineUrl}/convert`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...engineHeaders(),
            },
            body: JSON.stringify({
                user_name: userName,
                template_name: templateName,
                payload: {
                    format,
                    document: {
                        id: document.id,
                        title: document.title,
                        content,
                    },
                },
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            ctx.throw(502, `Engine error: ${text}`);
            return;
        }

        const contentType =
            response.headers.get("content-type") ??
            (format === "pdf"
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

        const filename = `${document.title}.${format}`;

        ctx.set("Content-Type", contentType);
        ctx.set(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(filename)}"`
        );
        ctx.body = response.body;
    }
);

export default router;
