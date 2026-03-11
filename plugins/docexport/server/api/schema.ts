import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

export const DocExportConvertSchema = BaseSchema.extend({
  body: z.object({
    /** The id of the document to export. */
    id: z.string().uuid(),
    /** The output format: Word document or PDF. */
    format: z.enum(["docx", "pdf"]),
  }),
});

export type DocExportConvertReq = z.infer<typeof DocExportConvertSchema>;
