import type { QualitativeTag } from "@server/models";

/**
 * Serialize a qualitative tag for API responses.
 *
 * @param tag the qualitative tag model.
 * @returns serialized tag payload.
 */
export default function presentQualitativeTag(tag: QualitativeTag) {
    return {
        id: tag.id,
        name: tag.name,
        code: tag.code,
        description: tag.description,
        color: tag.color,
        collectionId: tag.collectionId,
        createdById: tag.createdById,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
    };
}
