import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    admin?: import("./types.js").Admin;
  }
}
