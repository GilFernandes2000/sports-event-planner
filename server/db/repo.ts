import db from "./index.js";
import type { Player, Team, Tournament, Game, PlayerGameStat, SourceResult, Admin } from "../types.js";
import { deletePlayerPhoto } from "../services/player-photos.js";
import type { BracketMatchSpec, BracketSide } from "../services/schedule.js";

/* ----------------------------- Players ----------------------------- */

export interface PlayerInput {
  name: string;
  age: number | null;
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
        `INSERT INTO players (name, age, height_cm, weight_kg, years_played, plays_regularly, skill_self_rating, notes, admin_id)
         VALUES (@name, @age, @height_cm, @weight_kg, @years_played, @plays_regularly, @skill_self_rating, @notes, @admin_id)`
      )
      .run({ ...p, plays_regularly: p.plays_regularly ? 1 : 0, admin_id: adminId });
    return this.get(Number(info.lastInsertRowid))!;
  },
  update(id: number, p: PlayerInput): Player | undefined {
    db.prepare(
      `UPDATE players SET name=@name, age=@age, height_cm=@height_cm, weight_kg=@weight_kg,
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
  }): Admin {
    const info = db
      .prepare(
        `INSERT INTO admins (email, password_hash, google_id, display_name)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        data.email.trim().toLowerCase(),
        data.passwordHash ?? null,
        data.googleId ?? null,
        data.displayName ?? null
      );
    return this.get(Number(info.lastInsertRowid))!;
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

/* --------------------------- Tournaments --------------------------- */

export const tournaments = {
  all(): Tournament[] {
    return db.prepare("SELECT * FROM tournaments ORDER BY id").all() as Tournament[];
  },
  byAdmin(adminId: number): Tournament[] {
    return db
      .prepare("SELECT * FROM tournaments WHERE admin_id = ? ORDER BY id")
      .all(adminId) as Tournament[];
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
  create(name: string, passwordHash: string, adminId: number): Tournament {
    const info = db
      .prepare("INSERT INTO tournaments (name, password_hash, admin_id) VALUES (?, ?, ?)")
      .run(name, passwordHash, adminId);
    return this.get(Number(info.lastInsertRowid))!;
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
  /** Replace all games in a tournament with a generated round-robin. */
  replaceSchedule(
    tournamentId: number,
    matches: { round: number; label: string; team_a_id: number; team_b_id: number }[]
  ): void {
    const tx = db.transaction((tid: number, rows: typeof matches) => {
      db.prepare("DELETE FROM games WHERE tournament_id = ?").run(tid);
      const insert = db.prepare(
        `INSERT INTO games (tournament_id, label, round, stage, team_a_id, team_b_id, status)
         VALUES (?, ?, ?, 'round_robin', ?, ?, 'scheduled')`
      );
      for (const m of rows) insert.run(tid, m.label, m.round, m.team_a_id, m.team_b_id);
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
