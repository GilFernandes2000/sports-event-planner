import { useEffect, useState } from "react";
import { api, type PlayerPayload } from "../api";
import { useAdmin } from "../AdminContext";
import { useI18n } from "../i18n";
import PhotoField from "../components/PhotoField";
import { PlayerName } from "../components/PlayerAvatar";
import type { Player } from "../types";

type FormState = {
  name: string;
  age: string;
  height_cm: string;
  weight_kg: string;
  years_played: string;
  plays_regularly: boolean;
  skill_self_rating: number;
  notes: string;
};

function toForm(p: Player | null): FormState {
  return {
    name: p?.name ?? "",
    age: p?.age?.toString() ?? "",
    height_cm: p?.height_cm?.toString() ?? "",
    weight_kg: p?.weight_kg?.toString() ?? "",
    years_played: p?.years_played?.toString() ?? "",
    plays_regularly: !!p?.plays_regularly,
    skill_self_rating: p?.skill_self_rating ?? 5,
    notes: p?.notes ?? "",
  };
}

function toPayload(form: FormState): PlayerPayload {
  return {
    name: form.name.trim(),
    age: form.age === "" ? null : Number(form.age),
    height_cm: form.height_cm === "" ? null : Number(form.height_cm),
    weight_kg: form.weight_kg === "" ? null : Number(form.weight_kg),
    years_played: form.years_played === "" ? 0 : Number(form.years_played),
    plays_regularly: form.plays_regularly,
    skill_self_rating: Number(form.skill_self_rating),
    notes: form.notes.trim() || null,
  };
}

function PlayerModal({
  player,
  onClose,
  onSaved,
}: {
  player: Player | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(() => toForm(player));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = toPayload(form);
      let saved: Player;
      if (player) saved = await api.updatePlayer(player.id, payload);
      else saved = await api.createPlayer(payload);
      if (photoFile) await api.uploadPlayerPhoto(saved.id, photoFile);
      else if (removePhoto && player) await api.deletePlayerPhoto(player.id);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>{player ? t("modal.editPlayer") : t("modal.addPlayer")}</h2>
        <label>
          {t("form.name")}
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <PhotoField
          playerId={player?.id}
          playerName={form.name || player?.name || ""}
          hasPhoto={!!player?.has_photo && !removePhoto}
          onFileChange={(f) => {
            setPhotoFile(f);
            if (f) setRemovePhoto(false);
          }}
          onRemove={() => setRemovePhoto(true)}
        />
        <div className="grid-2">
          <label>
            {t("form.age")}
            <input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          </label>
          <label>
            {t("form.yearsPlaying")}
            <input
              type="number"
              value={form.years_played}
              onChange={(e) => setForm({ ...form, years_played: e.target.value })}
            />
          </label>
        </div>
        <div className="grid-2">
          <label>
            {t("form.height")}
            <input
              type="number"
              value={form.height_cm}
              onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
            />
          </label>
          <label>
            {t("form.weight")}
            <input
              type="number"
              value={form.weight_kg}
              onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.plays_regularly}
            onChange={(e) => setForm({ ...form, plays_regularly: e.target.checked })}
          />
          {t("form.playsRegularly")}
        </label>
        <label>
          {t("form.skill")}: <strong>{form.skill_self_rating}/10</strong>
          <input
            type="range"
            min={1}
            max={10}
            value={form.skill_self_rating}
            onChange={(e) => setForm({ ...form, skill_self_rating: Number(e.target.value) })}
          />
        </label>
        <label>
          {t("form.notes")}
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row gap">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "..." : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Players() {
  const { isAdmin } = useAdmin();
  const { t } = useI18n();
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
    if (!confirm(t("players.confirmRemove", { name: p.name }))) return;
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
                  {p.age ? t("players.ageY", { n: p.age }) : t("players.ageUnknown")} ·{" "}
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
