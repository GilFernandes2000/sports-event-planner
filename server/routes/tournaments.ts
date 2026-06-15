import type { FastifyInstance } from "fastify";
import { tournaments, players } from "../db/repo.js";
import { ratePlayers } from "../services/balance.js";
import { requireAdmin } from "../services/auth.js";
import { parsePlayerInput } from "./players.js";

function ratedRoster(tournamentId: number) {
  const roster = tournaments.roster(tournamentId);
  const ids = new Set(roster.map((p) => p.id));
  return ratePlayers(players.all())
    .filter((r) => ids.has(r.player.id))
    .map(({ player, rating }) => ({ ...player, rating }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default async function tournamentRoutes(app: FastifyInstance) {
  // Public: list tournaments with quick counts.
  app.get("/api/tournaments", async () => {
    return tournaments.all().map((t) => ({ ...t, counts: tournaments.counts(t.id) }));
  });

  // Admin: create a tournament.
  app.post("/api/tournaments", { preHandler: requireAdmin }, async (req, reply) => {
    const body = req.body as { name?: unknown };
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) return reply.code(400).send({ error: "Tournament name is required." });
    return tournaments.create(name);
  });

  // Admin: delete a tournament (and its teams/games/roster links).
  app.delete("/api/tournaments/:tid", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!tournaments.get(tid)) return reply.code(404).send({ error: "Tournament not found." });
    tournaments.remove(tid);
    return reply.code(204).send();
  });

  // Public: roster of a tournament (rated).
  app.get("/api/tournaments/:tid/roster", async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!tournaments.get(tid)) return reply.code(404).send({ error: "Tournament not found." });
    return ratedRoster(tid);
  });

  // Public: self-enrollment - create a player and add them to this tournament.
  app.post("/api/tournaments/:tid/enroll", async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!tournaments.get(tid)) return reply.code(404).send({ error: "Tournament not found." });
    const { value, error } = parsePlayerInput(req.body);
    if (error) return reply.code(400).send({ error });
    const created = players.create(value!);
    tournaments.addToRoster(tid, created.id);
    return created;
  });

  // Admin: add existing players and/or create new ones into the roster.
  app.post("/api/tournaments/:tid/roster", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!tournaments.get(tid)) return reply.code(404).send({ error: "Tournament not found." });
    const body = req.body as { playerIds?: unknown; newPlayers?: unknown };

    const playerIds = Array.isArray(body.playerIds) ? body.playerIds.map(Number) : [];
    for (const id of playerIds) {
      if (!players.get(id)) return reply.code(400).send({ error: `Unknown player id ${id}.` });
    }

    const newPlayers = Array.isArray(body.newPlayers) ? body.newPlayers : [];
    const parsedNew = [];
    for (const np of newPlayers) {
      const { value, error } = parsePlayerInput(np);
      if (error) return reply.code(400).send({ error });
      parsedNew.push(value!);
    }

    for (const id of playerIds) tournaments.addToRoster(tid, id);
    for (const np of parsedNew) {
      const created = players.create(np);
      tournaments.addToRoster(tid, created.id);
    }
    return ratedRoster(tid);
  });

  // Admin: remove a player from this tournament's roster.
  app.delete("/api/tournaments/:tid/roster/:playerId", { preHandler: requireAdmin }, async (req, reply) => {
    const params = req.params as { tid: string; playerId: string };
    const tid = Number(params.tid);
    const pid = Number(params.playerId);
    if (!tournaments.get(tid)) return reply.code(404).send({ error: "Tournament not found." });
    tournaments.removeFromRoster(tid, pid);
    return reply.code(204).send();
  });
}
