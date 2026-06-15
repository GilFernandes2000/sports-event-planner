-- 2v2 Basketball Championship schema
-- Players are a shared directory; tournaments scope rosters, teams and games.

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  age INTEGER,
  height_cm REAL,
  weight_kg REAL,
  years_played REAL NOT NULL DEFAULT 0,
  plays_regularly INTEGER NOT NULL DEFAULT 0,
  skill_self_rating INTEGER NOT NULL DEFAULT 5,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Shared-directory roster link: which players take part in which tournament.
CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, player_id)
);

-- A game's two sides can be a concrete team OR a placeholder that resolves from
-- another match ("winner of" / "loser of"), enabling brackets.
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
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
);

CREATE TABLE IF NOT EXISTS player_game_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  UNIQUE (game_id, player_id)
);

-- Admin sessions persisted so a server restart does not log the organiser out.
CREATE TABLE IF NOT EXISTS admin_tokens (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_player ON team_members(player_id);
CREATE INDEX IF NOT EXISTS idx_pgs_game ON player_game_stats(game_id);
CREATE INDEX IF NOT EXISTS idx_pgs_player ON player_game_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_t ON tournament_players(tournament_id);
