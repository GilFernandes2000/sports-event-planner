import db from "../db/index.js";
import { games as gamesRepo, teams as teamsRepo } from "../db/repo.js";
import type { Game, Player } from "../types.js";

export interface TeamStanding {
  teamId: number;
  name: string;
  members: { id: number; name: string }[];
  played: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  points: number; // 2 per win, 1 per tie
}

export interface PlayerLeader {
  playerId: number;
  name: string;
  teamName: string | null;
  gamesPlayed: number;
  totalPoints: number;
  pointsPerGame: number;
}

export interface Highlights {
  topScorer: PlayerLeader | null;
  bestTeam: TeamStanding | null;
  highestScoringGame: { label: string | null; teams: string; total: number } | null;
  totalGamesPlayed: number;
  totalPointsScored: number;
}

export interface StatsResponse {
  standings: TeamStanding[];
  players: PlayerLeader[];
  highlights: Highlights;
}

export function computeStats(tournamentId: number): StatsResponse {
  const teams = teamsRepo.byTournament(tournamentId);
  const allGames = gamesRepo.byTournament(tournamentId);
  const finals = allGames.filter(
    (g) => g.status === "final" && g.score_a !== null && g.score_b !== null && g.team_a_id !== null && g.team_b_id !== null
  );

  const membersByTeam = new Map<number, Player[]>();
  for (const t of teams) membersByTeam.set(t.id, teamsRepo.membersOf(t.id));

  // ---- Team standings ----
  const standings = new Map<number, TeamStanding>();
  for (const t of teams) {
    standings.set(t.id, {
      teamId: t.id,
      name: t.name,
      members: (membersByTeam.get(t.id) ?? []).map((m) => ({ id: m.id, name: m.name })),
      played: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      points: 0,
    });
  }

  for (const g of finals) {
    const a = standings.get(g.team_a_id as number);
    const b = standings.get(g.team_b_id as number);
    if (!a || !b) continue;
    const sa = g.score_a as number;
    const sb = g.score_b as number;
    a.played++;
    b.played++;
    a.pointsFor += sa;
    a.pointsAgainst += sb;
    b.pointsFor += sb;
    b.pointsAgainst += sa;
    if (sa > sb) {
      a.wins++;
      b.losses++;
      a.points += 2;
    } else if (sb > sa) {
      b.wins++;
      a.losses++;
      b.points += 2;
    } else {
      a.ties++;
      b.ties++;
      a.points += 1;
      b.points += 1;
    }
  }

  const standingsList = [...standings.values()]
    .map((s) => ({ ...s, diff: s.pointsFor - s.pointsAgainst }))
    .sort((x, y) => y.points - x.points || y.diff - x.diff || y.pointsFor - x.pointsFor);

  // ---- Player leaderboard (only finalised games in this tournament) ----
  const teamNameByPlayer = new Map<number, string>();
  for (const t of teams) {
    for (const m of membersByTeam.get(t.id) ?? []) teamNameByPlayer.set(m.id, t.name);
  }

  const finalIds = new Set(finals.map((g) => g.id));
  const perPlayer = new Map<number, { name: string; gp: number; pts: number }>();
  if (finalIds.size > 0) {
    const placeholders = [...finalIds].map(() => "?").join(",");
    const detailed = db
      .prepare(
        `SELECT pgs.player_id AS playerId, p.name AS name, pgs.game_id AS gameId, pgs.points AS points
         FROM player_game_stats pgs JOIN players p ON p.id = pgs.player_id
         WHERE pgs.game_id IN (${placeholders})`
      )
      .all(...finalIds) as { playerId: number; name: string; gameId: number; points: number }[];
    for (const d of detailed) {
      const cur = perPlayer.get(d.playerId) ?? { name: d.name, gp: 0, pts: 0 };
      cur.gp += 1;
      cur.pts += d.points;
      perPlayer.set(d.playerId, cur);
    }
  }

  const playerLeaders: PlayerLeader[] = [...perPlayer.entries()]
    .map(([playerId, v]) => ({
      playerId,
      name: v.name,
      teamName: teamNameByPlayer.get(playerId) ?? null,
      gamesPlayed: v.gp,
      totalPoints: v.pts,
      pointsPerGame: v.gp ? Math.round((v.pts / v.gp) * 10) / 10 : 0,
    }))
    .sort((x, y) => y.totalPoints - x.totalPoints || y.pointsPerGame - x.pointsPerGame);

  // ---- Highlights ----
  const teamNameById = new Map(teams.map((t) => [t.id, t.name] as const));
  let highestScoringGame: Highlights["highestScoringGame"] = null;
  for (const g of finals) {
    const total = (g.score_a as number) + (g.score_b as number);
    if (!highestScoringGame || total > highestScoringGame.total) {
      highestScoringGame = {
        label: g.label,
        teams: `${teamNameById.get(g.team_a_id as number) ?? "?"} vs ${teamNameById.get(g.team_b_id as number) ?? "?"}`,
        total,
      };
    }
  }

  const totalPointsScored = finals.reduce((s, g) => s + (g.score_a as number) + (g.score_b as number), 0);

  const highlights: Highlights = {
    topScorer: playerLeaders[0] ?? null,
    bestTeam: standingsList.find((s) => s.played > 0) ?? null,
    highestScoringGame,
    totalGamesPlayed: finals.length,
    totalPointsScored,
  };

  return { standings: standingsList, players: playerLeaders, highlights };
}

/** Display label for an unresolved bracket slot, e.g. "Winner of Game 3". */
function placeholderName(sourceMatchId: number | null, result: string | null): string {
  if (!sourceMatchId) return "TBD";
  const src = gamesRepo.get(sourceMatchId);
  const label = src?.label ?? `Game ${sourceMatchId}`;
  return `${result === "loser" ? "Loser" : "Winner"} of ${label}`;
}

export function gameView(g: Game) {
  const stats = gamesRepo.statsFor(g.id);
  const pointsByPlayer = new Map(stats.map((s) => [s.player_id, s.points] as const));
  const decorate = (m: Player) => ({ id: m.id, name: m.name, points: pointsByPlayer.get(m.id) ?? 0 });

  const side = (
    teamId: number | null,
    sourceMatchId: number | null,
    sourceResult: string | null
  ) => {
    if (teamId !== null) {
      const team = teamsRepo.get(teamId);
      return {
        id: teamId,
        name: team?.name ?? "?",
        members: teamsRepo.membersOf(teamId).map(decorate),
        placeholder: false as const,
      };
    }
    return {
      id: null,
      name: placeholderName(sourceMatchId, sourceResult),
      members: [] as { id: number; name: string; points: number }[],
      placeholder: true as const,
    };
  };

  return {
    ...g,
    teamA: side(g.team_a_id, g.a_source_match_id, g.a_source_result),
    teamB: side(g.team_b_id, g.b_source_match_id, g.b_source_result),
  };
}
