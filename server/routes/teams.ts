import type { FastifyInstance } from "fastify";
import { players, teams, tournaments } from "../db/repo.js";
import { ratePlayers, suggestTeams } from "../services/balance.js";
import { requireAdmin } from "../services/auth.js";
import type { TeamWithMembers } from "../types.js";

function teamsWithMembers(tournamentId: number): TeamWithMembers[] {
  const ratingMap = new Map(ratePlayers(players.all()).map((r) => [r.player.id, r.rating] as const));
  return teams.byTournament(tournamentId).map((t) => {
    const members = teams.membersOf(t.id);
    const rating = Math.round(members.reduce((s, m) => s + (ratingMap.get(m.id) ?? 0), 0) * 10) / 10;
    return { ...t, members, rating };
  });
}

function requireTournament(tid: number, reply: import("fastify").FastifyReply): boolean {
  if (!tournaments.get(tid)) {
    reply.code(404).send({ error: "Tournament not found." });
    return false;
  }
  return true;
}

export default async function teamRoutes(app: FastifyInstance) {
  // Public: current teams in a tournament.
  app.get("/api/tournaments/:tid/teams", async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;
    return { teams: teamsWithMembers(tid), locked: teams.anyLocked(tid) };
  });

  // Admin: preview balanced pairs without persisting (uses the tournament roster).
  app.post("/api/tournaments/:tid/teams/suggest", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;
    return suggestTeams(tournaments.roster(tid));
  });

  // Admin: generate balanced teams from the roster and persist them.
  app.post("/api/tournaments/:tid/teams/generate", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;
    if (teams.anyLocked(tid)) return reply.code(409).send({ error: "Teams are locked. Unlock before regenerating." });
    const roster = tournaments.roster(tid);
    if (roster.length < 4) {
      return reply.code(400).send({ error: `Add at least 4 players to the roster first (currently ${roster.length}).` });
    }
    const result = suggestTeams(roster);
    teams.replaceAll(tid, result.teams.map((t) => ({ name: t.name, playerIds: t.players.map((p) => p.id) })));
    return { teams: teamsWithMembers(tid), locked: false, leftover: result.leftover, balanceScore: result.balanceScore };
  });

  // Admin: manual override - replace the entire set of teams.
  app.put("/api/tournaments/:tid/teams", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;
    if (teams.anyLocked(tid)) return reply.code(409).send({ error: "Teams are locked. Unlock to edit." });
    const body = req.body as { teams?: { name?: string; playerIds?: number[] }[] };
    if (!body || !Array.isArray(body.teams)) return reply.code(400).send({ error: "Expected { teams: [...] }." });

    const rosterIds = new Set(tournaments.roster(tid).map((p) => p.id));
    const seen = new Set<number>();
    const sets: { name: string; playerIds: number[] }[] = [];
    for (let i = 0; i < body.teams.length; i++) {
      const t = body.teams[i];
      const ids = Array.isArray(t.playerIds) ? t.playerIds.map(Number) : [];
      for (const id of ids) {
        if (!rosterIds.has(id)) return reply.code(400).send({ error: `Player ${id} is not in this tournament's roster.` });
        if (seen.has(id)) return reply.code(400).send({ error: `Player ${id} assigned to more than one team.` });
        seen.add(id);
      }
      sets.push({ name: (t.name || `Team ${i + 1}`).trim().slice(0, 40), playerIds: ids });
    }
    teams.replaceAll(tid, sets);
    return { teams: teamsWithMembers(tid), locked: false };
  });

  // Admin: lock teams so games can reference stable rosters.
  app.post("/api/tournaments/:tid/teams/lock", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;
    if (teams.byTournament(tid).length < 2) return reply.code(400).send({ error: "Need at least two teams to lock." });
    teams.lockAll(tid, true);
    return { teams: teamsWithMembers(tid), locked: true };
  });

  // Admin: unlock teams (clears the tournament's games since teams may change).
  app.post("/api/tournaments/:tid/teams/unlock", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;
    teams.replaceAll(tid, teamsWithMembers(tid).map((t) => ({ name: t.name, playerIds: t.members.map((m) => m.id) })));
    teams.lockAll(tid, false);
    return { teams: teamsWithMembers(tid), locked: false };
  });
}
