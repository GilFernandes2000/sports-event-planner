import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

// Simulate an existing installation: build the pre-gender players table with a
// legacy row BEFORE the app's DB module boots, then let schema + migrations run.
const dbPath = join(mkdtempSync(join(tmpdir(), "bball-test-")), "test.db");
process.env.DB_PATH = dbPath;
{
  const raw = new Database(dbPath);
  raw.exec(`CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age INTEGER,
    height_cm REAL,
    weight_kg REAL,
    years_played REAL NOT NULL DEFAULT 0,
    plays_regularly INTEGER NOT NULL DEFAULT 0,
    skill_self_rating INTEGER NOT NULL DEFAULT 5,
    notes TEXT,
    has_photo INTEGER NOT NULL DEFAULT 0,
    admin_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  raw.prepare("INSERT INTO players (name, age, skill_self_rating) VALUES (?, ?, ?)").run("Legacy Player", 55, 6);
  raw.close();
}

const { default: db } = await import("../server/db/index.js");
const { players, tournaments, teams, games, tournamentAdmins } = await import("../server/db/repo.js");
const { computeStats } = await import("../server/services/stats.js");
const { buildSingleElimination } = await import("../server/services/schedule.js");

test("boot migration adds the gender column without losing legacy data", () => {
  const cols = (db.prepare("PRAGMA table_info(players)").all() as { name: string }[]).map((c) => c.name);
  assert.ok(cols.includes("gender"));
  const legacy = players.get(1)!;
  assert.equal(legacy.name, "Legacy Player");
  assert.equal(legacy.age, 55);
  assert.equal(legacy.gender, null);
});

// Shared fixtures for the following tests.
db.prepare("INSERT INTO admins (email, status) VALUES ('test@example.com', 'approved')").run();
const adminId = 1;

const playerInput = {
  age: 30,
  gender: null as "male" | "female" | null,
  height_cm: 175,
  weight_kg: 70,
  years_played: 3,
  plays_regularly: true,
  skill_self_rating: 6,
  notes: null,
};

test("players CRUD round-trips gender", () => {
  const created = players.create({ ...playerInput, name: "Maria", gender: "female" }, adminId);
  assert.equal(created.gender, "female");
  assert.equal(players.get(created.id)!.gender, "female");

  const updated = players.update(created.id, { ...playerInput, name: "Maria", gender: "male" })!;
  assert.equal(updated.gender, "male");

  players.remove(created.id);
  assert.equal(players.get(created.id), undefined);
});

test("tournament roster, teams, games and stats work end to end", () => {
  const t = tournaments.create({ name: "Test Cup", passwordHash: "hash", adminId });

  const ids = ["Ana", "Bruno", "Carla", "Diogo"].map(
    (name) => players.create({ ...playerInput, name }, adminId).id
  );
  for (const id of ids) tournaments.addToRoster(t.id, id);
  assert.equal(tournaments.roster(t.id).length, 4);

  teams.replaceAll(t.id, [
    { name: "Alpha", playerIds: [ids[0], ids[1]] },
    { name: "Beta", playerIds: [ids[2], ids[3]] },
  ]);
  const created = teams.byTournament(t.id);
  assert.equal(created.length, 2);
  const [alpha, beta] = created;

  games.replaceSchedule(t.id, [
    { round: 1, label: "Game 1", team_a_id: alpha.id, team_b_id: beta.id },
  ]);
  const [game] = games.byTournament(t.id);

  games.setResult(game.id, {
    score_a: 21,
    score_b: 15,
    status: "final",
    playerPoints: { [ids[0]]: 12, [ids[1]]: 9, [ids[2]]: 8, [ids[3]]: 7 },
  });

  const stats = computeStats(t.id);
  assert.equal(stats.standings.length, 2);
  assert.equal(stats.standings[0].name, "Alpha", "winner leads the standings");
  assert.equal(stats.standings[0].points, 2, "a win is worth 2 points");
  assert.equal(stats.standings[0].pointsFor, 21);
  assert.equal(stats.standings[1].points, 0);

  const topScorer = stats.players[0];
  assert.equal(topScorer.name, "Ana");
  assert.equal(topScorer.totalPoints, 12);
  assert.equal(stats.highlights.totalGamesPlayed, 1);
  assert.equal(stats.highlights.totalPointsScored, 36);

  tournaments.remove(t.id);
});

test("co-admins may manage roster players of their tournament, and nothing else", () => {
  db.prepare("INSERT INTO admins (email, status) VALUES ('coadmin@example.com', 'approved')").run();
  const coAdminId = (db.prepare("SELECT id FROM admins WHERE email = 'coadmin@example.com'").get() as { id: number }).id;

  const t = tournaments.create({ name: "Shared Cup", passwordHash: "hash", adminId });
  const onRoster = players.create({ ...playerInput, name: "On Roster" }, adminId);
  const offRoster = players.create({ ...playerInput, name: "Off Roster" }, adminId);
  tournaments.addToRoster(t.id, onRoster.id);

  assert.equal(tournamentAdmins.managesPlayer(coAdminId, onRoster.id), false, "not yet a co-admin");

  tournamentAdmins.add(t.id, coAdminId);
  assert.equal(tournamentAdmins.managesPlayer(coAdminId, onRoster.id), true, "co-admin manages roster players");
  assert.equal(
    tournamentAdmins.managesPlayer(coAdminId, offRoster.id),
    false,
    "players outside the tournament stay off-limits"
  );

  tournamentAdmins.remove(t.id, coAdminId);
  assert.equal(tournamentAdmins.managesPlayer(coAdminId, onRoster.id), false, "access ends with the co-admin role");

  tournaments.remove(t.id);
  players.remove(onRoster.id);
  players.remove(offRoster.id);
});

test("finishing a bracket game feeds the winner into the next round", () => {
  const t = tournaments.create({ name: "KO Cup", passwordHash: "hash", adminId });

  const ids = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"].map(
    (name) => players.create({ ...playerInput, name }, adminId).id
  );
  for (const id of ids) tournaments.addToRoster(t.id, id);
  teams.replaceAll(t.id, [
    { name: "T1", playerIds: [ids[0], ids[1]] },
    { name: "T2", playerIds: [ids[2], ids[3]] },
    { name: "T3", playerIds: [ids[4], ids[5]] },
    { name: "T4", playerIds: [ids[6], ids[7]] },
  ]);
  const teamRows = teams.byTournament(t.id);

  const specs = buildSingleElimination(
    teamRows.map((tm, i) => ({ id: tm.id, rating: 100 - i })),
    { seeding: "rating" }
  );
  games.replaceBracket(t.id, specs);

  const all = games.byTournament(t.id);
  assert.equal(all.length, 3);
  const final = all.find((g) => g.label === "Final")!;
  assert.equal(final.team_a_id, null, "final starts undecided");

  const semi = all.find((g) => g.id === final.a_source_match_id)!;
  games.setResult(semi.id, { score_a: 10, score_b: 5, status: "final", playerPoints: {} });

  const resolvedFinal = games.get(final.id)!;
  assert.equal(resolvedFinal.team_a_id, semi.team_a_id, "semifinal winner advances to the final");

  tournaments.remove(t.id);
});
