import type { FastifyInstance } from "fastify";
import { admins } from "../db/repo.js";
import {
  hashPassword,
  issueToken,
  parseAccountPassword,
  parseEmail,
  publicAdmin,
  requireAdmin,
  revokeToken,
  tokenFromRequest,
  verifyPassword,
} from "../services/auth.js";
import {
  consumeOAuthState,
  googleAuthUrl,
  googleOAuthEnabled,
  googleProfileFromCode,
  publicBaseUrl,
} from "../services/google-auth.js";

const authRateLimit = { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } };

export default async function adminRoutes(app: FastifyInstance) {
  app.post("/api/admin/register", authRateLimit, async (req, reply) => {
    const body = req.body as { email?: unknown; password?: unknown };
    const { email, error: emailErr } = parseEmail(body?.email);
    if (emailErr) return reply.code(400).send({ error: emailErr });
    const { password, error: passErr } = parseAccountPassword(body?.password);
    if (passErr) return reply.code(400).send({ error: passErr });

    if (admins.findByEmail(email!)) {
      return reply.code(409).send({ error: "An account with this email already exists." });
    }

    const created = admins.create({ email: email!, passwordHash: hashPassword(password!) });
    const token = issueToken(created.id);
    return { token, admin: publicAdmin(created) };
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
      } else {
        admin = admins.create({
          email: profile.email,
          googleId: profile.googleId,
          displayName: profile.displayName,
        });
      }

      const token = issueToken(admin.id);
      return reply.redirect(`${frontend}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch {
      return reply.redirect(`${frontend}/auth/callback?error=google_failed`);
    }
  });
}
