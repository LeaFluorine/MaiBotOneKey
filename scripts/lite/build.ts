import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build, Platform } from "electron-builder";

const root = process.cwd();
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const electronPkg = JSON.parse(await readFile(join(root, "node_modules/electron/package.json"), "utf8"));
for (const path of ["modules/MaiBot/bot.py", "modules/MaiBot/EULA.md", "modules/MaiBot/PRIVACY.md", "runtime/python/python.exe"]) {
  await stat(join(root, path));
}
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, [join(root, "node_modules/electron-vite/bin/electron-vite.js"), "build", "--config", "electron.lite.config.ts"], { stdio: "inherit", cwd: root });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Lite build exited ${code}`)));
});
// A tiny dedicated app directory prevents inherited release settings/dependencies.
const appDir = join(root, ".codex-tmp/lite-app");
for (const stalePath of [join(root, "out-lite/ui"), join(root, "out-lite/preload"), join(appDir, "out-lite")]) {
  const resolved = resolve(stalePath);
  if (!resolved.startsWith(resolve(root) + "\\")) throw new Error("Unexpected cleanup path");
  await rm(resolved, { recursive: true, force: true });
}
await mkdir(appDir, { recursive: true });
await cp(join(root, "out-lite"), join(appDir, "out-lite"), { recursive: true });
await mkdir(join(appDir, "node_modules"), { recursive: true });
await cp(join(root, "node_modules/smol-toml"), join(appDir, "node_modules/smol-toml"), { recursive: true });
await writeFile(join(appDir, "package.json"), JSON.stringify({
  name: "maibot-lite-test", version: pkg.version, description: "Experimental MaiBot-only desktop package",
  author: "MaiBot OneKey", license: "GPL-3.0-only", main: "out-lite/main/index.cjs",
  dependencies: { "smol-toml": pkg.dependencies["smol-toml"] },
}, null, 2));
await build({
  projectDir: appDir,
  targets: Platform.WINDOWS.createTarget(process.argv.includes("--dir") ? "dir" : "portable"),
  config: {
    extends: null, appId: "org.maibot.lite.test", productName: "MaiBot Lite Test", electronVersion: electronPkg.version,
    directories: { app: appDir, output: join(root, "release/lite-test"), buildResources: join(root, "resources") },
    npmRebuild: false, compression: "normal", files: ["out-lite/**/*", "package.json", "node_modules/smol-toml/**/*"],
    extraResources: [
      { from: join(root, "runtime/python"), to: "runtime/python", filter: ["**/*", "!Doc/**", "!**/__pycache__/**", "!**/*.pyc"] },
      { from: join(root, "modules/MaiBot"), to: "modules/MaiBot", filter: [
        "bot.py", "pyproject.toml", "requirements.txt", "EULA.md", "PRIVACY.md", "LICENSE",
        "src/**/*", "locales/**/*", "prompts/**/*", "depends-data/char_frequency.json",
        "!**/__pycache__/**", "!**/*.pyc", "!**/.env", "!**/.git/**",
      ] },
    ],
    win: { icon: join(root, "resources/icon.ico"), extraResources: [], artifactName: "MaiBot-Lite-Test-${version}-win.${ext}", signAndEditExecutable: false },
    portable: { requestExecutionLevel: "user" },
  },
});
