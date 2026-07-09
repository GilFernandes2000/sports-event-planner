import type { FastifyInstance } from "fastify";
import { tournaments, games as gamesRepo } from "../db/repo.js";
import { computeStats, gameView } from "../services/stats.js";

function publicTournamentMeta(t: ReturnType<typeof tournaments.get>) {
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    share_slug: t.share_slug,
    event_date: t.event_date,
    location: t.location,
    team_size: t.team_size,
    game_duration_min: t.game_duration_min,
    scoring_preset: t.scoring_preset,
    format_type: t.format_type,
    status: t.status,
    created_at: t.created_at,
    counts: tournaments.counts(t.id),
  };
}

export default async function publicRoutes(app: FastifyInstance) {
  app.get("/api/public/tournaments/:slug", async (req, reply) => {
    const slug = (req.params as { slug: string }).slug?.trim();
    if (!slug) return reply.code(400).send({ error: "Invalid slug." });

    const t = tournaments.findBySlug(slug);
    if (!t) return reply.code(404).send({ error: "Tournament not found." });

    const allGames = gamesRepo.byTournament(t.id).map(gameView);
    const stats = computeStats(t.id);
    const nextGame =
      allGames.find((g) => g.status === "scheduled" && g.team_a_id && g.team_b_id) ??
      allGames.find((g) => g.status === "scheduled") ??
      null;
    const liveGame = allGames.find((g) => g.status === "scheduled" && g.score_a !== null) ?? null;

    return {
      tournament: publicTournamentMeta(t),
      stats,
      games: allGames,
      nextGame,
      liveGame,
    };
  });
}
