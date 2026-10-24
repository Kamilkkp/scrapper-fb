import fs from "node:fs";
import path from "node:path";
import { type Page } from "playwright";
import { dismissOverlays, firstPage, openContext, openWorkerPages, requireSession, SEARCH_INPUT, splitWork } from "./browser.ts";
import { pause } from "./human.ts";
import { ensureSession } from "./login.ts";
import { log, profileDir, writeJson } from "./io.ts";
import type { Candidate, ClientProfile } from "./types.ts";
import { cleanPageName, normalizeFbUrl } from "./urls.ts";

type RawLink = { href: string; name: string; snippet: string };

const SKIP_LINES = /^(obserwuj|obserwujesz|lubię to|polubiono|follow|following|like|liked|udostępnij|share|wiadomość|message|zobacz więcej|see more|\.\.\.)$/i;

// innerText karty dzieli tekst na linie (nazwa / kategoria · adres / opis / przyciski),
// więc snippet składa się z osobnych części zamiast zlepionego textContent.
export function cleanSnippet(cardText: string, name: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const line of cardText.split("\n")) {
    // FB zaciemnia część kart: litery rozdziela niewidzialnymi znakami (U+034F itd.)
    // i w DOM są „rozsypane”. Niewidzialne znaki wycinamy, a linię z samych
    // pojedynczych liter traktujemy jako bełkot i pomijamy.
    const part = line
      .replace(/[͏​⁠﻿]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!part || SKIP_LINES.test(part)) continue;
    const tokens = part.split(" ");
    const singles = tokens.filter((token) => token.length === 1).length;
    if (tokens.length >= 6 && singles / tokens.length > 0.6) continue;
    if (name && part === name) continue;
    if (seen.has(part)) continue;
    seen.add(part);
    parts.push(part);
  }
  return parts.join(" · ").slice(0, 600);
}

// Wyciąga liczbę obserwujących ze snippetu. Obsługuje polskie formaty
// („184 obserwujących”, „1 234 obserwujących”, „1,2 tys. obserwujących”)
// i angielskie („184 followers”, „1.2K followers”).
export function followersFromSnippet(snippet: string): number | null {
  const match = snippet.match(/(\d[\d\s ]*(?:[.,]\d+)?)\s*(tys\.|mln|[KM])?\s*(?:obserwuj\w*|followers)/i);
  if (!match) return null;
  let raw = match[1].replace(/[\s ]/g, "");
  const suffix = (match[2] ?? "").toLowerCase();
  if (!suffix && /[.,]\d{3}$/.test(raw)) raw = raw.replace(/[.,]/g, ""); // separator tysięcy
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const multiplier = suffix === "tys." || suffix === "k" ? 1_000 : suffix === "mln" || suffix === "m" ? 1_000_000 : 1;
  return Math.round(value * multiplier);
}

function nameFromSnippet(snippet: string): string {
  const firstPart = snippet.split(" · ")[0] ?? "";
  const head = firstPart.split(/\b(Lubię to|Obserwuj|Follow|Like|Udostępnij)\b/)[0] ?? "";
  return cleanPageName(head.slice(0, 80));
}

function reachedLimit(count: number, limit: number | null): boolean {
  return limit !== null && count >= limit;
}

async function dumpDebug(page: Page, dir: string, label: string): Promise<void> {
  const debug = path.join(dir, "debug");
  await page.screenshot({ path: path.join(debug, `${label}.png`) }).catch(() => undefined);
  const text = await page
    .locator('div[role="main"]')
    .first()
    .innerText()
    .catch(() => "");
  fs.writeFileSync(path.join(debug, `${label}.txt`), text.slice(0, 8000));
}

async function focusSearch(page: Page): Promise<void> {
  const input = page.locator(SEARCH_INPUT).first();
  if (await input.isVisible().catch(() => false)) {
    await input.click({ timeout: 6_000 });
    return;
  }
  await page.getByRole("combobox", { name: /Szukaj|Search/i }).first().click({ timeout: 6_000 });
}

