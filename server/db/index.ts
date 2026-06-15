import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveDbPath(): string {
  const configured = process.env.DB_PATH;
  if (!configured) return join(__dirname, "..", "..", "data.db");
  return isAbsolute(configured) ? configured : join(process.cwd(), configured);
}

export const db = new Database(resolveDbPath());

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

runMigrations(db);

export default db;
