import db from "./index.js";
import type {
  Player,
  Team,
  Tournament,
  Game,
  PlayerGameStat,
  SourceResult,
  Admin,
  TournamentInput,
  TournamentUpdate,
  TournamentWithRole,
  TournamentAdminSummary,
} from "../types.js";
import { deletePlayerPhoto } from "../services/player-photos.js";
import type { BracketMatchSpec, BracketSide } from "../services/schedule.js";

/* ----------------------------- Players ----------------------------- */

export interface PlayerInput {
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

export const players = {
  all(): Player[] {
    return db.prepare("SELECT * FROM players ORDER BY name COLLATE NOCASE").all() as Player[];
  },
  byAdmin(adminId: number): Player[] {
    return db
      .prepare("SELECT * FROM players WHERE admin_id = ? ORDER BY name COLLATE NOCASE")
      .all(adminId) as Player[];
  },
  get(id: number): Player | undefined {
    return db.prepare("SELECT * FROM players WHERE id = ?").get(id) as Player | undefined;
  },
  getForAdmin(adminId: number, id: number): Player | undefined {
    return db
      .prepare("SELECT * FROM players WHERE id = ? AND admin_id = ?")
      .get(id, adminId) as Player | undefined;
  },
  create(p: PlayerInput, adminId: number): Player {
    const info = db
      .prepare(
        `INSERT INTO players (name, age, gender, height_cm, weight_kg, years_played, plays_regularly, skill_self_rating, notes, admin_id)
         VALUES (@name, @age, @gender, @height_cm, @weight_kg, @years_played, @plays_regularly, @skill_self_rating, @notes, @admin_id)`
      )
      .run({ ...p, plays_regularly: p.plays_regularly ? 1 : 0, admin_id: adminId });
    return this.get(Number(info.lastInsertRowid))!;
  },
  update(id: number, p: PlayerInput): Player | undefined {
    db.prepare(
      `UPDATE players SET name=@name, age=@age, gender=@gender, height_cm=@height_cm, weight_kg=@weight_kg,
        years_played=@years_played, plays_regularly=@plays_regularly,
        skill_self_rating=@skill_self_rating, notes=@notes WHERE id=@id`
    ).run({ ...p, plays_regularly: p.plays_regularly ? 1 : 0, id });
    return this.get(id);
  },
  remove(id: number): void {
    deletePlayerPhoto(id);
    db.prepare("DELETE FROM players WHERE id = ?").run(id);
  },
  setHasPhoto(id: number, hasPhoto: boolean): void {
    db.prepare("UPDATE players SET has_photo = ? WHERE id = ?").run(hasPhoto ? 1 : 0, id);
  },
};

/* ----------------------------- Admins ----------------------------- */

export const admins = {
  get(id: number): Admin | undefined {
    return db.prepare("SELECT * FROM admins WHERE id = ?").get(id) as Admin | undefined;
  },
  count(): number {
    return (db.prepare("SELECT COUNT(*) AS c FROM admins").get() as { c: number }).c;
  },
  countApproved(): number {
    return (db.prepare("SELECT COUNT(*) AS c FROM admins WHERE status = 'approved'").get() as { c: number }).c;
  },
  findByEmail(email: string): Admin | undefined {
    return db
      .prepare("SELECT * FROM admins WHERE email = ? COLLATE NOCASE")
      .get(email.trim().toLowerCase()) as Admin | undefined;
  },
  findByGoogleId(googleId: string): Admin | undefined {
    return db.prepare("SELECT * FROM admins WHERE google_id = ?").get(googleId) as Admin | undefined;
  },
  create(data: {
    email: string;
    passwordHash?: string | null;
    googleId?: string | null;
    displayName?: string | null;
    status?: "unverified" | "approved";
  }): Admin {
    const info = db
      .prepare(
        `INSERT INTO admins (email, password_hash, google_id, display_name, status)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        data.email.trim().toLowerCase(),
        data.passwordHash ?? null,
        data.googleId ?? null,
        data.displayName ?? null,
        data.status ?? "approved"
      );
    return this.get(Number(info.lastInsertRowid))!;
  },
  markApproved(id: number): Admin | undefined {
    db.prepare("UPDATE admins SET status = 'approved' WHERE id = ?").run(id);
    return this.get(id);
  },
  linkGoogle(id: number, googleId: string, displayName: string | null): void {
    db.prepare("UPDATE admins SET google_id = ?, display_name = COALESCE(?, display_name) WHERE id = ?").run(
      googleId,
      displayName,
      id
    );
  },
  setPassword(id: number, passwordHash: string): void {
    db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(passwordHash, id);
  },
};

/* ---------------------- Admin email verification ---------------------- */

export interface AdminEmailVerification {
  admin_id: number;
  code_hash: string;
  expires_at: string;
  attempts: number;
  created_at: string;
}

export const adminEmailVerifications = {
  get(adminId: number): AdminEmailVerification | undefined {
    return db
      .prepare("SELECT * FROM admin_email_verifications WHERE admin_id = ?")
      .get(adminId) as AdminEmailVerification | undefined;
  },
  upsert(adminId: number, codeHash: string, expiresAt: string): void {
    db.prepare(
      `INSERT INTO admin_email_verifications (admin_id, code_hash, expires_at, attempts)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(admin_id) DO UPDATE SET
         code_hash = excluded.code_hash,
         expires_at = excluded.expires_at,
         attempts = 0,
         created_at = datetime('now')`
    ).run(adminId, codeHash, expiresAt);
  },
  incrementAttempts(adminId: number): void {
    db.prepare("UPDATE admin_email_verifications SET attempts = attempts + 1 WHERE admin_id = ?").run(adminId);
  },
  remove(adminId: number): void {
    db.prepare("DELETE FROM admin_email_verifications WHERE admin_id = ?").run(adminId);
  },
};

/* ----------------------- Admin password resets ----------------------- */

export interface AdminPasswordReset {
  admin_id: number;
  code_hash: string;
  expires_at: string;
  attempts: number;
  created_at: string;
}

export const adminPasswordResets = {
  get(adminId: number): AdminPasswordReset | undefined {
    return db
      .prepare("SELECT * FROM admin_password_resets WHERE admin_id = ?")
      .get(adminId) as AdminPasswordReset | undefined;
  },
  upsert(adminId: number, codeHash: string, expiresAt: string): void {
    db.prepare(
      `INSERT INTO admin_password_resets (admin_id, code_hash, expires_at, attempts)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(admin_id) DO UPDATE SET
         code_hash = excluded.code_hash,
         expires_at = excluded.expires_at,
         attempts = 0,
         created_at = datetime('now')`
    ).run(adminId, codeHash, expiresAt);
  },
  incrementAttempts(adminId: number): void {
    db.prepare("UPDATE admin_password_resets SET attempts = attempts + 1 WHERE admin_id = ?").run(adminId);
  },
  remove(adminId: number): void {
    db.prepare("DELETE FROM admin_password_resets WHERE admin_id = ?").run(adminId);
  },
};

/* ------------------------- Tournament admins ------------------------- */

export const tournamentAdmins = {
  add(tournamentId: number, adminId: number): void {
    db.prepare(
      "INSERT OR IGNORE INTO tournament_admins (tournament_id, admin_id) VALUES (?, ?)"
    ).run(tournamentId, adminId);
  },
  remove(tournamentId: number, adminId: number): void {
    db.prepare("DELETE FROM tournament_admins WHERE tournament_id = ? AND admin_id = ?").run(
      tournamentId,
      adminId
    );
  },
  isCoAdmin(tournamentId: number, adminId: number): boolean {
    return !!db
      .prepare("SELECT 1 FROM tournament_admins WHERE tournament_id = ? AND admin_id = ?")
      .get(tournamentId, adminId);
  },
  listByTournament(tournamentId: number): TournamentAdminSummary[] {
    const owner = db
      .prepare(
        `SELECT a.id, a.email, a.display_name FROM admins a
         JOIN tournaments t ON t.admin_id = a.id
         WHERE t.id = ?`
      )
      .get(tournamentId) as { id: number; email: string; display_name: string | null } | undefined;
    const coAdmins = db
      .prepare(
        `SELECT a.id, a.email, a.display_name FROM admins a
         JOIN tournament_admins ta ON ta.admin_id = a.id
         WHERE ta.tournament_id = ?
         ORDER BY a.email COLLATE NOCASE`
      )
      .all(tournamentId) as { id: number; email: string; display_name: string | null }[];
    const result: TournamentAdminSummary[] = [];
    if (owner) result.push({ ...owner, role: "owner" });
    for (const a of coAdmins) result.push({ ...a, role: "co-admin" });
    return result;
  },
  tournamentIdsForAdmin(adminId: number): number[] {
    return (
      db
        .prepare("SELECT tournament_id FROM tournament_admins WHERE admin_id = ?")
        .all(adminId) as { tournament_id: number }[]
    ).map((r) => r.tournament_id);
  },
  /**
   * A co-admin may manage a player when the player is on the roster of a
   * tournament they co-administer and belongs to that tournament's owner.
   */
  managesPlayer(adminId: number, playerId: number): boolean {
    return !!db
      .prepare(
        `SELECT 1 FROM tournament_players tp
         JOIN tournaments t ON t.id = tp.tournament_id
         JOIN tournament_admins ta ON ta.tournament_id = tp.tournament_id
         JOIN players p ON p.id = tp.player_id
         WHERE tp.player_id = ? AND ta.admin_id = ? AND p.admin_id = t.admin_id`
      )
      .get(playerId, adminId);
  },
};

/* --------------------------- Tournaments --------------------------- */

function slugify(name: string, id: number): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "cup";
  return `${base}-${id}`;
}

export const tournaments = {
  all(): Tournament[] {
    return db.prepare("SELECT * FROM tournaments ORDER BY id").all() as Tournament[];
  },
  byAdmin(adminId: number): TournamentWithRole[] {
    return db
      .prepare(
        `SELECT t.*, 'owner' AS role FROM tournaments t WHERE t.admin_id = ?
         UNION ALL
         SELECT t.*, 'co-admin' AS role FROM tournaments t
         JOIN tournament_admins ta ON ta.tournament_id = t.id
         WHERE ta.admin_id = ?
         ORDER BY id`
      )
      .all(adminId, adminId) as TournamentWithRole[];
  },
  get(id: number): Tournament | undefined {
    return db.prepare("SELECT * FROM tournaments WHERE id = ?").get(id) as Tournament | undefined;
  },
  findByName(name: string): Tournament | undefined {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    return db
      .prepare("SELECT * FROM tournaments WHERE name = ? COLLATE NOCASE")
      .get(trimmed) as Tournament | undefined;
  },
  findBySlug(slug: string): Tournament | undefined {
    const trimmed = slug.trim();
    if (!trimmed) return undefined;
    return db.prepare("SELECT * FROM tournaments WHERE share_slug = ?").get(trimmed) as Tournament | undefined;
  },
  create(input: TournamentInput): Tournament {
    const info = db
      .prepare(
        `INSERT INTO tournaments
           (name, password_hash, admin_id, event_date, location, team_size, game_duration_min, scoring_preset, format_type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
      )
      .run(
        input.name,
        input.passwordHash,
        input.adminId,
        input.eventDate ?? null,
        input.location ?? null,
        input.teamSize ?? 2,
        input.gameDurationMin ?? 10,
        input.scoringPreset ?? "standard",
        input.formatType ?? "round_robin"
      );
    const id = Number(info.lastInsertRowid);
    const shareSlug = slugify(input.name, id);
    db.prepare("UPDATE tournaments SET share_slug = ? WHERE id = ?").run(shareSlug, id);
    return this.get(id)!;
  },
  update(id: number, patch: TournamentUpdate): Tournament | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    const name = patch.name?.trim().slice(0, 60) ?? cur.name;
    db.prepare(
      `UPDATE tournaments SET
         name = ?, event_date = ?, location = ?, team_size = ?, game_duration_min = ?,
         scoring_preset = ?, format_type = ?, status = ?
       WHERE id = ?`
    ).run(
      name,
      patch.eventDate !== undefined ? patch.eventDate : cur.event_date,
      patch.location !== undefined ? patch.location : cur.location,
      patch.teamSize ?? cur.team_size,
      patch.gameDurationMin ?? cur.game_duration_min,
      patch.scoringPreset ?? cur.scoring_preset,
      patch.formatType ?? cur.format_type,
      patch.status ?? cur.status,
      id
    );
    return this.get(id);
  },
  setPassword(id: number, passwordHash: string): void {
    db.prepare("UPDATE tournaments SET password_hash = ? WHERE id = ?").run(passwordHash, id);
  },
  hasPassword(id: number): boolean {
    const row = db.prepare("SELECT password_hash FROM tournaments WHERE id = ?").get(id) as
      | { password_hash: string }
      | undefined;
    return !!row?.password_hash;
  },
  remove(id: number): void {
    db.prepare("DELETE FROM tournaments WHERE id = ?").run(id);
  },
  counts(id: number): { players: number; teams: number; games: number } {
    const p = db.prepare("SELECT COUNT(*) AS c FROM tournament_players WHERE tournament_id = ?").get(id) as { c: number };
    const t = db.prepare("SELECT COUNT(*) AS c FROM teams WHERE tournament_id = ?").get(id) as { c: number };
    const g = db.prepare("SELECT COUNT(*) AS c FROM games WHERE tournament_id = ?").get(id) as { c: number };
    return { players: p.c, teams: t.c, games: g.c };
  },
  roster(id: number): Player[] {
    return db
      .prepare(
        `SELECT p.* FROM players p
         JOIN tournament_players tp ON tp.player_id = p.id
         WHERE tp.tournament_id = ? ORDER BY p.name COLLATE NOCASE`
      )
      .all(id) as Player[];
  },
  addToRoster(tournamentId: number, playerId: number): void {
    db.prepare(
      "INSERT OR IGNORE INTO tournament_players (tournament_id, player_id) VALUES (?, ?)"
    ).run(tournamentId, playerId);
  },
  removeFromRoster(tournamentId: number, playerId: number): void {
    const tx = db.transaction(() => {
      // Pull the player out of any team in this tournament too.
      db.prepare(
        `DELETE FROM team_members WHERE player_id = ?
         AND team_id IN (SELECT id FROM teams WHERE tournament_id = ?)`
      ).run(playerId, tournamentId);
      db.prepare("DELETE FROM tournament_players WHERE tournament_id = ? AND player_id = ?").run(
        tournamentId,
        playerId
      );
    });
    tx();
  },
};

/* ------------------------------ Teams ------------------------------ */

export const teams = {
  byTournament(tournamentId: number): Team[] {
    return db.prepare("SELECT * FROM teams WHERE tournament_id = ? ORDER BY id").all(tournamentId) as Team[];
  },
  get(id: number): Team | undefined {
    return db.prepare("SELECT * FROM teams WHERE id = ?").get(id) as Team | undefined;
  },
  membersOf(teamId: number): Player[] {
    return db
      .prepare(
        `SELECT p.* FROM players p
         JOIN team_members tm ON tm.player_id = p.id
         WHERE tm.team_id = ? ORDER BY p.name COLLATE NOCASE`
      )
      .all(teamId) as Player[];
  },
  anyLocked(tournamentId: number): boolean {
    const row = db
      .prepare("SELECT COUNT(*) AS c FROM teams WHERE tournament_id = ? AND locked = 1")
      .get(tournamentId) as { c: number };
    return row.c > 0;
  },
  /** Replace every team (and its games) in a tournament with the supplied set. */
  replaceAll(tournamentId: number, input: { name: string; playerIds: number[] }[]): void {
    const tx = db.transaction((tid: number, sets: { name: string; playerIds: number[] }[]) => {
      db.prepare("DELETE FROM games WHERE tournament_id = ?").run(tid);
      db.prepare("DELETE FROM teams WHERE tournament_id = ?").run(tid);
      const insertTeam = db.prepare("INSERT INTO teams (tournament_id, name) VALUES (?, ?)");
      const insertMember = db.prepare("INSERT INTO team_members (team_id, player_id) VALUES (?, ?)");
      for (const set of sets) {
        const info = insertTeam.run(tid, set.name);
        const teamId = Number(info.lastInsertRowid);
        for (const pid of set.playerIds) insertMember.run(teamId, pid);
      }
    });
    tx(tournamentId, input);
  },
  lockAll(tournamentId: number, locked: boolean): void {
    db.prepare("UPDATE teams SET locked = ? WHERE tournament_id = ?").run(locked ? 1 : 0, tournamentId);
  },
};

/* ------------------------------ Games ------------------------------ */

export interface MatchSide {
  team_id: number | null;
  source_match_id: number | null;
  source_result: SourceResult | null;
}

export interface MatchInput {
  label: string;
  round: number;
  stage: string;
  a: MatchSide;
  b: MatchSide;
}

export const games = {
  byTournament(tournamentId: number): Game[] {
    return db
      .prepare("SELECT * FROM games WHERE tournament_id = ? ORDER BY round, id")
      .all(tournamentId) as Game[];
  },
  get(id: number): Game | undefined {
    return db.prepare("SELECT * FROM games WHERE id = ?").get(id) as Game | undefined;
  },
  /** Replace all games in a tournament with a generated schedule (round-robin or group stage). */
  replaceSchedule(
    tournamentId: number,
    matches: {
      round: number;
      label: string;
      team_a_id: number;
      team_b_id: number;
      stage?: string;
      group_name?: string | null;
    }[]
  ): void {
    const tx = db.transaction((tid: number, rows: typeof matches) => {
      db.prepare("DELETE FROM games WHERE tournament_id = ?").run(tid);
      const insert = db.prepare(
        `INSERT INTO games (tournament_id, label, round, stage, team_a_id, team_b_id, status, group_name)
         VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)`
      );
      for (const m of rows) {
        insert.run(tid, m.label, m.round, m.stage ?? "round_robin", m.team_a_id, m.team_b_id, m.group_name ?? null);
      }
    });
    tx(tournamentId, matches);
  },
  /** Replace all games in a tournament with a generated bracket (specs in dependency order). */
  replaceBracket(tournamentId: number, specs: BracketMatchSpec[]): void {
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM games WHERE tournament_id = ?").run(tournamentId);
      insertBracketSpecs(tournamentId, specs);
    });
    tx();
  },
  /** Add bracket games without removing existing ones (used for the repechage). */
  appendBracket(tournamentId: number, specs: BracketMatchSpec[]): void {
    const tx = db.transaction(() => insertBracketSpecs(tournamentId, specs));
    tx();
  },
  add(tournamentId: number, m: MatchInput): Game {
    const info = db
      .prepare(
        `INSERT INTO games
           (tournament_id, label, round, stage,
            team_a_id, a_source_match_id, a_source_result,
            team_b_id, b_source_match_id, b_source_result, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
      )
      .run(
        tournamentId,
        m.label,
        m.round,
        m.stage,
        m.a.team_id,
        m.a.source_match_id,
        m.a.source_result,
        m.b.team_id,
        m.b.source_match_id,
        m.b.source_result
      );
    return this.get(Number(info.lastInsertRowid))!;
  },
  updateMatch(id: number, m: MatchInput): Game | undefined {
    db.prepare(
      `UPDATE games SET label = @label, round = @round, stage = @stage,
         team_a_id = @a_team, a_source_match_id = @a_src, a_source_result = @a_res,
         team_b_id = @b_team, b_source_match_id = @b_src, b_source_result = @b_res
       WHERE id = @id`
    ).run({
      id,
      label: m.label,
      round: m.round,
      stage: m.stage,
      a_team: m.a.team_id,
      a_src: m.a.source_match_id,
      a_res: m.a.source_result,
      b_team: m.b.team_id,
      b_src: m.b.source_match_id,
      b_res: m.b.source_result,
    });
    return this.get(id);
  },
  remove(id: number): void {
    db.prepare("DELETE FROM games WHERE id = ?").run(id);
  },
  setResult(
    id: number,
    result: { score_a: number; score_b: number; status: "scheduled" | "final"; playerPoints: Record<number, number> }
  ): Game | undefined {
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE games SET score_a = ?, score_b = ?, status = ?, played_at = datetime('now') WHERE id = ?`
      ).run(result.score_a, result.score_b, result.status, id);
      const upsert = db.prepare(
        `INSERT INTO player_game_stats (game_id, player_id, points) VALUES (?, ?, ?)
         ON CONFLICT(game_id, player_id) DO UPDATE SET points = excluded.points`
      );
      for (const [pid, pts] of Object.entries(result.playerPoints)) {
        upsert.run(id, Number(pid), pts);
      }
      resolveDependents(id);
    });
    tx();
    return this.get(id);
  },
  statsFor(gameId: number): PlayerGameStat[] {
    return db.prepare("SELECT * FROM player_game_stats WHERE game_id = ?").all(gameId) as PlayerGameStat[];
  },
};

