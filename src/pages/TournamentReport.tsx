import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useTournament } from "../TournamentContext";
import { useI18n } from "../i18n";
import { awardDetail, awardLabel } from "../awardLabels";
import { sideDisplayName } from "../gameLabels";
import { computeDepths, stageBadge } from "../bracketDepth";
import NoTournament from "../components/NoTournament";
import { PlayerName } from "../components/PlayerAvatar";
import type { Game, StatsResponse, Tournament } from "../types";

function formatTournamentMeta(tournament: Tournament | null): string[] {
  if (!tournament) return [];
  return [
    tournament.event_date,
    tournament.location,
    `${tournament.team_size}v${tournament.team_size}`,
  ].filter(Boolean) as string[];
}

function BracketReportSection({ games }: { games: Game[] }) {
  const { t } = useI18n();
  const bracketGames = games.filter((g) => g.stage !== "group");
  if (bracketGames.length === 0) return null;

  const depth = computeDepths(bracketGames);
  const cols = new Map<number, Game[]>();
  for (const g of bracketGames) {
    const d = depth.get(g.id) ?? 0;
    const arr = cols.get(d) ?? [];
    arr.push(g);
    cols.set(d, arr);
  }
  const columns = [...cols.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, list]) => [d, [...list].sort((x, y) => x.round - y.round || x.id - y.id)] as const);

  return (
    <>
      <h2>{t("report.bracket")}</h2>
      <div className="bracket-report">
        {columns.map(([d, list]) => (
          <div className="bracket-report-round" key={d}>
            <h3>{t("round.n", { n: d + 1 })}</h3>
            {list.map((g) => {
              const winnerA = g.status === "final" && (g.score_a ?? 0) > (g.score_b ?? 0);
              const winnerB = g.status === "final" && (g.score_b ?? 0) > (g.score_a ?? 0);
              const badge = stageBadge(g.stage, t);
              return (
                <div className="bracket-report-game" key={g.id}>
                  <div className={`bracket-report-side ${winnerA ? "win" : ""}`}>
                    <span>{sideDisplayName(g, "A", games, t)}</span>
                    <span>{g.teamA.placeholder ? "" : g.score_a ?? ""}</span>
                  </div>
                  <span className="muted tiny">{badge ?? (g.label ?? t("game.gameNum", { id: g.id }))}</span>
                  <div className={`bracket-report-side ${winnerB ? "win" : ""}`}>
                    <span>{sideDisplayName(g, "B", games, t)}</span>
                    <span>{g.teamB.placeholder ? "" : g.score_b ?? ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

export default function TournamentReport() {
  const { currentId, current } = useTournament();
  const { t, lang } = useI18n();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!currentId) return;
    Promise.all([api.getStats(currentId), api.getGames(currentId)])
      .then(([s, g]) => {
        setStats(s);
        setGames(g);
        setError(null);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [currentId]);

  useEffect(() => {
    if (!currentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [currentId, load]);

  if (!currentId) return <div className="page"><NoTournament /></div>;
  if (loading) return <div className="page">{t("stats.loading")}</div>;
  if (error && !stats) return <div className="page"><div className="banner error">{error}</div></div>;
  if (!stats) return null;

  const { standings, players, highlights } = stats;
  const hasGames = highlights.totalGamesPlayed > 0;
  const tournamentDone = games.length > 0 && games.every((g) => g.status === "final");
  const champion = tournamentDone && standings.length > 0 ? standings[0] : null;
  const meta = formatTournamentMeta(current);
  const generatedOn = new Date().toLocaleDateString(lang);

  return (
    <div className="page report-page">
      <div className="report-actions no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>
          {t("report.print")}
        </button>
      </div>

      <h1>{current?.name ?? t("report.title")}</h1>
      {meta.length > 0 && <p className="muted report-meta">{meta.join(" · ")}</p>}
      <p className="muted tiny">{t("report.generatedOn", { date: generatedOn })}</p>

      {champion && (
        <div className="champion-banner">
          <span className="champion-trophy" aria-hidden>🏆</span>
          {t("stats.champion", { name: champion.name })}
        </div>
      )}

      {hasGames && (
        <div className="highlights">
          <div className="card highlight">
            <div className="muted">{t("stats.topScorer")}</div>
            <div className="big">
              {highlights.topScorer ? (
                <PlayerName
                  id={highlights.topScorer.playerId}
                  name={highlights.topScorer.name}
                  hasPhoto={highlights.topScorer.has_photo}
                />
              ) : (
                "-"
              )}
            </div>
            <div className="muted">{highlights.topScorer ? t("stats.pts", { n: highlights.topScorer.totalPoints }) : ""}</div>
          </div>
          <div className="card highlight">
            <div className="muted">{t("stats.leadingTeam")}</div>
            <div className="big">{highlights.bestTeam?.name ?? "-"}</div>
            <div className="muted">
              {highlights.bestTeam
                ? t("stats.recordFull", {
                    w: highlights.bestTeam.wins,
                    l: highlights.bestTeam.losses,
                    tie: highlights.bestTeam.ties,
                  })
                : ""}
            </div>
          </div>
          <div className="card highlight">
            <div className="muted">{t("stats.gamesPlayed")}</div>
            <div className="big">{highlights.totalGamesPlayed}</div>
            <div className="muted">{t("stats.totalPts", { n: highlights.totalPointsScored })}</div>
          </div>
        </div>
      )}

      {highlights.awards.length > 0 && (
        <>
          <h2>{t("stats.awards")}</h2>
          <div className="awards-grid">
            {highlights.awards.map((a) => (
              <div className="card award-card" key={a.key}>
                <div className="muted sm">{awardLabel(t, a.key)}</div>
                <div className="award-name">
                  {a.playerId ? (
                    <PlayerName id={a.playerId} name={a.playerName ?? "-"} hasPhoto={0} />
                  ) : (
                    a.teamName ?? "-"
                  )}
                </div>
                <div className="muted tiny">{awardDetail(t, a)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {stats.groups.length > 0 && (
        <>
          <h2>{t("stats.groupStage")}</h2>
          <div className="groups-grid">
            {stats.groups.map((g) => (
              <div className="card group-card" key={g.name}>
                <div className="group-title">{t("stats.group", { name: g.name })}</div>
                <div className="table-wrap">
                  <table className="table group-table">
                    <thead>
                      <tr>
                        <th className="left">{t("stats.h.team")}</th>
                        <th>{t("stats.h.played")}</th>
                        <th>{t("stats.h.wins")}</th>
                        <th>{t("stats.h.losses")}</th>
                        <th>{t("stats.h.diff")}</th>
                        <th>{t("stats.h.pts")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.standings.map((s, i) => (
                        <tr key={s.teamId}>
                          <td className="left">
                            <span className={`rank${i < 3 ? ` rank-${i + 1}` : ""}`}>{i + 1}</span>
                            <span className="team-name-cell">{s.name}</span>
                          </td>
                          <td>{s.played}</td>
                          <td>{s.wins}</td>
                          <td>{s.losses}</td>
                          <td className={s.diff > 0 ? "pos" : s.diff < 0 ? "neg" : ""}>
                            {s.diff > 0 ? `+${s.diff}` : s.diff}
                          </td>
                          <td>
                            <strong>{s.points}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {standings.length > 0 && (
        <>
          <h2>{t("stats.teamStandings")}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="left">{t("stats.h.team")}</th>
                  <th>{t("stats.h.played")}</th>
                  <th>{t("stats.h.wins")}</th>
                  <th>{t("stats.h.losses")}</th>
                  <th>{t("stats.h.ties")}</th>
                  <th>{t("stats.h.pf")}</th>
                  <th>{t("stats.h.pa")}</th>
                  <th>{t("stats.h.diff")}</th>
                  <th>{t("stats.h.pts")}</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr key={s.teamId}>
                    <td className="left">
                      <span className={`rank${i < 3 ? ` rank-${i + 1}` : ""}`}>{i + 1}</span>
                      <div>
                        <div className="team-name-cell">{s.name}</div>
                        <div className="muted tiny member-names">
                          {s.members.map((m, mi) => (
                            <span key={m.id} className="member-name-item">
                              {mi > 0 && " · "}
                              <PlayerName id={m.id} name={m.name} hasPhoto={m.has_photo} size="sm" />
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td>{s.played}</td>
                    <td>{s.wins}</td>
                    <td>{s.losses}</td>
                    <td>{s.ties}</td>
                    <td>{s.pointsFor}</td>
                    <td>{s.pointsAgainst}</td>
                    <td className={s.diff > 0 ? "pos" : s.diff < 0 ? "neg" : ""}>
                      {s.diff > 0 ? `+${s.diff}` : s.diff}
                    </td>
                    <td>
                      <strong>{s.points}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <BracketReportSection games={games} />

      {players.length > 0 && (
        <>
          <h2>{t("stats.playerLeaderboard")}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="left">{t("stats.h.player")}</th>
                  <th>{t("stats.h.gp")}</th>
                  <th>{t("stats.h.pts")}</th>
                  <th>{t("stats.h.ppg")}</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.playerId}>
                    <td className="left">
                      <span className={`rank${i < 3 ? ` rank-${i + 1}` : ""}`}>{i + 1}</span>
                      <div>
                        <PlayerName id={p.playerId} name={p.name} hasPhoto={p.has_photo} />
                        <div className="muted tiny">{p.teamName ?? ""}</div>
                      </div>
                    </td>
                    <td>{p.gamesPlayed}</td>
                    <td>
                      <strong>{p.totalPoints}</strong>
                    </td>
                    <td>{p.pointsPerGame}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
