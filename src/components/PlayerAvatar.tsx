import { useEffect, useMemo, useState } from "react";
import { getToken, getTournamentToken } from "../api";

export type AvatarSize = "sm" | "md" | "lg";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface PlayerAvatarProps {
  id: number;
  name: string;
  hasPhoto?: boolean | number;
  size?: AvatarSize;
  className?: string;
}

export default function PlayerAvatar({ id, name, hasPhoto, size = "md", className }: PlayerAvatarProps) {
  const [url, setUrl] = useState<string | null>(null);
  const showPhoto = !!hasPhoto;

  useEffect(() => {
    if (!showPhoto) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const headers: Record<string, string> = {};
    const adminToken = getToken();
    const tournamentToken = getTournamentToken();
    if (adminToken) headers.authorization = `Bearer ${adminToken}`;
    if (tournamentToken) headers["x-tournament-token"] = tournamentToken;

    fetch(`/api/players/${id}/photo`, { headers })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, showPhoto]);

  const label = useMemo(() => initials(name), [name]);
  const sizeClass = `player-avatar-${size}`;

  return (
    <span
      className={`player-avatar ${sizeClass}${className ? ` ${className}` : ""}`}
      title={name}
      aria-hidden={!name}
    >
      {url ? <img src={url} alt="" /> : <span className="player-avatar-fallback">{label}</span>}
    </span>
  );
}

interface PlayerNameProps {
  id: number;
  name: string;
  hasPhoto?: boolean | number;
  size?: AvatarSize;
  className?: string;
}

export function PlayerName({ id, name, hasPhoto, size = "md", className }: PlayerNameProps) {
  return (
    <span className={`player-name-row${className ? ` ${className}` : ""}`}>
      <PlayerAvatar id={id} name={name} hasPhoto={hasPhoto} size={size} />
      <span className="player-name-text">{name}</span>
    </span>
  );
}
