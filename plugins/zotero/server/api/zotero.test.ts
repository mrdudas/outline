import { IntegrationService, IntegrationType } from "@shared/types";
import { Integration } from "@server/models";
import { buildUser } from "@server/test/factories";
import { getTestServer } from "@server/test/support";

const server = getTestServer();

/**
 * Creates a per-user Zotero LinkedAccount integration with fake credentials.
 *
 * @param teamId - the user's teamId.
 * @param userId - the user's id.
 */
async function buildZoteroIntegration(teamId: string, userId: string) {
    return Integration.create({
        service: IntegrationService.Zotero,
        type: IntegrationType.LinkedAccount,
        teamId,
        userId,
        settings: {
            zotero: {
                url: "https://api.zotero.org",
                apiKey: "test-api-key",
                userId: "1234567",
            },
        },
    });
}

// ---------------------------------------------------------------------------
// GET /api/zotero.search
// ---------------------------------------------------------------------------

describe("#zotero.search", () => {
    it("returns 401 when not authenticated", async () => {
        const res = await server.get("/api/zotero.search?q=darwin");
        expect(res.status).toEqual(401);
    });

    it("returns 404 when Zotero integration is not configured", async () => {
        const user = await buildUser();
        const res = await server.get("/api/zotero.search?q=darwin", {
            headers: { Authorization: `Bearer ${user.getJwtToken()}` },
        });
        expect(res.status).toEqual(404);
    });

    it("returns 400 when query param is missing", async () => {
        const user = await buildUser();
        await buildZoteroIntegration(user.teamId, user.id);

        // `q` is required by the schema; omitting it should yield a validation error
        const res = await server.get("/api/zotero.search", {
            headers: { Authorization: `Bearer ${user.getJwtToken()}` },
        });
        expect(res.status).toEqual(400);
    });
});

// ---------------------------------------------------------------------------
// POST /api/zotero.bibliography
// ---------------------------------------------------------------------------

describe("#zotero.bibliography", () => {
    it("returns 401 when not authenticated", async () => {
        const res = await server.post("/api/zotero.bibliography", {
            body: { keys: ["ABCD1234"] },
        });
        expect(res.status).toEqual(401);
    });

    it("returns 404 when Zotero integration is not configured", async () => {
        const user = await buildUser();
        const res = await server.post("/api/zotero.bibliography", {
            headers: { Authorization: `Bearer ${user.getJwtToken()}` },
            body: { keys: ["ABCD1234"] },
        });
        expect(res.status).toEqual(404);
    });

    it("returns 400 when keys array is empty", async () => {
        const user = await buildUser();
        await buildZoteroIntegration(user.teamId, user.id);

        const res = await server.post("/api/zotero.bibliography", {
            headers: { Authorization: `Bearer ${user.getJwtToken()}` },
            body: { keys: [] },
        });
        expect(res.status).toEqual(400);
    });

    it("returns 400 when keys are missing", async () => {
        const user = await buildUser();
        await buildZoteroIntegration(user.teamId, user.id);

        const res = await server.post("/api/zotero.bibliography", {
            headers: { Authorization: `Bearer ${user.getJwtToken()}` },
            body: {},
        });
        expect(res.status).toEqual(400);
    });
});
