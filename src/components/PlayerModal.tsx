import { useState } from "react";
import { api, type PlayerPayload } from "../api";
import { useI18n } from "../i18n";
import PhotoField from "./PhotoField";
import type { Player } from "../types";

type FormState = {
  name: string;
  age: string;
  gender: string;
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
    gender: p?.gender ?? "",
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
    gender: form.gender === "male" || form.gender === "female" ? form.gender : null,
    height_cm: form.height_cm === "" ? null : Number(form.height_cm),
    weight_kg: form.weight_kg === "" ? null : Number(form.weight_kg),
    years_played: form.years_played === "" ? 0 : Number(form.years_played),
    plays_regularly: form.plays_regularly,
    skill_self_rating: Number(form.skill_self_rating),
    notes: form.notes.trim() || null,
  };
}

export default function PlayerModal({
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
            {t("form.gender")}
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">{t("gender.unspecified")}</option>
              <option value="male">{t("gender.male")}</option>
              <option value="female">{t("gender.female")}</option>
            </select>
          </label>
        </div>
        <label>
          {t("form.yearsPlaying")}
          <input
            type="number"
            value={form.years_played}
            onChange={(e) => setForm({ ...form, years_played: e.target.value })}
          />
        </label>
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
