import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Always load .env from the project root (next to package.json), not from the
// shell's current working directory — and preload via `tsx --import` so env
// vars are set before any other server module runs.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  config({ path: envPath });
}
