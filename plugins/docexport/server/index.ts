import { Hook, PluginManager } from "@server/utils/PluginManager";
import config from "../plugin.json";
import router from "./api/docexport";
import env from "./env";

if (env.DOCEXPORT_ENGINE_URL) {
    PluginManager.add([
        {
            ...config,
            type: Hook.API,
            value: router,
        },
    ]);
}
