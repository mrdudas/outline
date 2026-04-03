import Router from "koa-router";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { Collection, QualitativeTag } from "@server/models";
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
