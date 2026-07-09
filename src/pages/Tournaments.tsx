import { useState } from "react";
import { api } from "../api";
import { useAdmin } from "../AdminContext";
import { useTournament } from "../TournamentContext";
import { useI18n } from "../i18n";
import { useConfirm } from "../components/ConfirmDialog";
import type { FormatType, ScoringPreset, TournamentAdmin, TournamentCreateInput } from "../types";

function shareUrl(slug: string | null): string | null {
  if (!slug) return null;
  return `${window.location.origin}/display/${slug}`;
}

function ShareBlock({ slug }: { slug: string | null }) {
  const { t } = useI18n();
  const url = shareUrl(slug);
  const [copied, setCopied] = useState(false);

  if (!url) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="share-block">
      <div className="muted sm">{t("tournaments.publicLink")}</div>
      <div className="share-row">
        <input className="share-input" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn sm" onClick={copy}>
          {copied ? t("tournaments.copied") : t("tournaments.copyLink")}
        </button>
        <a className="btn sm btn-ghost" href={url} target="_blank" rel="noreferrer">
          {t("tournaments.openDisplay")}
        </a>
      </div>
      <div className="share-qr">
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}`}
          alt={t("tournaments.qrAlt")}
          width={140}
          height={140}
        />
      </div>
    </div>
  );
}

function AdminsBlock({ tournamentId, isOwner }: { tournamentId: number; isOwner: boolean }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [admins, setAdmins] = useState<TournamentAdmin[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setAdmins(await api.listTournamentAdmins(tournamentId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !admins) await load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setAdmins(await api.addTournamentAdmin(tournamentId, email.trim()));
      setEmail("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (admin: TournamentAdmin) => {
    const ok = await confirm({
      message: t("tournaments.admins.confirmRemove", { email: admin.email }),
      confirmLabel: t("common.remove"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeTournamentAdmin(tournamentId, admin.id);
      setAdmins((cur) => cur?.filter((a) => a.id !== admin.id) ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admins-block">
      <button type="button" className="btn-link sm" onClick={toggle}>
        {open ? t("tournaments.admins.hide") : t("tournaments.admins.show")}
      </button>
      {open && (
        <div className="admins-panel">
          {error && <div className="banner error sm">{error}</div>}
          {!admins ? (
            <div className="muted sm">{t("tournaments.loading")}</div>
          ) : (
            <ul className="admins-list">
              {admins.map((a) => (
                <li key={a.id} className="admins-row">
                  <span className="admin-email">{a.email}</span>
                  <span className={`pill sm ${a.role === "owner" ? "pill-good" : ""}`}>
                    {a.role === "owner" ? t("tournaments.admins.owner") : t("tournaments.admins.coAdmin")}
                  </span>
                  {isOwner && a.role === "co-admin" && (
                    <button
                      type="button"
                      className="btn-link sm danger"
                      disabled={busy}
                      onClick={() => remove(a)}
                    >
                      {t("common.remove")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isOwner && (
            <form className="row gap wrap admin-add-form" onSubmit={add}>
              <input
                type="email"
                placeholder={t("tournaments.admins.addPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" className="btn sm btn-primary" disabled={busy || !email.trim()}>
                {t("tournaments.admins.addButton")}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

const DEFAULT_FORM: TournamentCreateInput = {
  name: "",
  password: "",
  eventDate: "",
  location: "",
  teamSize: 2,
  gameDurationMin: 10,
  scoringPreset: "standard",
  formatType: "round_robin",
};

export default function Tournaments() {
  const { isAdmin } = useAdmin();
  const { tournaments, currentId, select, refresh, loading } = useTournament();
  const { t } = useI18n();
  const confirm = useConfirm();
  const [form, setForm] = useState<TournamentCreateInput>({ ...DEFAULT_FORM });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [passwordEditId, setPasswordEditId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const setField = <K extends keyof TournamentCreateInput>(key: K, value: TournamentCreateInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.password) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const created = await api.createTournament({
        ...form,
        name: form.name.trim(),
        eventDate: form.eventDate?.trim() || undefined,
        location: form.location?.trim() || undefined,
      });
      setForm({ ...DEFAULT_FORM });
      setInfo(t("tournaments.createdShare", { name: created.name }));
      await refresh();
      select(created.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (id: number) => {
    if (!newPassword) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await api.setTournamentPassword(id, newPassword);
      setPasswordEditId(null);
      setNewPassword("");
      setInfo(t("tournaments.passwordUpdated"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number, tName: string) => {
    const ok = await confirm({
      message: t("tournaments.confirmDelete", { name: tName }),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteTournament(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page">{t("tournaments.loading")}</div>;

  return (
    <div className="page">
      <h1>{t("tournaments.title")}</h1>
      <p className="muted">{t("tournaments.intro")}</p>
      {error && <div className="banner error">{error}</div>}
      {info && <div className="banner info">{info}</div>}

      {isAdmin && (
        <form className="card home-form tournament-create" onSubmit={create}>
          <label>
            <span className="label">{t("tournaments.nameLabel")}</span>
            <input
              placeholder={t("tournaments.namePlaceholder")}
              value={form.name}
              maxLength={60}
              onChange={(e) => setField("name", e.target.value)}
            />
          </label>
          <label>
            <span className="label">{t("tournaments.passwordLabel")}</span>
            <input
              type="password"
              placeholder={t("tournaments.passwordPlaceholder")}
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
            />
          </label>
          <p className="muted sm">{t("tournaments.passwordHint")}</p>

          <button type="button" className="btn-link sm" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? t("tournaments.hideSettings") : t("tournaments.showSettings")}
          </button>

          {showAdvanced && (
            <div className="tournament-settings">
              <label>
                <span className="label">{t("tournaments.dateLabel")}</span>
                <input
                  type="date"
                  value={form.eventDate ?? ""}
                  onChange={(e) => setField("eventDate", e.target.value)}
                />
              </label>
              <label>
                <span className="label">{t("tournaments.locationLabel")}</span>
                <input
                  placeholder={t("tournaments.locationPlaceholder")}
                  value={form.location ?? ""}
                  maxLength={120}
                  onChange={(e) => setField("location", e.target.value)}
                />
              </label>
              <label>
                <span className="label">{t("tournaments.teamSizeLabel")}</span>
                <select value={form.teamSize ?? 2} onChange={(e) => setField("teamSize", Number(e.target.value))}>
                  {[2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}v{n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">{t("tournaments.durationLabel")}</span>
                <select
                  value={form.gameDurationMin ?? 10}
                  onChange={(e) => setField("gameDurationMin", Number(e.target.value))}
                >
                  {[8, 10, 12, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {t("tournaments.durationMin", { n })}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">{t("tournaments.scoringLabel")}</span>
                <select
                  value={form.scoringPreset ?? "standard"}
                  onChange={(e) => setField("scoringPreset", e.target.value as ScoringPreset)}
                >
                  <option value="standard">{t("tournaments.scoringStandard")}</option>
                  <option value="first_to_21">{t("tournaments.scoringFirst21")}</option>
                  <option value="kids">{t("tournaments.scoringKids")}</option>
                </select>
              </label>
              <label>
                <span className="label">{t("tournaments.formatLabel")}</span>
                <select
                  value={form.formatType ?? "round_robin"}
                  onChange={(e) => setField("formatType", e.target.value as FormatType)}
                >
                  <option value="round_robin">{t("tournaments.formatRoundRobin")}</option>
                  <option value="knockout">{t("tournaments.formatKnockout")}</option>
                  <option value="group_playoff">{t("tournaments.formatGroupPlayoff")}</option>
                </select>
              </label>
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={busy || !form.name.trim() || !form.password}>
            {t("common.create")}
          </button>
        </form>
      )}

      {tournaments.length === 0 ? (
        <div className="empty">
          {isAdmin ? t("tournaments.emptyAdmin") : t("tournaments.emptyUser")}
        </div>
      ) : (
        <div className="player-list">
          {tournaments.map((tr) => (
            <div className={`card player-row ${tr.id === currentId ? "selected-card" : ""}`} key={tr.id}>
              <div className="player-main">
                <div className="player-name">
                  {tr.name}
                  {isAdmin && tr.role === "co-admin" && (
                    <span className="pill sm" style={{ marginLeft: 8 }}>
                      {t("tournaments.admins.coAdmin")}
                    </span>
                  )}
                </div>
                <div className="player-meta muted">
                  {tr.event_date && <span>{tr.event_date} · </span>}
                  {tr.location && <span>{tr.location} · </span>}
                  <span>
                    {tr.team_size}v{tr.team_size} · {t("tournaments.durationMin", { n: tr.game_duration_min })}
                  </span>
                </div>
                <div className="player-meta muted">
                  {t("tournaments.counts", { p: tr.counts.players, t: tr.counts.teams, g: tr.counts.games })}
                </div>
                {isAdmin && tr.share_slug && <ShareBlock slug={tr.share_slug} />}
                {isAdmin && <AdminsBlock tournamentId={tr.id} isOwner={tr.role === "owner"} />}
                {isAdmin && passwordEditId !== tr.id && (
                  <button
                    type="button"
                    className="btn-link sm"
                    onClick={() => {
                      setPasswordEditId(tr.id);
                      setNewPassword("");
                    }}
                  >
                    {t("tournaments.changePassword")}
                  </button>
                )}
                {isAdmin && passwordEditId === tr.id && (
                  <div className="row gap wrap password-edit">
                    <input
                      type="password"
                      placeholder={t("tournaments.newPasswordPlaceholder")}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn sm btn-primary"
                      disabled={busy || !newPassword}
                      onClick={() => changePassword(tr.id)}
                    >
                      {t("common.save")}
                    </button>
                    <button
                      type="button"
                      className="btn sm btn-ghost"
                      onClick={() => {
                        setPasswordEditId(null);
                        setNewPassword("");
                      }}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                )}
              </div>
              <div className="player-side">
                {tr.id === currentId ? (
                  <span className="pill pill-good">{t("common.selected")}</span>
                ) : (
                  <button className="btn sm" onClick={() => select(tr.id)}>
                    {t("common.select")}
                  </button>
                )}
                {isAdmin && tr.role === "owner" && (
                  <button className="btn btn-danger sm" onClick={() => remove(tr.id, tr.name)} disabled={busy}>
                    {t("common.delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
