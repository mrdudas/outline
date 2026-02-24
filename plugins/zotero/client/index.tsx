import { createLazyComponent } from "~/components/LazyLoad";
import { Hook, PluginManager } from "~/utils/PluginManager";
import config from "../plugin.json";
import Icon from "./Icon";

PluginManager.add([
    {
        ...config,
        type: Hook.Settings,
        value: {
            group: "Account",
            icon: Icon,
            description:
                "Connect your personal Zotero library to insert citations and bibliographies into documents.",
            component: createLazyComponent(() => import("./Settings")),
            enabled: () => true,
        },
    },
]);
