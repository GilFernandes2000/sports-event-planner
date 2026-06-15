import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";

import "./db/index.js"; // initialise DB + schema on boot
import playerRoutes from "./routes/players.js";
import tournamentRoutes from "./routes/tournaments.js";
import teamRoutes from "./routes/teams.js";
import gameRoutes from "./routes/games.js";
import statsRoutes from "./routes/stats.js";
import adminRoutes from "./routes/admin.js";
import { usingDefaultPassword } from "./services/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const app = Fastify({ logger: { level: isProd ? "info" : "warn" } });

await app.register(adminRoutes);
await app.register(playerRoutes);
await app.register(tournamentRoutes);
await app.register(teamRoutes);
await app.register(gameRoutes);
await app.register(statsRoutes);

app.get("/api/health", async () => ({ ok: true }));

// In production, serve the built React app and fall back to index.html for
// client-side routing.
const distDir = join(__dirname, "..", "dist");
if (existsSync(distDir)) {
  await app.register(fastifyStatic, { root: distDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url && req.raw.url.startsWith("/api")) {
      return reply.code(404).send({ error: "Not found." });
    }
    return reply.sendFile("index.html");
  });
}

function lanAddresses(): string[] {
  const nets = networkInterfaces();
  const out: string[] = [];
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

try {
  await app.listen({ port: PORT, host: HOST });
  const urls = [`http://localhost:${PORT}`, ...lanAddresses().map((ip) => `http://${ip}:${PORT}`)];
  console.log("\n  2v2 Basketball Championship is running");
  console.log("  Open on this network:");
  for (const u of urls) console.log(`    ${u}`);
  if (!existsSync(distDir)) {
    console.log("\n  (dev) Frontend served by Vite on http://localhost:5173");
  }
  if (usingDefaultPassword()) {
    console.log('\n  WARNING: ADMIN_PASSWORD not set. Using default "changeme". Set it before your event.');
  }
  console.log("");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
