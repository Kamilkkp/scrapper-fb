import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { splitWork } from "./browser.ts";
import { cleanSnippet } from "./search.ts";
import { randomHumanMs } from "./human.ts";
import { loadProfile } from "./profile.ts";
import { cleanPageName, normalizeFbUrl } from "./urls.ts";

test("zostawia adres strony i ucina parametry śledzące", () => {
  assert.equal(
    normalizeFbUrl("https://www.facebook.com/HaleKowalski/?fbclid=1"),
    "https://www.facebook.com/HaleKowalski",
  );
  assert.equal(
    normalizeFbUrl("https://m.facebook.com/profile.php?id=12345&sk=about"),
    "https://www.facebook.com/profile.php?id=12345",
  );
});

test("odrzuca grupy, posty i wyszukiwarkę", () => {
  assert.equal(normalizeFbUrl("https://www.facebook.com/groups/hale"), null);
  assert.equal(normalizeFbUrl("https://www.facebook.com/HaleKowalski/posts/1"), null);
  assert.equal(normalizeFbUrl("https://www.facebook.com/search/pages?q=hale"), null);
  assert.equal(normalizeFbUrl("https://www.facebook.com/watch-repair"), "https://www.facebook.com/watch-repair");
});

test("czyści generyczne podpisy linków", () => {
  assert.equal(cleanPageName("Obserwuj"), "");
  assert.equal(cleanPageName("Hale Kowalski"), "Hale Kowalski");
});

test("składa snippet z osobnych linii karty, bez przycisków i duplikatów nazwy", () => {
  const card = [
    "Koło Gospodyń Wiejskich w Raczycach",
    "Usługi socjalne · Wiejska 14, Raczyce · 184 obserwujących",
    "Koło Gospodyń Wiejskich w Raczycach",
    "Tradycja, smak i wspólnota. Działamy razem dla naszej wsi.",
    "Obserwuj",
  ].join("\n");
  assert.equal(
    cleanSnippet(card, "Koło Gospodyń Wiejskich w Raczycach"),
    "Usługi socjalne · Wiejska 14, Raczyce · 184 obserwujących · Tradycja, smak i wspólnota. Działamy razem dla naszej wsi.",
  );
});

test("dzieli pracę na trzy karty", () => {
  assert.deepEqual(splitWork(["a", "b", "c", "d"], 3), [["a", "d"], ["b"], ["c"]]);
});

test("czyta przykładowy profil klienta", () => {
  const loaded = loadProfile(fileURLToPath(new URL("../profiles/hale-stalowe.yaml", import.meta.url)));
  assert.equal(loaded.id, "hale-stalowe");
  assert.ok(loaded.search_queries.length >= 2);
});

test("losowe opóźnienia trzymają zadany zakres", () => {
  for (let i = 0; i < 30; i += 1) {
    const delay = randomHumanMs(100, 200);
    assert.ok(delay >= 100 && delay <= 200);
  }
});
