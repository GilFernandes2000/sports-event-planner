export interface Player {
  id: number;
  name: string;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  years_played: number;
  plays_regularly: number;
  skill_self_rating: number;
  notes: string | null;
  has_photo: number;
  created_at: string;
  rating: number;
}

export interface Tournament {
  id: number;
  name: string;
  created_at: string;
  counts: { players: number; teams: number; games: number };
}

export interface TeamMember {
  id: number;
  name: string;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  years_played: number;
  plays_regularly: number;
  skill_self_rating: number;
  notes: string | null;
  has_photo: number;
  created_at: string;
}

export interface Team {
  id: number;
  tournament_id: number;
  name: string;
  locked: number;
  created_at: string;
  members: TeamMember[];
  rating: number;
}

export interface TeamsResponse {
  teams: Team[];
  locked: boolean;
}

export interface GamePlayer {
  id: number;
  name: string;
  has_photo: number;
  points: number;
}

export interface GameSide {
  id: number | null;
  name: string;
  members: GamePlayer[];
  placeholder: boolean;
}

export type SourceResult = "winner" | "loser";

export interface Game {
  id: number;
  tournament_id: number;
  label: string | null;
  round: number;
  stage: string;
  team_a_id: number | null;
  team_b_id: number | null;
  a_source_match_id: number | null;
  a_source_result: SourceResult | null;
  b_source_match_id: number | null;
  b_source_result: SourceResult | null;
  score_a: number | null;
  score_b: number | null;
  status: "scheduled" | "final";
  played_at: string | null;
  teamA: GameSide;
  teamB: GameSide;
}

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
  points: number;
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

export interface StatsResponse {
  standings: TeamStanding[];
  players: PlayerLeader[];
  highlights: {
    topScorer: PlayerLeader | null;
    bestTeam: TeamStanding | null;
    highestScoringGame: { label: string | null; teams: string; total: number } | null;
    totalGamesPlayed: number;
    totalPointsScored: number;
  };
}

export interface SuggestResult {
  teams: { name: string; players: Player[]; rating: number }[];
  leftover: Player | null;
  balanceScore: number;
  averageTeamRating: number;
}
