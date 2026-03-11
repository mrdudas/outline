import Router from "koa-router";
import documentLoader from "@server/commands/documentLoader";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import validate from "@server/middlewares/validate";
import { authorize } from "@server/policies";
import type { APIContext } from "@server/types";
import fetch from "@server/utils/fetch";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import env from "../env";
import * as T from "./schema";

const router = new Router();

router.post(
  "docexport.convert",
  rateLimiter(RateLimiterStrategy.TenPerMinute),
  auth(),
  validate(T.DocExportConvertSchema),
  async (ctx: APIContext<T.DocExportConvertReq>) => {
    const { id, format } = ctx.input.body;
    const { user } = ctx.state.auth;

    const document = await documentLoader({
      id,
      user,
      includeState: false,
    });

    authorize(user, "download", document);

    const engineUrl = env.DOCEXPORT_ENGINE_URL!;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (env.DOCEXPORT_ENGINE_API_KEY) {
      headers["Authorization"] = `Bearer ${env.DOCEXPORT_ENGINE_API_KEY}`;
    }

    const response = await fetch(`${engineUrl}/convert`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        format,
        title: document.title,
        date: document.updatedAt.toISOString().slice(0, 10),
        doc_id: document.id,
        content: document.content,
      }),
    });

    if (!response.ok) {
      throw new Error(`Conversion engine returned status ${response.status}`);
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
