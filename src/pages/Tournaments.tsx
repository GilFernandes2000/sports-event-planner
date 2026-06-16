import { useState } from "react";
import { api } from "../api";
import { useAdmin } from "../AdminContext";
import { useTournament } from "../TournamentContext";
import { useI18n } from "../i18n";

export default function Tournaments() {
  const { isAdmin } = useAdmin();
  const { tournaments, currentId, select, refresh, loading } = useTournament();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [passwordEditId, setPasswordEditId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const created = await api.createTournament(name.trim(), password);
      setName("");
      setPassword("");
      setInfo(t("tournaments.createdShare", { name: created.name }));
      await refresh();
      select(created.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (id: number) => {
    if (!newPassword) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await api.setTournamentPassword(id, newPassword);
      setPasswordEditId(null);
      setNewPassword("");
      setInfo(t("tournaments.passwordUpdated"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number, tName: string) => {
    if (!confirm(t("tournaments.confirmDelete", { name: tName }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteTournament(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page">{t("tournaments.loading")}</div>;

  return (
    <div className="page">
      <h1>{t("tournaments.title")}</h1>
      <p className="muted">{t("tournaments.intro")}</p>
      {error && <div className="banner error">{error}</div>}
      {info && <div className="banner info">{info}</div>}

      {isAdmin && (
        <form className="card home-form" onSubmit={create}>
          <label>
            <span className="label">{t("tournaments.nameLabel")}</span>
            <input
              placeholder={t("tournaments.namePlaceholder")}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <span className="label">{t("tournaments.passwordLabel")}</span>
            <input
              type="password"
              placeholder={t("tournaments.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <p className="muted sm">{t("tournaments.passwordHint")}</p>
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim() || !password}>
            {t("common.create")}
          </button>
        </form>
      )}

      {tournaments.length === 0 ? (
        <div className="empty">
          {isAdmin ? t("tournaments.emptyAdmin") : t("tournaments.emptyUser")}
        </div>
      ) : (
        <div className="player-list">
          {tournaments.map((tr) => (
            <div className={`card player-row ${tr.id === currentId ? "selected-card" : ""}`} key={tr.id}>
              <div className="player-main">
                <div className="player-name">{tr.name}</div>
                <div className="player-meta muted">
                  {t("tournaments.counts", { p: tr.counts.players, t: tr.counts.teams, g: tr.counts.games })}
                </div>
                {isAdmin && passwordEditId !== tr.id && (
                  <button
                    type="button"
                    className="btn-link sm"
                    onClick={() => {
                      setPasswordEditId(tr.id);
                      setNewPassword("");
                    }}
                  >
                    {t("tournaments.changePassword")}
                  </button>
                )}
                {isAdmin && passwordEditId === tr.id && (
                  <div className="row gap wrap password-edit">
                    <input
                      type="password"
                      placeholder={t("tournaments.newPasswordPlaceholder")}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn sm btn-primary"
                      disabled={busy || !newPassword}
                      onClick={() => changePassword(tr.id)}
                    >
                      {t("common.save")}
                    </button>
                    <button
                      type="button"
                      className="btn sm btn-ghost"
                      onClick={() => {
                        setPasswordEditId(null);
                        setNewPassword("");
                      }}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                )}
              </div>
              <div className="player-side">
                {tr.id === currentId ? (
                  <span className="pill pill-good">{t("common.selected")}</span>
                ) : (
                  <button className="btn sm" onClick={() => select(tr.id)}>
                    {t("common.select")}
                  </button>
                )}
                {isAdmin && (
                  <button className="btn btn-danger sm" onClick={() => remove(tr.id, tr.name)} disabled={busy}>
                    {t("common.delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
