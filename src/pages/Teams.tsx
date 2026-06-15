import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAdmin } from "../AdminContext";
import { useTournament } from "../TournamentContext";
import { useI18n } from "../i18n";
import NoTournament from "../components/NoTournament";
import type { Player } from "../types";

interface LocalTeam {
  name: string;
  memberIds: number[];
}

export default function Teams() {
  const { isAdmin } = useAdmin();
  const { currentId } = useTournament();
  const { t } = useI18n();
  const [roster, setRoster] = useState<Player[]>([]);
  const [teams, setTeams] = useState<LocalTeam[]>([]);
  const [bench, setBench] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const playerMap = useMemo(() => new Map(roster.map((p) => [p.id, p] as const)), [roster]);

  const load = async () => {
    if (!currentId) return;
    try {
      const [r, tr] = await Promise.all([api.getRoster(currentId), api.getTeams(currentId)]);
      setRoster(r);
      const local = tr.teams.map((t) => ({ name: t.name, memberIds: t.members.map((m) => m.id) }));
      setTeams(local);
      setLocked(tr.locked);
      const assigned = new Set(local.flatMap((t) => t.memberIds));
      setBench(r.filter((p) => !assigned.has(p.id)).map((p) => p.id));
      setDirty(false);
      setSelected(null);
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

  const teamRating = (memberIds: number[]) =>
    Math.round(memberIds.reduce((s, id) => s + (playerMap.get(id)?.rating ?? 0), 0) * 10) / 10;

  const balanceScore = useMemo(() => {
    const ratings = teams.map((t) => teamRating(t.memberIds));
    if (ratings.length < 2) return 0;
    return Math.round((Math.max(...ratings) - Math.min(...ratings)) * 10) / 10;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, playerMap]);

  const generate = async () => {
    if (!currentId) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await api.generateTeams(currentId);
      await load();
      setInfo(t("teams.info.created"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tapPlayer = (id: number) => {
    if (locked || !isAdmin) return;
    if (selected === null) {
      setSelected(id);
      return;
    }
    if (selected === id) {
      setSelected(null);
      return;
    }
    swap(selected, id);
    setSelected(null);
  };

  const swap = (a: number, b: number) => {
    const replace = (ids: number[]) => ids.map((x) => (x === a ? b : x === b ? a : x));
    setTeams((prev) => prev.map((t) => ({ ...t, memberIds: replace(t.memberIds) })));
    setBench((prev) => replace(prev));
    setDirty(true);
  };

  const renameTeam = (idx: number, name: string) => {
    setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, name } : t)));
    setDirty(true);
  };

  const save = async () => {
    if (!currentId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.saveTeams(currentId, teams.map((t) => ({ name: t.name, playerIds: t.memberIds })));
      setLocked(res.locked);
      setInfo(t("teams.info.saved"));
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    if (!currentId) return;
    setBusy(true);
    setError(null);
    try {
      if (dirty) await api.saveTeams(currentId, teams.map((t) => ({ name: t.name, playerIds: t.memberIds })));
      await api.lockTeams(currentId);
      setLocked(true);
      setInfo(t("teams.info.locked"));
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    if (!currentId) return;
    if (!confirm(t("teams.confirmUnlock"))) return;
    setBusy(true);
    setError(null);
    try {
      await api.unlockTeams(currentId);
      await load();
      setInfo(t("teams.info.unlocked"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!currentId) return <div className="page"><NoTournament /></div>;
  if (loading) return <div className="page">{t("teams.loading")}</div>;

  const chip = (id: number) => {
    const p = playerMap.get(id);
    if (!p) return null;
    return (
      <button
        key={id}
        className={`chip ${selected === id ? "chip-selected" : ""}`}
        onClick={() => tapPlayer(id)}
        disabled={locked || !isAdmin}
      >
        <span className="chip-name">{p.name}</span>
        <span className="chip-rating">{p.rating}</span>
      </button>
    );
  };

  return (
    <div className="page">
      <div className="row between center">
        <h1>{t("teams.title")}</h1>
        {teams.length > 0 && (
          <span className={`pill ${balanceScore <= 15 ? "pill-good" : balanceScore <= 30 ? "pill-warn" : "pill-bad"}`}>
            {t("teams.balanceGap", { n: balanceScore })}
          </span>
        )}
      </div>

      {locked && <div className="banner">{t("teams.lockedBanner")}</div>}
      {info && <div className="banner success">{info}</div>}
      {error && <div className="banner error">{error}</div>}

      {isAdmin && !locked && (
        <div className="card toolbar">
          <button className="btn btn-primary" onClick={generate} disabled={busy}>
            {teams.length ? t("teams.rebalance") : t("teams.generate")}
          </button>
          <button className="btn" onClick={save} disabled={busy || !dirty}>
            {t("teams.saveChanges")}
          </button>
          <button className="btn btn-success" onClick={lock} disabled={busy || teams.length < 2}>
            {t("teams.lock")}
          </button>
        </div>
      )}

      {isAdmin && locked && (
        <div className="card toolbar">
          <button className="btn btn-danger" onClick={unlock} disabled={busy}>
            {t("teams.unlock")}
          </button>
        </div>
      )}

      {!isAdmin && teams.length === 0 && <div className="empty">{t("teams.notDrawn")}</div>}

      {isAdmin && teams.length === 0 && (
        <div className="empty">
          {roster.length < 4 ? t("teams.needPlayers", { n: roster.length }) : t("teams.hitGenerate")}
        </div>
      )}

      <div className="teams-grid">
        {teams.map((team, idx) => (
          <div className="card team-card" key={idx}>
            <div className="team-head">
              {isAdmin && !locked ? (
                <input className="team-name-input" value={team.name} onChange={(e) => renameTeam(idx, e.target.value)} />
              ) : (
                <span className="team-name">{team.name}</span>
              )}
              <span className="team-rating" title={t("teams.combinedRating")}>
                {teamRating(team.memberIds)}
              </span>
            </div>
            <div className="chips">{team.memberIds.map((id) => chip(id))}</div>
          </div>
        ))}
      </div>

      {bench.length > 0 && (
        <div className="card bench">
          <div className="muted bench-title">{t("teams.bench")}</div>
          <div className="chips">{bench.map((id) => chip(id))}</div>
        </div>
      )}

      {isAdmin && !locked && teams.length > 0 && (
        <p className="muted hint">{t("teams.swapHint")}</p>
      )}
    </div>
  );
}
