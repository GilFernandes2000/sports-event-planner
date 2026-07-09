import type { Award } from "./types";
import type { Translate } from "./i18n";

export function awardLabel(t: Translate, key: string): string {
  return t(`award.${key}`);
}

export function awardDetail(t: Translate, award: Award): string {
  switch (award.key) {
    case "mvp":
      return award.value != null ? t("award.mvpDetail", { n: award.value }) : "";
    case "bestShooter":
      return award.value != null ? t("award.bestShooterDetail", { n: award.value }) : "";
    case "leadingTeam":
      return award.wins != null && award.losses != null
        ? t("award.leadingTeamDetail", { w: award.wins, l: award.losses })
        : "";
    case "clutchWin":
      return award.value != null ? t("award.clutchWinDetail", { n: award.value }) : "";
    case "shootout":
      return award.value != null ? t("award.shootoutDetail", { n: award.value }) : "";
    default:
      return award.detail ?? "";
  }
}
