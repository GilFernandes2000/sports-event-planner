import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export default function NoTournament() {
  const { t } = useI18n();
  return (
    <div className="empty">
      {t("noTournament.pre")}
      <Link to="/tournaments">{t("noTournament.link")}</Link>
      {t("noTournament.post")}
    </div>
  );
}
