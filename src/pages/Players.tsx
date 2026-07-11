import { useEffect, useState } from "react";
import { api } from "../api";
import { useAdmin } from "../AdminContext";
import { useI18n } from "../i18n";
import PlayerModal from "../components/PlayerModal";
import { PlayerName } from "../components/PlayerAvatar";
import { useConfirm } from "../components/ConfirmDialog";
import type { Player } from "../types";

export default function Players() {
  const { isAdmin } = useAdmin();
  const { t } = useI18n();
  const confirm = useConfirm();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Player | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setPlayers(await api.getPlayers());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (p: Player) => {
    const ok = await confirm({
      message: t("players.confirmRemove", { name: p.name }),
      confirmLabel: t("common.remove"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deletePlayer(p.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) return <div className="page">{t("players.loading")}</div>;

  return (
    <div className="page">
      <div className="row between center">
        <h1>{t("players.title")}</h1>
        <span className="pill">{t("players.inDirectory", { n: players.length })}</span>
      </div>
      <p className="muted">{t("players.intro")}</p>
      {error && <div className="banner error">{error}</div>}

      {isAdmin && (
        <div className="card toolbar">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            {t("players.addToDir")}
          </button>
        </div>
      )}

      {players.length === 0 ? (
        <div className="empty">{t("players.emptyDir")}</div>
      ) : (
        <div className="player-list">
          {players.map((p) => (
            <div className="card player-row" key={p.id}>
              <div className="player-main">
                <PlayerName id={p.id} name={p.name} hasPhoto={p.has_photo} />
                <div className="player-meta muted">
                  {p.age ? t("players.ageY", { n: p.age }) : t("players.ageUnknown")}
                  {p.gender ? ` · ${t(`gender.${p.gender}`)}` : ""} ·{" "}
                  {p.height_cm ? `${p.height_cm}cm` : "-"} · {p.weight_kg ? `${p.weight_kg}kg` : "-"} ·{" "}
                  {t("players.yearsPlaying", { n: p.years_played })}
                  {p.plays_regularly ? ` · ${t("players.regular")}` : ""}
                </div>
                {p.notes && <div className="player-notes muted">"{p.notes}"</div>}
              </div>
              <div className="player-side">
                <div className="rating-badge" title={t("players.computedRating")}>
                  {p.rating}
                </div>
                <div className="muted skill-line">{t("players.skillLine", { n: p.skill_self_rating })}</div>
                {isAdmin && (
                  <div className="row gap sm">
                    <button className="btn btn-ghost sm" onClick={() => setEditing(p)}>
                      {t("common.edit")}
                    </button>
                    <button className="btn btn-danger sm" onClick={() => remove(p)}>
                      {t("common.remove")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <PlayerModal
          player={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}
