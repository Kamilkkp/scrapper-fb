import fs from "node:fs";
import path from "node:path";
import { loadDotEnv, option } from "./io.ts";
import { login } from "./login.ts";
import { loadProfile } from "./profile.ts";
import { searchPages } from "./search.ts";
import type { ClientProfile } from "./types.ts";

loadDotEnv();

function printHelp(): void {
  console.log(`Użycie:
  npm run search -- --profile profiles/kolo-gospodyn.yaml [--max-results 100]
  npm run login

search na starcie loguje (gdy sesja wygasła), przeszukuje frazy z profilu
i zapisuje listę adresów stron do data/<id>/candidates.json.
--max-results ogranicza liczbę stron zebranych dla jednej frazy.`);
}

function maxResultsOption(): number | null {
  const raw = option("max-results");
  if (raw === undefined) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("--max-results musi być dodatnią liczbą.");
  }
  return Math.floor(parsed);
}

function requireProfile(): ClientProfile {
  const file = option("profile");
  if (!file) throw new Error("Podaj --profile profiles/<nazwa>.yaml");
  return loadProfile(path.resolve(file));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case "login":
      await login();
      return;
    case "search":
      await searchPages(requireProfile(), maxResultsOption());
      return;
    case undefined:
    case "help":
      printHelp();
      return;
    default:
      printHelp();
      throw new Error(`Nieznana komenda: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[fb] ${message}`);
  if (!fs.existsSync(path.join(process.cwd(), "node_modules"))) {
    console.error("[fb] Najpierw uruchom npm install.");
  }
  process.exitCode = 1;
});
