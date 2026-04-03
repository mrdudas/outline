"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.createTable(
                "qualitative_tags",
                {
                    id: {
                        type: Sequelize.UUID,
                        primaryKey: true,
                        allowNull: false,
                    },
                    name: {
                        type: Sequelize.STRING,
                        allowNull: false,
                    },
                    code: {
                        type: Sequelize.STRING,
                        allowNull: false,
                    },
                    description: {
                        type: Sequelize.TEXT,
                        allowNull: true,
                    },
                    color: {
                        type: Sequelize.STRING,
                        allowNull: false,
                    },
                    collectionId: {
                        type: Sequelize.UUID,
                        allowNull: false,
                        references: {
                            model: "collections",
                            key: "id",
                        },
                        onDelete: "CASCADE",
                    },
                    teamId: {
                        type: Sequelize.UUID,
                        allowNull: false,
                        references: {
                            model: "teams",
                            key: "id",
                        },
                        onDelete: "CASCADE",
                    },
                    createdById: {
                        type: Sequelize.UUID,
                        allowNull: false,
                        references: {
                            model: "users",
                            key: "id",
                        },
                        onDelete: "CASCADE",
                    },
                    createdAt: {
                        type: Sequelize.DATE,
                        allowNull: false,
                    },
                    updatedAt: {
                        type: Sequelize.DATE,
                        allowNull: false,
                    },
                },
                { transaction }
            );

            await queryInterface.addIndex("qualitative_tags", ["collectionId"], {
                transaction,
            });
            await queryInterface.addIndex("qualitative_tags", ["teamId"], {
                transaction,
            });
            await queryInterface.addIndex("qualitative_tags", ["createdById"], {
                transaction,
            });
            await queryInterface.addIndex(
                "qualitative_tags",
                ["collectionId", "name"],
                {
                    unique: true,
                    transaction,
                }
            );
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("qualitative_tags");
    },
};
