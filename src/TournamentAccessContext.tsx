import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  api,
  getTournamentAccessId,
  getTournamentToken,
  setTournamentAccessId,
  setTournamentToken,
} from "./api";

interface TournamentAccessState {
  hasAccess: boolean;
  loading: boolean;
  tournamentId: number | null;
  tournamentName: string | null;
  login: (name: string, password: string) => Promise<{ id: number; name: string }>;
  logout: () => void;
}

const TournamentAccessCtx = createContext<TournamentAccessState | null>(null);

export function TournamentAccessProvider({ children }: { children: ReactNode }) {
  const [hasAccess, setHasAccess] = useState<boolean>(!!getTournamentToken());
  const [tournamentId, setTournamentId] = useState<number | null>(() => getTournamentAccessId());
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!getTournamentToken());

  useEffect(() => {
    const onUnauth = () => {
      setHasAccess(false);
      setTournamentId(null);
      setTournamentName(null);
    };
    window.addEventListener("tournament-unauthorized", onUnauth);

    if (getTournamentToken()) {
      api
        .accessVerify()
        .then((res) => {
          if (res.valid && res.tournament) {
            setHasAccess(true);
            setTournamentId(res.tournament.id);
            setTournamentName(res.tournament.name);
            setTournamentAccessId(res.tournament.id);
          } else {
            setTournamentToken(null);
            setTournamentAccessId(null);
            setHasAccess(false);
            setTournamentId(null);
            setTournamentName(null);
          }
        })
        .catch(() => {
          setTournamentToken(null);
          setTournamentAccessId(null);
          setHasAccess(false);
          setTournamentId(null);
          setTournamentName(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }

    return () => window.removeEventListener("tournament-unauthorized", onUnauth);
  }, []);

  const login = async (name: string, password: string) => {
    const { token, tournament } = await api.accessLogin(name, password);
    setTournamentToken(token);
    setTournamentAccessId(tournament.id);
    setHasAccess(true);
    setTournamentId(tournament.id);
    setTournamentName(tournament.name);
    return tournament;
  };

  const logout = () => {
    api.accessLogout().catch(() => undefined);
    setTournamentToken(null);
    setTournamentAccessId(null);
    setHasAccess(false);
    setTournamentId(null);
    setTournamentName(null);
  };

  return (
    <TournamentAccessCtx.Provider
      value={{ hasAccess, loading, tournamentId, tournamentName, login, logout }}
    >
      {children}
    </TournamentAccessCtx.Provider>
  );
}

export function useTournamentAccess(): TournamentAccessState {
  const ctx = useContext(TournamentAccessCtx);
  if (!ctx) throw new Error("useTournamentAccess must be used within TournamentAccessProvider");
  return ctx;
}
