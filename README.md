# Publiczne strony Facebooka — lista adresów

Projekt otwiera przez Playwright lokalnego Chrome'a (a gdy go nie ma w systemie — pobrany automatycznie Chromium), loguje na Facebooku i wyszukuje **publiczne strony** według fraz z profilu. Wynik — deduplikowana lista adresów stron — ląduje w `data/<id>/candidates.json` i jest nadpisywany przy każdym uruchomieniu (gdy wyszukiwanie nie zwróci nic, stary plik zostaje).

## Uruchomienie

```bash
npm install
npm run search -- --profile profiles/kolo-gospodyn.yaml
```

Opcjonalna flaga `--max-results 100` ogranicza liczbę stron zebranych dla jednej frazy (każda fraza leci w osobnej karcie równolegle).

Wyszukiwarka na samym początku loguje — jeśli sesja w `.auth/chrome-profile` wygasła, otwiera formularz (wypełnia go z `FB_EMAIL`/`FB_PASSWORD` z `.env`, gdy są ustawione) i czeka na dokończenie logowania w oknie. Samo logowanie można też odpalić osobno: `npm run login`.

## Windows

Projekt działa na Windowsie bez zmian (Node.js + Playwright są multiplatformowe):

```powershell
# 1. Zainstaluj Node.js LTS z https://nodejs.org
# 2. W katalogu projektu (PowerShell lub cmd):
npm install
npm run search -- --profile profiles/kolo-gospodyn.yaml
```

`npm install` sam pobiera też Chromium (skrypt postinstall).

- Jeśli masz zainstalowany Google Chrome, skrypt użyje go automatycznie; bez Chrome'a sam spadnie na pobrany Chromium.
- Plik `.env` z `FB_EMAIL` i `FB_PASSWORD` działa tak samo jak na Linuksie.
- Zmienne środowiskowe w PowerShellu ustawisz tak: `$env:BROWSER_CHANNEL="chromium"`.

## Konfiguracja profilu

Nowy profil to plik YAML w `profiles/` z dwoma polami: `id` (nazwa katalogu wyników) i `search_queries` (frazy wpisywane do wyszukiwarki).

Sesja Facebooka zostaje lokalnie w `.auth/chrome-profile`; nie jest commitowana.
