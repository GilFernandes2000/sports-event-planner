import type { Player } from "../types.js";

/**
 * Transparent fairness model.
 *
 * Each player gets a 0-100 `rating` from a weighted blend of normalised
 * attributes. Weights live here so they are trivial to tune. Skill self-rating
 * dominates; experience and "plays regularly" add real-world signal; height is a
 * small athleticism factor; age contributes via a prime-age curve. Weight (kg)
 * is intentionally NOT used to boost rating (being heavier is not "better"); it
 * is kept on the player only as info.
 */
export const WEIGHTS = {
  skill: 0.45,
  experience: 0.2,
  height: 0.15,
  regular: 0.1,
  age: 0.1,
} as const;

const EXPERIENCE_CAP_YEARS = 15; // diminishing returns past this

// Prime athletic window; players inside it score highest on the age factor.
const PRIME_MIN = 22;
const PRIME_MAX = 30;
const YOUNG_FLOOR_AGE = 12; // ramps up from here to PRIME_MIN
const OLD_FLOOR_AGE = 55; // declines down to here from PRIME_MAX

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** 0..1 prime-age score; neutral 0.5 when age is unknown. */
export function ageScore(age: number | null | undefined): number {
  if (age === null || age === undefined || !Number.isFinite(age)) return 0.5;
  if (age >= PRIME_MIN && age <= PRIME_MAX) return 1;
  if (age < PRIME_MIN) {
    return clamp01(0.3 + 0.7 * ((age - YOUNG_FLOOR_AGE) / (PRIME_MIN - YOUNG_FLOOR_AGE)));
  }
  return clamp01(1 - 0.7 * ((age - PRIME_MAX) / (OLD_FLOOR_AGE - PRIME_MAX)));
}

/** Normalise a value to 0..1 across the pool; neutral 0.5 when no spread. */
function normaliser(values: number[]): (v: number | null | undefined) => number {
  const present = values.filter((v) => Number.isFinite(v));
  if (present.length === 0) return () => 0.5;
  const min = Math.min(...present);
  const max = Math.max(...present);
  if (max === min) return () => 0.5;
  return (v) => (Number.isFinite(v as number) ? clamp01(((v as number) - min) / (max - min)) : 0.5);
}

export interface RatedPlayer {
  player: Player;
  rating: number;
}

export function ratePlayers(pool: Player[]): RatedPlayer[] {
  const normHeight = normaliser(pool.map((p) => (p.height_cm ?? NaN) as number));

  return pool.map((p) => {
    const skill = clamp01((p.skill_self_rating ?? 5) / 10);
    const experience = clamp01(Math.min(p.years_played ?? 0, EXPERIENCE_CAP_YEARS) / EXPERIENCE_CAP_YEARS);
    const regular = p.plays_regularly ? 1 : 0;
    const height = normHeight(p.height_cm);
    const age = ageScore(p.age);

    const score =
      WEIGHTS.skill * skill +
      WEIGHTS.experience * experience +
      WEIGHTS.height * height +
      WEIGHTS.regular * regular +
      WEIGHTS.age * age;

    return { player: p, rating: Math.round(score * 1000) / 10 }; // 0..100, one decimal
  });
}

export interface SuggestedTeam {
  name: string;
  players: Player[];
  rating: number; // combined rating of the pair
}

export interface BalanceResult {
  teams: SuggestedTeam[];
  leftover: Player[]; // unassigned players when roster doesn't divide evenly
  balanceScore: number; // spread between strongest and weakest team (lower is fairer)
  averageTeamRating: number;
}

export interface SuggestOptions {
  /** Spread each gender as evenly as possible across teams. */
  mixGenders?: boolean;
}

function genderKey(p: Player): string {
  return p.gender ?? "other";
}

/** Snake draft: alternate picks from the strongest and weakest remaining. */
function buildSnakeTeams(working: RatedPlayer[], size: number): RatedPlayer[][] {
  const teams: RatedPlayer[][] = [];
  const queue = [...working];
  while (queue.length >= size) {
    const members: RatedPlayer[] = [];
    for (let i = 0; i < size; i++) {
      members.push(i % 2 === 0 ? queue.shift()! : queue.pop()!);
    }
    teams.push(members);
  }
  return teams;
}

