import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAdmin } from "../AdminContext";
import { useTournament } from "../TournamentContext";
import { useI18n } from "../i18n";
import NoTournament from "../components/NoTournament";
import { PlayerName } from "../components/PlayerAvatar";
import type { Player } from "../types";

export default function Roster() {
  const { isAdmin } = useAdmin();
  const { currentId, current, refresh } = useTournament();
  const { t } = useI18n();
  const [roster, setRoster] = useState<Player[]>([]);
  const [directory, setDirectory] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!currentId) return;
    try {
      const [r, d] = await Promise.all([api.getRoster(currentId), api.getPlayers()]);
      setRoster(r);
      setDirectory(d);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const rosterIds = useMemo(() => new Set(roster.map((p) => p.id)), [roster]);
  const available = useMemo(() => directory.filter((p) => !rosterIds.has(p.id)), [directory, rosterIds]);

  if (!currentId) return <div className="page"><NoTournament /></div>;
  if (loading) return <div className="page">{t("roster.loading")}</div>;

  const toggle = (id: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addPicked = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.addToRoster(currentId, [...picked]);
      setPicked(new Set());
      setAdding(false);
      await load();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: Player) => {
    if (!confirm(t("roster.confirmRemove", { name: p.name, tournament: current?.name ?? t("roster.thisTournament") }))) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeFromRoster(currentId, p.id);
      await load();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="row between center">
        <h1>{t("roster.title")}</h1>
        <span className="pill">{t("roster.inTournament", { n: roster.length, name: current?.name ?? "" })}</span>
      </div>
      <p className="muted">{t("roster.intro")}</p>
      {error && <div className="banner error">{error}</div>}

      {isAdmin && (
        <div className="card toolbar">
          <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
            {adding ? t("common.close") : t("roster.addExisting")}
          </button>
          <span className="muted">{t("roster.enrollHint")}</span>
        </div>
      )}

      {isAdmin && adding && (
        <div className="card">
          <div className="entry-team-name">{t("roster.pickFromDir")}</div>
          {available.length === 0 ? (
            <p className="muted">{t("roster.allInTournament")}</p>
          ) : (
            <>
              <div className="chips">
                {available.map((p) => (
                  <button
                    key={p.id}
                    className={`chip ${picked.has(p.id) ? "chip-selected" : ""}`}
                    onClick={() => toggle(p.id)}
                  >
                    <PlayerName id={p.id} name={p.name} hasPhoto={p.has_photo} size="sm" className="chip-name" />
                    <span className="chip-rating">{p.rating}</span>
                  </button>
                ))}
              </div>
              <div className="row gap" style={{ marginTop: 12 }}>
                <button className="btn btn-success" onClick={addPicked} disabled={busy || picked.size === 0}>
                  {picked.size > 0 ? t("roster.addCount", { n: picked.size }) : t("roster.addToRoster")}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {roster.length === 0 ? (
        <div className="empty">{t("roster.emptyTournament")}</div>
      ) : (
        <div className="player-list">
          {roster.map((p) => (
            <div className="card player-row" key={p.id}>
              <div className="player-main">
                <PlayerName id={p.id} name={p.name} hasPhoto={p.has_photo} />
                <div className="player-meta muted">
                  {p.age ? t("players.ageY", { n: p.age }) : t("players.ageUnknown")} ·{" "}
                  {p.height_cm ? `${p.height_cm}cm` : "-"} · {t("players.yearsPlaying", { n: p.years_played })}
                  {p.plays_regularly ? ` · ${t("players.regular")}` : ""}
                </div>
              </div>
              <div className="player-side">
                <div className="rating-badge" title={t("roster.fairnessRating")}>
                  {p.rating}
                </div>
                {isAdmin && (
                  <button className="btn btn-danger sm" onClick={() => remove(p)} disabled={busy}>
                    {t("common.remove")}
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
