import type { FastifyInstance } from "fastify";
import { randomInt } from "node:crypto";
import { adminEmailVerifications, adminPasswordResets, admins } from "../db/repo.js";
import {
  hashPassword,
  issueToken,
  parseAccountPassword,
  parseEmail,
  publicAdmin,
  requireAdmin,
  revokeAllTokens,
  revokeToken,
  tokenFromRequest,
  verifyPassword,
} from "../services/auth.js";
import {
  emailVerificationEnabled,
  sendAdminPasswordResetEmail,
  sendAdminVerificationEmail,
} from "../services/email.js";
import {
  consumeOAuthState,
  googleAuthUrl,
  googleOAuthEnabled,
  googleProfileFromCode,
  publicBaseUrl,
} from "../services/google-auth.js";

const authRateLimit = { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } };
const registerRateLimit = { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } };
const verifyRateLimit = { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } };
const CODE_TTL_MINUTES = 15;
const MAX_VERIFY_ATTEMPTS = 5;

function verificationExpiresAt(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + CODE_TTL_MINUTES);
  return d.toISOString();
}

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

async function sendVerificationCode(adminId: number, email: string): Promise<void> {
  const code = generateCode();
  adminEmailVerifications.upsert(adminId, hashPassword(code), verificationExpiresAt());
  await sendAdminVerificationEmail({ to: email, code });
}

async function sendPasswordResetCode(adminId: number, email: string): Promise<void> {
  const code = generateCode();
  adminPasswordResets.upsert(adminId, hashPassword(code), verificationExpiresAt());
  await sendAdminPasswordResetEmail({ to: email, code });
}

