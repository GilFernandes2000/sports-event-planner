import type { FastifyInstance, FastifyReply } from "fastify";
import { games, players, teams, tournaments } from "../db/repo.js";
import type { MatchInput, MatchSide } from "../db/repo.js";
import { requireAdmin } from "../services/auth.js";
import { buildRoundRobin, buildSingleElimination, buildRepechage } from "../services/schedule.js";
import { ratePlayers } from "../services/balance.js";
import { gameView } from "../services/stats.js";

function requireTournament(tid: number, reply: FastifyReply): boolean {
  if (!tournaments.get(tid)) {
    reply.code(404).send({ error: "Tournament not found." });
    return false;
  }
  return true;
}

/** Teams in a tournament with their combined fairness rating (for seeding/tie-breaks). */
function teamsWithRating(tid: number): { id: number; rating: number }[] {
  const ratingByPlayer = new Map(ratePlayers(players.all()).map((r) => [r.player.id, r.rating] as const));
  return teams.byTournament(tid).map((t) => ({
    id: t.id,
    rating: Math.round(teams.membersOf(t.id).reduce((s, m) => s + (ratingByPlayer.get(m.id) ?? 0), 0) * 10) / 10,
  }));
}

interface SidePayload {
  type?: "team" | "winner" | "loser";
  value?: number;
}

/** Validate one side of a match against the tournament's teams/games. */
function parseSide(
  tid: number,
  raw: SidePayload | undefined,
  excludeGameId: number | null
): { side?: MatchSide; error?: string } {
  if (!raw || raw.type === undefined || raw.value === undefined || raw.value === null) {
    return { error: "Each side needs a team or a source match." };
  }
  const value = Number(raw.value);
  if (raw.type === "team") {
    const team = teams.get(value);
    if (!team || team.tournament_id !== tid) return { error: "Pick a valid team in this tournament." };
    return { side: { team_id: value, source_match_id: null, source_result: null } };
  }
  if (raw.type === "winner" || raw.type === "loser") {
    const src = games.get(value);
    if (!src || src.tournament_id !== tid) return { error: "Pick a valid source match in this tournament." };
    if (excludeGameId !== null && value === excludeGameId) return { error: "A match cannot advance from itself." };
    return { side: { team_id: null, source_match_id: value, source_result: raw.type } };
  }
  return { error: "Invalid side type." };
}

