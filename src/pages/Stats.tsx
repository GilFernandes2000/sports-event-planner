import { useEffect, useState } from "react";
import { api } from "../api";
import { useTournament } from "../TournamentContext";
import { useI18n } from "../i18n";
import NoTournament from "../components/NoTournament";
import type { StatsResponse } from "../types";

export default function Stats() {
  const { currentId, current } = useTournament();
  const { t } = useI18n();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .getStats(currentId)
      .then(setStats)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [currentId]);

  if (!currentId) return <div className="page"><NoTournament /></div>;
  if (loading) return <div className="page">{t("stats.loading")}</div>;
  if (error) return <div className="page"><div className="banner error">{error}</div></div>;
  if (!stats) return null;

  const { standings, players, highlights } = stats;
  const hasGames = highlights.totalGamesPlayed > 0;

  return (
    <div className="page">
      <h1>{current?.name ?? t("nav.standings")}</h1>

      {!hasGames && standings.length === 0 && (
        <div className="empty">{t("stats.emptyNothing")}</div>
      )}

      {hasGames && (
        <div className="highlights">
          <div className="card highlight">
            <div className="muted">{t("stats.topScorer")}</div>
            <div className="big">{highlights.topScorer?.name ?? "-"}</div>
            <div className="muted">{highlights.topScorer ? t("stats.pts", { n: highlights.topScorer.totalPoints }) : ""}</div>
          </div>
          <div className="card highlight">
            <div className="muted">{t("stats.leadingTeam")}</div>
            <div className="big">{highlights.bestTeam?.name ?? "-"}</div>
            <div className="muted">{highlights.bestTeam ? t("stats.record", { w: highlights.bestTeam.wins, l: highlights.bestTeam.losses }) : ""}</div>
          </div>
          <div className="card highlight">
            <div className="muted">{t("stats.gamesPlayed")}</div>
            <div className="big">{highlights.totalGamesPlayed}</div>
            <div className="muted">{t("stats.totalPts", { n: highlights.totalPointsScored })}</div>
          </div>
        </div>
      )}

      {standings.length > 0 && (
        <>
          <h2>{t("stats.teamStandings")}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="left">{t("stats.h.team")}</th>
                  <th>P</th>
                  <th>W</th>
                  <th>L</th>
                  <th>PF</th>
                  <th>PA</th>
                  <th>Diff</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr key={s.teamId}>
                    <td className="left">
                      <span className="rank">{i + 1}</span>
                      <div>
                        <div className="team-name-cell">{s.name}</div>
                        <div className="muted tiny">{s.members.map((m) => m.name).join(" & ")}</div>
                      </div>
                    </td>
                    <td>{s.played}</td>
                    <td>{s.wins}</td>
                    <td>{s.losses}</td>
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

      {players.length > 0 && (
        <>
          <h2>{t("stats.playerLeaderboard")}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="left">{t("stats.h.player")}</th>
                  <th>GP</th>
                  <th>Pts</th>
                  <th>PPG</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.playerId}>
                    <td className="left">
                      <span className="rank">{i + 1}</span>
                      <div>
                        <div className="team-name-cell">{p.name}</div>
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
