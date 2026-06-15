import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";

interface AdminState {
  isAdmin: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const AdminCtx = createContext<AdminState | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean>(!!getToken());

  useEffect(() => {
    // Any API 401 means our token is no longer valid (e.g. revoked).
    const onUnauth = () => setIsAdmin(false);
    window.addEventListener("admin-unauthorized", onUnauth);

    // Confirm an existing token is still accepted by the server on load, so the
    // UI never shows "Admin: on" while admin actions silently fail.
    if (getToken()) {
      api
        .verify()
        .then(() => setIsAdmin(true))
        .catch(() => {
          setToken(null);
          setIsAdmin(false);
        });
    }

    return () => window.removeEventListener("admin-unauthorized", onUnauth);
  }, []);

  const login = async (password: string) => {
    const { token } = await api.login(password);
    setToken(token);
    setIsAdmin(true);
  };

  const logout = () => {
    api.logout().catch(() => undefined);
    setToken(null);
    setIsAdmin(false);
  };

  return <AdminCtx.Provider value={{ isAdmin, login, logout }}>{children}</AdminCtx.Provider>;
}

export function useAdmin(): AdminState {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
