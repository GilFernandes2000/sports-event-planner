import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import db from "../db/index.js";

const DEFAULT_PASSWORD = "changeme";

export function adminPassword(): string {
  const fromEnv = process.env.ADMIN_PASSWORD?.trim();
  return fromEnv || DEFAULT_PASSWORD;
}

export function usingDefaultPassword(): boolean {
  return !process.env.ADMIN_PASSWORD?.trim();
}

// Tokens are persisted in the database so they survive server restarts and Pi
// reboots (the previous in-memory store silently logged the admin out on every
// restart, which made admin actions appear broken).
export function issueToken(): string {
  const token = randomBytes(24).toString("hex");
  db.prepare("INSERT INTO admin_tokens (token) VALUES (?)").run(token);
  return token;
}

export function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  return !!db.prepare("SELECT 1 FROM admin_tokens WHERE token = ?").get(token);
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

/** Fastify preHandler that blocks non-admins from write routes. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isValidToken(tokenFromRequest(req))) {
    reply.code(401).send({ error: "Admin authentication required." });
  }
}
