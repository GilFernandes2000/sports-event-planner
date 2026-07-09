import db from "../db/index.js";
import { games as gamesRepo, teams as teamsRepo } from "../db/repo.js";
import type { Game, Player } from "../types.js";

export interface TeamStanding {
  teamId: number;
  name: string;
  members: { id: number; name: string; has_photo: number }[];
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
  has_photo: number;
  teamName: string | null;
  gamesPlayed: number;
  totalPoints: number;
  pointsPerGame: number;
}

export interface Award {
  key: string;
  playerId?: number;
  playerName?: string;
  teamName?: string;
  value?: number;
  wins?: number;
  losses?: number;
}

export interface Highlights {
  topScorer: PlayerLeader | null;
  bestTeam: TeamStanding | null;
  highestScoringGame: { label: string | null; teams: string; total: number } | null;
  clutchWin: { label: string | null; teams: string; margin: number } | null;
  totalGamesPlayed: number;
  totalPointsScored: number;
  awards: Award[];
}

export interface StatsResponse {
  standings: TeamStanding[];
  players: PlayerLeader[];
  highlights: Highlights;
}

/** 1 = first team won head-to-head, -1 = second won, 0 = tied or no meeting. */
function headToHead(teamA: number, teamB: number, finals: Game[]): number {
  for (const g of finals) {
    if (g.team_a_id === teamA && g.team_b_id === teamB) {
      const sa = g.score_a as number;
      const sb = g.score_b as number;
      if (sa > sb) return 1;
      if (sb > sa) return -1;
      return 0;
    }
    if (g.team_a_id === teamB && g.team_b_id === teamA) {
      const sa = g.score_a as number;
      const sb = g.score_b as number;
      if (sb > sa) return 1;
      if (sa > sb) return -1;
      return 0;
    }
  }
  return 0;
}

