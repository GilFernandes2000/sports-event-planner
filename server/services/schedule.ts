import type { Team } from "../types.js";

export interface ScheduledMatch {
  round: number;
  label: string;
  team_a_id: number;
  team_b_id: number;
}

/**
 * Single round-robin using the circle method so each round pairs up as many
 * teams as possible (nice ordering for an afternoon). With an odd number of
 * teams a "bye" slot is added and simply skipped.
 */
export function buildRoundRobin(teams: Team[]): ScheduledMatch[] {
  const ids = teams.map((t) => t.id);
  if (ids.length < 2) return [];

  const hasBye = ids.length % 2 === 1;
  const slots = hasBye ? [...ids, -1] : [...ids];
  const n = slots.length;
  const rounds = n - 1;
  const half = n / 2;

  const matches: ScheduledMatch[] = [];
  let gameNo = 1;
  let arr = [...slots];

  for (let r = 0; r < rounds; r++) {
    for (let k = 0; k < half; k++) {
      const a = arr[k];
      const b = arr[n - 1 - k];
      if (a !== -1 && b !== -1) {
        matches.push({
          round: r + 1,
          label: `Game ${gameNo}`,
          team_a_id: a,
          team_b_id: b,
        });
        gameNo++;
      }
    }
    // Rotate everyone except the first slot.
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop() as number);
    arr = [fixed, ...rest];
  }

  return matches;
}

/* --------------------------- Knockout brackets --------------------------- */

export type BracketSide =
  | { kind: "team"; teamId: number }
  | { kind: "source"; key: string; result: "winner" | "loser" };

export interface BracketMatchSpec {
  key: string; // local-only key used to wire later rounds before DB ids exist
  label: string;
  round: number;
  stage: string;
  a: BracketSide;
  b: BracketSide;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Standard seeding order for a bracket of `size` (power of two). e.g. size 8 -> [1,8,4,5,2,7,3,6]. */
function seedOrder(size: number): number[] {
  let seeds = [1];
  while (seeds.length < size) {
    const len = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(len - s);
    }
    seeds = next;
  }
  return seeds;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function knockoutLabel(round: number, totalRounds: number, idxInRound: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return "Final";
  if (fromFinal === 1) return `Semifinal ${idxInRound}`;
  if (fromFinal === 2) return `Quarterfinal ${idxInRound}`;
  return `Round ${round} Match ${idxInRound}`;
}

function repechageLabel(round: number, totalRounds: number, idxInRound: number): string {
  if (totalRounds === 1) return "Repechage";
  if (round === totalRounds) return "Repechage Final";
  return `Repechage R${round} #${idxInRound}`;
}

/**
 * Build a single-elimination bracket from an already-ordered list of team ids
 * (index 0 = top seed). Pads to a power of two with byes given to the top seeds,
 * and wires each later round to the winners of the previous round.
 */
function buildElimination(
  orderedTeamIds: number[],
  stage: string,
  labelFn: (round: number, totalRounds: number, idx: number) => string
): BracketMatchSpec[] {
  const n = orderedTeamIds.length;
  if (n < 2) return [];

  const size = nextPowerOfTwo(n);
  const totalRounds = Math.round(Math.log2(size));
  const order = seedOrder(size);
  // Position occupants: a concrete team, or null for a bye.
  let occupants: (BracketSide | null)[] = order.map((seed) =>
    seed <= n ? ({ kind: "team", teamId: orderedTeamIds[seed - 1] } as BracketSide) : null
  );

  const specs: BracketMatchSpec[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const next: (BracketSide | null)[] = [];
    let idxInRound = 0;
    for (let i = 0; i < occupants.length; i += 2) {
      const a = occupants[i];
      const b = occupants[i + 1];
      if (a && b) {
        idxInRound++;
        const key = `${stage}_r${round}_${i / 2}`;
        specs.push({ key, label: labelFn(round, totalRounds, idxInRound), round, stage, a, b });
        next.push({ kind: "source", key, result: "winner" });
      } else {
        // Bye: whichever side exists advances untouched.
        next.push(a ?? b ?? null);
      }
    }
    occupants = next;
  }
  return specs;
}

/** Seeded single-elimination main bracket. */
export function buildSingleElimination(
  teams: { id: number; rating: number }[],
  opts: { seeding: "rating" | "random" }
): BracketMatchSpec[] {
  const ordered =
    opts.seeding === "random"
      ? shuffle(teams)
      : [...teams].sort((a, b) => b.rating - a.rating);
  return buildElimination(ordered.map((t) => t.id), "knockout", knockoutLabel);
}

/** Repechage mini-bracket among the chosen losers (already ordered best-first). */
export function buildRepechage(orderedLoserTeamIds: number[]): BracketMatchSpec[] {
  return buildElimination(orderedLoserTeamIds, "repechage", repechageLabel);
}
