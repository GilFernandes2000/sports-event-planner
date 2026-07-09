import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";

export interface ConfirmOptions {
  message: string;
  /** Label for the confirm button; defaults to common.confirm. */
  confirmLabel?: string;
  /** Style the confirm button as destructive (red). */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const settle = (ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOptions(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {options && (
        <div className="modal-backdrop" onClick={() => settle(false)}>
          <div
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-label={t("confirm.title")}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{t("confirm.title")}</h2>
            <p className="confirm-message">{options.message}</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-ghost" autoFocus onClick={() => settle(false)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className={`btn ${options.danger ? "btn-danger" : "btn-primary"}`}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
