import type { FastifyInstance } from "fastify";
import { players, type PlayerInput } from "../db/repo.js";
import { ratePlayers } from "../services/balance.js";
import { requireAdmin } from "../services/auth.js";

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

export default async function playerRoutes(app: FastifyInstance) {
  // Public: directory of all players with their computed rating.
  app.get("/api/players", async () => {
    const rated = ratePlayers(players.all());
    return rated.map(({ player, rating }) => ({ ...player, rating }));
  });

  // Admin: add a player to the directory.
  app.post("/api/players", { preHandler: requireAdmin }, async (req, reply) => {
    const { value, error } = parsePlayerInput(req.body);
    if (error) return reply.code(400).send({ error });
    return players.create(value!);
  });

  // Admin: edit a player.
  app.put("/api/players/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!players.get(id)) return reply.code(404).send({ error: "Player not found." });
    const { value, error } = parsePlayerInput(req.body);
    if (error) return reply.code(400).send({ error });
    return players.update(id, value!);
  });

  // Admin: remove a player from the directory (and all tournaments).
  app.delete("/api/players/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!players.get(id)) return reply.code(404).send({ error: "Player not found." });
    players.remove(id);
    return reply.code(204).send();
  });
}
