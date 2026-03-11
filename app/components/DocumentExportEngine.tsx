import { observer } from "mobx-react";
import { DownloadIcon, ExportIcon, TrashIcon } from "outline-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type Document from "~/models/Document";
import Button from "~/components/Button";
import ConfirmationDialog from "~/components/ConfirmationDialog";
import Flex from "~/components/Flex";
import { InputSelect } from "~/components/InputSelect";
import Text from "~/components/Text";
import { client } from "~/utils/ApiClient";

type Props = {
    document: Document;
    onSubmit: () => void;
};

const FORMAT_OPTIONS = [
    { type: "item" as const, label: "Word (.docx)", value: "docx" },
    { type: "item" as const, label: "PDF (.pdf)", value: "pdf" },
];

export const DocumentExportEngine = observer(({ document, onSubmit }: Props) => {
    const { t } = useTranslation();
    const [format, setFormat] = useState<"docx" | "pdf">("docx");
    const [templates, setTemplates] = useState<string[]>([]);
    const [templateName, setTemplateName] = useState<string>("");
    const [uploading, setUploading] = useState(false);
    const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        client
            .post("/docexport.templates.list", {})
            .then((res: any) => {
                const list: string[] = res?.data?.templates ?? [];
                setTemplates(list);
                if (list.length > 0) {
                    setTemplateName(list[0]);
                }
            })
            .catch(() => {
                // engine unreachable – continue without templates
            });
    }, []);

    const handleUploadClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
        async (ev: React.ChangeEvent<HTMLInputElement>) => {
            const file = ev.target.files?.[0];
            if (!file) {
                return;
            }

            const name = file.name.replace(/\.docx$/i, "");
            const formData = new FormData();
            formData.append("templateName", name);
            formData.append("file", file);

            setUploading(true);
            try {
                await client.post("/docexport.templates.upload", formData);
                toast.success(t("Template uploaded"));
                const res: any = await client.post("/docexport.templates.list", {});
                const list: string[] = res?.data?.templates ?? [];
                setTemplates(list);
                setTemplateName(name);
            } catch {
                toast.error(t("Template upload failed"));
            } finally {
                setUploading(false);
                // reset so the same file can be re-uploaded
                ev.target.value = "";
            }
        },
        [t]
    );

    const handleDownloadTemplate = useCallback(
        async (name: string) => {
            try {
                await client.post(
                    "/docexport.templates.download",
                    { templateName: name },
                    { download: true }
                );
            } catch {
                toast.error(t("Template download failed"));
            }
        },
        [t]
    );

    const handleDeleteTemplate = useCallback(
        async (name: string) => {
            setDeletingTemplate(name);
            try {
                await client.post("/docexport.templates.delete", {
                    templateName: name,
                });
                toast.success(t("Template deleted"));
                const res: any = await client.post("/docexport.templates.list", {});
                const list: string[] = res?.data?.templates ?? [];
                setTemplates(list);
                if (templateName === name) {
                    setTemplateName(list[0] ?? "");
                }
            } catch {
                toast.error(t("Template delete failed"));
            } finally {
                setDeletingTemplate(null);
            }
        },
        [t, templateName]
    );

    const handleSubmit = useCallback(async () => {
        await client.post(
            "/docexport.convert",
            { id: document.id, format, templateName },
            { download: true }
        );
        onSubmit();
    }, [document.id, format, templateName, onSubmit]);

    const templateOptions = templates.map((name) => ({
        type: "item" as const,
        label: name,
        value: name,
    }));

    return (
        <ConfirmationDialog
            onSubmit={handleSubmit}
            submitText={t("Export")}
            disabled={!templateName}
        >
            <Flex gap={16} column>
                <Flex gap={8} column>
                    <Text as="p" size="small" weight="bold">
                        {t("Format")}
                    </Text>
                    <InputSelect
                        label={t("Format")}
                        options={FORMAT_OPTIONS}
                        value={format}
                        onChange={(v) => setFormat(v as "docx" | "pdf")}
                    />
                </Flex>

                <Flex gap={8} column>
                    <Flex justify="space-between" align="center">
                        <Text as="p" size="small" weight="bold">
                            {t("Template")}
                        </Text>
                        <Flex gap={4}>
                            <Button
                                type="button"
                                onClick={() => templateName && handleDownloadTemplate(templateName)}
                                disabled={!templateName}
                                icon={<DownloadIcon />}
                                neutral
                                small
                            >
                                {t("Download")}
                            </Button>
                            <Button
                                type="button"
                                onClick={() => templateName && handleDeleteTemplate(templateName)}
                                disabled={!templateName || deletingTemplate === templateName}
                                icon={<TrashIcon />}
                                neutral
                                small
                                danger
                            >
                                {deletingTemplate === templateName ? t("Deleting…") : t("Delete")}
                            </Button>
                            <Button
                                type="button"
                                onClick={handleUploadClick}
                                disabled={uploading}
                                icon={<ExportIcon />}
                                neutral
                                small
                            >
                                {uploading ? t("Uploading…") : t("Upload")}
                            </Button>
                            <HiddenInput
                                ref={fileInputRef}
                                type="file"
                                accept=".docx"
                                onChange={handleFileChange}
                            />
                        </Flex>
                    </Flex>

                    {templateOptions.length > 0 ? (
                        <InputSelect
                            label={t("Template")}
                            options={templateOptions}
                            value={templateName}
                            onChange={setTemplateName}
                        />
                    ) : (
                        <Text size="small" type="secondary">
                            {t("No templates yet. Upload a .docx file to use as a template.")}
                        </Text>
                    )}
                </Flex>
            </Flex>
        </ConfirmationDialog>
    );
});

const HiddenInput = styled.input`
  display: none;
`;
