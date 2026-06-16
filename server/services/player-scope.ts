import type { FastifyRequest } from "fastify";
import { players, tournaments } from "../db/repo.js";
import type { Player } from "../types.js";
import { getAdminFromToken, getTournamentSession, tokenFromRequest, tournamentTokenFromRequest } from "./auth.js";

/** Admin id whose player directory applies to this request. */
export function playerScopeAdminId(req: FastifyRequest): number | null {
  const admin = getAdminFromToken(tokenFromRequest(req));
  if (admin) return admin.id;

  const session = getTournamentSession(tournamentTokenFromRequest(req));
  if (!session) return null;

  const t = tournaments.get(session.tournament_id);
  return t?.admin_id ?? null;
}

export function canViewPlayer(req: FastifyRequest, player: Player): boolean {
  const scopeId = playerScopeAdminId(req);
  return scopeId !== null && player.admin_id === scopeId;
}

export function canManagePlayerPhoto(req: FastifyRequest, playerId: number): boolean {
  const player = players.get(playerId);
  if (!player) return false;

  const admin = getAdminFromToken(tokenFromRequest(req));
  if (admin) return player.admin_id === admin.id;

  const session = getTournamentSession(tournamentTokenFromRequest(req));
  if (!session) return false;

  const t = tournaments.get(session.tournament_id);
  if (!t || player.admin_id !== t.admin_id) return false;

  const onRoster = tournaments.roster(session.tournament_id).some((p) => p.id === playerId);
  return onRoster;
}

export function playersForTournament(tournamentId: number) {
  const t = tournaments.get(tournamentId);
  if (!t?.admin_id) return [];
  return players.byAdmin(t.admin_id);
}