export default async function gameRoutes(app: FastifyInstance) {
  // Public: schedule/bracket for a tournament.
  app.get("/api/tournaments/:tid/games", async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;
    return games.byTournament(tid).map((g) => gameView(g));
  });

  // Admin: generate a round-robin from this tournament's teams (replaces games).
  app.post("/api/tournaments/:tid/round-robin", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;
    const current = teams.byTournament(tid);
    if (current.length < 2) return reply.code(400).send({ error: "Create at least two teams first." });
    const schedule = buildRoundRobin(current);
    games.replaceSchedule(tid, schedule);
    return { gamesCreated: schedule.length, games: games.byTournament(tid).map((g) => gameView(g)) };
  });

  // Admin: generate a seeded single-elimination knockout (replaces games).
  app.post("/api/tournaments/:tid/knockout", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;
    const rated = teamsWithRating(tid);
    if (rated.length < 2) return reply.code(400).send({ error: "Create at least two teams first." });
    const body = req.body as { seeding?: unknown };
    const seeding = body?.seeding === "random" ? "random" : "rating";
    const specs = buildSingleElimination(rated, { seeding });
    games.replaceBracket(tid, specs);
    return { gamesCreated: specs.length, games: games.byTournament(tid).map((g) => gameView(g)) };
  });

  // Admin: create a second-chance repechage among the best first-round losers.
  app.post("/api/tournaments/:tid/repechage", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;

    const all = games.byTournament(tid);
    if (all.some((g) => g.stage === "repechage")) {
      return reply.code(409).send({ error: "A repechage already exists. Delete it first to recreate." });
    }
    const knockout = all.filter((g) => g.stage === "knockout");
    if (knockout.length === 0) return reply.code(400).send({ error: "Generate a knockout bracket first." });

    // Round 1 = the lowest round of the knockout, played by concrete teams.
    const firstRound = Math.min(...knockout.map((g) => g.round));
    const round1 = knockout.filter((g) => g.round === firstRound && g.team_a_id !== null && g.team_b_id !== null);
    if (round1.some((g) => g.status !== "final" || g.score_a === null || g.score_b === null)) {
      return reply.code(400).send({ error: "Finish all first-round games before creating the repechage." });
    }

    const body = req.body as { count?: unknown };
    const requested = Number(body?.count);
    if (!Number.isInteger(requested) || requested < 2) {
      return reply.code(400).send({ error: "Pick at least 2 losers for the second chance." });
    }

    const ratingByTeam = new Map(teamsWithRating(tid).map((t) => [t.id, t.rating] as const));
    const losers = round1
      .filter((g) => (g.score_a as number) !== (g.score_b as number)) // ties have no loser
      .map((g) => {
        const aWon = (g.score_a as number) > (g.score_b as number);
        const loserId = aWon ? (g.team_b_id as number) : (g.team_a_id as number);
        const loserScore = aWon ? (g.score_b as number) : (g.score_a as number);
        const winnerScore = aWon ? (g.score_a as number) : (g.score_b as number);
        return { loserId, margin: winnerScore - loserScore, loserScore };
      })
      .sort(
        (x, y) =>
          x.margin - y.margin || // smallest losing margin = best loser
          y.loserScore - x.loserScore ||
          (ratingByTeam.get(y.loserId) ?? 0) - (ratingByTeam.get(x.loserId) ?? 0)
      );

    if (losers.length < 2) {
      return reply.code(400).send({ error: "Not enough decided first-round losers for a repechage." });
    }

    const chosen = losers.slice(0, Math.min(requested, losers.length)).map((l) => l.loserId);
    const specs = buildRepechage(chosen);
    games.appendBracket(tid, specs);
    return {
      gamesCreated: specs.length,
      chosen: chosen.length,
      games: games.byTournament(tid).map((g) => gameView(g)),
    };
  });

  // Admin: create a custom match (teams and/or winner-of/loser-of links).
  app.post("/api/tournaments/:tid/games", { preHandler: requireAdmin }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!requireTournament(tid, reply)) return;
    const body = req.body as { label?: string; round?: number; stage?: string; sideA?: SidePayload; sideB?: SidePayload };

    const a = parseSide(tid, body.sideA, null);
    if (a.error) return reply.code(400).send({ error: a.error });
    const b = parseSide(tid, body.sideB, null);
    if (b.error) return reply.code(400).send({ error: b.error });

    const match: MatchInput = {
      label: (body.label || "Match").toString().trim().slice(0, 40) || "Match",
      round: Number.isFinite(body.round) ? Number(body.round) : 1,
      stage: body.stage === "round_robin" ? "round_robin" : "bracket",
      a: a.side!,
      b: b.side!,
    };
    return gameView(games.add(tid, match));
  });

  // Admin: edit a match definition (teams/sources/label/round).
  app.put("/api/games/:id/match", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const game = games.get(id);
    if (!game) return reply.code(404).send({ error: "Match not found." });
    const body = req.body as { label?: string; round?: number; stage?: string; sideA?: SidePayload; sideB?: SidePayload };

    const a = parseSide(game.tournament_id, body.sideA, id);
    if (a.error) return reply.code(400).send({ error: a.error });
    const b = parseSide(game.tournament_id, body.sideB, id);
    if (b.error) return reply.code(400).send({ error: b.error });

    const match: MatchInput = {
      label: (body.label || game.label || "Match").toString().trim().slice(0, 40) || "Match",
      round: Number.isFinite(body.round) ? Number(body.round) : game.round,
      stage: body.stage === "round_robin" ? "round_robin" : "bracket",
      a: a.side!,
      b: b.side!,
    };
    return gameView(games.updateMatch(id, match)!);
  });

  // Admin: delete a match.
  app.delete("/api/games/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!games.get(id)) return reply.code(404).send({ error: "Match not found." });
    games.remove(id);
    return reply.code(204).send();
  });

  // Admin: enter / update a result and per-player points.
  app.put("/api/games/:id/result", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const game = games.get(id);
    if (!game) return reply.code(404).send({ error: "Game not found." });
    if (game.team_a_id === null || game.team_b_id === null) {
      return reply.code(400).send({ error: "Both teams must be decided before entering a result." });
    }

    const body = req.body as { score_a?: unknown; score_b?: unknown; status?: unknown; playerPoints?: Record<string, unknown> };

    const scoreA = Number(body.score_a);
    const scoreB = Number(body.score_b);
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
      return reply.code(400).send({ error: "Scores must be non-negative whole numbers." });
    }

    const status = body.status === "final" ? "final" : "scheduled";

    const validIds = new Set<number>([
      ...teams.membersOf(game.team_a_id).map((m) => m.id),
      ...teams.membersOf(game.team_b_id).map((m) => m.id),
    ]);
    const playerPoints: Record<number, number> = {};
    for (const [pid, val] of Object.entries(body.playerPoints ?? {})) {
      const playerId = Number(pid);
      if (!validIds.has(playerId)) continue;
      const pts = Number(val);
      if (!Number.isInteger(pts) || pts < 0) {
        return reply.code(400).send({ error: "Player points must be non-negative whole numbers." });
      }
      playerPoints[playerId] = pts;
    }

    const updated = games.setResult(id, { score_a: scoreA, score_b: scoreB, status, playerPoints });
    return gameView(updated!);
  });
}
