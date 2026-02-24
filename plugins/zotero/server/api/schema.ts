import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

/** Schema for GET /api/zotero.search */
export const ZoteroSearchSchema = BaseSchema.extend({
    query: z.object({
        /** Search query string. */
        q: z.string().min(1),
        /** Maximum number of results (default 20, max 100). */
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        /** Citation style to use for formatted citations. */
        style: z.string().optional().default("apa"),
    }),
});

export type ZoteroSearchReq = z.infer<typeof ZoteroSearchSchema>;

/** Schema for POST /api/zotero.bibliography */
export const ZoteroBibliographySchema = BaseSchema.extend({
    body: z.object({
        /** Array of Zotero item keys to include in the bibliography. */
        keys: z.array(z.string().min(1)).min(1).max(50),
        /** Citation style (CSL filename without .csl extension, or a remote URL). */
        style: z.string().optional().default("apa"),
        /** Bibliography locale. */
        locale: z.string().optional().default("en-US"),
    }),
});

export type ZoteroBibliographyReq = z.infer<typeof ZoteroBibliographySchema>;
