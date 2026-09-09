import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Game } from "../types";
import { useI18n } from "../i18n";
import { sideDisplayName } from "../gameLabels";
import { computeDepths, stageBadge } from "../bracketDepth";

interface Connector {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "winner" | "loser";
  live: boolean;
}

export default function BracketFlow({
  games,
  selectedId,
  onSelect,
}: {
  games: Game[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<number, HTMLButtonElement>());
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const columns = useMemo(() => {
    const depth = computeDepths(games);
    const cols = new Map<number, Game[]>();
    for (const g of games) {
      const d = depth.get(g.id) ?? 0;
      const arr = cols.get(d) ?? [];
      arr.push(g);
      cols.set(d, arr);
    }
    return [...cols.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([d, list]) => [d, [...list].sort((x, y) => x.round - y.round || x.id - y.id)] as const);
  }, [games]);

  const recompute = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const base = wrap.getBoundingClientRect();
    // Offsets so coordinates are in the (scrolling) content space the SVG lives in.
    const ox = wrap.scrollLeft - base.left;
    const oy = wrap.scrollTop - base.top;
    const next: Connector[] = [];
    for (const g of games) {
      const target = nodeRefs.current.get(g.id);
      if (!target) continue;
      const tr = target.getBoundingClientRect();
      const links: { src: number | null; kind: "winner" | "loser" }[] = [
        { src: g.a_source_match_id, kind: g.a_source_result ?? "winner" },
        { src: g.b_source_match_id, kind: g.b_source_result ?? "winner" },
      ];
      for (const { src, kind } of links) {
        if (src === null) continue;
        const source = nodeRefs.current.get(src);
        if (!source) continue;
        const sr = source.getBoundingClientRect();
        const srcGame = games.find((x) => x.id === src);
        const live = srcGame?.status === "final";
        next.push({
          id: `${src}->${g.id}-${kind}`,
          x1: sr.right + ox,
          y1: sr.top + oy + sr.height / 2,
          x2: tr.left + ox,
          y2: tr.top + oy + tr.height / 2,
          kind,
          live,
        });
      }
    }
    setConnectors(next);
    setSize({ w: wrap.scrollWidth, h: wrap.scrollHeight });
  }, [games]);

  useLayoutEffect(() => {
    recompute();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(wrap);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [recompute]);

  return (
    <div className="bracket-wrap" ref={wrapRef}>
      <svg className="bracket-links" width={size.w} height={size.h}>
        {connectors.map((c) => {
          const dx = Math.max(24, (c.x2 - c.x1) / 2);
          return (
            <path
              key={c.id}
              d={`M ${c.x1} ${c.y1} C ${c.x1 + dx} ${c.y1}, ${c.x2 - dx} ${c.y2}, ${c.x2} ${c.y2}`}
              className={`bracket-link ${c.kind} ${c.live ? "live" : ""}`}
              fill="none"
            />
          );
        })}
      </svg>

      <div className="bracket-cols">
        {columns.map(([d, list]) => (
          <div className="bracket-col" key={d}>
            <div className="bracket-col-title">{t("round.n", { n: d + 1 })}</div>
            {list.map((g) => {
              const winnerA = g.status === "final" && (g.score_a ?? 0) > (g.score_b ?? 0);
              const winnerB = g.status === "final" && (g.score_b ?? 0) > (g.score_a ?? 0);
              const badge = stageBadge(g.stage, t);
              return (
                <button
                  type="button"
                  key={g.id}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(g.id, el);
                    else nodeRefs.current.delete(g.id);
                  }}
                  className={`bnode ${selectedId === g.id ? "selected" : ""} ${g.status === "final" ? "done" : ""}`}
                  onClick={() => onSelect(g.id)}
                >
                  <div className="bnode-head">
                    <span className="bnode-label">{g.label ?? t("game.gameNum", { id: g.id })}</span>
                    {badge && <span className="bnode-stage">{badge}</span>}
                  </div>
                  <div className={`brow ${winnerA ? "win" : ""} ${g.teamA.placeholder ? "tbd" : ""}`}>
                    <span className="bteam">{sideDisplayName(g, "A", games, t)}</span>
                    <span className="bscore">{g.teamA.placeholder ? "" : g.score_a ?? ""}</span>
                  </div>
                  <div className={`brow ${winnerB ? "win" : ""} ${g.teamB.placeholder ? "tbd" : ""}`}>
                    <span className="bteam">{sideDisplayName(g, "B", games, t)}</span>
                    <span className="bscore">{g.teamB.placeholder ? "" : g.score_b ?? ""}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
