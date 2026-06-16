import { useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAdmin } from "./AdminContext";
import { useTournamentAccess } from "./TournamentAccessContext";
import { useTournament } from "./TournamentContext";
import { useI18n, LANGUAGES, type Lang } from "./i18n";
import Home from "./pages/Home";
import AdminAuthModal from "./components/AdminAuthModal";
import AuthCallback from "./pages/AuthCallback";
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
  const { isAdmin, admin, logout } = useAdmin();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (isAdmin) {
    return (
      <button className="btn btn-ghost" onClick={logout} title={t("admin.exit")}>
        {admin?.email ?? t("admin.on")}
      </button>
    );
  }

  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        {t("admin.admin")}
      </button>
      <AdminAuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function TournamentHeader() {
  const { isAdmin } = useAdmin();
  const { hasAccess, logout: accessLogout } = useTournamentAccess();
  const { tournaments, current, currentId, select } = useTournament();
  const { t } = useI18n();
  const navigate = useNavigate();

  const leaveTournament = () => {
    accessLogout();
    navigate("/");
  };

  if (isAdmin && tournaments.length > 0) {
    return (
      <select
        className="tournament-pick"
        value={currentId ?? ""}
        onChange={(e) => select(Number(e.target.value))}
        aria-label={t("header.selectTournament")}
      >
        {tournaments.map((tr) => (
          <option key={tr.id} value={tr.id}>
            {tr.name}
          </option>
        ))}
      </select>
    );
  }

  if (hasAccess && current?.name) {
    return (
      <div className="tournament-pick row gap">
        <span className="tournament-name">{current.name}</span>
        <button className="btn btn-ghost sm" onClick={leaveTournament} title={t("access.exit")}>
          {t("access.exit")}
        </button>
      </div>
    );
  }

  if (isAdmin) {
    return <span className="tournament-pick muted">{t("header.noTournaments")}</span>;
  }

  return null;
}

function AppShell() {
  const { t } = useI18n();
  const { isAdmin } = useAdmin();
  const { hasAccess, loading: accessLoading } = useTournamentAccess();
  const { currentId, loading: tournamentLoading } = useTournament();
  const location = useLocation();

  if (accessLoading || tournamentLoading) {
    return <div className="page muted">{t("access.loading")}</div>;
  }

  const canEnter = hasAccess || isAdmin;
  if (!canEnter) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (isAdmin && !hasAccess && !currentId && location.pathname !== "/tournaments") {
    return <Navigate to="/tournaments" replace />;
  }

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
          <TournamentHeader />
          <LanguageSwitcher />
          <AdminButton />
        </header>

        <nav className="tabs">
          <NavLink to="/standings" end>
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
          <Route path="/standings" element={<Stats />} />
          <Route path="/games" element={<Dashboard />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/enroll" element={<Enroll />} />
          <Route path="/players" element={<Players />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="*" element={<Navigate to="/standings" replace />} />
        </Routes>
      </main>

      <footer className="footer muted">{t("footer")}</footer>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/*" element={<AppShell />} />
    </Routes>
  );
}
