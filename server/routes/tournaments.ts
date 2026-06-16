import type { FastifyInstance } from "fastify";
import { tournaments, players } from "../db/repo.js";
import { ratePlayers } from "../services/balance.js";
import {
  hashPassword,
  requireAdmin,
  requireAdminTournament,
  requireTournamentAccess,
} from "../services/auth.js";
import { parsePlayerInput } from "./players.js";

function ratedRoster(tournamentId: number) {
  const roster = tournaments.roster(tournamentId);
  return ratePlayers(roster)
    .map(({ player, rating }) => ({ ...player, rating }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function publicTournament(t: { id: number; name: string; created_at: string }) {
  return { ...t, counts: tournaments.counts(t.id) };
}

function parsePassword(body: unknown): { password?: string; error?: string } {
  if (typeof body !== "object" || body === null) return { error: "Invalid body." };
  const password = typeof (body as { password?: unknown }).password === "string"
    ? (body as { password: string }).password
    : "";
  if (!password || password.length < 4) return { error: "Password must be at least 4 characters." };
  if (password.length > 128) return { error: "Password is too long." };
  return { password };
}

export default async function tournamentRoutes(app: FastifyInstance) {
  app.get("/api/tournaments", { preHandler: requireAdmin }, async (req) => {
    return tournaments.byAdmin(req.admin!.id).map((t) => publicTournament(t));
  });

  app.post("/api/tournaments", { preHandler: requireAdmin }, async (req, reply) => {
    const body = req.body as { name?: unknown; password?: unknown };
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) return reply.code(400).send({ error: "Tournament name is required." });
    const { password, error } = parsePassword(body);
    if (error) return reply.code(400).send({ error });
    const created = tournaments.create(name, hashPassword(password!), req.admin!.id);
    return publicTournament(created);
  });

  app.delete("/api/tournaments/:tid", { preHandler: requireAdminTournament }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    tournaments.remove(tid);
    return reply.code(204).send();
  });

  app.put("/api/tournaments/:tid/password", { preHandler: requireAdminTournament }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    const { password, error } = parsePassword(req.body);
    if (error) return reply.code(400).send({ error });
    tournaments.setPassword(tid, hashPassword(password!));
    return { ok: true };
  });

  app.get("/api/tournaments/:tid/roster", { preHandler: requireTournamentAccess }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!tournaments.get(tid)) return reply.code(404).send({ error: "Tournament not found." });
    return ratedRoster(tid);
  });

  app.post("/api/tournaments/:tid/enroll", { preHandler: requireTournamentAccess }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    const t = tournaments.get(tid);
    if (!t) return reply.code(404).send({ error: "Tournament not found." });
    if (!t.admin_id) return reply.code(400).send({ error: "Tournament has no organiser." });
    const { value, error } = parsePlayerInput(req.body);
    if (error) return reply.code(400).send({ error });
    const created = players.create(value!, t.admin_id);
    tournaments.addToRoster(tid, created.id);
    return created;
  });

  app.post("/api/tournaments/:tid/roster", { preHandler: requireAdminTournament }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    const adminId = req.admin!.id;
    const body = req.body as { playerIds?: unknown; newPlayer?: unknown };

    const playerIds = Array.isArray(body.playerIds) ? body.playerIds.map(Number) : [];
    for (const id of playerIds) {
      if (!players.getForAdmin(adminId, id)) {
        return reply.code(400).send({ error: `Unknown player id ${id}.` });
      }
    }

    const newPlayer = Array.isArray(body.newPlayer) ? body.newPlayer : [];
    const parsedNew = [];
    for (const np of newPlayer) {
      const { value, error } = parsePlayerInput(np);
      if (error) return reply.code(400).send({ error });
      parsedNew.push(value!);
    }

    for (const id of playerIds) tournaments.addToRoster(tid, id);
    for (const np of parsedNew) {
      const created = players.create(np, adminId);
      tournaments.addToRoster(tid, created.id);
    }
    return ratedRoster(tid);
  });

  app.delete("/api/tournaments/:tid/roster/:playerId", { preHandler: requireAdminTournament }, async (req, reply) => {
    const params = req.params as { tid: string; playerId: string };
    tournaments.removeFromRoster(Number(params.tid), Number(params.playerId));
    return reply.code(204).send();
  });
}
