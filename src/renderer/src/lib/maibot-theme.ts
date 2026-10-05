export const MAIBOT_THEME_EVENT = "maibot-webui-theme-change";
const CACHE_KEY = "maibot-webui-theme-cache";
export interface MaiBotTheme {
  mode: "future-retro" | "millennium" | "modern";
  dark: boolean;
}

export function parseMaiBotTheme(value: unknown): MaiBotTheme | undefined {
  if (!value || typeof value !== "object") return undefined;
  const theme = value as Record<string, unknown>;
  if (!["future-retro", "millennium", "modern"].includes(String(theme.mode)) || typeof theme.dark !== "boolean") return undefined;
  return { mode: theme.mode as MaiBotTheme["mode"], dark: theme.dark };
}

export function readMaiBotTheme(): MaiBotTheme | undefined {
  try { return parseMaiBotTheme(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null")); }
  catch { return undefined; }
}

export function rememberMaiBotTheme(theme: MaiBotTheme): void {
  const previous = readMaiBotTheme();
  if (previous?.mode === theme.mode && previous.dark === theme.dark) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(theme)); } catch { /* Keep live synchronization without storage. */ }
  window.dispatchEvent(new CustomEvent<MaiBotTheme>(MAIBOT_THEME_EVENT, { detail: theme }));
}

// Read only the WebUI's theme metadata; do not access other local storage.
export const READ_MAIBOT_THEME_SCRIPT = `(() => {
  const root = document.documentElement;
  const mode = root.dataset.dashboardStyle || localStorage.getItem("maibot-theme-dashboard-style");
  if (!["future-retro", "millennium", "modern"].includes(mode)) return null;
  return { mode, dark: root.classList.contains("dark") };
})()`;