/**
 * Gender-mixed grouping: each gender group is spread as evenly as possible
 * across teams (smallest group first so its members land on distinct teams),
 * strongest players going to the currently weakest eligible team. A local
 * same-gender swap pass then narrows the rating gap without disturbing the
 * gender distribution.
 */
function buildMixedTeams(working: RatedPlayer[], size: number): RatedPlayer[][] {
  const teamCount = working.length / size;
  const teams: RatedPlayer[][] = Array.from({ length: teamCount }, () => []);

  const groups = new Map<string, RatedPlayer[]>();
  for (const rp of working) {
    const key = genderKey(rp.player);
    const arr = groups.get(key) ?? [];
    arr.push(rp);
    groups.set(key, arr);
  }
  const ordered = [...groups.entries()].sort((a, b) => a[1].length - b[1].length);

  const teamRating = (t: RatedPlayer[]) => t.reduce((s, m) => s + m.rating, 0);
  for (const [key, members] of ordered) {
    for (const rp of members) {
      const open = teams.filter((t) => t.length < size);
      open.sort((a, b) => {
        const ga = a.filter((m) => genderKey(m.player) === key).length;
        const gb = b.filter((m) => genderKey(m.player) === key).length;
        if (ga !== gb) return ga - gb;
        const ra = teamRating(a);
        const rb = teamRating(b);
        if (ra !== rb) return ra - rb;
        return a.length - b.length;
      });
      open[0].push(rp);
    }
  }

  // Same-gender swaps only, so the gender spread is preserved.
  const gapOf = (ratings: number[]) => Math.max(...ratings) - Math.min(...ratings);
  for (let guard = 0; guard < 100; guard++) {
    const ratings = teams.map(teamRating);
    let bestGap = gapOf(ratings);
    let best: { ti: number; tj: number; ai: number; bj: number } | null = null;
    for (let ti = 0; ti < teams.length; ti++) {
      for (let tj = ti + 1; tj < teams.length; tj++) {
        for (let ai = 0; ai < teams[ti].length; ai++) {
          for (let bj = 0; bj < teams[tj].length; bj++) {
            const a = teams[ti][ai];
            const b = teams[tj][bj];
            if (genderKey(a.player) !== genderKey(b.player)) continue;
            const next = [...ratings];
            next[ti] += b.rating - a.rating;
            next[tj] += a.rating - b.rating;
            const gap = gapOf(next);
            if (gap < bestGap - 1e-9) {
              bestGap = gap;
              best = { ti, tj, ai, bj };
            }
          }
        }
      }
    }
    if (!best) break;
    const tmp = teams[best.ti][best.ai];
    teams[best.ti][best.ai] = teams[best.tj][best.bj];
    teams[best.tj][best.bj] = tmp;
  }

  return teams;
}

/**
 * Build fairness-balanced teams. Default is a greedy "snake" over ratings;
 * with `mixGenders` each gender is first spread evenly across teams and
 * ratings are balanced within that constraint.
 */
export function suggestTeams(pool: Player[], teamSize = 2, opts: SuggestOptions = {}): BalanceResult {
  const size = Math.max(2, Math.min(5, Math.floor(teamSize) || 2));
  const rated = ratePlayers(pool).sort((a, b) => b.rating - a.rating);

  const leftover: Player[] = [];
  const working = [...rated];
  const remainder = working.length % size;
  if (remainder !== 0) {
    const startIdx = Math.floor((working.length - remainder) / 2);
    for (let i = 0; i < remainder; i++) {
      leftover.push(working.splice(startIdx, 1)[0].player);
    }
  }

  const grouped = opts.mixGenders ? buildMixedTeams(working, size) : buildSnakeTeams(working, size);
  const teams: SuggestedTeam[] = grouped.map((members, i) => ({
    name: `Team ${i + 1}`,
    players: members.map((m) => m.player),
    rating: Math.round(members.reduce((s, m) => s + m.rating, 0) * 10) / 10,
  }));

  const ratings = teams.map((t) => t.rating);
  const averageTeamRating = ratings.length
    ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
    : 0;
  const balanceScore = ratings.length ? Math.round((Math.max(...ratings) - Math.min(...ratings)) * 10) / 10 : 0;

  return { teams, leftover, balanceScore, averageTeamRating };
}