/** Insert bracket specs in dependency order, mapping local keys to new row ids. */
function insertBracketSpecs(tournamentId: number, specs: BracketMatchSpec[]): void {
  const keyToId = new Map<string, number>();
  const insert = db.prepare(
    `INSERT INTO games
       (tournament_id, label, round, stage,
        team_a_id, a_source_match_id, a_source_result,
        team_b_id, b_source_match_id, b_source_result, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
  );
  const cols = (side: BracketSide): { team: number | null; src: number | null; res: SourceResult | null } => {
    if (side.kind === "team") return { team: side.teamId, src: null, res: null };
    return { team: null, src: keyToId.get(side.key) ?? null, res: side.result };
  };
  for (const s of specs) {
    const a = cols(s.a);
    const b = cols(s.b);
    const info = insert.run(
      tournamentId,
      s.label,
      s.round,
      s.stage,
      a.team,
      a.src,
      a.res,
      b.team,
      b.src,
      b.res
    );
    keyToId.set(s.key, Number(info.lastInsertRowid));
  }
}

/**
 * Fill (or clear) the slots of any match that advances from this one. Re-runs on
 * every result edit, so flipping a winner or un-finalising re-syncs the bracket.
 */
function resolveDependents(gameId: number): void {
  // Clear slots that depend on this match first (handles edits / un-finalise).
  db.prepare("UPDATE games SET team_a_id = NULL WHERE a_source_match_id = ?").run(gameId);
  db.prepare("UPDATE games SET team_b_id = NULL WHERE b_source_match_id = ?").run(gameId);

  const g = games.get(gameId);
  if (!g || g.status !== "final" || g.score_a === null || g.score_b === null) return;
  if (g.score_a === g.score_b) return; // ties cannot advance
  const winner = g.score_a > g.score_b ? g.team_a_id : g.team_b_id;
  const loser = g.score_a > g.score_b ? g.team_b_id : g.team_a_id;
  if (winner === null) return;

  const deps = db
    .prepare("SELECT * FROM games WHERE a_source_match_id = ? OR b_source_match_id = ?")
    .all(gameId, gameId) as Game[];
  for (const d of deps) {
    if (d.a_source_match_id === gameId) {
      const team = d.a_source_result === "loser" ? loser : winner;
      db.prepare("UPDATE games SET team_a_id = ? WHERE id = ?").run(team, d.id);
    }
    if (d.b_source_match_id === gameId) {
      const team = d.b_source_result === "loser" ? loser : winner;
      db.prepare("UPDATE games SET team_b_id = ? WHERE id = ?").run(team, d.id);
    }
  }
}
