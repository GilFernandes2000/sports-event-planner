import { useState } from "react";
import { api, type PlayerPayload } from "../api";
import { useTournament } from "../TournamentContext";
import { useI18n } from "../i18n";
import NoTournament from "../components/NoTournament";
import PhotoField from "../components/PhotoField";

const empty = {
  name: "",
  age: "",
  height_cm: "",
  weight_kg: "",
  years_played: "",
  plays_regularly: false,
  skill_self_rating: 5,
  notes: "",
};

export default function Enroll() {
  const { currentId, current } = useTournament();
  const { t } = useI18n();
  const [form, setForm] = useState({ ...empty });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!currentId) return <div className="page"><NoTournament /></div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const payload: PlayerPayload = {
        name: form.name.trim(),
        age: form.age === "" ? null : Number(form.age),
        height_cm: form.height_cm === "" ? null : Number(form.height_cm),
        weight_kg: form.weight_kg === "" ? null : Number(form.weight_kg),
        years_played: form.years_played === "" ? 0 : Number(form.years_played),
        plays_regularly: form.plays_regularly,
        skill_self_rating: Number(form.skill_self_rating),
        notes: form.notes.trim() || null,
      };
      const created = await api.enroll(currentId, payload);
      if (photoFile) await api.uploadPlayerPhoto(created.id, photoFile);
      setDone(t("enroll.done", { name: created.name }));
      setForm({ ...empty });
      setPhotoFile(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>{t("enroll.joinTitle", { name: current?.name ?? "" })}</h1>
      <p className="muted">{t("enroll.intro")}</p>

      {done && <div className="banner success">{done}</div>}
      {error && <div className="banner error">{error}</div>}

      <form className="card form" onSubmit={submit}>
        <label>
          {t("form.name")}
          <input
            required
            value={form.name}
            maxLength={60}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t("enroll.namePlaceholder")}
          />
        </label>

        <PhotoField playerName={form.name} onFileChange={setPhotoFile} />

        <div className="grid-2">
          <label>
            {t("form.age")}
            <input
              type="number"
              inputMode="numeric"
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
              placeholder={t("enroll.agePlaceholder")}
            />
          </label>
          <label>
            {t("form.yearsPlaying")}
            <input
              type="number"
              inputMode="numeric"
              value={form.years_played}
              onChange={(e) => setForm({ ...form, years_played: e.target.value })}
              placeholder={t("enroll.yearsPlaceholder")}
            />
          </label>
        </div>

        <div className="grid-2">
          <label>
            {t("form.height")}
            <input
              type="number"
              inputMode="numeric"
              value={form.height_cm}
              onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
              placeholder={t("enroll.heightPlaceholder")}
            />
          </label>
          <label>
            {t("form.weight")}
            <input
              type="number"
              inputMode="numeric"
              value={form.weight_kg}
              onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
              placeholder={t("enroll.weightPlaceholder")}
            />
          </label>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.plays_regularly}
            onChange={(e) => setForm({ ...form, plays_regularly: e.target.checked })}
          />
          {t("enroll.playsRegularlyLong")}
        </label>

        <label>
          {t("enroll.selfSkill")}: <strong>{form.skill_self_rating}/10</strong>
          <input
            type="range"
            min={1}
            max={10}
            value={form.skill_self_rating}
            onChange={(e) => setForm({ ...form, skill_self_rating: Number(e.target.value) })}
          />
          <div className="range-hints muted">
            <span>{t("enroll.skillLow")}</span>
            <span>{t("enroll.skillHigh")}</span>
          </div>
        </label>

        <label>
          {t("enroll.anythingElse")}
          <input
            value={form.notes}
            maxLength={280}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={t("enroll.notesPlaceholder")}
          />
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? t("common.saving") : t("enroll.submit")}
        </button>
      </form>
    </div>
  );
}
