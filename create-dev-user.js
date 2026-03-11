/**
 * One-time script to create a dev team and admin user for local testing.
 */

/* eslint-disable */
process.env.NODE_ENV = "development";
require("./build/server/utils/environment");

// Load the production sequelize instance (which has models with Encrypted decorators)
const { sequelize } = require("./build/server/storage/database");
const { default: Team } = require("./build/server/models/Team");
const { default: User } = require("./build/server/models/User");

async function main() {
    await sequelize.authenticate();
    console.log("DB connected");

    const [team] = await Team.findOrCreate({
        where: { name: "Dev Wiki" },
        defaults: {
            name: "Dev Wiki",
            guestSignin: true,
            sharing: true,
        },
    });
    console.log("Team:", team.id, team.name);

    const [user, created] = await User.findOrCreate({
        where: { email: "admin@example.com" },
        defaults: {
            name: "Admin",
            email: "admin@example.com",
            role: "admin",
            teamId: team.id,
        },
    });
    console.log("User:", user.id, user.email, created ? "(created)" : "(exists)");

    await sequelize.close();
    console.log("Done! You can now log in with: admin@example.com");
}

main().catch((e) => {
    console.error(e.message, e.stack);
    process.exit(1);
});
