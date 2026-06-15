import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useAdmin } from "./AdminContext";
import { useTournament } from "./TournamentContext";
import { useI18n, LANGUAGES, type Lang } from "./i18n";
import Stats from "./pages/Stats";
import Enroll from "./pages/Enroll";
import Players from "./pages/Players";
import Teams from "./pages/Teams";
import Dashboard from "./pages/Dashboard";
import Roster from "./pages/Roster";
import Tournaments from "./pages/Tournaments";

function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      className="lang-pick"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label={t("lang.label")}
      title={t("lang.label")}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.short}
        </option>
      ))}
    </select>
  );
}

function AdminButton() {
  const { isAdmin, login, logout } = useAdmin();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isAdmin) {
    return (
      <button className="btn btn-ghost" onClick={logout} title={t("admin.exit")}>
        {t("admin.on")}
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      setOpen(false);
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        {t("admin.admin")}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2>{t("admin.login")}</h2>
            <p className="muted">{t("admin.prompt")}</p>
            <input
              type="password"
              autoFocus
              placeholder={t("admin.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="error">{error}</p>}
            <div className="row gap">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "..." : t("admin.loginSubmit")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function TournamentSelector() {
  const { tournaments, currentId, select } = useTournament();
  const { t } = useI18n();
  if (tournaments.length === 0) {
    return <span className="tournament-pick muted">{t("header.noTournaments")}</span>;
  }
  return (
    <select
      className="tournament-pick"
      value={currentId ?? ""}
      onChange={(e) => select(Number(e.target.value))}
      aria-label={t("header.selectTournament")}
    >
      {tournaments.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export default function App() {
  const { t } = useI18n();
  return (
    <div className="app">
      <div className="topnav">
        <header className="topbar">
          <div className="brand">
            <span className="ball" aria-hidden>
              🏀
            </span>
            <span>2v2</span>
          </div>
          <TournamentSelector />
          <LanguageSwitcher />
          <AdminButton />
        </header>

        <nav className="tabs">
          <NavLink to="/" end>
            {t("nav.standings")}
          </NavLink>
          <NavLink to="/games">{t("nav.games")}</NavLink>
          <NavLink to="/teams">{t("nav.teams")}</NavLink>
          <NavLink to="/roster">{t("nav.roster")}</NavLink>
          <NavLink to="/enroll">{t("nav.enroll")}</NavLink>
          <NavLink to="/players">{t("nav.players")}</NavLink>
          <NavLink to="/tournaments">{t("nav.events")}</NavLink>
        </nav>
      </div>

      <main className="content">
        <Routes>
          <Route path="/" element={<Stats />} />
          <Route path="/games" element={<Dashboard />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/enroll" element={<Enroll />} />
          <Route path="/players" element={<Players />} />
          <Route path="/tournaments" element={<Tournaments />} />
        </Routes>
      </main>

      <footer className="footer muted">{t("footer")}</footer>
    </div>
  );
}
