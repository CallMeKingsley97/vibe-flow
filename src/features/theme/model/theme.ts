export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const THEME_STORAGE_KEY = "vibe-flow.theme";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "dark" || value === "light";
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark = window.matchMedia(SYSTEM_THEME_QUERY).matches,
): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}

function syncNativeWindowTheme(preference: ThemePreference, resolved: ResolvedTheme) {
  // Keep Tauri title bar / OS chrome in sync with the web theme.
  // When following system, pass null so the native window tracks the OS appearance.
  void import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) =>
      getCurrentWindow().setTheme(preference === "system" ? null : resolved),
    )
    .catch(() => {
      // Browser / non-Tauri environments do not expose this API.
    });
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "light" ? "#eef3f6" : "#090d14");
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  syncNativeWindowTheme(preference, resolved);
  return resolved;
}

export function initializeTheme() {
  applyTheme(readThemePreference());
}
