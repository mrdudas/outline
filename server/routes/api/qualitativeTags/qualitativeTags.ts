import Router from "koa-router";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { Collection, Document, QualitativeTag } from "@server/models";
import { authorize } from "@server/policies";
import { presentPolicies, presentQualitativeTag } from "@server/presenters";
import type { APIContext } from "@server/types";
import * as T from "./schema";

const router = new Router();

const randomColor = () => {
    const value = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");

    return `#${value}`;
};

const normalizeCode = (name: string, code?: string) => {
    const source = (code ?? name).trim();
    const compressed = source.replace(/\s+/g, "").toUpperCase();
    const fallback = compressed.slice(0, 3);

    return fallback || "TAG";
};

interface ProsemirrorMark {
    type?: string;
    attrs?: {
        id?: string;
        tagId?: string;
    };
}

interface ProsemirrorNode {
    type?: string;
    text?: string;
    marks?: ProsemirrorMark[];
    content?: ProsemirrorNode[];
}

interface QualitativeFragment {
    occurrenceId: string;
    tagId: string;
    text: string;
}

const collectQualitativeFragments = (
    node: ProsemirrorNode | null | undefined,
    fragments: QualitativeFragment[] = []
) => {
    if (!node) {
        return fragments;
    }

    if (
        node.type === "text" &&
        node.text &&
        Array.isArray(node.marks) &&
        node.marks.length > 0
    ) {
        for (const mark of node.marks) {
            if (mark.type !== "qualitativeTag") {
                continue;
            }

            const tagId = mark.attrs?.tagId;
            if (!tagId) {
                continue;
            }

            fragments.push({
                occurrenceId: mark.attrs?.id || `${tagId}:${fragments.length}`,
                tagId,
                text: node.text,
            });
        }
    }

    if (Array.isArray(node.content)) {
        for (const child of node.content) {
            collectQualitativeFragments(child, fragments);
        }
    }

    return fragments;
};

router.post(
    "qualitativeTags.list",
    auth(),
    validate(T.QualitativeTagsListSchema),
    async (ctx: APIContext<T.QualitativeTagsListReq>) => {
        const { collectionId } = ctx.input.body;
        const { user } = ctx.state.auth;

        const collection = await Collection.findByPk(collectionId, {
            userId: user.id,
        });
        authorize(user, "read", collection);

        const tags = await QualitativeTag.findAll({
            where: {
                collectionId,
                teamId: user.teamId,
            },
            order: [["name", "ASC"]],
        });

        ctx.body = {
            data: tags.map(presentQualitativeTag),
            policies: presentPolicies(user, tags),
        };
    }
);

router.post(
    "qualitativeTags.create",
    auth(),
    validate(T.QualitativeTagsCreateSchema),
    transaction(),
    async (ctx: APIContext<T.QualitativeTagsCreateReq>) => {
        const { collectionId, name, code, description, color } = ctx.input.body;
        const { user } = ctx.state.auth;

        const collection = await Collection.findByPk(collectionId, {
            userId: user.id,
            transaction: ctx.state.transaction,
        });
        authorize(user, "read", collection);

        const tag = await QualitativeTag.createWithCtx(ctx, {
            name: name.trim(),
            code: normalizeCode(name, code),
            description: description?.trim() || null,
            color: color ?? randomColor(),
            collectionId,
            teamId: user.teamId,
            createdById: user.id,
        });

        ctx.body = {
            data: presentQualitativeTag(tag),
            policies: presentPolicies(user, [tag]),
        };
    }
);

