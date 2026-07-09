import type { FastifyInstance } from "fastify";
import { tournaments, tournamentAdmins, players, admins } from "../db/repo.js";
import { ratePlayers } from "../services/balance.js";
import {
  hashPassword,
  parseEmail,
  requireAdmin,
  requireAdminTournament,
  requireTournamentAccess,
  requireTournamentOwner,
} from "../services/auth.js";
import { parsePlayerInput } from "./players.js";
import type { FormatType, ScoringPreset, TournamentStatus, TournamentRole } from "../types.js";

function ratedRoster(tournamentId: number) {
  const roster = tournaments.roster(tournamentId);
  return ratePlayers(roster)
    .map(({ player, rating }) => ({ ...player, rating }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function publicTournament(t: NonNullable<ReturnType<typeof tournaments.get>>, role?: TournamentRole) {
  return {
    id: t.id,
    name: t.name,
    share_slug: t.share_slug,
    event_date: t.event_date,
    location: t.location,
    team_size: t.team_size,
    game_duration_min: t.game_duration_min,
    scoring_preset: t.scoring_preset,
    format_type: t.format_type,
    status: t.status,
    created_at: t.created_at,
    counts: tournaments.counts(t.id),
    role: role ?? "owner",
  };
}

function parsePassword(body: unknown): { password?: string; error?: string } {
  if (typeof body !== "object" || body === null) return { error: "Invalid body." };
  const password = typeof (body as { password?: unknown }).password === "string"
    ? (body as { password: string }).password
    : "";
  if (!password || password.length < 4) return { error: "Password must be at least 4 characters." };
  if (password.length > 128) return { error: "Password is too long." };
  return { password };
}

function parseCreateBody(body: unknown): { value?: import("../types.js").TournamentInput; error?: string } {
  if (typeof body !== "object" || body === null) return { error: "Invalid body." };
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  if (!name) return { error: "Tournament name is required." };
  const { password, error } = parsePassword(body);
  if (error) return { error };

  const teamSize = Number(b.teamSize ?? b.team_size ?? 2);
  if (![2, 3, 4, 5].includes(teamSize)) return { error: "Team size must be 2, 3, 4, or 5." };

  const gameDurationMin = Number(b.gameDurationMin ?? b.game_duration_min ?? 10);
  if (!Number.isFinite(gameDurationMin) || gameDurationMin < 1 || gameDurationMin > 60) {
    return { error: "Game duration must be between 1 and 60 minutes." };
  }

  const scoringPreset = (b.scoringPreset ?? b.scoring_preset ?? "standard") as ScoringPreset;
  if (!["standard", "first_to_21", "kids"].includes(scoringPreset)) {
    return { error: "Invalid scoring preset." };
  }

  const formatType = (b.formatType ?? b.format_type ?? "round_robin") as FormatType;
  if (!["round_robin", "knockout", "group_playoff"].includes(formatType)) {
    return { error: "Invalid format type." };
  }

  const eventDate =
    typeof b.eventDate === "string" && b.eventDate.trim() ? b.eventDate.trim().slice(0, 32) : null;
  const location =
    typeof b.location === "string" && b.location.trim() ? b.location.trim().slice(0, 120) : null;

  return {
    value: {
      name,
      passwordHash: hashPassword(password!),
      adminId: 0, // filled by route handler
      eventDate,
      location,
      teamSize,
      gameDurationMin,
      scoringPreset,
      formatType,
    },
  };
}

function parseUpdateBody(body: unknown): { value?: import("../types.js").TournamentUpdate; error?: string } {
  if (typeof body !== "object" || body === null) return { error: "Invalid body." };
  const b = body as Record<string, unknown>;
  const patch: import("../types.js").TournamentUpdate = {};

  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
    if (!name) return { error: "Tournament name is required." };
    patch.name = name;
  }
  if (b.eventDate !== undefined || b.event_date !== undefined) {
    const raw = (b.eventDate ?? b.event_date) as unknown;
    patch.eventDate = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 32) : null;
  }
  if (b.location !== undefined) {
    patch.location =
      typeof b.location === "string" && b.location.trim() ? b.location.trim().slice(0, 120) : null;
  }
  if (b.teamSize !== undefined || b.team_size !== undefined) {
    const teamSize = Number(b.teamSize ?? b.team_size);
    if (![2, 3, 4, 5].includes(teamSize)) return { error: "Team size must be 2, 3, 4, or 5." };
    patch.teamSize = teamSize;
  }
  if (b.gameDurationMin !== undefined || b.game_duration_min !== undefined) {
    const n = Number(b.gameDurationMin ?? b.game_duration_min);
    if (!Number.isFinite(n) || n < 1 || n > 60) return { error: "Game duration must be between 1 and 60 minutes." };
    patch.gameDurationMin = n;
  }
  if (b.scoringPreset !== undefined || b.scoring_preset !== undefined) {
    const preset = (b.scoringPreset ?? b.scoring_preset) as ScoringPreset;
    if (!["standard", "first_to_21", "kids"].includes(preset)) return { error: "Invalid scoring preset." };
    patch.scoringPreset = preset;
  }
  if (b.formatType !== undefined || b.format_type !== undefined) {
    const format = (b.formatType ?? b.format_type) as FormatType;
    if (!["round_robin", "knockout", "group_playoff"].includes(format)) return { error: "Invalid format type." };
    patch.formatType = format;
  }
  if (b.status !== undefined) {
    const status = b.status as TournamentStatus;
    if (!["draft", "active", "finished"].includes(status)) return { error: "Invalid status." };
    patch.status = status;
  }

  return { value: patch };
}

export default async function tournamentRoutes(app: FastifyInstance) {
  app.get("/api/tournaments", { preHandler: requireAdmin }, async (req) => {
    return tournaments.byAdmin(req.admin!.id).map((t) => publicTournament(t, t.role));
  });

  app.post("/api/tournaments", { preHandler: requireAdmin }, async (req, reply) => {
    const { value, error } = parseCreateBody(req.body);
    if (error || !value) return reply.code(400).send({ error });
    value.adminId = req.admin!.id;
    const created = tournaments.create(value);
    return publicTournament(created);
  });

  app.patch("/api/tournaments/:tid", { preHandler: requireAdminTournament }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    const { value, error } = parseUpdateBody(req.body);
    if (error) return reply.code(400).send({ error });
    const updated = tournaments.update(tid, value ?? {});
    if (!updated) return reply.code(404).send({ error: "Tournament not found." });
    return publicTournament(updated);
  });

  app.delete("/api/tournaments/:tid", { preHandler: requireTournamentOwner }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    tournaments.remove(tid);
    return reply.code(204).send();
  });

  app.get("/api/tournaments/:tid/admins", { preHandler: requireAdminTournament }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!tournaments.get(tid)) return reply.code(404).send({ error: "Tournament not found." });
    return tournamentAdmins.listByTournament(tid);
  });

  app.post("/api/tournaments/:tid/admins", { preHandler: requireTournamentOwner }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    const body = req.body as { email?: unknown };
    const { email, error } = parseEmail(body?.email);
    if (error) return reply.code(400).send({ error });

    const target = admins.findByEmail(email!);
    if (!target) {
      return reply
        .code(404)
        .send({ error: "No admin account with that email yet. Ask them to register first, then add them." });
    }
    if (target.id === req.admin!.id) {
      return reply.code(400).send({ error: "You already own this tournament." });
    }
    tournamentAdmins.add(tid, target.id);
    return tournamentAdmins.listByTournament(tid);
  });

  app.delete(
    "/api/tournaments/:tid/admins/:adminId",
    { preHandler: requireTournamentOwner },
    async (req, reply) => {
      const params = req.params as { tid: string; adminId: string };
      const tid = Number(params.tid);
      const targetAdminId = Number(params.adminId);
      tournamentAdmins.remove(tid, targetAdminId);
      return reply.code(204).send();
    }
  );

  app.put("/api/tournaments/:tid/password", { preHandler: requireAdminTournament }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    const { password, error } = parsePassword(req.body);
    if (error) return reply.code(400).send({ error });
    tournaments.setPassword(tid, hashPassword(password!));
    return { ok: true };
  });

  app.get("/api/tournaments/:tid/roster", { preHandler: requireTournamentAccess }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!tournaments.get(tid)) return reply.code(404).send({ error: "Tournament not found." });
    return ratedRoster(tid);
  });

  app.post("/api/tournaments/:tid/enroll", { preHandler: requireTournamentAccess }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    const t = tournaments.get(tid);
    if (!t) return reply.code(404).send({ error: "Tournament not found." });
    if (!t.admin_id) return reply.code(400).send({ error: "Tournament has no organiser." });
    const { value, error } = parsePlayerInput(req.body);
    if (error) return reply.code(400).send({ error });
    const created = players.create(value!, t.admin_id);
    tournaments.addToRoster(tid, created.id);
    return created;
  });

  app.post("/api/tournaments/:tid/roster", { preHandler: requireAdminTournament }, async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    const t = tournaments.get(tid);
    if (!t?.admin_id) return reply.code(400).send({ error: "Tournament has no organiser." });
    // Player directory follows the tournament owner, not the requester, so a
    // co-admin adds players into the same shared pool as the owner.
    const adminId = t.admin_id;
    const body = req.body as { playerIds?: unknown; newPlayer?: unknown };

    const playerIds = Array.isArray(body.playerIds) ? body.playerIds.map(Number) : [];
    for (const id of playerIds) {
      if (!players.getForAdmin(adminId, id)) {
        return reply.code(400).send({ error: `Unknown player id ${id}.` });
      }
    }

    const newPlayer = Array.isArray(body.newPlayer) ? body.newPlayer : [];
    const parsedNew = [];
    for (const np of newPlayer) {
      const { value, error } = parsePlayerInput(np);
      if (error) return reply.code(400).send({ error });
      parsedNew.push(value!);
    }

    for (const id of playerIds) tournaments.addToRoster(tid, id);
    for (const np of parsedNew) {
      const created = players.create(np, adminId);
      tournaments.addToRoster(tid, created.id);
    }
    return ratedRoster(tid);
  });

  app.delete("/api/tournaments/:tid/roster/:playerId", { preHandler: requireAdminTournament }, async (req, reply) => {
    const params = req.params as { tid: string; playerId: string };
    tournaments.removeFromRoster(Number(params.tid), Number(params.playerId));
    return reply.code(204).send();
  });
}
