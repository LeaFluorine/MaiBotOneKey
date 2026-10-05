import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { parseMaiBotTheme, READ_MAIBOT_THEME_SCRIPT } from "../../src/renderer/src/lib/maibot-theme";

test("theme reader follows live Dashboard style and resolved dark mode", () => {
  const read = (style: string | undefined, stored: string | null, dark: boolean) => runInNewContext(READ_MAIBOT_THEME_SCRIPT, {
    document: { documentElement: { dataset: { dashboardStyle: style }, classList: { contains: (name: string) => name === "dark" && dark } } },
    localStorage: { getItem: (key: string) => key === "maibot-theme-dashboard-style" ? stored : null },
  });
  expect(parseMaiBotTheme(read("millennium", "modern", true))).toEqual({ mode: "millennium", dark: true });
  expect(parseMaiBotTheme(read("future-retro", null, false))).toEqual({ mode: "future-retro", dark: false });
  expect(parseMaiBotTheme(read(undefined, "modern", true))).toEqual({ mode: "modern", dark: true });
  expect(parseMaiBotTheme(read(undefined, null, false))).toBeUndefined();
});

test("unsupported or malformed theme data cannot change launcher appearance", () => {
  for (const value of [null, {}, { mode: "custom", dark: true }, { mode: "modern", dark: "false" }]) {
    expect(parseMaiBotTheme(value)).toBeUndefined();
  }
});
