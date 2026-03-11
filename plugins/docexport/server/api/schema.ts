import type formidable from "formidable";
import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

export const DocExportConvertSchema = BaseSchema.extend({
    body: z.object({
        /** The id of the document to export. */
        id: z.string().uuid(),
        /** The output format: Word document or PDF. */
        format: z.enum(["docx", "pdf"]),
        /** The name of the template to use (without extension). */
        templateName: z.string().min(1),
    }),
});

export type DocExportConvertReq = z.infer<typeof DocExportConvertSchema>;

export const DocExportListTemplatesSchema = BaseSchema.extend({
    body: z.object({}),
});

export type DocExportListTemplatesReq = z.infer<
    typeof DocExportListTemplatesSchema
>;

export const DocExportUploadTemplateSchema = BaseSchema.extend({
    body: z.object({
        /** The name to give the template (without extension). */
        templateName: z.string().min(1),
        file: z.custom<formidable.File>().optional(),
    }),
});

export type DocExportUploadTemplateReq = z.infer<
    typeof DocExportUploadTemplateSchema
>;

export const DocExportTemplateActionSchema = BaseSchema.extend({
    body: z.object({
        /** The name of the template to act on (without extension). */
        templateName: z.string().min(1),
    }),
});

export type DocExportTemplateActionReq = z.infer<
    typeof DocExportTemplateActionSchema
>;
