import type { Player, Tournament, TeamsResponse, Game, StatsResponse, SuggestResult } from "./types";

const TOKEN_KEY = "bball_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  // Only declare a JSON body when one is actually sent; Fastify rejects an
  // empty body when content-type is application/json (FST_ERR_CTP_EMPTY_JSON_BODY),
  // which would break bodyless POSTs like generate/lock/round-robin.
  if (options.body) headers["content-type"] = "application/json";
  const token = getToken();
  if (token) headers["authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers: { ...headers, ...(options.headers as object) } });

  if (res.status === 401) {
    // A stale/invalid token: drop it and let the app reflect logged-out state.
    setToken(null);
    window.dispatchEvent(new Event("admin-unauthorized"));
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface PlayerPayload {
  name: string;
  age: number | null;
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

export const api = {
  // ---- auth ----
  login: (password: string) =>
    request<{ token: string }>("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  verify: () => request<{ valid: boolean }>("/api/admin/verify"),
  logout: () => request<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),

  // ---- players directory ----
  getPlayers: () => request<Player[]>("/api/players"),
  createPlayer: (p: PlayerPayload) => request<Player>("/api/players", { method: "POST", body: JSON.stringify(p) }),
  updatePlayer: (id: number, p: PlayerPayload) =>
    request<Player>(`/api/players/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  deletePlayer: (id: number) => request<void>(`/api/players/${id}`, { method: "DELETE" }),

  // ---- tournaments ----
  getTournaments: () => request<Tournament[]>("/api/tournaments"),
  createTournament: (name: string) =>
    request<Tournament>("/api/tournaments", { method: "POST", body: JSON.stringify({ name }) }),
  deleteTournament: (id: number) => request<void>(`/api/tournaments/${id}`, { method: "DELETE" }),

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
  generateTeams: (tid: number) =>
    request<TeamsResponse>(`/api/tournaments/${tid}/teams/generate`, { method: "POST" }),
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
