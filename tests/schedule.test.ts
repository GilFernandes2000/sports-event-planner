import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRoundRobin,
  buildSingleElimination,
  buildRepechage,
  type BracketMatchSpec,
} from "../server/services/schedule.js";
import type { Team } from "../server/types.js";

function mkTeams(n: number): Team[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    tournament_id: 1,
    name: `Team ${i + 1}`,
    locked: 0,
    created_at: "",
  }));
}

test("round-robin with 4 teams: every pair plays exactly once", () => {
  const matches = buildRoundRobin(mkTeams(4));
  assert.equal(matches.length, 6);

  const pairs = new Set(matches.map((m) => [m.team_a_id, m.team_b_id].sort().join("-")));
  assert.equal(pairs.size, 6, "no duplicate pairings");

  for (let id = 1; id <= 4; id++) {
    const played = matches.filter((m) => m.team_a_id === id || m.team_b_id === id).length;
    assert.equal(played, 3, `team ${id} plays 3 games`);
  }
});

test("round-robin never schedules a team twice in the same round", () => {
  for (const n of [4, 5, 6, 7]) {
    const matches = buildRoundRobin(mkTeams(n));
    const byRound = new Map<number, number[]>();
    for (const m of matches) {
      const list = byRound.get(m.round) ?? [];
      list.push(m.team_a_id, m.team_b_id);
      byRound.set(m.round, list);
    }
    for (const [round, ids] of byRound) {
      assert.equal(new Set(ids).size, ids.length, `${n} teams: round ${round} double-books a team`);
    }
  }
});

test("round-robin with an odd team count gives everyone a bye but a full schedule", () => {
  const matches = buildRoundRobin(mkTeams(5));
  assert.equal(matches.length, 10); // C(5,2)
  for (let id = 1; id <= 5; id++) {
    const played = matches.filter((m) => m.team_a_id === id || m.team_b_id === id).length;
    assert.equal(played, 4);
  }
});

test("round-robin needs at least two teams", () => {
  assert.deepEqual(buildRoundRobin(mkTeams(0)), []);
  assert.deepEqual(buildRoundRobin(mkTeams(1)), []);
});

function concreteTeamIds(specs: BracketMatchSpec[]): number[] {
  const ids: number[] = [];
  for (const s of specs) {
    if (s.a.kind === "team") ids.push(s.a.teamId);
    if (s.b.kind === "team") ids.push(s.b.teamId);
  }
  return ids;
}

test("knockout with 4 teams: 1v4 and 2v3 semis feeding a final", () => {
  const teams = [
    { id: 1, rating: 100 },
    { id: 2, rating: 80 },
    { id: 3, rating: 60 },
    { id: 4, rating: 40 },
  ];
  const specs = buildSingleElimination(teams, { seeding: "rating" });
  assert.equal(specs.length, 3);

  const semis = specs.filter((s) => s.round === 1);
  const pairings = semis.map((s) =>
    [s.a.kind === "team" ? s.a.teamId : -1, s.b.kind === "team" ? s.b.teamId : -1].sort().join("-")
  );
  assert.deepEqual(pairings.sort(), ["1-4", "2-3"]);

  const final = specs.find((s) => s.label === "Final")!;
  assert.equal(final.a.kind, "source");
  assert.equal(final.b.kind, "source");
});

test("knockout always produces n-1 matches and enters every team exactly once", () => {
  for (const n of [2, 3, 5, 6, 8]) {
    const teams = Array.from({ length: n }, (_, i) => ({ id: i + 1, rating: 100 - i }));
    const specs = buildSingleElimination(teams, { seeding: "rating" });
    assert.equal(specs.length, n - 1, `${n} teams -> ${n - 1} matches`);
    const entered = concreteTeamIds(specs);
    assert.equal(new Set(entered).size, n, `${n} teams: every team enters the bracket`);
    assert.equal(entered.length, n, `${n} teams: no team enters twice`);
  }
});

test("knockout byes go to the top seeds", () => {
  const teams = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, rating: 100 - i }));
  const specs = buildSingleElimination(teams, { seeding: "rating" });
  const round1Ids = concreteTeamIds(specs.filter((s) => s.round === 1));
  assert.ok(!round1Ids.includes(1), "top seed skips round 1 with a bye");
});

test("random seeding still yields a structurally valid bracket", () => {
  const teams = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, rating: 50 }));
  const specs = buildSingleElimination(teams, { seeding: "random" });
  assert.equal(specs.length, 5);
  assert.equal(new Set(concreteTeamIds(specs)).size, 6);
});

test("repechage of two losers is a single final", () => {
  const specs = buildRepechage([7, 9]);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].label, "Repechage");
  assert.equal(specs[0].stage, "repechage");
});
