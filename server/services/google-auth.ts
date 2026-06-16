import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

const oauthStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

export function publicBaseUrl(): string {
  const fromEnv = process.env.PUBLIC_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const port = process.env.PORT || "3000";
  return process.env.NODE_ENV === "production"
    ? `http://localhost:${port}`
    : "http://localhost:5173";
}

export function apiBaseUrl(): string {
  const publicUrl = publicBaseUrl();
  if (process.env.NODE_ENV === "production") return publicUrl;
  // Dev: browser hits Vite; API is proxied at /api on same origin as frontend.
  return publicUrl;
}

export function googleOAuthEnabled(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

function oauthClient(): OAuth2Client | null {
  if (!googleOAuthEnabled()) return null;
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    redirectUri: `${apiBaseUrl()}/api/admin/google/callback`,
  });
}

function purgeExpiredStates(): void {
  const now = Date.now();
  for (const [state, expires] of oauthStates) {
    if (expires <= now) oauthStates.delete(state);
  }
}

export function issueOAuthState(): string {
  purgeExpiredStates();
  const state = randomBytes(16).toString("hex");
  oauthStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

export function consumeOAuthState(state: string | undefined): boolean {
  if (!state) return false;
  purgeExpiredStates();
  const ok = oauthStates.has(state);
  oauthStates.delete(state);
  return ok;
}

export function googleAuthUrl(): string | null {
  const client = oauthClient();
  if (!client) return null;
  const state = issueOAuthState();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
}

export async function googleProfileFromCode(
  code: string
): Promise<{ email: string; googleId: string; displayName: string | null } | null> {
  const client = oauthClient();
  if (!client) return null;
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token!,
    audience: process.env.GOOGLE_CLIENT_ID!.trim(),
  });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) return null;
  return {
    email: payload.email.trim().toLowerCase(),
    googleId: payload.sub,
    displayName: payload.name?.trim() || null,
  };
}
