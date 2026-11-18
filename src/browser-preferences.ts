// Persistence is optional: privacy settings must never prevent browsing.
const languageKey = "ink-observer-language";

export function savedLanguage(): string | null {
  try { return localStorage.getItem(languageKey); }
  catch { return null; }
}

export function saveLanguage(value: string): void {
  try { localStorage.setItem(languageKey, value); }
  catch { /* The selected language remains in the URL and current session. */ }
}
