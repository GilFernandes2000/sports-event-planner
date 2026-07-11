import { test } from "node:test";
import assert from "node:assert/strict";
import { ageScore, ratePlayers, suggestTeams } from "../server/services/balance.js";
import type { Player } from "../server/types.js";

let nextId = 0;
function mk(overrides: Partial<Player> = {}): Player {
  return {
    id: ++nextId,
    name: `Player ${nextId}`,
    age: 28,
    gender: null,
    height_cm: 175,
    weight_kg: 70,
    years_played: 3,
    plays_regularly: 1,
    skill_self_rating: 5,
    notes: null,
    has_photo: 0,
    admin_id: 1,
    created_at: "",
    ...overrides,
  };
}

test("ageScore peaks in the prime window and is neutral when unknown", () => {
  assert.equal(ageScore(25), 1);
  assert.equal(ageScore(null), 0.5);
  assert.ok(ageScore(14) < 1);
  assert.ok(ageScore(50) < 1);
  assert.ok(ageScore(50) > ageScore(60));
});

test("ratePlayers keeps ratings in 0..100 and rewards skill", () => {
  const low = mk({ skill_self_rating: 1 });
  const high = mk({ skill_self_rating: 10 });
  const rated = ratePlayers([low, high]);
  for (const r of rated) {
    assert.ok(r.rating >= 0 && r.rating <= 100, `rating ${r.rating} out of range`);
  }
  const byId = new Map(rated.map((r) => [r.player.id, r.rating]));
  assert.ok(byId.get(high.id)! > byId.get(low.id)!);
});

test("suggestTeams pairs strongest with weakest (snake) and uses everyone once", () => {
  const players = [
    mk({ skill_self_rating: 10, years_played: 15 }),
    mk({ skill_self_rating: 7 }),
    mk({ skill_self_rating: 4 }),
    mk({ skill_self_rating: 1, years_played: 0 }),
  ];
  const result = suggestTeams(players, 2);
  assert.equal(result.teams.length, 2);
  assert.equal(result.leftover.length, 0);

  const assigned = result.teams.flatMap((t) => t.players.map((p) => p.id));
  assert.equal(new Set(assigned).size, 4);

  const rated = ratePlayers(players).sort((a, b) => b.rating - a.rating);
  const strongest = rated[0].player.id;
  const weakest = rated[rated.length - 1].player.id;
  const teamOfStrongest = result.teams.find((t) => t.players.some((p) => p.id === strongest))!;
  assert.ok(
    teamOfStrongest.players.some((p) => p.id === weakest),
    "strongest and weakest should be on the same team"
  );
});

test("suggestTeams sits out the middle-rated player when the roster is odd", () => {
  const players = [
    mk({ skill_self_rating: 9 }),
    mk({ skill_self_rating: 7 }),
    mk({ skill_self_rating: 5 }),
    mk({ skill_self_rating: 3 }),
    mk({ skill_self_rating: 1 }),
  ];
  const result = suggestTeams(players, 2);
  assert.equal(result.teams.length, 2);
  assert.equal(result.leftover.length, 1);
  const rated = ratePlayers(players).sort((a, b) => b.rating - a.rating);
  assert.equal(result.leftover[0].id, rated[2].player.id, "middle-rated player sits out");
});

test("suggestTeams respects team size", () => {
  const players = Array.from({ length: 6 }, (_, i) => mk({ skill_self_rating: i + 2 }));
  const result = suggestTeams(players, 3);
  assert.equal(result.teams.length, 2);
  for (const t of result.teams) assert.equal(t.players.length, 3);
});

test("balanceScore is the gap between strongest and weakest team", () => {
  const players = [mk(), mk(), mk(), mk()];
  const result = suggestTeams(players, 2);
  const ratings = result.teams.map((t) => t.rating);
  const expected = Math.round((Math.max(...ratings) - Math.min(...ratings)) * 10) / 10;
  assert.equal(result.balanceScore, expected);
});

test("mixGenders puts one man and one woman on every team when counts allow", () => {
  const players = [
    mk({ gender: "male", skill_self_rating: 9 }),
    mk({ gender: "male", skill_self_rating: 6 }),
    mk({ gender: "male", skill_self_rating: 4 }),
    mk({ gender: "male", skill_self_rating: 2 }),
    mk({ gender: "female", skill_self_rating: 8 }),
    mk({ gender: "female", skill_self_rating: 6 }),
    mk({ gender: "female", skill_self_rating: 3 }),
    mk({ gender: "female", skill_self_rating: 1 }),
  ];
  const result = suggestTeams(players, 2, { mixGenders: true });
  assert.equal(result.teams.length, 4);
  for (const t of result.teams) {
    const genders = t.players.map((p) => p.gender).sort();
    assert.deepEqual(genders, ["female", "male"], `${t.name} should be mixed`);
  }
});

test("mixGenders never doubles up the minority gender", () => {
  const players = [
    mk({ gender: "male", skill_self_rating: 8 }),
    mk({ gender: "male", skill_self_rating: 7 }),
    mk({ gender: "male", skill_self_rating: 6 }),
    mk({ gender: "male", skill_self_rating: 4 }),
    mk({ gender: "male", skill_self_rating: 3 }),
    mk({ gender: "female", skill_self_rating: 8 }),
    mk({ gender: "female", skill_self_rating: 5 }),
    mk({ gender: "female", skill_self_rating: 3 }),
  ];
  const result = suggestTeams(players, 2, { mixGenders: true });
  assert.equal(result.teams.length, 4);
  for (const t of result.teams) {
    const women = t.players.filter((p) => p.gender === "female").length;
    assert.ok(women <= 1, `${t.name} has ${women} women`);
  }
  const assigned = result.teams.flatMap((t) => t.players.map((p) => p.id));
  assert.equal(new Set(assigned).size, 8, "everyone plays exactly once");
});

test("mixGenders copes with players who did not specify a gender", () => {
  const players = [
    mk({ gender: "male", skill_self_rating: 8 }),
    mk({ gender: "male", skill_self_rating: 5 }),
    mk({ gender: "female", skill_self_rating: 7 }),
    mk({ gender: "female", skill_self_rating: 4 }),
    mk({ gender: null, skill_self_rating: 6 }),
    mk({ gender: null, skill_self_rating: 3 }),
  ];
  const result = suggestTeams(players, 2, { mixGenders: true });
  assert.equal(result.teams.length, 3);
  const assigned = result.teams.flatMap((t) => t.players.map((p) => p.id));
  assert.equal(new Set(assigned).size, 6);
  // Unspecified players are their own group, spread across different teams.
  const unspecifiedPerTeam = result.teams.map((t) => t.players.filter((p) => p.gender === null).length);
  assert.ok(Math.max(...unspecifiedPerTeam) <= 1);
});

test("mixGenders off matches the classic snake result", () => {
  const players = [
    mk({ gender: "male", skill_self_rating: 9 }),
    mk({ gender: "female", skill_self_rating: 6 }),
    mk({ gender: "male", skill_self_rating: 4 }),
    mk({ gender: "female", skill_self_rating: 1 }),
  ];
  const plain = suggestTeams(players, 2);
  const explicitOff = suggestTeams(players, 2, { mixGenders: false });
  assert.deepEqual(
    plain.teams.map((t) => t.players.map((p) => p.id)),
    explicitOff.teams.map((t) => t.players.map((p) => p.id))
  );
});
