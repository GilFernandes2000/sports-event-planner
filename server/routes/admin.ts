import type { FastifyInstance } from "fastify";
import { adminPassword, issueToken, requireAdmin, revokeToken, tokenFromRequest } from "../services/auth.js";

export default async function adminRoutes(app: FastifyInstance) {
  app.post("/api/admin/login", async (req, reply) => {
    const body = req.body as { password?: unknown };
    const password = typeof body?.password === "string" ? body.password : "";
    if (password !== adminPassword()) {
      return reply.code(401).send({ error: "Wrong password." });
    }
    return { token: issueToken() };
  });

  // Returns 200 only if the presented token is still valid (used on app load).
  app.get("/api/admin/verify", { preHandler: requireAdmin }, async () => ({ valid: true }));

  app.post("/api/admin/logout", { preHandler: requireAdmin }, async (req) => {
    revokeToken(tokenFromRequest(req));
    return { ok: true };
  });
}
