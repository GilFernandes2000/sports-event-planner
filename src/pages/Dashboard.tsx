import { useEffect, useMemo, useState } from "react";
import { api, type MatchPayload, type SidePayload } from "../api";
import { useAdmin } from "../AdminContext";
import { useTournament } from "../TournamentContext";
import { useI18n } from "../i18n";
import NoTournament from "../components/NoTournament";
import BracketFlow from "../components/BracketFlow";
import type { Game, Team } from "../types";

/* --------------------------- Match definition form --------------------------- */

interface MatchFormValue {
  label: string;
  round: string;
  sideA: string;
  sideB: string;
}

function sideToValue(teamId: number | null, srcId: number | null, srcRes: string | null): string {
  if (srcId !== null) return `${srcRes ?? "winner"}:${srcId}`;
  if (teamId !== null) return `team:${teamId}`;
  return "";
}

function parseSide(value: string): SidePayload | null {
  if (!value) return null;
  const [type, id] = value.split(":");
  if (type !== "team" && type !== "winner" && type !== "loser") return null;
  return { type, value: Number(id) };
}

function MatchForm({
  initial,
  teams,
  games,
  excludeId,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: MatchFormValue;
  teams: Team[];
  games: Game[];
  excludeId: number | null;
  submitLabel: string;
  onSubmit: (payload: MatchPayload) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<MatchFormValue>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: "", label: t("match.choose") }];
    for (const tm of teams) opts.push({ value: `team:${tm.id}`, label: t("match.team", { name: tm.name }) });
    for (const g of games) {
      if (g.id === excludeId) continue;
      const gl = g.label ?? t("game.gameNum", { id: g.id });
      opts.push({ value: `winner:${g.id}`, label: t("match.winnerOf", { label: gl }) });
      opts.push({ value: `loser:${g.id}`, label: t("match.loserOf", { label: gl }) });
    }
    return opts;
  }, [teams, games, excludeId, t]);

  const submit = async () => {
    const a = parseSide(form.sideA);
    const b = parseSide(form.sideB);
    if (!a || !b) {
      setError(t("match.pickBoth"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        label: form.label.trim() || t("match.default"),
        round: Number(form.round) || 1,
        stage: "bracket",
        sideA: a,
        sideB: b,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="match-form">
      <div className="grid-2">
        <label>
          {t("match.name")}
          <input value={form.label} maxLength={40} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </label>
        <label>
          {t("match.round")}
          <input
            type="number"
            min={1}
            value={form.round}
            onChange={(e) => setForm({ ...form, round: e.target.value })}
          />
        </label>
      </div>
      <label>
        {t("match.sideA")}
        <select value={form.sideA} onChange={(e) => setForm({ ...form, sideA: e.target.value })}>
          {options.map((o) => (
            <option key={`a-${o.value}`} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("match.sideB")}
        <select value={form.sideB} onChange={(e) => setForm({ ...form, sideB: e.target.value })}>
          {options.map((o) => (
            <option key={`b-${o.value}`} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row gap">
        {onCancel && (
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
        )}
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- Game card -------------------------------- */

function GameCard({
  game,
  teams,
  games,
  onChanged,
}: {
  game: Game;
  teams: Team[];
  games: Game[];
  onChanged: () => void;
}) {
  const { isAdmin } = useAdmin();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const init: Record<number, string> = {};
  for (const m of [...game.teamA.members, ...game.teamB.members]) init[m.id] = m.points ? String(m.points) : "0";
  const [points, setPoints] = useState<Record<number, string>>(init);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolved = game.teamA.id !== null && game.teamB.id !== null;

  const sum = (ids: number[]) => ids.reduce((s, id) => s + (Number(points[id]) || 0), 0);
  const scoreA = sum(game.teamA.members.map((m) => m.id));
  const scoreB = sum(game.teamB.members.map((m) => m.id));

  const save = async (status: "scheduled" | "final") => {
    setBusy(true);
    setError(null);
    try {
      const playerPoints: Record<number, number> = {};
      for (const [id, v] of Object.entries(points)) playerPoints[Number(id)] = Number(v) || 0;
      await api.saveResult(game.id, { score_a: scoreA, score_b: scoreB, status, playerPoints });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!confirm(t("game.confirmDelete", { label: game.label ?? t("game.thisMatch") }))) return;
    try {
      await api.deleteMatch(game.id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const winnerA = game.status === "final" && (game.score_a ?? 0) > (game.score_b ?? 0);
  const winnerB = game.status === "final" && (game.score_b ?? 0) > (game.score_a ?? 0);

  if (editing) {
    return (
      <div className="card game-card">
        <div className="game-head">
          <span className="game-label">{t("game.editTitle", { label: game.label ?? t("match.default") })}</span>
        </div>
        <MatchForm
          initial={{
            label: game.label ?? t("match.default"),
            round: String(game.round),
            sideA: sideToValue(game.team_a_id, game.a_source_match_id, game.a_source_result),
            sideB: sideToValue(game.team_b_id, game.b_source_match_id, game.b_source_result),
          }}
          teams={teams}
          games={games}
          excludeId={game.id}
          submitLabel={t("game.saveMatch")}
          onCancel={() => setEditing(false)}
          onSubmit={async (payload) => {
            await api.updateMatch(game.id, payload);
            setEditing(false);
            onChanged();
          }}
        />
      </div>
    );
  }

  return (
    <div className="card game-card">
      <div className="game-head">
        <span className="game-label">{game.label ?? t("game.gameNum", { id: game.id })}</span>
        <span className={`status ${game.status}`}>{game.status === "final" ? t("game.final") : t("game.scheduled")}</span>
      </div>

      <div className="scoreboard">
        <div className={`side ${winnerA ? "winner" : ""} ${game.teamA.placeholder ? "tbd" : ""}`}>
          <div className="side-name">{game.teamA.name}</div>
          <div className="side-score">{game.teamA.placeholder ? "-" : isAdmin && resolved ? scoreA : game.score_a ?? "-"}</div>
        </div>
        <div className="vs">vs</div>
        <div className={`side ${winnerB ? "winner" : ""} ${game.teamB.placeholder ? "tbd" : ""}`}>
          <div className="side-name">{game.teamB.name}</div>
          <div className="side-score">{game.teamB.placeholder ? "-" : isAdmin && resolved ? scoreB : game.score_b ?? "-"}</div>
        </div>
      </div>

      {!resolved && <p className="muted hint">{t("game.waitingTeams")}</p>}

      {isAdmin && resolved && (
        <div className="stat-entry">
          {[game.teamA, game.teamB].map((s) => (
            <div className="entry-team" key={s.id}>
              <div className="muted entry-team-name">{s.name}</div>
              {s.members.map((m) => (
                <label className="entry-row" key={m.id}>
                  <span>{m.name}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={points[m.id]}
                    onChange={(e) => setPoints({ ...points, [m.id]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          ))}
          {error && <p className="error">{error}</p>}
          <div className="row gap">
            <button className="btn" onClick={() => save("scheduled")} disabled={busy}>
              {t("game.saveProgress")}
            </button>
            <button className="btn btn-success" onClick={() => save("final")} disabled={busy}>
              {t("game.saveFinal")}
            </button>
          </div>
        </div>
      )}

      {!isAdmin && resolved && (game.score_a !== null || game.status === "final") && (
        <div className="boxscore">
          {[game.teamA, game.teamB].map((s) => (
            <div className="boxscore-team" key={s.id}>
              <div className="muted">{s.name}</div>
              {s.members.map((m) => (
                <div className="boxscore-row" key={m.id}>
                  <span>{m.name}</span>
                  <span>{m.points}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="row gap sm match-admin">
          <button className="btn btn-ghost sm" onClick={() => setEditing(true)}>
            {t("game.editMatch")}
          </button>
          <button className="btn btn-danger sm" onClick={del}>
            {t("common.delete")}
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Page -------------------------------- */

export default function Dashboard() {
  const { isAdmin } = useAdmin();
  const { currentId } = useTournament();
  const { t } = useI18n();
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState<"rating" | "random">("rating");
  const [repCount, setRepCount] = useState("2");
  const [view, setView] = useState<"list" | "bracket">("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = async () => {
    if (!currentId) return;
    try {
      const [g, tr] = await Promise.all([api.getGames(currentId), api.getTeams(currentId)]);
      setGames(g);
      setTeams(tr.teams);
      setLocked(tr.locked);
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

  const roundRobin = async () => {
    if (!currentId) return;
    if (games.length > 0 && !confirm(t("dash.confirmReplaceRR"))) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.generateRoundRobin(currentId);
      setInfo(t("dash.info.rr", { n: res.gamesCreated }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const knockout = async () => {
    if (!currentId) return;
    if (games.length > 0 && !confirm(t("dash.confirmReplaceKnockout"))) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.generateKnockout(currentId, { seeding });
      setInfo(t("dash.info.knockout", { n: res.gamesCreated }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const repechage = async () => {
    if (!currentId) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.generateRepechage(currentId, { count: Number(repCount) || 2 });
      setInfo(t("dash.info.repechage", { n: res.chosen }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const knockoutInfo = useMemo(() => {
    const ko = games.filter((g) => g.stage === "knockout");
    const hasKnockout = ko.length > 0;
    const hasRepechage = games.some((g) => g.stage === "repechage");
    let round1Complete = false;
    if (hasKnockout) {
      const firstRound = Math.min(...ko.map((g) => g.round));
      const round1 = ko.filter((g) => g.round === firstRound && g.teamA.id !== null && g.teamB.id !== null);
      round1Complete = round1.length > 0 && round1.every((g) => g.status === "final");
    }
    return { hasKnockout, hasRepechage, round1Complete };
  }, [games]);

  const byRound = useMemo(() => {
    const map = new Map<number, Game[]>();
    for (const g of games) {
      const arr = map.get(g.round) ?? [];
      arr.push(g);
      map.set(g.round, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [games]);

  const selectedGame = useMemo(
    () => (selectedId === null ? null : games.find((g) => g.id === selectedId) ?? null),
    [games, selectedId]
  );

  if (!currentId) return <div className="page"><NoTournament /></div>;
  if (loading) return <div className="page">{t("dash.loading")}</div>;

  return (
    <div className="page">
      <h1>{t("dash.title")}</h1>
      {error && <div className="banner error">{error}</div>}
      {info && <div className="banner success">{info}</div>}

      {isAdmin && (
        <div className="card toolbar">
          <button className="btn btn-primary" onClick={roundRobin} disabled={busy || teams.length < 2}>
            {t("dash.autoRR")}
          </button>
          <select
            value={seeding}
            onChange={(e) => setSeeding(e.target.value as "rating" | "random")}
            aria-label={t("dash.seedRating")}
          >
            <option value="rating">{t("dash.seedRating")}</option>
            <option value="random">{t("dash.seedRandom")}</option>
          </select>
          <button className="btn btn-primary" onClick={knockout} disabled={busy || teams.length < 2}>
            {t("dash.generateKnockout")}
          </button>
          <button className="btn" onClick={() => setAdding((v) => !v)} disabled={teams.length < 1}>
            {adding ? t("common.close") : t("dash.addMatch")}
          </button>
          {!locked && <span className="muted">{t("dash.lockTip")}</span>}
        </div>
      )}

      {isAdmin && knockoutInfo.hasKnockout && (
        <div className="card toolbar">
          <span className="entry-team-name">{t("dash.secondChance")}</span>
          <label className="inline-count">
            {t("dash.bestLosers")}
            <input
              type="number"
              min={2}
              value={repCount}
              onChange={(e) => setRepCount(e.target.value)}
              disabled={knockoutInfo.hasRepechage}
            />
          </label>
          <button
            className="btn btn-success"
            onClick={repechage}
            disabled={busy || knockoutInfo.hasRepechage || !knockoutInfo.round1Complete}
          >
            {t("dash.createRepechage")}
          </button>
          {knockoutInfo.hasRepechage ? (
            <span className="muted">{t("dash.repCreated")}</span>
          ) : !knockoutInfo.round1Complete ? (
            <span className="muted">{t("dash.repFinishRound1")}</span>
          ) : (
            <span className="muted">{t("dash.repHint")}</span>
          )}
        </div>
      )}

      {isAdmin && adding && (
        <div className="card">
          <div className="entry-team-name">{t("dash.newMatch")}</div>
          <MatchForm
            initial={{ label: t("match.matchN", { n: games.length + 1 }), round: "1", sideA: "", sideB: "" }}
            teams={teams}
            games={games}
            excludeId={null}
            submitLabel={t("match.addMatch")}
            onSubmit={async (payload) => {
              await api.addMatch(currentId, payload);
              await load();
            }}
          />
        </div>
      )}

      {games.length > 0 && (
        <div className="view-toggle">
          <button
            className={`seg ${view === "list" ? "active" : ""}`}
            onClick={() => setView("list")}
          >
            {t("view.list")}
          </button>
          <button
            className={`seg ${view === "bracket" ? "active" : ""}`}
            onClick={() => setView("bracket")}
          >
            {t("view.flow")}
          </button>
        </div>
      )}

      {games.length === 0 ? (
        <div className="empty">{isAdmin ? t("dash.noGamesAdmin") : t("dash.noGamesUser")}</div>
      ) : view === "bracket" ? (
        <>
          <BracketFlow games={games} selectedId={selectedId} onSelect={setSelectedId} />
          {selectedGame ? (
            <div className="selected-match">
              <h2 className="round-title">{t("dash.selectedMatch")}</h2>
              <GameCard game={selectedGame} teams={teams} games={games} onChanged={load} />
            </div>
          ) : (
            <p className="muted hint">{t("dash.tapToScore")}</p>
          )}
        </>
      ) : (
        byRound.map(([round, list]) => (
          <div key={round}>
            <h2 className="round-title">{t("round.n", { n: round })}</h2>
            <div className="games-list">
              {list.map((g) => (
                <GameCard key={g.id} game={g} teams={teams} games={games} onChanged={load} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
