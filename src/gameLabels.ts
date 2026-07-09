import type { Game } from "./types";
import type { Translate } from "./i18n";

export function sideDisplayName(game: Game, side: "A" | "B", games: Game[], t: Translate): string {
  const team = side === "A" ? game.teamA : game.teamB;
  if (!team.placeholder) return team.name;

  const srcId = side === "A" ? game.a_source_match_id : game.b_source_match_id;
  const srcRes = side === "A" ? game.a_source_result : game.b_source_result;
  if (!srcId) return t("game.tbd");

  const src = games.find((g) => g.id === srcId);
  const label = src?.label ?? t("game.gameNum", { id: srcId });
  return srcRes === "loser" ? t("match.loserOf", { label }) : t("match.winnerOf", { label });
}
