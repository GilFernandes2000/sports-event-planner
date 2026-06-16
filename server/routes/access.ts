import type { FastifyInstance } from "fastify";
import { tournaments } from "../db/repo.js";
import {
  getTournamentSession,
  issueTournamentToken,
  revokeTournamentToken,
  requireTournamentOrAdmin,
  tournamentTokenFromRequest,
  verifyPassword,
} from "../services/auth.js";

const LOGIN_ERROR = "Invalid tournament or password.";

function publicTournament(t: { id: number; name: string; created_at: string }) {
  return { id: t.id, name: t.name, created_at: t.created_at };
}

export default async function accessRoutes(app: FastifyInstance) {
  app.post(
    "/api/access",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const body = req.body as { name?: unknown; password?: unknown };
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const password = typeof body?.password === "string" ? body.password : "";
      if (!name || !password) {
        return reply.code(401).send({ error: LOGIN_ERROR });
      }

      const tournament = tournaments.findByName(name);
      if (!tournament || !tournament.password_hash || !verifyPassword(password, tournament.password_hash)) {
        return reply.code(401).send({ error: LOGIN_ERROR });
      }

      const token = issueTournamentToken(tournament.id);
      const isProd = process.env.NODE_ENV === "production";
      reply.header(
        "set-cookie",
        `tournament_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}; Max-Age=${7 * 24 * 60 * 60}`
      );

      return {
        token,
        tournament: publicTournament(tournament),
      };
    }
  );

  app.get("/api/access/verify", { preHandler: requireTournamentOrAdmin }, async (req) => {
    const token = tournamentTokenFromRequest(req);
    const session = getTournamentSession(token);
    if (!session) return { valid: true, tournament: null };
    const tournament = tournaments.get(session.tournament_id);
    if (!tournament) return { valid: false, tournament: null };
    return { valid: true, tournament: publicTournament(tournament) };
  });

  app.post("/api/access/logout", async (req, reply) => {
    revokeTournamentToken(tournamentTokenFromRequest(req));
    reply.header(
      "set-cookie",
      "tournament_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
    );
    return { ok: true };
  });
}
