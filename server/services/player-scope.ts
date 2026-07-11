import type { FastifyRequest } from "fastify";
import { players, tournamentAdmins, tournaments } from "../db/repo.js";
import type { Player } from "../types.js";
import { getAdminFromToken, getTournamentSession, tokenFromRequest, tournamentTokenFromRequest } from "./auth.js";

/** Owner of the player's directory, or a co-admin of a tournament the player is on. */
export function adminCanManagePlayer(adminId: number, player: Player): boolean {
  return player.admin_id === adminId || tournamentAdmins.managesPlayer(adminId, player.id);
}

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
  if (scopeId === null) return false;
  if (player.admin_id === scopeId) return true;
  // Co-admins can see players of tournaments they help run.
  const admin = getAdminFromToken(tokenFromRequest(req));
  return !!admin && tournamentAdmins.managesPlayer(admin.id, player.id);
}

export function canManagePlayerPhoto(req: FastifyRequest, playerId: number): boolean {
  const player = players.get(playerId);
  if (!player) return false;

  const admin = getAdminFromToken(tokenFromRequest(req));
  if (admin) return adminCanManagePlayer(admin.id, player);

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
