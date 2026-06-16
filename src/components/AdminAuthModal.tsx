import { useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { api } from "../api";
import { useI18n } from "../i18n";

type Mode = "login" | "register";

export default function AdminAuthModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { login, register } = useAdmin();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    if (open) {
      api.googleOAuthEnabled().then((r) => setGoogleEnabled(r.enabled)).catch(() => setGoogleEnabled(false));
    }
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
      setEmail("");
      setPassword("");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{mode === "login" ? t("admin.login") : t("admin.register")}</h2>
        <p className="muted">
          {mode === "login" ? t("admin.prompt") : t("admin.registerPrompt")}
        </p>

        <label>
          <span className="label">{t("admin.email")}</span>
          <input
            type="email"
            autoFocus
            autoComplete="email"
            placeholder={t("admin.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          <span className="label">{t("admin.password")}</span>
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={t("admin.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="error">{error}</p>}

        {googleEnabled && (
          <button
            type="button"
            className="btn btn-google"
            disabled={busy}
            onClick={() => {
              window.location.href = "/api/admin/google";
            }}
          >
            {t("admin.googleSignIn")}
          </button>
        )}

        <div className="row gap">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !email || !password}>
            {busy ? "..." : mode === "login" ? t("admin.loginSubmit") : t("admin.registerSubmit")}
          </button>
        </div>

        <p className="muted sm home-organiser">
          {mode === "login" ? t("admin.noAccount") : t("admin.haveAccount")}
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          >
            {mode === "login" ? t("admin.registerLink") : t("admin.loginLink")}
          </button>
        </p>
      </form>
    </div>
  );
}
