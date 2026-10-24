const BLOCKED_SEGMENTS = new Set([
  "groups",
  "events",
  "watch",
  "marketplace",
  "reel",
  "reels",
  "stories",
  "login",
  "messages",
  "photo",
  "photos",
  "videos",
  "posts",
  "permalink",
  "friends",
  "gaming",
  "bookmarks",
  "settings",
  "help",
  "privacy",
  "policies",
  "sharer",
  "share.php",
  "hashtag",
  "search",
  "recover",
  "checkpoint",
  "dialog",
  "notifications",
  "people",
  "l.php",
  "stories.php",
  "photo.php",
]);

const GENERIC_NAMES = new Set([
  "zdjęcie profilowe",
  "zdjecie profilowe",
  "profile photo",
  "obserwuj",
  "follow",
  "lubię to",
  "lubie to",
  "like",
  "udostępnij",
  "share",
  "więcej",
  "wiecej",
  "more",
  "strony",
  "pages",
  "filtry",
  "filters",
]);

export function normalizeFbUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input, "https://www.facebook.com");
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^m\./, "");
  if (host !== "www.facebook.com" && host !== "facebook.com") return null;

  if (url.pathname === "/profile.php") {
    const id = url.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) return null;
    return `https://www.facebook.com/profile.php?id=${id}`;
  }

  let pathName: string;
  try {
    pathName = decodeURIComponent(url.pathname).replace(/\/+$/, "");
  } catch {
    return null;
  }
  if (!pathName || pathName === "/") return null;

  const segments = pathName
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  if (segments.some((segment) => segment.endsWith(".php"))) return null;
  if (segments.some((segment) => BLOCKED_SEGMENTS.has(segment))) return null;
  if (segments.length > 4) return null;

  return `https://www.facebook.com${pathName}`;
}

export function cleanPageName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || name.length > 150) return "";
  if (GENERIC_NAMES.has(name.toLowerCase())) return "";
  return name;
}
