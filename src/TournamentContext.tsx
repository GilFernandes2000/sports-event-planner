import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { useAdmin } from "./AdminContext";
import { useTournamentAccess } from "./TournamentAccessContext";
import type { Tournament } from "./types";

interface TournamentState {
  tournaments: Tournament[];
  current: Tournament | null;
  currentId: number | null;
  loading: boolean;
  select: (id: number) => void;
  refresh: () => Promise<void>;
}

const STORAGE_KEY = "bball_current_tournament";
const TournamentCtx = createContext<TournamentState | null>(null);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAdmin();
  const { hasAccess, tournamentId: accessTournamentId, tournamentName, tournamentMeta, loading: accessLoading } =
    useTournamentAccess();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  const select = useCallback((id: number) => {
    setCurrentId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const refresh = useCallback(async () => {
    if (isAdmin) {
      const list = await api.getTournaments();
      setTournaments(list);
      setCurrentId((prev) => {
        if (prev && list.some((t) => t.id === prev)) return prev;
        const next = list.length ? list[0].id : null;
        if (next) localStorage.setItem(STORAGE_KEY, String(next));
        else localStorage.removeItem(STORAGE_KEY);
        return next;
      });
    }
  }, [isAdmin]);

  useEffect(() => {
    if (accessLoading) return;
    if (!isAdmin && !hasAccess) {
      setTournaments([]);
      setLoading(false);
      return;
    }
    if (isAdmin) {
      refresh().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [accessLoading, isAdmin, hasAccess, refresh]);

  useEffect(() => {
    if (hasAccess && accessTournamentId && !isAdmin) {
      select(accessTournamentId);
    }
  }, [hasAccess, accessTournamentId, isAdmin, select]);

  const listed = tournaments.find((t) => t.id === currentId);
  const participantCurrent =
    hasAccess && accessTournamentId && currentId === accessTournamentId && tournamentMeta
      ? {
          id: accessTournamentId,
          name: tournamentName ?? tournamentMeta.name,
          share_slug: tournamentMeta.share_slug,
          event_date: tournamentMeta.event_date,
          location: tournamentMeta.location,
          team_size: tournamentMeta.team_size,
          game_duration_min: tournamentMeta.game_duration_min,
          scoring_preset: tournamentMeta.scoring_preset as Tournament["scoring_preset"],
          format_type: tournamentMeta.format_type as Tournament["format_type"],
          status: tournamentMeta.status as Tournament["status"],
          created_at: tournamentMeta.created_at,
          counts: listed?.counts ?? { players: 0, teams: 0, games: 0 },
          // Participants aren't admins; role is irrelevant to them.
          role: "owner" as Tournament["role"],
        }
      : null;

  const current = listed ?? participantCurrent;

  return (
    <TournamentCtx.Provider
      value={{
        tournaments,
        current,
        currentId,
        loading: loading || accessLoading,
        select,
        refresh,
      }}
    >
      {children}
    </TournamentCtx.Provider>
  );
}

export function useTournament(): TournamentState {
  const ctx = useContext(TournamentCtx);
  if (!ctx) throw new Error("useTournament must be used within TournamentProvider");
  return ctx;
}
