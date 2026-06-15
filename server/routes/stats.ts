import type { FastifyInstance } from "fastify";
import { tournaments } from "../db/repo.js";
import { computeStats } from "../services/stats.js";

export default async function statsRoutes(app: FastifyInstance) {
  app.get("/api/tournaments/:tid/stats", async (req, reply) => {
    const tid = Number((req.params as { tid: string }).tid);
    if (!tournaments.get(tid)) return reply.code(404).send({ error: "Tournament not found." });
    return computeStats(tid);
  });
}
