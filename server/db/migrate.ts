import type DatabaseType from "better-sqlite3";

type DB = DatabaseType.Database;

function tableExists(db: DB, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function hasColumn(db: DB, table: string, column: string): boolean {
  if (!tableExists(db, table)) return false;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function count(db: DB, table: string): number {
  if (!tableExists(db, table)) return 0;
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
}

/**
 * Rebuild the legacy `games` table (which had NOT NULL team ids and no
 * tournament/bracket columns) into the current shape, preserving ids so
 * player_game_stats keeps matching.
 */
function rebuildGames(db: DB): void {
  db.pragma("foreign_keys = OFF");
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE games_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER,
        label TEXT,
        round INTEGER NOT NULL DEFAULT 1,
        stage TEXT NOT NULL DEFAULT 'bracket',
        team_a_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        team_b_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
        a_source_match_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
        a_source_result TEXT,
        b_source_match_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
        b_source_result TEXT,
        score_a INTEGER,
        score_b INTEGER,
        status TEXT NOT NULL DEFAULT 'scheduled',
        played_at TEXT
      )`);
    db.exec(`
      INSERT INTO games_new (id, tournament_id, label, round, stage, team_a_id, team_b_id, score_a, score_b, status, played_at)
      SELECT id, NULL, label, round, 'round_robin', team_a_id, team_b_id, score_a, score_b, status, played_at FROM games`);
    db.exec("DROP TABLE games");
    db.exec("ALTER TABLE games_new RENAME TO games");
  });
  tx();
  db.pragma("foreign_keys = ON");
}

/** Idempotent migrations run on every boot after schema.sql. */
export function runMigrations(db: DB): void {
  if (tableExists(db, "players") && !hasColumn(db, "players", "age")) {
    db.exec("ALTER TABLE players ADD COLUMN age INTEGER");
  }

  if (tableExists(db, "players") && !hasColumn(db, "players", "has_photo")) {
    db.exec("ALTER TABLE players ADD COLUMN has_photo INTEGER NOT NULL DEFAULT 0");
  }

  if (tableExists(db, "teams") && !hasColumn(db, "teams", "tournament_id")) {
    db.exec("ALTER TABLE teams ADD COLUMN tournament_id INTEGER");
  }

  if (tableExists(db, "games") && !hasColumn(db, "games", "tournament_id")) {
    rebuildGames(db);
  }

  if (tableExists(db, "tournaments") && !hasColumn(db, "tournaments", "password_hash")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
  }

  if (!tableExists(db, "tournament_sessions")) {
    db.exec(`
      CREATE TABLE tournament_sessions (
        token TEXT PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
  }

  // Admins (and tournaments.admin_id) must exist before players.admin_id backfill.
  if (!tableExists(db, "admins")) {
    db.exec(`
      CREATE TABLE admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        google_id TEXT UNIQUE,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
  }

  if (tableExists(db, "tournaments") && !hasColumn(db, "tournaments", "admin_id")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL");
  }

  if (tableExists(db, "players") && !hasColumn(db, "players", "admin_id")) {
    db.exec("ALTER TABLE players ADD COLUMN admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE");
    db.exec(`
      UPDATE players SET admin_id = (
        SELECT t.admin_id FROM tournament_players tp
        JOIN tournaments t ON t.id = tp.tournament_id
        WHERE tp.player_id = players.id AND t.admin_id IS NOT NULL
        ORDER BY tp.tournament_id LIMIT 1
      ) WHERE admin_id IS NULL`);
    db.exec(`
      UPDATE players SET admin_id = (SELECT id FROM admins ORDER BY id LIMIT 1)
      WHERE admin_id IS NULL AND EXISTS (SELECT 1 FROM admins)`);
  }

  if (tableExists(db, "players") && hasColumn(db, "players", "admin_id")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_players_admin ON players(admin_id)");
  }

  if (tableExists(db, "admin_tokens") && !hasColumn(db, "admin_tokens", "admin_id")) {
    // Legacy tokens have no admin — clear them so everyone re-authenticates.
    db.exec("DELETE FROM admin_tokens");
    db.exec("ALTER TABLE admin_tokens ADD COLUMN admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE");
  }

  // Seed a default tournament from any pre-tournament data so nothing is lost.
  if (count(db, "tournaments") === 0) {
    const hasLegacyData =
      count(db, "players") > 0 || count(db, "teams") > 0 || count(db, "games") > 0;
    if (hasLegacyData) {
      const info = db.prepare("INSERT INTO tournaments (name) VALUES (?)").run("Tournament 1");
      const tid = Number(info.lastInsertRowid);
      const playerIds = db.prepare("SELECT id FROM players").all() as { id: number }[];
      const enroll = db.prepare(
        "INSERT OR IGNORE INTO tournament_players (tournament_id, player_id) VALUES (?, ?)"
      );
      for (const p of playerIds) enroll.run(tid, p.id);
      db.prepare("UPDATE teams SET tournament_id = ? WHERE tournament_id IS NULL").run(tid);
      db.prepare("UPDATE games SET tournament_id = ? WHERE tournament_id IS NULL").run(tid);
    }
  }
}
