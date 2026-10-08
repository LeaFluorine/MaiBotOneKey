export const MAIBOT_THEME_EVENT = "maibot-webui-theme-change";
const CACHE_KEY = "maibot-webui-theme-cache";
export interface MaiBotTheme {
  mode: "future-retro" | "millennium" | "modern";
  dark: boolean;
  preference: "light" | "dark" | "system";
}

export function parseMaiBotTheme(value: unknown): MaiBotTheme | undefined {
  if (!value || typeof value !== "object") return undefined;
  const theme = value as Record<string, unknown>;
  if (!["future-retro", "millennium", "modern"].includes(String(theme.mode)) || typeof theme.dark !== "boolean") return undefined;
  if (theme.preference !== undefined && !["light", "dark", "system"].includes(String(theme.preference))) return undefined;
  // Older caches recorded only the resolved color; they cannot prove a fixed preference.
  const preference = theme.preference === "light" || theme.preference === "dark" ? theme.preference : "system";
  return { mode: theme.mode as MaiBotTheme["mode"], dark: theme.dark, preference };
}

export function resolveMaiBotTheme(theme: MaiBotTheme, systemTheme: "light" | "dark"): "light" | "dark" {
  return theme.preference === "system" ? systemTheme : theme.preference;
}

export function readMaiBotTheme(): MaiBotTheme | undefined {
  try { return parseMaiBotTheme(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null")); }
  catch { return undefined; }
}

export function rememberMaiBotTheme(theme: MaiBotTheme): void {
  const previous = readMaiBotTheme();
  if (previous?.mode === theme.mode && previous.dark === theme.dark && previous.preference === theme.preference) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(theme)); } catch { /* Keep live synchronization without storage. */ }
  window.dispatchEvent(new CustomEvent<MaiBotTheme>(MAIBOT_THEME_EVENT, { detail: theme }));
}

// Read only the WebUI's theme metadata; do not access other local storage.
export const READ_MAIBOT_THEME_SCRIPT = `(() => {
  const root = document.documentElement;
  const mode = root.dataset.dashboardStyle || localStorage.getItem("maibot-theme-dashboard-style");
  if (!["future-retro", "millennium", "modern"].includes(mode)) return null;
  const storedPreference = localStorage.getItem("maibot-theme-mode");
  const preference = storedPreference === "light" || storedPreference === "dark" ? storedPreference : "system";
  return { mode, dark: root.classList.contains("dark"), preference };
})()`;
