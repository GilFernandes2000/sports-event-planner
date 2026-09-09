import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useTournament } from "../TournamentContext";
import { useI18n } from "../i18n";
import { awardDetail, awardLabel } from "../awardLabels";
import { sideDisplayName } from "../gameLabels";
import { computeDepths, stageBadge } from "../bracketDepth";
import NoTournament from "../components/NoTournament";
import { PlayerName } from "../components/PlayerAvatar";
import type { Game, StatsResponse, TeamStanding } from "../types";

const AWARD_ICONS: Record<string, string> = {
  mvp: "⭐",
  bestShooter: "🎯",
  leadingTeam: "🛡️",
  clutchWin: "🔥",
  shootout: "💥",
};

function awardIcon(key: string): string {
  return AWARD_ICONS[key] ?? "🏅";
}

function rankClass(i: number): string {
  return i < 3 ? ` rpt-rank-${i + 1}` : "";
}

function PodiumSlot({ place, standing }: { place: 1 | 2 | 3; standing: TeamStanding }) {
  const { t } = useI18n();
  const slotClass = place === 1 ? "first" : place === 2 ? "second" : "third";
  return (
    <div className={`rpt-podium-slot ${slotClass}`}>
      {place === 1 && (
        <span className="rpt-podium-trophy" aria-hidden>
          🏆
        </span>
      )}
      <div className="rpt-podium-name">{standing.name}</div>
      <div className="rpt-podium-block">{place}</div>
      <div className="rpt-podium-record">{t("stats.recordFull", { w: standing.wins, l: standing.losses, tie: standing.ties })}</div>
    </div>
  );
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
      <div className="rpt-section-title">
        <span aria-hidden>🏀</span> {t("report.bracket")}
      </div>
      <div className="rpt-bracket">
        {columns.map(([d, list]) => (
          <div key={d}>
            <div className="rpt-bracket-round-title">{t("round.n", { n: d + 1 })}</div>
            {list.map((g) => {
              const winnerA = g.status === "final" && (g.score_a ?? 0) > (g.score_b ?? 0);
              const winnerB = g.status === "final" && (g.score_b ?? 0) > (g.score_a ?? 0);
              const badge = stageBadge(g.stage, t);
              return (
                <div className="rpt-match" key={g.id}>
                  <div className="rpt-match-label">{badge ?? (g.label ?? t("game.gameNum", { id: g.id }))}</div>
                  <div className={`rpt-match-row ${winnerA ? "win" : ""}`}>
                    <span>{sideDisplayName(g, "A", games, t)}</span>
                    <span className="rpt-match-score">{g.teamA.placeholder ? "" : g.score_a ?? ""}</span>
                  </div>
                  <div className={`rpt-match-row ${winnerB ? "win" : ""}`}>
                    <span>{sideDisplayName(g, "B", games, t)}</span>
                    <span className="rpt-match-score">{g.teamB.placeholder ? "" : g.score_b ?? ""}</span>
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
  const [mode, setMode] = useState<"print" | "color">("print");

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
  const generatedOn = new Date().toLocaleDateString(lang);
  const maxPoints = players[0]?.totalPoints ?? 0;

  return (
    <div className={`page report-page ${mode === "color" ? "report-color" : ""}`}>
      <div className="report-actions no-print">
        <div className="view-toggle">
          <button className={`seg ${mode === "print" ? "active" : ""}`} onClick={() => setMode("print")}>
            {t("report.modePrint")}
          </button>
          <button className={`seg ${mode === "color" ? "active" : ""}`} onClick={() => setMode("color")}>
            {t("report.modeColor")}
          </button>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>
          {t("report.print")}
        </button>
      </div>

      <div className="rpt-hero">
        <span className="rpt-hero-ball" aria-hidden>🏀</span>
        <h1>{current?.name ?? t("report.title")}</h1>
        <div className="rpt-hero-meta">
          {current?.event_date && <span className="rpt-hero-pill">📅 {current.event_date}</span>}
          {current?.location && <span className="rpt-hero-pill">📍 {current.location}</span>}
          {current && (
            <span className="rpt-hero-pill">
              🤝 {current.team_size}v{current.team_size}
            </span>
          )}
        </div>
        <p className="muted tiny rpt-hero-generated">{t("report.generatedOn", { date: generatedOn })}</p>
      </div>

      {champion && (
        <div className="rpt-podium-wrap">
          <div className="rpt-podium-caption">{t("stats.champion", { name: champion.name })}</div>
          <div className="rpt-podium">
            <PodiumSlot place={1} standing={standings[0]} />
            {standings[1] && <PodiumSlot place={2} standing={standings[1]} />}
            {standings[2] && <PodiumSlot place={3} standing={standings[2]} />}
          </div>
        </div>
      )}

      {hasGames && (
        <div className="rpt-stats">
          <div className="rpt-panel rpt-stat-tile">
            <div className="rpt-stat-icon" aria-hidden>🎯</div>
            <div className="muted tiny">{t("stats.topScorer")}</div>
            <div className="rpt-stat-value">
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
            <div className="muted tiny">{highlights.topScorer ? t("stats.pts", { n: highlights.topScorer.totalPoints }) : ""}</div>
          </div>
          <div className="rpt-panel rpt-stat-tile">
            <div className="rpt-stat-icon" aria-hidden>🛡️</div>
            <div className="muted tiny">{t("stats.leadingTeam")}</div>
            <div className="rpt-stat-value">{highlights.bestTeam?.name ?? "-"}</div>
            <div className="muted tiny">
              {highlights.bestTeam
                ? t("stats.recordFull", {
                    w: highlights.bestTeam.wins,
                    l: highlights.bestTeam.losses,
                    tie: highlights.bestTeam.ties,
                  })
                : ""}
            </div>
          </div>
          <div className="rpt-panel rpt-stat-tile">
            <div className="rpt-stat-icon" aria-hidden>🏀</div>
            <div className="muted tiny">{t("stats.gamesPlayed")}</div>
            <div className="rpt-stat-value">{highlights.totalGamesPlayed}</div>
            <div className="muted tiny">{t("stats.totalPts", { n: highlights.totalPointsScored })}</div>
          </div>
        </div>
      )}

      {highlights.awards.length > 0 && (
        <>
          <div className="rpt-section-title">
            <span aria-hidden>🏅</span> {t("stats.awards")}
          </div>
          <div className="rpt-awards">
            {highlights.awards.map((a) => (
              <div className="rpt-panel rpt-award" key={a.key}>
                <span className="rpt-award-icon" aria-hidden>{awardIcon(a.key)}</span>
                <div>
                  <div className="muted tiny">{awardLabel(t, a.key)}</div>
                  <div className="rpt-award-name">
                    {a.playerId ? (
                      <PlayerName id={a.playerId} name={a.playerName ?? "-"} hasPhoto={0} />
                    ) : (
                      a.teamName ?? "-"
                    )}
                  </div>
                  <div className="muted tiny">{awardDetail(t, a)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {stats.groups.length > 0 && (
        <>
          <div className="rpt-section-title">
            <span aria-hidden>👥</span> {t("stats.groupStage")}
          </div>
          <div className="rpt-groups">
            {stats.groups.map((g) => (
              <div className="rpt-panel rpt-group" key={g.name}>
                <div className="rpt-group-title">{t("stats.group", { name: g.name })}</div>
                <div className="rpt-table-wrap">
                  <table className="rpt-table">
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
                            <div className="rpt-table-team">
                              <span className={`rpt-rank${rankClass(i)}`}>{i + 1}</span>
                              <span>{s.name}</span>
                            </div>
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
          <div className="rpt-section-title">
            <span aria-hidden>📊</span> {t("stats.teamStandings")}
          </div>
          <div className="rpt-panel rpt-table-wrap">
            <table className="rpt-table">
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
                      <div className="rpt-table-team">
                        <span className={`rpt-rank${rankClass(i)}`}>{i + 1}</span>
                        <div>
                          <div>{s.name}</div>
                          <div className="muted tiny member-names">
                            {s.members.map((m, mi) => (
                              <span key={m.id} className="member-name-item">
                                {mi > 0 && " · "}
                                <PlayerName id={m.id} name={m.name} hasPhoto={m.has_photo} size="sm" />
                              </span>
                            ))}
                          </div>
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
          <div className="rpt-section-title">
            <span aria-hidden>🔥</span> {t("stats.playerLeaderboard")}
          </div>
          <div className="rpt-panel rpt-table-wrap">
            <table className="rpt-table">
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
                      <div className="rpt-table-team">
                        <span className={`rpt-rank${rankClass(i)}`}>{i + 1}</span>
                        <div>
                          <PlayerName id={p.playerId} name={p.name} hasPhoto={p.has_photo} />
                          <div className="muted tiny">{p.teamName ?? ""}</div>
                        </div>
                      </div>
                    </td>
                    <td>{p.gamesPlayed}</td>
                    <td>
                      <div>
                        <strong>{p.totalPoints}</strong>
                        <div className="rpt-bar-track">
                          <div
                            className="rpt-bar-fill"
                            style={{ width: `${maxPoints > 0 ? (p.totalPoints / maxPoints) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>{p.pointsPerGame}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="rpt-footer muted tiny">🏀 {t("footer")}</p>
    </div>
  );
}
