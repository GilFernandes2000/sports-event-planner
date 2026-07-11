import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// parsePlayerInput lives in the players route, which opens the DB on import —
// point it at a throwaway file first.
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "bball-test-")), "test.db");
const { parsePlayerInput } = await import("../server/routes/players.js");

const valid = {
  name: "Maria",
  age: 30,
  gender: "female",
  height_cm: 170,
  weight_kg: 60,
  years_played: 3,
  plays_regularly: true,
  skill_self_rating: 6,
  notes: "hello",
};

test("accepts a complete valid player", () => {
  const { value, error } = parsePlayerInput(valid);
  assert.equal(error, undefined);
  assert.equal(value!.name, "Maria");
  assert.equal(value!.gender, "female");
});

test("name is required and length-limited", () => {
  assert.ok(parsePlayerInput({ ...valid, name: "" }).error);
  assert.ok(parsePlayerInput({ ...valid, name: "   " }).error);
  assert.ok(parsePlayerInput({ ...valid, name: "x".repeat(61) }).error);
});

test("gender only accepts male or female, anything else becomes null", () => {
  assert.equal(parsePlayerInput({ ...valid, gender: "male" }).value!.gender, "male");
  assert.equal(parsePlayerInput({ ...valid, gender: "female" }).value!.gender, "female");
  assert.equal(parsePlayerInput({ ...valid, gender: "banana" }).value!.gender, null);
  assert.equal(parsePlayerInput({ ...valid, gender: 42 }).value!.gender, null);
  assert.equal(parsePlayerInput({ ...valid, gender: undefined }).value!.gender, null);
  assert.equal(parsePlayerInput({ ...valid, gender: null }).value!.gender, null);
});

test("age must be within 5-100 when given, optional otherwise", () => {
  assert.ok(parsePlayerInput({ ...valid, age: 3 }).error);
  assert.ok(parsePlayerInput({ ...valid, age: 150 }).error);
  assert.ok(parsePlayerInput({ ...valid, age: "abc" }).error);
  assert.equal(parsePlayerInput({ ...valid, age: "" }).value!.age, null);
});

test("height and weight are range-checked", () => {
  assert.ok(parsePlayerInput({ ...valid, height_cm: 20 }).error);
  assert.ok(parsePlayerInput({ ...valid, weight_kg: 900 }).error);
  assert.equal(parsePlayerInput({ ...valid, height_cm: "" }).value!.height_cm, null);
});

test("skill rating is clamped to 1-10 and years to 0-80", () => {
  assert.ok(parsePlayerInput({ ...valid, skill_self_rating: 0 }).error);
  assert.ok(parsePlayerInput({ ...valid, skill_self_rating: 11 }).error);
  assert.ok(parsePlayerInput({ ...valid, years_played: -1 }).error);
  assert.ok(parsePlayerInput({ ...valid, years_played: 99 }).error);
  assert.equal(parsePlayerInput({ ...valid, years_played: "" }).value!.years_played, 0);
});

test("notes are trimmed and truncated to 280 characters", () => {
  const { value } = parsePlayerInput({ ...valid, notes: " x".repeat(300) });
  assert.ok(value!.notes!.length <= 280);
  assert.equal(parsePlayerInput({ ...valid, notes: "  " }).value!.notes, null);
});
