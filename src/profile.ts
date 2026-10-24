import fs from "node:fs";
import { parse } from "yaml";
import type { ClientProfile } from "./types.ts";

export function loadProfile(file: string): ClientProfile {
  if (!fs.existsSync(file)) throw new Error(`Nie ma pliku profilu: ${file}`);
  const raw = parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") throw new Error("Profil YAML jest pusty.");

  const id = String(raw.id ?? "").trim();
  if (!/^[a-z0-9-]{1,48}$/.test(id)) throw new Error("Pole id: małe litery, cyfry, myślnik.");

  const queries = raw.search_queries;
  if (!Array.isArray(queries) || queries.length === 0 || queries.some((q) => typeof q !== "string" || !q.trim())) {
    throw new Error("search_queries musi być niepustą listą fraz.");
  }

  return {
    id,
    search_queries: queries.map((q) => q.trim()),
    max_results: optionalLimit(raw.max_results),
  };
}

function optionalLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("max_results musi być dodatnią liczbą albo nie występować w pliku.");
  }
  return Math.floor(parsed);
}
