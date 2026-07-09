import { type CSSProperties, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAdmin } from "../AdminContext";
import { useTournament } from "../TournamentContext";
import { useI18n } from "../i18n";
import { awardDetail, awardLabel } from "../awardLabels";
import { sideDisplayName } from "../gameLabels";
import NoTournament from "../components/NoTournament";
import { PlayerName } from "../components/PlayerAvatar";
import type { Game, StatsResponse, Tournament } from "../types";

const POLL_MS = 10_000;

function formatTournamentMeta(tournament: Tournament | null): string[] {
  if (!tournament) return [];
  return [
    tournament.event_date,
    tournament.location,
    `${tournament.team_size}v${tournament.team_size}`,
    `${tournament.game_duration_min} min`,
  ].filter(Boolean) as string[];
}

function GameDayPanel({
  current,
  stats,
  games,
  displayUrl,
  isAdmin,
}: {
  current: Tournament | null;
  stats: StatsResponse;
  games: Game[];
  displayUrl: string | null;
  isAdmin: boolean;
}) {
  const { t } = useI18n();
  const completed = stats.highlights.totalGamesPlayed;
  const total = games.length;
  const remaining = Math.max(total - completed, 0);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const liveGame = games.find((g) => g.status === "scheduled" && (g.score_a !== null || g.score_b !== null));
  const nextGame =
    liveGame ??
    games.find((g) => g.status !== "final" && g.teamA.id !== null && g.teamB.id !== null) ??
    games.find((g) => g.status !== "final") ??
    null;
  const minPlayers = (current?.team_size ?? 2) * 2;
  const playerCount = current?.counts.players ?? 0;
  const teamCount = current?.counts.teams ?? 0;

  let status = t("gameday.status.finished");
  let actionTo = "/standings";
  let actionLabel = t("nav.standings");
  if (playerCount < minPlayers) {
    status = t("gameday.status.roster", { n: playerCount, min: minPlayers });
    actionTo = "/enroll";
    actionLabel = t("nav.enroll");
  } else if (teamCount < 2) {
    status = t("gameday.status.teams");
    actionTo = "/teams";
    actionLabel = t("nav.teams");
  } else if (total === 0) {
    status = t("gameday.status.schedule");
    actionTo = "/games";
    actionLabel = t("nav.games");
  } else if (remaining > 0) {
    status = t("gameday.status.play", { n: remaining });
    actionTo = "/games";
    actionLabel = t("nav.games");
  }

  const meta = formatTournamentMeta(current);
  const nextLabel = nextGame ? nextGame.label ?? t("game.gameNum", { id: nextGame.id }) : t("gameday.noNext");

  return (
    <section className="gameday-panel">
      <div className="gameday-hero">
        <div>
          <div className="eyebrow">{t("gameday.kicker")}</div>
          <h2>{status}</h2>
          {meta.length > 0 && <p className="muted">{meta.join(" · ")}</p>}
        </div>
        <div
          className="progress-ring"
          style={{ "--progress": `${progress}%` } as CSSProperties}
          aria-label={t("gameday.progress", { n: progress })}
        >
          <span>{progress}%</span>
        </div>
      </div>

      <div className="gameday-strip">
        <div>
          <span className="metric-label">{t("gameday.players")}</span>
          <strong>{playerCount}</strong>
        </div>
        <div>
          <span className="metric-label">{t("gameday.teams")}</span>
          <strong>{teamCount}</strong>
        </div>
        <div>
          <span className="metric-label">{t("gameday.games")}</span>
          <strong>
            {completed}/{total}
          </strong>
        </div>
      </div>

      <div className="next-match">
        <div>
          <span className="metric-label">{liveGame ? t("gameday.live") : t("display.nextGame")}</span>
          <strong>{nextLabel}</strong>
          {nextGame && (
            <p className="muted sm">
              {sideDisplayName(nextGame, "A", games, t)} {t("common.vs")} {sideDisplayName(nextGame, "B", games, t)}
            </p>
          )}
        </div>
        <div className="quick-actions">
          <Link className="btn btn-primary sm" to={actionTo}>
            {actionLabel}
          </Link>
          {isAdmin && (
            <Link className="btn sm" to="/teams">
              {t("nav.teams")}
            </Link>
          )}
          {displayUrl && (
            <a className="btn btn-ghost sm" href={displayUrl} target="_blank" rel="noreferrer">
              {t("tournaments.openDisplay")}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Stats() {
  const { currentId, current } = useTournament();
  const { isAdmin } = useAdmin();
  const { t } = useI18n();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = () =>
      Promise.all([api.getStats(currentId), api.getGames(currentId)])
        .then(([s, g]) => {
          if (!cancelled) {
            setStats(s);
            setGames(g);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setError((err as Error).message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    load();
    const poll = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [currentId]);

  if (!currentId) return <div className="page"><NoTournament /></div>;
  if (loading && !stats) return <div className="page">{t("stats.loading")}</div>;
  if (error && !stats) return <div className="page"><div className="banner error">{error}</div></div>;
  if (!stats) return null;

  const { standings, players, highlights } = stats;
  const hasGames = highlights.totalGamesPlayed > 0;
  const displayUrl =
    current?.share_slug ? `${window.location.origin}/display/${current.share_slug}` : null;

  return (
    <div className="page">
      <h1>{current?.name ?? t("nav.standings")}</h1>
      {displayUrl && (
        <p className="muted sm">
          {t("stats.publicView")}{" "}
          <a href={displayUrl} target="_blank" rel="noreferrer">
            {t("stats.openDisplay")}
          </a>
        </p>
      )}

      <GameDayPanel current={current} stats={stats} games={games} displayUrl={displayUrl} isAdmin={isAdmin} />

      {!hasGames && standings.length === 0 && (
        <div className="empty">{t("stats.emptyNothing")}</div>
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
                      <span className="rank">{i + 1}</span>
                      <div>
                        <div className="team-name-cell">{s.name}</div>
                        <div className="muted tiny member-names">
                          {s.members.map((m, i) => (
                            <span key={m.id} className="member-name-item">
                              {i > 0 && " · "}
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
                      <span className="rank">{i + 1}</span>
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
