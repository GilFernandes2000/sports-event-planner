import i18n from "i18next";
import type {
  Player,
  Tournament,
  TournamentAdmin,
  TournamentCreateInput,
  TeamsResponse,
  Game,
  StatsResponse,
  SuggestResult,
  PublicTournamentResponse,
} from "./types";

const ADMIN_TOKEN_KEY = "bball_admin_token";
const TOURNAMENT_TOKEN_KEY = "bball_tournament_token";
const TOURNAMENT_ID_KEY = "bball_tournament_access_id";

export function getToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function getTournamentToken(): string | null {
  return localStorage.getItem(TOURNAMENT_TOKEN_KEY);
}
export function setTournamentToken(token: string | null): void {
  if (token) localStorage.setItem(TOURNAMENT_TOKEN_KEY, token);
  else localStorage.removeItem(TOURNAMENT_TOKEN_KEY);
}

export function getTournamentAccessId(): number | null {
  const raw = localStorage.getItem(TOURNAMENT_ID_KEY);
  return raw ? Number(raw) : null;
}
export function setTournamentAccessId(id: number | null): void {
  if (id) localStorage.setItem(TOURNAMENT_ID_KEY, String(id));
  else localStorage.removeItem(TOURNAMENT_ID_KEY);
}

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const adminToken = getToken();
  const tournamentToken = getTournamentToken();
  if (adminToken) headers["authorization"] = `Bearer ${adminToken}`;
  if (tournamentToken) headers["x-tournament-token"] = tournamentToken;
  return headers;
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = authHeaders();
  if (options.body && !(options.body instanceof FormData)) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers as object) } });
  } catch {
    throw new Error(i18n.t("common.networkError"));
  }

  if (res.status === 401) {
    const adminToken = getToken();
    const tournamentToken = getTournamentToken();
    if (adminToken && path.startsWith("/api/admin")) {
      setToken(null);
      window.dispatchEvent(new Event("admin-unauthorized"));
    }
    if (tournamentToken && !path.startsWith("/api/admin")) {
      setTournamentToken(null);
      setTournamentAccessId(null);
      window.dispatchEvent(new Event("tournament-unauthorized"));
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? (parseJsonSafe(text) as { error?: string } | null) : null;
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface PlayerPayload {
  name: string;
  age: number | null;
  gender: "male" | "female" | null;
  height_cm: number | null;
  weight_kg: number | null;
  years_played: number;
  plays_regularly: boolean;
  skill_self_rating: number;
  notes: string | null;
}

export interface SidePayload {
  type: "team" | "winner" | "loser";
  value: number;
}

export interface MatchPayload {
  label: string;
  round: number;
  stage?: "bracket" | "round_robin";
  sideA: SidePayload;
  sideB: SidePayload;
}

export interface AccessLoginResponse {
  token: string;
  tournament: {
    id: number;
    name: string;
    share_slug: string | null;
    event_date: string | null;
    location: string | null;
    team_size: number;
    game_duration_min: number;
    scoring_preset: string;
    format_type: string;
    status: string;
    created_at: string;
  };
}

export interface AccessVerifyResponse {
  valid: boolean;
  tournament: AccessLoginResponse["tournament"] | null;
}

export interface AdminProfileResponse {
  id: number;
  email: string;
  display_name: string | null;
  status: "unverified" | "approved";
}

export interface AdminAuthResponse {
  token: string;
  admin: AdminProfileResponse;
}

export interface AdminVerificationRequiredResponse {
  verificationRequired: true;
  admin: AdminProfileResponse;
}

export const api = {
  // ---- tournament access ----
  accessLogin: (name: string, password: string) =>
    request<AccessLoginResponse>("/api/access", { method: "POST", body: JSON.stringify({ name, password }) }),
  accessVerify: () => request<AccessVerifyResponse>("/api/access/verify"),
  accessLogout: () => request<{ ok: boolean }>("/api/access/logout", { method: "POST" }),

  // ---- admin accounts ----
  registrationConfig: () => request<{ emailVerificationEnabled: boolean }>("/api/admin/registration"),
  register: (email: string, password: string) =>
    request<AdminAuthResponse | AdminVerificationRequiredResponse>("/api/admin/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  verifyAdminEmail: (email: string, code: string) =>
    request<AdminAuthResponse>("/api/admin/verify-email", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),
  resendAdminVerification: (email: string) =>
    request<{ ok: boolean }>("/api/admin/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  login: (email: string, password: string) =>
    request<AdminAuthResponse>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  verify: () => request<{ valid: boolean; admin: AdminAuthResponse["admin"] }>("/api/admin/verify"),
  logout: () => request<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),
  googleOAuthEnabled: () => request<{ enabled: boolean }>("/api/admin/google/enabled"),
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>("/api/admin/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (email: string, code: string, password: string) =>
    request<AdminAuthResponse>("/api/admin/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, code, password }),
    }),

  // ---- players directory ----
  getPlayers: () => request<Player[]>("/api/players"),
  createPlayer: (p: PlayerPayload) => request<Player>("/api/players", { method: "POST", body: JSON.stringify(p) }),
  updatePlayer: (id: number, p: PlayerPayload) =>
    request<Player>(`/api/players/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  deletePlayer: (id: number) => request<void>(`/api/players/${id}`, { method: "DELETE" }),
  uploadPlayerPhoto: (id: number, file: File) => {
    const form = new FormData();
    form.append("photo", file);
    return request<Player>(`/api/players/${id}/photo`, { method: "PUT", body: form });
  },
  deletePlayerPhoto: (id: number) => request<void>(`/api/players/${id}/photo`, { method: "DELETE" }),

  // ---- tournaments ----
  getTournaments: () => request<Tournament[]>("/api/tournaments"),
  createTournament: (input: TournamentCreateInput) =>
    request<Tournament>("/api/tournaments", { method: "POST", body: JSON.stringify(input) }),
  updateTournament: (id: number, patch: Partial<Omit<TournamentCreateInput, "password"> & { status?: Tournament["status"] }>) =>
    request<Tournament>(`/api/tournaments/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTournament: (id: number) => request<void>(`/api/tournaments/${id}`, { method: "DELETE" }),
  setTournamentPassword: (id: number, password: string) =>
    request<{ ok: boolean }>(`/api/tournaments/${id}/password`, {
      method: "PUT",
      body: JSON.stringify({ password }),
    }),
  listTournamentAdmins: (id: number) => request<TournamentAdmin[]>(`/api/tournaments/${id}/admins`),
  addTournamentAdmin: (id: number, email: string) =>
    request<TournamentAdmin[]>(`/api/tournaments/${id}/admins`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  removeTournamentAdmin: (id: number, adminId: number) =>
    request<void>(`/api/tournaments/${id}/admins/${adminId}`, { method: "DELETE" }),

  // ---- public (no auth) ----
  getPublicTournament: (slug: string) => request<PublicTournamentResponse>(`/api/public/tournaments/${encodeURIComponent(slug)}`),

  // ---- roster ----
  getRoster: (tid: number) => request<Player[]>(`/api/tournaments/${tid}/roster`),
  enroll: (tid: number, p: PlayerPayload) =>
    request<Player>(`/api/tournaments/${tid}/enroll`, { method: "POST", body: JSON.stringify(p) }),
  addToRoster: (tid: number, playerIds: number[], newPlayers: PlayerPayload[] = []) =>
    request<Player[]>(`/api/tournaments/${tid}/roster`, {
      method: "POST",
      body: JSON.stringify({ playerIds, newPlayers }),
    }),
  removeFromRoster: (tid: number, playerId: number) =>
    request<void>(`/api/tournaments/${tid}/roster/${playerId}`, { method: "DELETE" }),

  // ---- teams ----
  getTeams: (tid: number) => request<TeamsResponse>(`/api/tournaments/${tid}/teams`),
  generateTeams: (tid: number, opts: { mixGenders?: boolean } = {}) =>
    request<TeamsResponse>(`/api/tournaments/${tid}/teams/generate`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  saveTeams: (tid: number, teams: { name: string; playerIds: number[] }[]) =>
    request<TeamsResponse>(`/api/tournaments/${tid}/teams`, { method: "PUT", body: JSON.stringify({ teams }) }),
  lockTeams: (tid: number) => request<TeamsResponse>(`/api/tournaments/${tid}/teams/lock`, { method: "POST" }),
  unlockTeams: (tid: number) => request<TeamsResponse>(`/api/tournaments/${tid}/teams/unlock`, { method: "POST" }),

  // ---- games / bracket ----
  getGames: (tid: number) => request<Game[]>(`/api/tournaments/${tid}/games`),
  generateRoundRobin: (tid: number) =>
    request<{ gamesCreated: number; games: Game[] }>(`/api/tournaments/${tid}/round-robin`, { method: "POST" }),
  generateKnockout: (tid: number, opts: { seeding: "rating" | "random" }) =>
    request<{ gamesCreated: number; games: Game[] }>(`/api/tournaments/${tid}/knockout`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  generateGroupStage: (tid: number, opts: { teamsPerGroup: number }) =>
    request<{ groupsCreated: number; gamesCreated: number; games: Game[] }>(
      `/api/tournaments/${tid}/group-stage`,
      { method: "POST", body: JSON.stringify(opts) }
    ),
  generateGroupKnockout: (tid: number, opts: { advancePerGroup: number }) =>
    request<{ gamesCreated: number; qualified: number; games: Game[] }>(
      `/api/tournaments/${tid}/group-knockout`,
      { method: "POST", body: JSON.stringify(opts) }
    ),
  generateRepechage: (tid: number, opts: { count: number }) =>
    request<{ gamesCreated: number; chosen: number; games: Game[] }>(`/api/tournaments/${tid}/repechage`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  addMatch: (tid: number, m: MatchPayload) =>
    request<Game>(`/api/tournaments/${tid}/games`, { method: "POST", body: JSON.stringify(m) }),
  updateMatch: (id: number, m: MatchPayload) =>
    request<Game>(`/api/games/${id}/match`, { method: "PUT", body: JSON.stringify(m) }),
  deleteMatch: (id: number) => request<void>(`/api/games/${id}`, { method: "DELETE" }),
  saveResult: (
    id: number,
    payload: { score_a: number; score_b: number; status: "scheduled" | "final"; playerPoints: Record<number, number> }
  ) => request<Game>(`/api/games/${id}/result`, { method: "PUT", body: JSON.stringify(payload) }),

  // ---- stats ----
  getStats: (tid: number) => request<StatsResponse>(`/api/tournaments/${tid}/stats`),
};
