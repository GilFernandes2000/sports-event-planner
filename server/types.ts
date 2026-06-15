export interface Player {
  id: number;
  name: string;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  years_played: number;
  plays_regularly: number; // 0 | 1 in SQLite
  skill_self_rating: number;
  notes: string | null;
  created_at: string;
}

export interface Tournament {
  id: number;
  name: string;
  created_at: string;
}

export interface Team {
  id: number;
  tournament_id: number;
  name: string;
  locked: number; // 0 | 1
  created_at: string;
}

export interface TeamWithMembers extends Team {
  members: Player[];
  rating: number;
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
}

export interface PlayerGameStat {
  id: number;
  game_id: number;
  player_id: number;
  points: number;
}
