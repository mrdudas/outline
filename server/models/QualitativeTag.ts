import type { InferAttributes, InferCreationAttributes } from "sequelize";
import {
    DataType,
    BelongsTo,
    Column,
    ForeignKey,
    Is,
    Table,
} from "sequelize-typescript";
import Collection from "./Collection";
import Team from "./Team";
import User from "./User";
import IdModel from "./base/IdModel";
import Fix from "./decorators/Fix";

/**
 * A reusable qualitative analysis tag scoped to a collection.
 */
@Table({ tableName: "qualitative_tags", modelName: "qualitativeTag" })
@Fix
class QualitativeTag extends IdModel<
    InferAttributes<QualitativeTag>,
    Partial<InferCreationAttributes<QualitativeTag>>
> {
    /** Human readable tag name. */
    @Column(DataType.STRING)
    name: string;

    /** Short code shown in document annotations. */
    @Column(DataType.STRING)
    code: string;

    /** Optional longer description for coding rules. */
    @Column(DataType.TEXT)
    description: string | null;

    /** Hex color used for visual highlights. */
    @Is(/^#[0-9A-Fa-f]{6}$/)
    @Column(DataType.STRING)
    color: string;

    @BelongsTo(() => Collection, "collectionId")
    collection: Collection;

    @ForeignKey(() => Collection)
    @Column(DataType.UUID)
    collectionId: string;

    @BelongsTo(() => Team, "teamId")
    team: Team;

    @ForeignKey(() => Team)
    @Column(DataType.UUID)
    teamId: string;

    @BelongsTo(() => User, "createdById")
    createdBy: User;

    @ForeignKey(() => User)
    @Column(DataType.UUID)
    createdById: string;
}

export default QualitativeTag;
