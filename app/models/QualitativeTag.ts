import { observable } from "mobx";
import type QualitativeTagsStore from "~/stores/QualitativeTagsStore";
import Collection from "~/models/Collection";
import User from "~/models/User";
import Model from "~/models/base/Model";
import Field from "~/models/decorators/Field";
import Relation from "~/models/decorators/Relation";

/**
 * Reusable qualitative coding tag attached to a collection.
 */
export default class QualitativeTag extends Model {
    static modelName = "QualitativeTag";

    store: QualitativeTagsStore;

    @Field
    @observable
    name: string;

    @Field
    @observable
    code: string;

    @Field
    @observable
    description: string | null;

    @Field
    @observable
    color: string;

    @Field
    @observable
    collectionId: string;

    @Field
    @observable
    createdById: string;

    @Relation(() => Collection, { onDelete: "cascade" })
    collection: Collection;

    @Relation(() => User)
    createdBy: User;
}