function compareStandings(a: TeamStanding, b: TeamStanding, finals: Game[]): number {
  if (a.points !== b.points) return b.points - a.points;
  const h2h = headToHead(a.teamId, b.teamId, finals);
  if (h2h !== 0) return -h2h;
  if (a.diff !== b.diff) return b.diff - a.diff;
  if (a.pointsFor !== b.pointsFor) return b.pointsFor - a.pointsFor;
  return a.teamId - b.teamId;
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
      members: (membersByTeam.get(t.id) ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        has_photo: m.has_photo,
      })),
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
    .sort((x, y) => compareStandings(x, y, finals));

  // ---- Player leaderboard (only finalised games in this tournament) ----
  const teamNameByPlayer = new Map<number, string>();
  for (const t of teams) {
    for (const m of membersByTeam.get(t.id) ?? []) teamNameByPlayer.set(m.id, t.name);
  }

  const finalIds = new Set(finals.map((g) => g.id));
  const perPlayer = new Map<number, { name: string; has_photo: number; gp: number; pts: number }>();
  if (finalIds.size > 0) {
    const placeholders = [...finalIds].map(() => "?").join(",");
    const detailed = db
      .prepare(
        `SELECT pgs.player_id AS playerId, p.name AS name, p.has_photo AS has_photo,
                pgs.game_id AS gameId, pgs.points AS points
         FROM player_game_stats pgs JOIN players p ON p.id = pgs.player_id
         WHERE pgs.game_id IN (${placeholders})`
      )
      .all(...finalIds) as {
      playerId: number;
      name: string;
      has_photo: number;
      gameId: number;
      points: number;
    }[];
    for (const d of detailed) {
      const cur = perPlayer.get(d.playerId) ?? { name: d.name, has_photo: d.has_photo, gp: 0, pts: 0 };
      cur.gp += 1;
      cur.pts += d.points;
      perPlayer.set(d.playerId, cur);
    }
  }

  const playerLeaders: PlayerLeader[] = [...perPlayer.entries()]
    .map(([playerId, v]) => ({
      playerId,
      name: v.name,
      has_photo: v.has_photo,
      teamName: teamNameByPlayer.get(playerId) ?? null,
      gamesPlayed: v.gp,
      totalPoints: v.pts,
      pointsPerGame: v.gp ? Math.round((v.pts / v.gp) * 10) / 10 : 0,
    }))
    .sort((x, y) => y.totalPoints - x.totalPoints || y.pointsPerGame - x.pointsPerGame);

  // ---- Highlights & awards ----
  const teamNameById = new Map(teams.map((t) => [t.id, t.name] as const));
  let highestScoringGame: Highlights["highestScoringGame"] = null;
  let clutchWin: Highlights["clutchWin"] = null;
  for (const g of finals) {
    const sa = g.score_a as number;
    const sb = g.score_b as number;
    const total = sa + sb;
    const teamsLabel = `${teamNameById.get(g.team_a_id as number) ?? "?"} vs ${teamNameById.get(g.team_b_id as number) ?? "?"}`;
    if (!highestScoringGame || total > highestScoringGame.total) {
      highestScoringGame = { label: g.label, teams: teamsLabel, total };
    }
    if (sa !== sb) {
      const margin = Math.abs(sa - sb);
      if (!clutchWin || margin < clutchWin.margin) {
        clutchWin = { label: g.label, teams: teamsLabel, margin };
      }
    }
  }

  const totalPointsScored = finals.reduce((s, g) => s + (g.score_a as number) + (g.score_b as number), 0);

  const awards: Award[] = [];
  if (playerLeaders[0]) {
    awards.push({
      key: "mvp",
      value: playerLeaders[0].totalPoints,
      playerId: playerLeaders[0].playerId,
      playerName: playerLeaders[0].name,
    });
  }
  const bestShooter = playerLeaders.filter((p) => p.gamesPlayed >= 2).sort((a, b) => b.pointsPerGame - a.pointsPerGame)[0];
  if (bestShooter && bestShooter.playerId !== playerLeaders[0]?.playerId) {
    awards.push({
      key: "bestShooter",
      value: bestShooter.pointsPerGame,
      playerId: bestShooter.playerId,
      playerName: bestShooter.name,
    });
  }
  if (standingsList.find((s) => s.played > 0)) {
    const leader = standingsList.find((s) => s.played > 0)!;
    awards.push({
      key: "leadingTeam",
      wins: leader.wins,
      losses: leader.losses,
      teamName: leader.name,
    });
  }
  if (clutchWin) {
    awards.push({
      key: "clutchWin",
      value: clutchWin.margin,
      teamName: clutchWin.teams,
    });
  }
  if (highestScoringGame) {
    awards.push({
      key: "shootout",
      value: highestScoringGame.total,
      teamName: highestScoringGame.teams,
    });
  }

  const highlights: Highlights = {
    topScorer: playerLeaders[0] ?? null,
    bestTeam: standingsList.find((s) => s.played > 0) ?? null,
    highestScoringGame,
    clutchWin,
    totalGamesPlayed: finals.length,
    totalPointsScored,
    awards,
  };

  return { standings: standingsList, players: playerLeaders, highlights };
}

/** Display label for an unresolved bracket slot, e.g. "Winner of Game 3". */
function placeholderName(_sourceMatchId: number | null, _result: string | null): string {
  return "TBD";
}

export function gameView(g: Game) {
  const stats = gamesRepo.statsFor(g.id);
  const pointsByPlayer = new Map(stats.map((s) => [s.player_id, s.points] as const));
  const decorate = (m: Player) => ({
    id: m.id,
    name: m.name,
    has_photo: m.has_photo,
    points: pointsByPlayer.get(m.id) ?? 0,
  });

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
      members: [] as { id: number; name: string; has_photo: number; points: number }[],
      placeholder: true as const,
    };
  };

  return {
    ...g,
    teamA: side(g.team_a_id, g.a_source_match_id, g.a_source_result),
    teamB: side(g.team_b_id, g.b_source_match_id, g.b_source_result),
  };
}
