import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAdmin } from "../AdminContext";
import { api } from "../api";
import { useI18n } from "../i18n";

type Mode = "login" | "register" | "verify" | "forgot" | "reset";

export default function AdminAuthModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { login, register, verifyEmail, forgotPassword, resetPassword } = useAdmin();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleChecked, setGoogleChecked] = useState(false);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState(false);

  useEffect(() => {
    if (open) {
      setGoogleChecked(false);
      api
        .googleOAuthEnabled()
        .then((r) => setGoogleEnabled(r.enabled))
        .catch(() => setGoogleEnabled(false))
        .finally(() => setGoogleChecked(true));
      api
        .registrationConfig()
        .then((r) => setEmailVerificationEnabled(r.emailVerificationEnabled))
        .catch(() => setEmailVerificationEnabled(false));
    }
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "login") await login(email, password);
      else if (mode === "verify") await verifyEmail(email, verificationCode);
      else if (mode === "forgot") {
        await forgotPassword(email);
        setPassword("");
        setVerificationCode("");
        setNotice(t("admin.resetCodeSent"));
        setMode("reset");
        return;
      } else if (mode === "reset") await resetPassword(email, verificationCode, password);
      else {
        const result = await register(email, password);
        if (result === "verification_required") {
          setPassword("");
          setVerificationCode("");
          setNotice(t("admin.codeSent"));
          setMode("verify");
          return;
        }
      }
      setEmail("");
      setPassword("");
      setVerificationCode("");
      onSuccess?.();
      onClose();
    } catch (err) {
      const message = (err as Error).message;
      if (mode === "login" && message.toLowerCase().includes("verify your email")) {
        setMode("verify");
        setPassword("");
        setNotice(t("admin.verifyLoginPrompt"));
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const modal = (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>
          {mode === "login"
            ? t("admin.login")
            : mode === "verify"
              ? t("admin.verifyTitle")
              : mode === "forgot"
                ? t("admin.forgotTitle")
                : mode === "reset"
                  ? t("admin.resetTitle")
                  : t("admin.register")}
        </h2>
        <p className="muted">
          {mode === "login"
            ? t("admin.prompt")
            : mode === "verify"
              ? t("admin.verifyPrompt")
              : mode === "forgot"
                ? t("admin.forgotPrompt")
                : mode === "reset"
                  ? t("admin.resetPrompt")
                  : t("admin.registerPrompt")}
        </p>
        {mode === "register" && emailVerificationEnabled && (
          <p className="banner info">{t("admin.emailVerificationRequired")}</p>
        )}

        {(mode === "login" || mode === "register") && (
          <>
            <button
              type="button"
              className="btn btn-google"
              disabled={busy || !googleChecked}
              onClick={() => {
                setError(null);
                setNotice(null);
                if (!googleEnabled) {
                  setError(t("admin.googleNotConfigured"));
                  return;
                }
                window.location.href = "/api/admin/google";
              }}
            >
              <svg className="google-mark" aria-hidden viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.94v2.33A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.94a9 9 0 0 0 0 8.08l3.02-2.33Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .94 4.96l3.02 2.33C4.67 5.16 6.66 3.58 9 3.58Z" />
              </svg>
              <span>{mode === "register" ? t("admin.googleSignUp") : t("admin.googleSignIn")}</span>
            </button>

            <div className="auth-divider">
              <span>{t("admin.orEmail")}</span>
            </div>
          </>
        )}

        <label>
          <span className="label">{t("admin.email")}</span>
          <input
            type="email"
            autoFocus
            autoComplete="email"
            placeholder={t("admin.emailPlaceholder")}
            value={email}
            disabled={mode === "verify" || mode === "reset"}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {(mode === "verify" || mode === "reset") && (
          <label>
            <span className="label">{t("admin.verificationCode")}</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("admin.verificationCodePlaceholder")}
              value={verificationCode}
              maxLength={6}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
        )}
        {(mode === "login" || mode === "register" || mode === "reset") && (
          <label>
            <span className="label">{mode === "reset" ? t("admin.newPassword") : t("admin.password")}</span>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "reset" ? t("admin.newPassword") : t("admin.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        {error && <p className="error">{error}</p>}
        {notice && <p className="banner success">{notice}</p>}

        <div className="row gap">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              busy ||
              !email ||
              (mode === "verify" || mode === "reset" ? verificationCode.length !== 6 : false) ||
              (mode === "login" || mode === "register" || mode === "reset" ? !password : false)
            }
          >
            {busy
              ? "..."
              : mode === "login"
                ? t("admin.loginSubmit")
                : mode === "verify"
                  ? t("admin.verifySubmit")
                  : mode === "forgot"
                    ? t("admin.forgotSubmit")
                    : mode === "reset"
                      ? t("admin.resetSubmit")
                      : t("admin.registerSubmit")}
          </button>
        </div>

        {mode === "login" && (
          <p className="muted sm home-organiser">
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setMode("forgot");
                setError(null);
                setNotice(null);
                setPassword("");
              }}
            >
              {t("admin.forgotLink")}
            </button>
          </p>
        )}

        {(mode === "verify" || mode === "reset") && (
          <p className="muted sm home-organiser">
            <button
              type="button"
              className="btn-link"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                setNotice(null);
                try {
                  if (mode === "verify") {
                    await api.resendAdminVerification(email);
                  } else {
                    await api.forgotPassword(email);
                  }
                  setNotice(t("admin.codeResent"));
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("admin.resendCode")}
            </button>
          </p>
        )}

        {(mode === "login" || mode === "register") && (
          <p className="muted sm home-organiser">
            {mode === "login" ? t("admin.noAccount") : t("admin.haveAccount")}
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
                setNotice(null);
                setVerificationCode("");
              }}
            >
              {mode === "login" ? t("admin.registerLink") : t("admin.loginLink")}
            </button>
          </p>
        )}

        {(mode === "verify" || mode === "forgot" || mode === "reset") && (
          <p className="muted sm home-organiser">
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setMode("login");
                setError(null);
                setNotice(null);
                setVerificationCode("");
                setPassword("");
              }}
            >
              {t("admin.backToLogin")}
            </button>
          </p>
        )}
      </form>
    </div>
  );

  return createPortal(modal, document.body);
}
