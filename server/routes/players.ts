import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { players, type PlayerInput } from "../db/repo.js";
import { ratePlayers } from "../services/balance.js";
import {
  canManagePlayerPhoto,
  canViewPlayer,
  playerScopeAdminId,
} from "../services/player-scope.js";
import { requireAdmin, requireTournamentOrAdmin } from "../services/auth.js";
import { deletePlayerPhoto, getPlayerPhoto, savePlayerPhoto } from "../services/player-photos.js";

export function parsePlayerInput(body: unknown): { value?: PlayerInput; error?: string } {
  if (typeof body !== "object" || body === null) return { error: "Invalid body." };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "Name is required." };
  if (name.length > 60) return { error: "Name is too long." };

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  const age = num(b.age);
  if (Number.isNaN(age)) return { error: "Age must be a number." };
  if (age !== null && (age < 5 || age > 100)) return { error: "Age must be 5-100." };

  const height_cm = num(b.height_cm);
  const weight_kg = num(b.weight_kg);
  if (Number.isNaN(height_cm) || Number.isNaN(weight_kg)) return { error: "Height/weight must be numbers." };
  if (height_cm !== null && (height_cm < 80 || height_cm > 260)) return { error: "Height must be 80-260 cm." };
  if (weight_kg !== null && (weight_kg < 20 || weight_kg > 250)) return { error: "Weight must be 20-250 kg." };

  const yearsRaw = num(b.years_played) ?? 0;
  if (Number.isNaN(yearsRaw) || yearsRaw < 0 || yearsRaw > 80) return { error: "Years played must be 0-80." };

  const skillRaw = num(b.skill_self_rating) ?? 5;
  if (Number.isNaN(skillRaw) || skillRaw < 1 || skillRaw > 10) return { error: "Skill rating must be 1-10." };

  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 280) : null;

  return {
    value: {
      name,
      age: age === null ? null : Math.round(age),
      height_cm,
      weight_kg,
      years_played: yearsRaw,
      plays_regularly: !!b.plays_regularly,
      skill_self_rating: Math.round(skillRaw),
      notes: notes || null,
    },
  };
}

async function requireOwnedPlayer(
  req: FastifyRequest,
  reply: FastifyReply,
  playerId: number
): Promise<boolean> {
  if (!req.admin) {
    reply.code(401).send({ error: "Admin authentication required." });
    return false;
  }
  const player = players.getForAdmin(req.admin.id, playerId);
  if (!player) {
    reply.code(404).send({ error: "Player not found." });
    return false;
  }
  return true;
}

async function requirePlayerPhotoAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  playerId: number
): Promise<boolean> {
  const player = players.get(playerId);
  if (!player) {
    reply.code(404).send({ error: "Player not found." });
    return false;
  }
  if (!canManagePlayerPhoto(req, playerId)) {
    reply.code(403).send({ error: "Not allowed to change this player's photo." });
    return false;
  }
  return true;
}

export default async function playerRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  });

  // Participant or admin: this organiser's player directory with computed ratings.
  app.get("/api/players", { preHandler: requireTournamentOrAdmin }, async (req, reply) => {
    const adminId = playerScopeAdminId(req);
    if (adminId === null) return reply.code(401).send({ error: "Tournament access required." });
    const rated = ratePlayers(players.byAdmin(adminId));
    return rated.map(({ player, rating }) => ({ ...player, rating }));
  });

  // Participant or admin: serve a player's photo (auth via headers).
  app.get("/api/players/:id/photo", { preHandler: requireTournamentOrAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const player = players.get(id);
    if (!player || !player.has_photo || !canViewPlayer(req, player)) {
      return reply.code(404).send({ error: "Photo not found." });
    }
    const photo = getPlayerPhoto(id);
    if (!photo) return reply.code(404).send({ error: "Photo not found." });
    return reply.type(photo.mime).send(photo.buffer);
  });

  // Admin or tournament participant (roster member): upload/replace photo.
  app.put("/api/players/:id/photo", { preHandler: requireTournamentOrAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!(await requirePlayerPhotoAccess(req, reply, id))) return;

    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "Photo file is required." });

    const buffer = await part.toBuffer();
    const mime = part.mimetype;
    const saved = savePlayerPhoto(id, buffer, mime);
    if ("error" in saved) return reply.code(400).send({ error: saved.error });

    players.setHasPhoto(id, true);
    return players.get(id);
  });

  // Admin: remove a player's photo.
  app.delete("/api/players/:id/photo", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!(await requireOwnedPlayer(req, reply, id))) return;
    deletePlayerPhoto(id);
    players.setHasPhoto(id, false);
    return reply.code(204).send();
  });

  // Admin: add a player to their directory.
  app.post("/api/players", { preHandler: requireAdmin }, async (req, reply) => {
    const { value, error } = parsePlayerInput(req.body);
    if (error) return reply.code(400).send({ error });
    return players.create(value!, req.admin!.id);
  });

  // Admin: edit a player in their directory.
  app.put("/api/players/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!(await requireOwnedPlayer(req, reply, id))) return;
    const { value, error } = parsePlayerInput(req.body);
    if (error) return reply.code(400).send({ error });
    return players.update(id, value!);
  });

  // Admin: remove a player from their directory (and all tournaments).
  app.delete("/api/players/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!(await requireOwnedPlayer(req, reply, id))) return;
    players.remove(id);
    return reply.code(204).send();
  });
}
