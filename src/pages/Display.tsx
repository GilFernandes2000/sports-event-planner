import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useI18n, LanguageSwitcher } from "../i18n";
import { awardDetail, awardLabel } from "../awardLabels";
import { sideDisplayName } from "../gameLabels";
import { usePolling } from "../usePolling";
import type { PublicTournamentResponse } from "../types";

const POLL_MS = 10_000;

function formatPreset(key: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    standard: t("display.presetStandard"),
    first_to_21: t("display.presetFirst21"),
    kids: t("display.presetKids"),
    round_robin: t("display.formatRoundRobin"),
    knockout: t("display.formatKnockout"),
    group_playoff: t("display.formatGroupPlayoff"),
  };
  return map[key] ?? key;
}

export default function Display() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useI18n();
  const [data, setData] = useState<PublicTournamentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const load = useCallback(() => {
    if (!slug) return;
    api
      .getPublicTournament(slug)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError((err as Error).message));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  usePolling(load, POLL_MS, !!slug);

  if (error) {
    return (
      <div className="display-page">
        <div className="display-error">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="display-page">
        <div className="display-loading">{t("display.loading")}</div>
      </div>
    );
  }

  const { tournament, stats, games } = data;
  const { standings, highlights } = stats;
  const liveGames = games.filter(
    (g) => g.status === "scheduled" && (g.score_a !== null || g.score_b !== null)
  );
  const liveIds = new Set(liveGames.map((g) => g.id));
  const nextGame =
    games.find(
      (g) => g.status === "scheduled" && !liveIds.has(g.id) && g.teamA.id !== null && g.teamB.id !== null
    ) ??
    games.find((g) => g.status === "scheduled" && !liveIds.has(g.id)) ??
    null;
  const meta = [
    tournament.event_date,
    tournament.location,
    `${tournament.team_size}v${tournament.team_size}`,
    `${tournament.game_duration_min} min`,
    formatPreset(tournament.scoring_preset, t),
  ].filter(Boolean);

  return (
    <div className="display-page">
      <header className="display-header">
        <div>
          <div className="display-title">
            <span className="ball" aria-hidden>
              🏀
            </span>
            {tournament.name}
          </div>
          {meta.length > 0 && <div className="display-meta">{meta.join(" · ")}</div>}
        </div>
        <div className="display-header-right">
          <LanguageSwitcher className="lang-pick display-lang" />
          <div className="display-clock">{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      </header>

      <div className="display-grid">
        {liveGames.map((g) => (
          <section className="display-panel display-live" key={g.id}>
            <h2>
              <span className="live-dot" aria-hidden />
              {t("display.liveNow")}
              {g.label ? ` · ${g.label}` : ""}
            </h2>
            <div className="display-live-score">
              <div className="display-live-team">
                <div className="display-live-name">{g.teamA.name}</div>
                <div className="display-live-points">{g.score_a ?? 0}</div>
              </div>
              <span className="display-vs">{t("common.vs")}</span>
              <div className="display-live-team">
                <div className="display-live-name">{g.teamB.name}</div>
                <div className="display-live-points">{g.score_b ?? 0}</div>
              </div>
            </div>
            <div className="display-live-players">
              {[g.teamA, g.teamB].map((side) => (
                <div className="display-live-side" key={side.id}>
                  {side.members.map((m) => (
                    <div className="display-live-player" key={m.id}>
                      <span>{m.name}</span>
                      <strong>{m.points ?? 0}</strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}

        {nextGame && (
          <section className="display-panel display-next">
            <h2>{t("display.nextGame")}</h2>
            <div className="display-matchup">
              <span>{sideDisplayName(nextGame, "A", games, t)}</span>
              <span className="display-vs">{t("common.vs")}</span>
              <span>{sideDisplayName(nextGame, "B", games, t)}</span>
            </div>
            {nextGame.label && <div className="display-label muted">{nextGame.label}</div>}
          </section>
        )}

        {standings.length > 0 && (
          <section className="display-panel">
            <h2>{t("display.standings")}</h2>
            <table className="display-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="left">{t("stats.h.team")}</th>
                  <th>{t("stats.h.wins")}</th>
                  <th>{t("stats.h.losses")}</th>
                  <th>{t("stats.h.ties")}</th>
                  <th>{t("stats.h.pts")}</th>
                </tr>
              </thead>
              <tbody>
                {standings.slice(0, 8).map((s, i) => (
                  <tr key={s.teamId}>
                    <td>
                      <span className={`rank${i < 3 ? ` rank-${i + 1}` : ""}`}>{i + 1}</span>
                    </td>
                    <td className="left">{s.name}</td>
                    <td>{s.wins}</td>
                    <td>{s.losses}</td>
                    <td>{s.ties}</td>
                    <td>
                      <strong>{s.points}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {highlights.awards.length > 0 && (
          <section className="display-panel">
            <h2>{t("display.awards")}</h2>
            <div className="display-awards">
              {highlights.awards.slice(0, 6).map((a) => (
                <div className="display-award" key={a.key}>
                  <div className="display-award-label">{awardLabel(t, a.key)}</div>
                  <div className="display-award-name">{a.playerName ?? a.teamName ?? "-"}</div>
                  <div className="display-award-detail muted">{awardDetail(t, a)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {highlights.totalGamesPlayed === 0 && standings.length === 0 && (
          <section className="display-panel display-empty">
            <p>{t("display.empty")}</p>
          </section>
        )}
      </div>

      <footer className="display-footer muted">{t("display.footer")}</footer>
    </div>
  );
}