async function typeQuery(page: Page, query: string): Promise<void> {
  try {
    await focusSearch(page);
  } catch {
    await page.keyboard.press("Escape").catch(() => undefined);
    await dismissOverlays(page);
    try {
      await page.locator(SEARCH_INPUT).first().click({ timeout: 5_000 });
    } catch {
      log("Pole wyszukiwania zasłonięte, przechodzę bezpośrednio do wyników.");
      await page.goto(`https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}`, {
        waitUntil: "domcontentloaded",
      });
      await pause(400, 700);
      await dismissOverlays(page);
      return;
    }
  }
  await pause(80, 150);
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(query, { delay: 15 + Math.floor(Math.random() * 20) });
  await pause(80, 150);
  await page.keyboard.press("Enter");
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await pause(350, 600);
}

async function openPagesTab(page: Page, query: string): Promise<void> {
  if (page.url().includes("/search/pages")) return;
  const tabs = [
    page.locator('a[href*="/search/pages"]').first(),
    page.getByRole("link", { name: /^(Strony|Pages)$/ }).first(),
  ];
  for (const tab of tabs) {
    if (!(await tab.isVisible().catch(() => false))) continue;
    const clicked = await tab
      .click({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (clicked) {
      await page.waitForURL(/\/search\/pages/, { timeout: 8_000 }).catch(() => undefined);
      if (page.url().includes("/search/pages")) {
        await pause(250, 450);
        return;
      }
    }
  }
  await page.goto(`https://www.facebook.com/search/pages?q=${encodeURIComponent(query)}`, {
    waitUntil: "domcontentloaded",
  });
  await pause(250, 450);
}

async function extractLinks(page: Page): Promise<RawLink[]> {
  const main = page.locator('div[role="main"]').first();
  if (!(await main.count())) return [];
  return main.evaluate((root) => {
    const articles = [...root.querySelectorAll('div[role="article"]')];
    const scopes = articles.length > 0 ? articles : [root];
    const found: { href: string; name: string; snippet: string }[] = [];
    for (const scope of scopes) {
      const snippet = ((scope as HTMLElement).innerText || scope.textContent || "").slice(0, 1200);
      for (const anchor of scope.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href") || "";
        const name = (anchor.textContent || "").replace(/\s+/g, " ").trim();
        if (href) found.push({ href, name, snippet });
      }
    }
    return found;
  });
}

async function resultCount(page: Page): Promise<number> {
  return page
    .evaluate(() => {
      const main = document.querySelector('div[role="main"]');
      if (!main) return 0;
      const articles = main.querySelectorAll('div[role="article"]').length;
      return articles > 0 ? articles : main.querySelectorAll("a[href]").length;
    })
    .catch(() => 0);
}

async function reachedEnd(page: Page): Promise<boolean> {
  return page
    .evaluate(() => /Koniec wyników|End of results|Nie znaleziono więcej wyników/i.test(document.body.innerText))
    .catch(() => false);
}

async function loadMore(page: Page): Promise<boolean> {
  const before = await resultCount(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);
  await page.mouse.wheel(0, 600).catch(() => undefined);
  for (let wait = 0; wait < 12; wait += 1) {
    await pause(250, 350);
    if ((await resultCount(page)) > before) return true;
  }
  return false;
}

function remember(map: Map<string, Candidate>, raw: RawLink, query: string): void {
  const url = normalizeFbUrl(raw.href);
  if (!url) return;
  const name = cleanPageName(raw.name);
  const snippet = cleanSnippet(raw.snippet, name);
  const previous = map.get(url);
  if (!previous) {
    map.set(url, { name, url, snippet, query });
    return;
  }
  if (name && name.length > previous.name.length) previous.name = name;
  // Ta sama strona może wyjść przy kilku frazach — świeży snippet nadpisuje starszy.
  if (snippet) previous.snippet = snippet;
}

async function searchQueries(
  page: Page,
  queries: string[],
  dir: string,
  maxResults: number | null,
): Promise<Candidate[]> {
  const found = new Map<string, Candidate>();
  await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
  await requireSession(page);

  for (const query of queries) {
    log(`Szukam: ${query}`);
    // Limit dotyczy jednej frazy (jednej karty), nie sumy wyników.
    const startCount = found.size;
    await dismissOverlays(page);
    try {
      await typeQuery(page, query);
      await openPagesTab(page, query);
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      log(`„${query}”: błąd (${message}), pomijam tę frazę.`);
      await dumpDebug(page, dir, "search-error");
      continue;
    }

    let idle = 0;
    for (let step = 0; step < 600 && idle < 5; step += 1) {
      if (reachedLimit(found.size - startCount, maxResults)) break;
      const grew = await loadMore(page);
      idle = grew ? 0 : idle + 1;
      if (step % 10 === 9) {
        for (const raw of await extractLinks(page)) remember(found, raw, query);
        log(`„${query}”: ${found.size} stron, przewijam dalej.`);
      }
      if (!grew && (await reachedEnd(page))) break;
    }
    for (const raw of await extractLinks(page)) remember(found, raw, query);
    log(`„${query}”: koniec listy, ${found.size} stron w tej karcie.`);
  }
  return [...found.values()];
}

export async function searchPages(profile: ClientProfile, maxResults: number | null = null): Promise<Candidate[]> {
  const dir = profileDir(profile.id);
  const found = new Map<string, Candidate>();
  const context = await openContext();

  // Logowanie na samym początku — jeśli sesja wygasła, skrypt sam otwiera
  // formularz i czeka na dokończenie logowania w oknie.
  const entryPage = await firstPage(context);
  await entryPage.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
  await ensureSession(entryPage);

  // Jedna fraza = jedna karta — wszystkie zapytania lecą równolegle.
  const buckets = splitWork(profile.search_queries, profile.search_queries.length);
  const pages = await openWorkerPages(context, buckets.length);
  log(`Wyszukiwanie w ${pages.length} kartach Chrome (po jednej na frazę).`);

  // Lista zapisywana zawsze na nowo z bieżącego uruchomienia — bez mergowania
  // z poprzednim plikiem. Pusty wynik rzuca błędem, więc dobra lista nie zniknie.
  try {
    const settled = await Promise.allSettled(
      buckets.map((queries, index) => searchQueries(pages[index], queries, dir, maxResults)),
    );
    const groups: Candidate[][] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") groups.push(result.value);
      else log(`Karta przerwała pracę: ${String(result.reason).split("\n")[0]}`);
    }
    for (const group of groups) {
      for (const candidate of group) {
        remember(found, { href: candidate.url, name: candidate.name, snippet: candidate.snippet }, candidate.query);
      }
    }

    const candidates = [...found.values()]
      .map((item) => ({
        name: item.name || nameFromSnippet(item.snippet),
        followers: followersFromSnippet(item.snippet),
        url: item.url,
        snippet: item.snippet,
        query: item.query,
      }))
      .filter((item) => item.name)
      // Malejąco po liczbie obserwujących; strony bez wykrytej liczby lądują na końcu.
      .sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1));

    if (candidates.length === 0) {
      await dumpDebug(pages[0], dir, "search-empty");
      throw new Error(
        `Wyszukiwanie nie zwróciło stron. Zrzut: data/${profile.id}/debug/search-empty.png. Facebook mógł zmienić układ albo pokazać checkpoint.`,
      );
    }

    writeJson(path.join(dir, "candidates.json"), candidates);
    const withFollowers = candidates.filter((item) => item.followers !== null).length;
    log(
      `Zapisano ${candidates.length} kandydatów (z wykrytą liczbą obserwujących: ${withFollowers}) do data/${profile.id}/candidates.json — posortowani malejąco po obserwujących.`,
    );
    return candidates;
  } finally {
    await context.close().catch(() => undefined);
  }
}