export default async function adminRoutes(app: FastifyInstance) {
  app.get("/api/admin/registration", async () => ({
    emailVerificationEnabled: emailVerificationEnabled(),
  }));

  app.post("/api/admin/register", registerRateLimit, async (req, reply) => {
    const body = req.body as { email?: unknown; password?: unknown };
    const { email, error: emailErr } = parseEmail(body?.email);
    if (emailErr) return reply.code(400).send({ error: emailErr });
    const { password, error: passErr } = parseAccountPassword(body?.password);
    if (passErr) return reply.code(400).send({ error: passErr });

    if (admins.findByEmail(email!)) {
      return reply.code(409).send({ error: "An account with this email already exists." });
    }

    const created = admins.create({
      email: email!,
      passwordHash: hashPassword(password!),
      status: "unverified",
    });

    try {
      await sendVerificationCode(created.id, created.email);
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message });
    }

    return reply.code(202).send({ verificationRequired: true, admin: publicAdmin(created) });
  });

  app.post("/api/admin/verify-email", verifyRateLimit, async (req, reply) => {
    const body = req.body as { email?: unknown; code?: unknown };
    const { email, error: emailErr } = parseEmail(body?.email);
    if (emailErr) return reply.code(400).send({ error: emailErr });
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return reply.code(400).send({ error: "Enter the 6-digit verification code." });

    const admin = admins.findByEmail(email!);
    if (!admin) return reply.code(404).send({ error: "Account not found." });
    if (admin.status === "approved") {
      const token = issueToken(admin.id);
      return { token, admin: publicAdmin(admin) };
    }

    const verification = adminEmailVerifications.get(admin.id);
    if (!verification) return reply.code(400).send({ error: "Verification code expired. Request a new one." });
    if (new Date(verification.expires_at) <= new Date()) {
      adminEmailVerifications.remove(admin.id);
      return reply.code(400).send({ error: "Verification code expired. Request a new one." });
    }
    if (verification.attempts >= MAX_VERIFY_ATTEMPTS) {
      return reply.code(429).send({ error: "Too many verification attempts. Request a new code." });
    }
    if (!verifyPassword(code, verification.code_hash)) {
      adminEmailVerifications.incrementAttempts(admin.id);
      return reply.code(400).send({ error: "Invalid verification code." });
    }

    const approved = admins.markApproved(admin.id)!;
    adminEmailVerifications.remove(admin.id);
    const token = issueToken(approved.id);
    return { token, admin: publicAdmin(approved) };
  });

  app.post("/api/admin/resend-verification", verifyRateLimit, async (req, reply) => {
    const body = req.body as { email?: unknown };
    const { email, error: emailErr } = parseEmail(body?.email);
    if (emailErr) return reply.code(400).send({ error: emailErr });
    const admin = admins.findByEmail(email!);
    if (!admin) return reply.code(404).send({ error: "Account not found." });
    if (admin.status === "approved") return { ok: true };
    await sendVerificationCode(admin.id, admin.email);
    return { ok: true };
  });

  app.post("/api/admin/login", authRateLimit, async (req, reply) => {
    const body = req.body as { email?: unknown; password?: unknown };
    const { email, error: emailErr } = parseEmail(body?.email);
    if (emailErr) return reply.code(400).send({ error: emailErr });
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password) return reply.code(401).send({ error: "Invalid email or password." });

    const admin = admins.findByEmail(email!);
    if (!admin?.password_hash || !verifyPassword(password, admin.password_hash)) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }
    if (admin.status !== "approved") {
      return reply.code(403).send({ error: "Verify your email before logging in." });
    }

    const token = issueToken(admin.id);
    return { token, admin: publicAdmin(admin) };
  });

  app.post("/api/admin/forgot-password", verifyRateLimit, async (req, reply) => {
    const body = req.body as { email?: unknown };
    const { email, error: emailErr } = parseEmail(body?.email);
    if (emailErr) return reply.code(400).send({ error: emailErr });

    const admin = admins.findByEmail(email!);
    // Always respond the same way so this endpoint can't be used to find out
    // which emails have an account.
    if (admin && admin.password_hash) {
      await sendPasswordResetCode(admin.id, admin.email);
    }
    return { ok: true };
  });

  app.post("/api/admin/reset-password", verifyRateLimit, async (req, reply) => {
    const body = req.body as { email?: unknown; code?: unknown; password?: unknown };
    const { email, error: emailErr } = parseEmail(body?.email);
    if (emailErr) return reply.code(400).send({ error: emailErr });
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return reply.code(400).send({ error: "Enter the 6-digit reset code." });
    const { password, error: passErr } = parseAccountPassword(body?.password);
    if (passErr) return reply.code(400).send({ error: passErr });

    const admin = admins.findByEmail(email!);
    if (!admin) return reply.code(404).send({ error: "Account not found." });

    const reset = adminPasswordResets.get(admin.id);
    if (!reset) return reply.code(400).send({ error: "Reset code expired. Request a new one." });
    if (new Date(reset.expires_at) <= new Date()) {
      adminPasswordResets.remove(admin.id);
      return reply.code(400).send({ error: "Reset code expired. Request a new one." });
    }
    if (reset.attempts >= MAX_VERIFY_ATTEMPTS) {
      return reply.code(429).send({ error: "Too many attempts. Request a new code." });
    }
    if (!verifyPassword(code, reset.code_hash)) {
      adminPasswordResets.incrementAttempts(admin.id);
      return reply.code(400).send({ error: "Invalid reset code." });
    }

    admins.setPassword(admin.id, hashPassword(password!));
    adminPasswordResets.remove(admin.id);
    revokeAllTokens(admin.id);
    const token = issueToken(admin.id);
    return { token, admin: publicAdmin(admin) };
  });

  app.get("/api/admin/verify", { preHandler: requireAdmin }, async (req) => ({
    valid: true,
    admin: publicAdmin(req.admin!),
  }));

  app.post("/api/admin/logout", { preHandler: requireAdmin }, async (req) => {
    revokeToken(tokenFromRequest(req));
    return { ok: true };
  });

  app.get("/api/admin/google/enabled", async () => ({ enabled: googleOAuthEnabled() }));

  app.get("/api/admin/google", async (_req, reply) => {
    const url = googleAuthUrl();
    if (!url) {
      return reply.code(503).send({ error: "Google sign-in is not configured." });
    }
    return reply.redirect(url);
  });

  app.get("/api/admin/google/callback", async (req, reply) => {
    const query = req.query as { code?: string; state?: string; error?: string };
    const frontend = publicBaseUrl();

    if (query.error) {
      return reply.redirect(`${frontend}/auth/callback?error=google_denied`);
    }

    if (!consumeOAuthState(query.state)) {
      return reply.redirect(`${frontend}/auth/callback?error=invalid_state`);
    }

    const code = typeof query.code === "string" ? query.code : "";
    if (!code) {
      return reply.redirect(`${frontend}/auth/callback?error=missing_code`);
    }

    try {
      const profile = await googleProfileFromCode(code);
      if (!profile) {
        return reply.redirect(`${frontend}/auth/callback?error=profile_failed`);
      }

      let admin = admins.findByGoogleId(profile.googleId) ?? admins.findByEmail(profile.email);

      if (admin) {
        if (!admin.google_id) {
          admins.linkGoogle(admin.id, profile.googleId, profile.displayName);
          admin = admins.get(admin.id)!;
        }
        if (admin.status !== "approved") {
          admin = admins.markApproved(admin.id)!;
          adminEmailVerifications.remove(admin.id);
        }
      } else {
        admin = admins.create({
          email: profile.email,
          googleId: profile.googleId,
          displayName: profile.displayName,
          status: "approved",
        });
      }

      const token = issueToken(admin.id);
      return reply.redirect(`${frontend}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch {
      return reply.redirect(`${frontend}/auth/callback?error=google_failed`);
    }
  });
}
