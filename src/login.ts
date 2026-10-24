import { type Locator, type Page } from "playwright";
import { dismissOverlays, firstPage, isLoggedIn, looksLikeCheckpoint, openContext } from "./browser.ts";
import { pause } from "./human.ts";
import { log } from "./io.ts";

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

async function visibleField(page: Page, candidates: Locator[]): Promise<Locator | null> {
  for (const field of candidates) {
    const target = field.first();
    if (await target.isVisible().catch(() => false)) return target;
  }
  return null;
}

async function typeInto(page: Page, field: Locator, value: string): Promise<boolean> {
  // focus zamiast click — baner cookies przechwytuje kliknięcia (hit-test),
  // a focus idzie przez DOM i działa mimo przykrywającego overlaya.
  await field.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(value, { delay: 30 });
  const typed = await field.inputValue().catch(() => "");
  if (typed.length === value.length) return true;
  await field.fill(value);
  const filled = await field.inputValue().catch(() => "");
  return filled.length === value.length;
}

async function prefillCredentials(page: Page): Promise<void> {
  const email = process.env.FB_EMAIL?.trim();
  const password = process.env.FB_PASSWORD?.trim();
  if (!email || !password) {
    log("Brak FB_EMAIL i FB_PASSWORD w .env. Wpisz dane ręcznie w otwartym oknie. Okno zostaje.");
    return;
  }

  log(`Wczytano login (${email.length} znaków) i hasło (${password.length} znaków). Wpisuję w widoczne pola.`);
  await page.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded" });
  // Baner cookies renderuje się z opóźnieniem — czyszczę kilka razy.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await dismissOverlays(page);
    await pause(500, 800);
  }
  await page.getByRole("button", { name: /Zaloguj się|Log in/i }).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);

  const emailField = await visibleField(page, [
    page.getByRole("textbox", { name: /e-mail|email|telefon|phone/i }),
    page.locator("input[name='email']"),
    page.locator("#email"),
  ]);
  const passwordField = await visibleField(page, [
    page.locator("input[type='password']"),
    page.getByLabel(/Hasło|Password/i),
    page.locator("input[name='pass']"),
    page.locator("#pass"),
  ]);

  if (!emailField || !passwordField) {
    log("Nie widzę pól logowania. Wpisz e-mail i hasło ręcznie w oknie Chrome. Okno zostaje otwarte.");
    return;
  }

  const emailOk = await typeInto(page, emailField, email);
  const passwordOk = await typeInto(page, passwordField, password);
  if (!emailOk || !passwordOk) {
    log("Facebook nie przyjął wpisu w polu. Dokończ logowanie ręcznie w otwartym oknie.");
    return;
  }

  await pause(400, 800);
  // Enter idzie do sfokusowanego pola hasła i wysyła formularz mimo overlaya;
  // klik w przycisk zostaje jako zapas.
  await page.keyboard.press("Enter");
  await pause(2000, 3000);
  if (/login/.test(page.url())) {
    const submit = await visibleField(page, [
      page.getByRole("button", { name: /^Zaloguj się$|^Log in$/i }),
      page.locator("button[name='login']"),
    ]);
    if (submit) await submit.click({ timeout: 5_000 }).catch(() => undefined);
  }
  log("Wysłano formularz. Dokończ 2FA albo checkpoint w oknie. Okno zostaje otwarte.");
}

/**
 * Upewnia się, że konto jest zalogowane: jeśli sesja wygasła, otwiera formularz
 * logowania (wypełnia go z FB_EMAIL/FB_PASSWORD, gdy są ustawione) i czeka na
 * dokończenie logowania w oknie — potem skrypt jedzie dalej automatycznie.
 */
export async function ensureSession(page: Page): Promise<void> {
  await dismissOverlays(page);
  if (await isLoggedIn(page)) return;

  log("Brak aktywnej sesji — logowanie na starcie...");
  try {
    await prefillCredentials(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Nie udało się uzupełnić formularza (${message}). Okno zostaje otwarte — wpisz dane ręcznie.`);
  }

  const started = Date.now();
  let lastState = "";
  while (Date.now() - started < LOGIN_TIMEOUT_MS) {
    await pause(1500, 2200);
    await dismissOverlays(page);
    if (await isLoggedIn(page)) {
      log("Zalogowano. Sesja zapisana w .auth/chrome-profile.");
      return;
    }
    // „login” w URL to zwykła strona logowania, nie checkpoint — komunikaty rozróżniam
    // i loguję tylko przy zmianie stanu, bez spamu co 2 sekundy.
    const state = /checkpoint|two_factor|recover/i.test(page.url()) ? "checkpoint" : "waiting";
    if (state !== lastState) {
      lastState = state;
      log(
        state === "checkpoint"
          ? "Facebook prosi o potwierdzenie tożsamości. Dokończ to w oknie przeglądarki."
          : "Czekam na zalogowanie w oknie Chrome...",
      );
    }
  }
  throw new Error("Logowanie nie doszło do skutku w ciągu 10 minut.");
}

export async function login(): Promise<void> {
  const context = await openContext();
  const page = await firstPage(context);
  try {
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
    await ensureSession(page);
  } finally {
    await context.close().catch(() => undefined);
  }
}
