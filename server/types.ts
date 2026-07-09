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
  has_photo: number; // 0 | 1 in SQLite
  admin_id: number | null;
  created_at: string;
}

export interface Admin {
  id: number;
  email: string;
  password_hash?: string | null;
  google_id?: string | null;
  display_name: string | null;
  status: "unverified" | "approved";
  created_at: string;
}

export type ScoringPreset = "standard" | "first_to_21" | "kids";
export type FormatType = "round_robin" | "knockout" | "group_playoff";
export type TournamentStatus = "draft" | "active" | "finished";

export interface Tournament {
  id: number;
  name: string;
  password_hash?: string;
  admin_id: number | null;
  share_slug: string | null;
  event_date: string | null;
  location: string | null;
  team_size: number;
  game_duration_min: number;
  scoring_preset: ScoringPreset;
  format_type: FormatType;
  status: TournamentStatus;
  created_at: string;
}

export interface TournamentInput {
  name: string;
  passwordHash: string;
  adminId: number;
  eventDate?: string | null;
  location?: string | null;
  teamSize?: number;
  gameDurationMin?: number;
  scoringPreset?: ScoringPreset;
  formatType?: FormatType;
}

export interface TournamentUpdate {
  name?: string;
  eventDate?: string | null;
  location?: string | null;
  teamSize?: number;
  gameDurationMin?: number;
  scoringPreset?: ScoringPreset;
  formatType?: FormatType;
  status?: TournamentStatus;
}

export type TournamentRole = "owner" | "co-admin";

export interface TournamentWithRole extends Tournament {
  role: TournamentRole;
}

export interface TournamentAdminSummary {
  id: number;
  email: string;
  display_name: string | null;
  role: TournamentRole;
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
