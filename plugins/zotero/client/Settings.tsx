import find from "lodash/find";
import { observer } from "mobx-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { IntegrationType, IntegrationService } from "@shared/types";
import type Integration from "~/models/Integration";
import { IntegrationScene } from "~/scenes/Settings/components/IntegrationScene";
import SettingRow from "~/scenes/Settings/components/SettingRow";
import Actions from "~/components/Actions";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import Input from "~/components/Input";
import Text from "~/components/Text";
import useCurrentUser from "~/hooks/useCurrentUser";
import useStores from "~/hooks/useStores";
import styled from "styled-components";
import { s } from "@shared/styles";
import { client } from "~/utils/ApiClient";
import { disconnectIntegrationFactory } from "~/actions/definitions/integrations";
import Icon from "./Icon";

type FormData = {
    url: string;
    apiKey: string;
    userId: string;
    /** CSL style name for bibliography generation, e.g. "apa", "nature", "vancouver". */
    defaultStyle: string;
    /** BCP 47 locale for bibliography formatting, e.g. "en-US", "hu-HU". */
    defaultLocale: string;
};

/** Commonly used CSL citation styles. */
const CITATION_STYLES = [
    { value: "apa", label: "APA 7th" },
    { value: "nature", label: "Nature" },
    { value: "vancouver", label: "Vancouver" },
    { value: "harvard-cite-them-right", label: "Harvard" },
    { value: "chicago-author-date", label: "Chicago (author-date)" },
    { value: "ieee", label: "IEEE" },
    { value: "american-medical-association", label: "AMA" },
];

/**
 * Settings page for the Zotero integration.
 *
 * Allows an admin to configure the Zotero API base URL, API key, and user ID.
 * These credentials are stored as an Embed-type integration and are used by the
 * server-side proxy routes when searching items and generating bibliographies.
 */
