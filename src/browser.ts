import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { pause } from "./human.ts";

const USER_DATA = path.join(process.cwd(), ".auth", "chrome-profile");

export function sessionDir(): string {
  fs.mkdirSync(USER_DATA, { recursive: true });
  for (const lock of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try {
      fs.rmSync(path.join(USER_DATA, lock), { force: true });
    } catch {
      // ignore
    }
  }
  return USER_DATA;
}

async function launch(channel: string | undefined, headless: boolean): Promise<BrowserContext> {
  return chromium.launchPersistentContext(sessionDir(), {
    headless,
    channel: channel === "chromium" ? undefined : channel,
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
    viewport: null,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--disable-blink-features=AutomationControlled",
      "--lang=pl-PL",
      "--no-default-browser-check",
      "--start-maximized",
    ],
    permissions: ["clipboard-read", "clipboard-write"],
  });
}

export async function openContext(): Promise<BrowserContext> {
  const explicit = process.env.BROWSER_CHANNEL;
  const headless = process.env.HEADLESS === "1";
  // Bez wymuszonego kanału próbujemy Chrome, a gdy go nie ma (np. świeży Windows),
  // automatycznie spadamy na Chromium z `npx playwright install chromium`.
  const candidates = explicit ? [explicit] : ["chrome", "chromium"];

  let lastError: unknown = null;
  for (const channel of candidates) {
    try {
      return await launch(channel === "chromium" ? undefined : channel, headless);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/existing browser session|profile/i.test(message)) {
        throw new Error("Profil Chrome jest już otwarty. Zamknij poprzednie okno bota i uruchom ponownie.");
      }
      if (!explicit) continue; // próbujemy kolejny kanał
      if (/channel|chrome|executable/i.test(message)) {
        throw new Error(
          "Nie udało się uruchomić przeglądarki. Zainstaluj Google Chrome albo uruchom: npx playwright install chromium",
        );
      }
      throw error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  if (/existing browser session|profile/i.test(message)) {
    throw new Error("Profil Chrome jest już otwarty. Zamknij poprzednie okno bota i uruchom ponownie.");
  }
  throw new Error(
    "Nie udało się uruchomić przeglądarki. Zainstaluj Google Chrome albo uruchom: npx playwright install chromium",
  );
}

export const PARALLEL_WORKERS = 3;

export async function firstPage(context: BrowserContext): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(45_000);
  return page;
}

export async function openWorkerPages(context: BrowserContext, count: number): Promise<Page[]> {
  const pages: Page[] = [];
  const existing = context.pages()[0];
  if (existing) pages.push(existing);
  while (pages.length < count) pages.push(await context.newPage());
  for (const page of pages) {
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(45_000);
  }
  return pages.slice(0, count);
}

export function splitWork<T>(items: T[], workers: number): T[][] {
  const size = Math.max(1, Math.min(workers, items.length));
  const buckets = Array.from({ length: size }, () => [] as T[]);
  items.forEach((item, index) => buckets[index % size].push(item));
  return buckets;
}

export async function dismissOverlays(page: Page): Promise<void> {
  const labels = [
    "Zezwól na wszystkie pliki cookie",
    "Allow all cookies",
    "Akceptuj wszystkie",
    "Nie teraz",
    "Not now",
    "Zamknij",
    "Close",
  ];
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => undefined);
      await pause(100, 200);
    }
  }
}

export function looksLikeCheckpoint(page: Page): boolean {
  return /checkpoint|login|two_factor|recover\/initiate/i.test(page.url());
}

export const SEARCH_INPUT =
  'input[aria-label="Szukaj na Facebooku"], input[aria-label="Search Facebook"], input[placeholder="Szukaj na Facebooku"], input[placeholder="Search Facebook"], input[type="search"]';

export async function isLoggedIn(page: Page): Promise<boolean> {
  if (looksLikeCheckpoint(page)) return false;
  if (await page.locator(SEARCH_INPUT).first().isVisible().catch(() => false)) return true;
  return page
    .getByRole("combobox", { name: /Szukaj|Search/i })
    .first()
    .isVisible()
    .catch(() => false);
}

export async function requireSession(page: Page): Promise<void> {
  await dismissOverlays(page);
  if (await isLoggedIn(page)) return;
  if (looksLikeCheckpoint(page) || /facebook\.com\/?($|\?)/.test(page.url())) {
    throw new Error("Brak sesji Facebooka albo checkpoint. Uruchom: npm run login");
  }
  throw new Error("Nie widać pola wyszukiwania. Uruchom: npm run login");
}
