import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import db from "../db/index.js";
import { admins, tournaments } from "../db/repo.js";
import type { Admin } from "../types.js";

const SESSION_DAYS = 7;
const SALT_LEN = 16;
const KEY_LEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(password, salt, KEY_LEN);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const key = Buffer.from(keyHex, "hex");
    const derived = scryptSync(password, salt, KEY_LEN);
    return timingSafeEqual(key, derived);
  } catch {
    return false;
  }
}

function sessionExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d.toISOString();
}

export function publicAdmin(a: Admin) {
  return { id: a.id, email: a.email, display_name: a.display_name };
}

export function issueToken(adminId: number): string {
  const token = randomBytes(24).toString("hex");
  db.prepare("INSERT INTO admin_tokens (token, admin_id) VALUES (?, ?)").run(token, adminId);
  return token;
}

export function getAdminFromToken(token: string | undefined): Admin | undefined {
  if (!token) return undefined;
  const row = db
    .prepare(
      `SELECT a.* FROM admins a
       JOIN admin_tokens t ON t.admin_id = a.id
       WHERE t.token = ?`
    )
    .get(token) as Admin | undefined;
  return row;
}

export function isValidToken(token: string | undefined): boolean {
  return !!getAdminFromToken(token);
}

export function revokeToken(token: string | undefined): void {
  if (token) db.prepare("DELETE FROM admin_tokens WHERE token = ?").run(token);
}

export function tokenFromRequest(req: FastifyRequest): string | undefined {
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const x = req.headers["x-admin-token"];
  return typeof x === "string" ? x : undefined;
}

export function tournamentTokenFromRequest(req: FastifyRequest): string | undefined {
  const x = req.headers["x-tournament-token"];
  if (typeof x === "string" && x) return x;
  const cookie = req.headers.cookie;
  if (typeof cookie === "string") {
    const match = cookie.match(/(?:^|;\s*)tournament_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return undefined;
}

export interface TournamentSession {
  tournament_id: number;
  expires_at: string;
}

export function issueTournamentToken(tournamentId: number): string {
  const token = randomBytes(24).toString("hex");
  const expiresAt = sessionExpiresAt();
  db.prepare(
    "INSERT INTO tournament_sessions (token, tournament_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, tournamentId, expiresAt);
  return token;
}

export function getTournamentSession(token: string | undefined): TournamentSession | undefined {
  if (!token) return undefined;
  const row = db
    .prepare("SELECT tournament_id, expires_at FROM tournament_sessions WHERE token = ?")
    .get(token) as TournamentSession | undefined;
  if (!row) return undefined;
  if (new Date(row.expires_at) <= new Date()) {
    db.prepare("DELETE FROM tournament_sessions WHERE token = ?").run(token);
    return undefined;
  }
  return row;
}

export function revokeTournamentToken(token: string | undefined): void {
  if (token) db.prepare("DELETE FROM tournament_sessions WHERE token = ?").run(token);
}

function tournamentIdFromParams(req: FastifyRequest): number | null {
  const params = req.params as { tid?: string };
  if (params.tid === undefined) return null;
  const tid = Number(params.tid);
  return Number.isFinite(tid) ? tid : null;
}

export function adminOwnsTournament(adminId: number, tournamentId: number): boolean {
  const t = tournaments.get(tournamentId);
  return !!t && t.admin_id === adminId;
}

/** Attach authenticated admin to request or send 401. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const admin = getAdminFromToken(tokenFromRequest(req));
  if (!admin) {
    reply.code(401).send({ error: "Admin authentication required." });
    return;
  }
  req.admin = admin;
}

/** Admin must own the tournament in :tid. */
export async function requireAdminTournament(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAdmin(req, reply);
  if (reply.sent) return;

  const tid = tournamentIdFromParams(req);
  if (tid === null) {
    reply.code(400).send({ error: "Tournament id required." });
    return;
  }

  const t = tournaments.get(tid);
  if (!t) {
    reply.code(404).send({ error: "Tournament not found." });
    return;
  }
  if (t.admin_id !== req.admin!.id) {
    reply.code(403).send({ error: "You do not manage this tournament." });
  }
}

/** Admin must own the game's tournament (for /api/games/:id routes). */
export async function requireAdminGame(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAdmin(req, reply);
  if (reply.sent) return;

  const id = Number((req.params as { id: string }).id);
  if (!Number.isFinite(id)) {
    reply.code(400).send({ error: "Game id required." });
    return;
  }

  const game = db.prepare("SELECT tournament_id FROM games WHERE id = ?").get(id) as
    | { tournament_id: number }
    | undefined;
  if (!game) {
    reply.code(404).send({ error: "Match not found." });
    return;
  }
  if (!adminOwnsTournament(req.admin!.id, game.tournament_id)) {
    reply.code(403).send({ error: "You do not manage this tournament." });
  }
}

/** Participant session or admin token required (no tournament id in URL). */
export async function requireTournamentOrAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (isValidToken(tokenFromRequest(req))) return;
  const session = getTournamentSession(tournamentTokenFromRequest(req));
  if (!session) {
    reply.code(401).send({ error: "Tournament access required." });
  }
}

/** Tournament-scoped routes: participant session for :tid, or admin who owns it. */
export async function requireTournamentAccess(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const tid = tournamentIdFromParams(req);
  if (tid === null) {
    reply.code(400).send({ error: "Tournament id required." });
    return;
  }

  const admin = getAdminFromToken(tokenFromRequest(req));
  if (admin && adminOwnsTournament(admin.id, tid)) return;

  const session = getTournamentSession(tournamentTokenFromRequest(req));
  if (!session || session.tournament_id !== tid) {
    reply.code(401).send({ error: "Tournament access required." });
  }
}

export function parseEmail(raw: unknown): { email?: string; error?: string } {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email is required." };
  }
  if (email.length > 254) return { error: "Email is too long." };
  return { email };
}

export function parseAccountPassword(raw: unknown): { password?: string; error?: string } {
  const password = typeof raw === "string" ? raw : "";
  if (!password || password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password.length > 128) return { error: "Password is too long." };
  return { password };
}
