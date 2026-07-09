import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";

export interface AdminProfile {
  id: number;
  email: string;
  display_name: string | null;
  status: "unverified" | "approved";
}

interface AdminState {
  isAdmin: boolean;
  admin: AdminProfile | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<"approved" | "verification_required">;
  verifyEmail: (email: string, code: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  setSession: (token: string, admin: AdminProfile) => void;
  logout: () => void;
}

const AdminCtx = createContext<AdminState | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean>(!!getToken());
  const [admin, setAdmin] = useState<AdminProfile | null>(null);

  useEffect(() => {
    const onUnauth = () => {
      setIsAdmin(false);
      setAdmin(null);
    };
    window.addEventListener("admin-unauthorized", onUnauth);

    if (getToken()) {
      api
        .verify()
        .then((res) => {
          setIsAdmin(true);
          setAdmin(res.admin);
        })
        .catch(() => {
          setToken(null);
          setIsAdmin(false);
          setAdmin(null);
        });
    }

    return () => window.removeEventListener("admin-unauthorized", onUnauth);
  }, []);

  const setSession = (token: string, profile: AdminProfile) => {
    setToken(token);
    setIsAdmin(true);
    setAdmin(profile);
  };

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    setSession(res.token, res.admin);
  };

  const register = async (email: string, password: string) => {
    const res = await api.register(email, password);
    if ("verificationRequired" in res) return "verification_required";
    setSession(res.token, res.admin);
    return "approved";
  };

  const verifyEmail = async (email: string, code: string) => {
    const res = await api.verifyAdminEmail(email, code);
    setSession(res.token, res.admin);
  };

  const forgotPassword = async (email: string) => {
    await api.forgotPassword(email);
  };

  const resetPassword = async (email: string, code: string, password: string) => {
    const res = await api.resetPassword(email, code, password);
    setSession(res.token, res.admin);
  };

  const logout = () => {
    api.logout().catch(() => undefined);
    setToken(null);
    setIsAdmin(false);
    setAdmin(null);
  };

  return (
    <AdminCtx.Provider
      value={{ isAdmin, admin, login, register, verifyEmail, forgotPassword, resetPassword, setSession, logout }}
    >
      {children}
    </AdminCtx.Provider>
  );
}

export function useAdmin(): AdminState {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