router.post(
    "qualitativeTags.update",
    auth(),
    validate(T.QualitativeTagsUpdateSchema),
    transaction(),
    async (ctx: APIContext<T.QualitativeTagsUpdateReq>) => {
        const { id, collectionId, name, code, description, color } = ctx.input.body;
        const { user } = ctx.state.auth;

        const tag = await QualitativeTag.findByPk(id, {
            rejectOnEmpty: true,
            transaction: ctx.state.transaction,
        });

        const collection = await Collection.findByPk(collectionId ?? tag.collectionId, {
            userId: user.id,
            transaction: ctx.state.transaction,
        });
        authorize(user, "update", collection);

        await tag.updateWithCtx(ctx, {
            ...(name !== undefined ? { name: name.trim() } : {}),
            ...(code !== undefined
                ? { code: normalizeCode(name ?? tag.name, code) }
                : {}),
            ...(description !== undefined
                ? { description: description?.trim() || null }
                : {}),
            ...(color !== undefined ? { color } : {}),
        });

        ctx.body = {
            data: presentQualitativeTag(tag),
            policies: presentPolicies(user, [tag]),
        };
    }
);

router.post(
    "qualitativeTags.statistics",
    auth(),
    validate(T.QualitativeTagsStatisticsSchema),
    async (ctx: APIContext<T.QualitativeTagsStatisticsReq>) => {
        const { collectionId } = ctx.input.body;
        const { user } = ctx.state.auth;

        const collection = await Collection.findByPk(collectionId, {
            userId: user.id,
        });
        authorize(user, "readDocument", collection);

        const tags = await QualitativeTag.findAll({
            where: {
                collectionId,
                teamId: user.teamId,
            },
            order: [["name", "ASC"]],
        });

        const documents = await Document.withMembershipScope(user.id).findAll({
            where: {
                collectionId,
                teamId: user.teamId,
                archivedAt: null,
            },
            attributes: ["id", "title", "content"],
            order: [["title", "ASC"]],
        });

        const tagStats = tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            code: tag.code,
            color: tag.color,
            description: tag.description,
            total: 0,
            documents: [] as {
                id: string;
                title: string;
                count: number;
                snippets: string[];
            }[],
        }));

        const statsByTagId = new Map(tagStats.map((tag) => [tag.id, tag]));

        for (const document of documents) {
            const root = document.content as ProsemirrorNode | null;
            const fragments = collectQualitativeFragments(root);
            const occurrencesByTag = new Map<string, Map<string, string>>();

            for (const fragment of fragments) {
                if (!statsByTagId.has(fragment.tagId)) {
                    continue;
                }

                const tagOccurrences =
                    occurrencesByTag.get(fragment.tagId) ?? new Map<string, string>();
                const previousText = tagOccurrences.get(fragment.occurrenceId) ?? "";
                tagOccurrences.set(fragment.occurrenceId, previousText + fragment.text);
                occurrencesByTag.set(fragment.tagId, tagOccurrences);
            }

            for (const [tagId, occurrences] of occurrencesByTag) {
                const stat = statsByTagId.get(tagId);
                if (!stat) {
                    continue;
                }

                const snippets = Array.from(occurrences.values())
                    .map((snippet) => snippet.trim())
                    .filter(Boolean);

                stat.total += snippets.length;
                stat.documents.push({
                    id: document.id,
                    title: document.title,
                    count: snippets.length,
                    snippets,
                });
            }
        }

        ctx.body = {
            data: {
                collection: {
                    id: collection.id,
                    name: collection.name,
                    documentCount: documents.length,
                },
                tags: tagStats,
            },
        };
    }
);

router.post(
    "qualitativeTags.delete",
    auth(),
    validate(T.QualitativeTagsDeleteSchema),
    transaction(),
    async (ctx: APIContext<T.QualitativeTagsDeleteReq>) => {
        const { id } = ctx.input.body;
        const { user } = ctx.state.auth;

        const tag = await QualitativeTag.findByPk(id, {
            rejectOnEmpty: true,
            transaction: ctx.state.transaction,
        });
        const collection = await Collection.findByPk(tag.collectionId, {
            userId: user.id,
            transaction: ctx.state.transaction,
        });

        authorize(user, "update", collection);

        await tag.destroyWithCtx(ctx);

        ctx.body = {
            success: true,
        };
    }
);

export default router;
