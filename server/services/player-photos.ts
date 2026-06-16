import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PHOTOS_DIR =
  process.env.PLAYER_PHOTOS_DIR ||
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "photos");

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const EXT_BY_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const MIME_BY_EXT = new Map([
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

export function ensurePhotosDir(): void {
  if (!existsSync(PHOTOS_DIR)) mkdirSync(PHOTOS_DIR, { recursive: true });
}

export function deletePlayerPhoto(playerId: number): void {
  ensurePhotosDir();
  for (const ext of MIME_BY_EXT.keys()) {
    const path = join(PHOTOS_DIR, `${playerId}${ext}`);
    if (existsSync(path)) unlinkSync(path);
  }
}

export function savePlayerPhoto(
  playerId: number,
  buffer: Buffer,
  mime: string
): { ok: true } | { error: string } {
  const ext = EXT_BY_MIME.get(mime);
  if (!ext) return { error: "Photo must be JPEG, PNG, or WebP." };
  if (buffer.length > MAX_PHOTO_BYTES) return { error: "Photo must be at most 2 MB." };
  ensurePhotosDir();
  deletePlayerPhoto(playerId);
  writeFileSync(join(PHOTOS_DIR, `${playerId}${ext}`), buffer);
  return { ok: true };
}

export function getPlayerPhoto(playerId: number): { buffer: Buffer; mime: string } | null {
  ensurePhotosDir();
  for (const [ext, mime] of MIME_BY_EXT) {
    const path = join(PHOTOS_DIR, `${playerId}${ext}`);
    if (existsSync(path)) return { buffer: readFileSync(path), mime };
  }
  return null;
}
