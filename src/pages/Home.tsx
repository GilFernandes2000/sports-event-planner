import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAdmin } from "../AdminContext";
import { useTournamentAccess } from "../TournamentAccessContext";
import { useTournament } from "../TournamentContext";
import AdminAuthModal from "../components/AdminAuthModal";
import { useI18n } from "../i18n";

export default function Home() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasAccess, loading, login } = useTournamentAccess();
  const { select } = useTournament();
  const { isAdmin } = useAdmin();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    const authError = searchParams.get("auth_error");
    if (authError) setError(t("admin.oauthError"));
  }, [searchParams, t]);

  useEffect(() => {
    if (!loading && hasAccess) navigate("/standings", { replace: true });
  }, [loading, hasAccess, navigate]);

  if (loading) {
    return (
      <div className="app home-page">
        <p className="muted">{t("access.loading")}</p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const tournament = await login(name.trim(), password);
      select(tournament.id);
      navigate("/standings");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app home-page">
      <div className="home-card card">
        <div className="brand home-brand">
          <span className="ball" aria-hidden>🏀</span>
          <span>2v2</span>
        </div>
        <h1>{t("home.title")}</h1>
        <p className="muted">{t("home.intro")}</p>

        <form onSubmit={submit} className="home-form">
          <label>
            <span className="label">{t("home.tournamentName")}</span>
            <input
              type="text"
              autoFocus
              placeholder={t("home.tournamentNamePlaceholder")}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <span className="label">{t("home.tournamentPassword")}</span>
            <input
              type="password"
              placeholder={t("home.tournamentPasswordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !password}>
            {busy ? t("home.entering") : t("home.enter")}
          </button>
        </form>

        <p className="muted home-organiser">
          {t("home.organiserPrompt")}
          <button type="button" className="btn-link" onClick={() => setAdminOpen(true)}>
            {t("home.organiserLogin")}
          </button>
          {isAdmin && (
            <>
              {" · "}
              <button type="button" className="btn-link" onClick={() => navigate("/tournaments")}>
                {t("nav.events")}
              </button>
            </>
          )}
        </p>
      </div>

      <AdminAuthModal
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        onSuccess={() => navigate("/tournaments")}
      />
    </div>
  );
}