function ZoteroSettings() {
    const { integrations } = useStores();
    const { t } = useTranslation();
    const user = useCurrentUser();

    const integration = find(integrations.orderedData, {
        type: IntegrationType.LinkedAccount,
        service: IntegrationService.Zotero,
        userId: user.id,
    }) as Integration<IntegrationType.LinkedAccount> | undefined;

    const savedSettings = integration?.settings?.zotero;

    const {
        register,
        reset,
        handleSubmit: formHandleSubmit,
        formState,
    } = useForm<FormData>({
        mode: "all",
        defaultValues: {
            url: savedSettings?.url ?? "https://api.zotero.org",
            apiKey: savedSettings?.apiKey ?? "",
            userId: savedSettings?.userId ?? "",
            defaultStyle: (savedSettings as any)?.defaultStyle ?? "apa",
            defaultLocale: (savedSettings as any)?.defaultLocale ?? "en-US",
        },
    });

    React.useEffect(() => {
        reset({
            url: savedSettings?.url ?? "https://api.zotero.org",
            apiKey: savedSettings?.apiKey ?? "",
            userId: savedSettings?.userId ?? "",
            defaultStyle: (savedSettings as any)?.defaultStyle ?? "apa",
            defaultLocale: (savedSettings as any)?.defaultLocale ?? "en-US",
        });
    }, [reset, savedSettings]);

    const [testing, setTesting] = React.useState(false);

    /**
     * Fires a test search request against the saved Zotero integration
     * and notifies the user whether the connection is working.
     */
    const handleTest = React.useCallback(async () => {
        if (!integration) {
            toast.error(t("Save your settings first."));
            return;
        }
        setTesting(true);
        try {
            await client.get("/zotero.search", { q: "test", limit: 1 });
            toast.success(t("Connection successful!"));
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : t("Connection failed.")
            );
        } finally {
            setTesting(false);
        }
    }, [integration, t]);

    /**
     * Persists the form values as a `LinkedAccount` integration for the
     * current user. Creates a new integration record or updates the
     * existing one.
     *
     * @param data - validated form values (url, apiKey, userId).
     */
    const handleSubmit = React.useCallback(
        async (data: FormData) => {
            try {
                await integrations.save({
                    id: integration?.id,
                    type: IntegrationType.LinkedAccount,
                    service: IntegrationService.Zotero,
                    userId: user.id,
                    settings: {
                        zotero: {
                            url: data.url.replace(/\/?$/, ""),
                            apiKey: data.apiKey.trim(),
                            userId: data.userId.trim(),
                            defaultStyle: data.defaultStyle.trim() || "apa",
                            defaultLocale: data.defaultLocale.trim() || "en-US",
                        },
                    } as Integration<IntegrationType.LinkedAccount>["settings"],
                });

                toast.success(t("Settings saved"));
            } catch (err) {
                toast.error(err.message);
            }
        },
        [integrations, integration, user.id, t]
    );

    return (
        <IntegrationScene title="Zotero" icon={<Icon />}>
            <Heading>Zotero</Heading>

            <Text as="p" type="secondary">
                <Trans>
                    Connect your personal Zotero library to search and insert
                    citations and bibliographies in your documents. Use the{" "}
                    <strong>/citation</strong> command to search for a reference and
                    <strong> /bibliography</strong> to generate a reference list.
                    Each team member connects their own Zotero account independently.
                </Trans>
            </Text>

            <form onSubmit={formHandleSubmit(handleSubmit)}>
                <SettingRow
                    label={t("Zotero API URL")}
                    name="url"
                    description={t(
                        "The base URL of the Zotero API. Use https://api.zotero.org for the cloud service, or the URL of your self-hosted instance."
                    )}
                    border={false}
                >
                    <Input
                        placeholder="https://api.zotero.org"
                        {...register("url", { required: true })}
                    />
                </SettingRow>

                <SettingRow
                    label={t("User ID")}
                    name="userId"
                    description={t(
                        "Your Zotero numeric user ID. You can find it on the Zotero API Keys page."
                    )}
                    border={false}
                >
                    <Input
                        placeholder="123456"
                        {...register("userId", { required: true })}
                    />
                </SettingRow>

                <SettingRow
                    label={t("API Key")}
                    name="apiKey"
                    description={t(
                        "A Zotero API key with read access to your library. Create one at zotero.org/settings/keys."
                    )}
                    border={false}
                >
                    <Input
                        type="password"
                        placeholder="your-zotero-api-key"
                        {...register("apiKey", { required: true })}
                    />
                </SettingRow>

                <SettingRow
                    label={t("Default citation style")}
                    name="defaultStyle"
                    description={t(
                        "The CSL style used when generating bibliographies. Applies to all documents unless overridden."
                    )}
                    border={false}
                >
                    <StyleSelect {...register("defaultStyle")}>
                        {CITATION_STYLES.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.label}
                            </option>
                        ))}
                    </StyleSelect>
                </SettingRow>

                <SettingRow
                    label={t("Default locale")}
                    name="defaultLocale"
                    description={t(
                        "BCP 47 locale for bibliography formatting, e.g. en-US or hu-HU."
                    )}
                    border={false}
                >
                    <Input
                        placeholder="en-US"
                        {...register("defaultLocale")}
                    />
                </SettingRow>

                <StyledActions reverse justify="end" gap={8}>
                    <Button
                        type="submit"
                        disabled={
                            !formState.isDirty || !formState.isValid || formState.isSubmitting
                        }
                    >
                        {formState.isSubmitting ? `${t("Saving")}\u2026` : t("Save")}
                    </Button>

                    <Button
                        type="button"
                        onClick={handleTest}
                        disabled={!integration || formState.isDirty || testing}
                        neutral
                    >
                        {testing ? `${t("Testing")}\u2026` : t("Test Connection")}
                    </Button>

                    <Button
                        action={disconnectIntegrationFactory(integration)}
                        disabled={formState.isSubmitting}
                        neutral
                        hideIcon
                        hideOnActionDisabled
                    >
                        {t("Disconnect")}
                    </Button>
                </StyledActions>
            </form>
        </IntegrationScene>
    );
}

const StyledActions = styled(Flex)`
  margin-top: 8px;
`;

const StyleSelect = styled.select`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  background: ${s("background")};
  color: ${s("text")};
  font-size: 15px;
  outline: none;

  &:focus {
    border-color: ${s("accent")};
  }
`;

export default observer(ZoteroSettings);
