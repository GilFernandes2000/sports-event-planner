import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import PlayerAvatar from "./PlayerAvatar";

interface PhotoFieldProps {
  playerId?: number;
  playerName: string;
  hasPhoto?: boolean;
  onFileChange: (file: File | null) => void;
  onRemove?: () => void;
}

export default function PhotoField({ playerId, playerName, hasPhoto, onFileChange, onRemove }: PhotoFieldProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pick = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    if (!file) {
      setPreview(null);
      onFileChange(null);
      return;
    }
    setRemoved(false);
    setPreview(URL.createObjectURL(file));
    onFileChange(file);
  };

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setRemoved(true);
    onFileChange(null);
    onRemove?.();
    if (inputRef.current) inputRef.current.value = "";
  };

  const showExisting = !preview && !removed && hasPhoto && playerId;

  return (
    <label className="photo-field">
      <span>{t("form.photo")}</span>
      <div className="photo-field-row">
        {preview ? (
          <span className="player-avatar player-avatar-lg">
            <img src={preview} alt="" />
          </span>
        ) : showExisting ? (
          <PlayerAvatar id={playerId!} name={playerName} hasPhoto size="lg" />
        ) : (
          <span className="player-avatar player-avatar-lg">
            <span className="player-avatar-fallback">?</span>
          </span>
        )}
        <div className="photo-field-actions">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          {(preview || showExisting) && (
            <button type="button" className="btn btn-ghost sm" onClick={clear}>
              {t("form.removePhoto")}
            </button>
          )}
        </div>
      </div>
      <span className="muted tiny">{t("form.photoHint")}</span>
    </label>
  );
}
