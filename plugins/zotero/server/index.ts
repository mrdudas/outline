/**
 * Server-side entry point for the Zotero plugin.
 *
 * Registers the Zotero API router under the `API` hook so that
 * `GET /api/zotero.search` and `POST /api/zotero.bibliography` are
 * mounted on the Outline API server.
 */
import { PluginManager, Hook } from "@server/utils/PluginManager";
import config from "../plugin.json";
import router from "./api/zotero";

PluginManager.add([
    {
        ...config,
        type: Hook.API,
        value: router,
    },
]);
