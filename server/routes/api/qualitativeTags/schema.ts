import { z } from "zod";
import { BaseSchema } from "@server/routes/api/schema";

const BaseIdSchema = z.object({
    id: z.uuid(),
});

export const QualitativeTagsListSchema = BaseSchema.extend({
    body: z.object({
        collectionId: z.uuid(),
    }),
});

export type QualitativeTagsListReq = z.infer<typeof QualitativeTagsListSchema>;

export const QualitativeTagsCreateSchema = BaseSchema.extend({
    body: z.object({
        collectionId: z.uuid(),
        name: z.string().min(1).max(120),
        code: z.string().min(1).max(16).optional(),
        description: z.string().max(2000).optional(),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    }),
});

export type QualitativeTagsCreateReq = z.infer<
    typeof QualitativeTagsCreateSchema
>;

export const QualitativeTagsUpdateSchema = BaseSchema.extend({
    body: BaseIdSchema.extend({
        collectionId: z.uuid().optional(),
        name: z.string().min(1).max(120).optional(),
        code: z.string().min(1).max(16).optional(),
        description: z.string().max(2000).nullable().optional(),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    }),
});

export type QualitativeTagsUpdateReq = z.infer<
    typeof QualitativeTagsUpdateSchema
>;

export const QualitativeTagsDeleteSchema = BaseSchema.extend({
    body: BaseIdSchema,
});

export type QualitativeTagsDeleteReq = z.infer<
    typeof QualitativeTagsDeleteSchema
>;
