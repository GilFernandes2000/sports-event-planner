import type { Game } from "./types";
import type { Translate } from "./i18n";

export function stageBadge(stage: string, t: Translate): string | null {
  if (stage === "repechage") return t("stage.repechage");
  if (stage === "round_robin") return t("stage.roundRobin");
  return null;
}

/**
 * Compute each game's column by its longest dependency chain (topological depth),
 * so "winner-of/loser-of" links always flow left -> right regardless of the stored
 * round number. This keeps the repechage and any manual wiring laid out correctly.
 */
export function computeDepths(games: Game[]): Map<number, number> {
  const byId = new Map(games.map((g) => [g.id, g]));
  const depth = new Map<number, number>();
  const visiting = new Set<number>();

  const resolve = (id: number): number => {
    if (depth.has(id)) return depth.get(id) as number;
    if (visiting.has(id)) return 0; // guard against cycles
    visiting.add(id);
    const g = byId.get(id);
    let d = 0;
    if (g) {
      const sources = [g.a_source_match_id, g.b_source_match_id].filter(
        (s): s is number => s !== null && byId.has(s)
      );
      for (const s of sources) d = Math.max(d, resolve(s) + 1);
    }
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };

  for (const g of games) resolve(g.id);
  return depth;
}
