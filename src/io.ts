import fs from "node:fs";
import path from "node:path";

export function loadDotEnv(): void {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    let value = raw.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

export function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

export function profileDir(id: string): string {
  if (!/^[a-z0-9-]{1,48}$/.test(id)) {
    throw new Error(`Nieprawidłowe id profilu: ${id}. Użyj małych liter, cyfr i myślnika.`);
  }
  const dir = path.join(process.cwd(), "data", id);
  fs.mkdirSync(path.join(dir, "debug"), { recursive: true });
  return dir;
}

export function readJson<T>(file: string): T {
  if (!fs.existsSync(file)) {
    throw new Error(`Brak pliku ${path.relative(process.cwd(), file)}.`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function log(message: string): void {
  console.log(`[fb] ${message}`);
}
