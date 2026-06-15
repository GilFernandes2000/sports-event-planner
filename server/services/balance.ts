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
  leftover: Player | null; // odd player out, if any
  balanceScore: number; // spread between strongest and weakest team (lower is fairer)
  averageTeamRating: number;
}

/**
 * Greedy "snake" pairing: sort by rating then repeatedly pair the strongest
 * remaining player with the weakest remaining player. This keeps every pair's
 * combined rating close to the average, which is what we want for fair 2v2s.
 */
export function suggestTeams(pool: Player[]): BalanceResult {
  const rated = ratePlayers(pool).sort((a, b) => b.rating - a.rating);

  let leftover: Player | null = null;
  const working = [...rated];
  if (working.length % 2 === 1) {
    // The median player sits out so the remaining pairs stay balanced.
    const midIndex = Math.floor(working.length / 2);
    leftover = working.splice(midIndex, 1)[0].player;
  }

  const teams: SuggestedTeam[] = [];
  let i = 0;
  let j = working.length - 1;
  let n = 1;
  while (i < j) {
    const a = working[i];
    const b = working[j];
    teams.push({
      name: `Team ${n}`,
      players: [a.player, b.player],
      rating: Math.round((a.rating + b.rating) * 10) / 10,
    });
    i++;
    j--;
    n++;
  }

  const ratings = teams.map((t) => t.rating);
  const averageTeamRating = ratings.length
    ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
    : 0;
  const balanceScore = ratings.length ? Math.round((Math.max(...ratings) - Math.min(...ratings)) * 10) / 10 : 0;

  return { teams, leftover, balanceScore, averageTeamRating };
}
