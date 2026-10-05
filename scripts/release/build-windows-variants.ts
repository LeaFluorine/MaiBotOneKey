import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(command + " exited with code " + code)));
  });
}
async function buildVariant(variant: "standard" | "full" | "snowluma"): Promise<void> {
  const { build, version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const pythonRoot = join(root, "runtime", variant === "full" ? "python-full" : "python");
  if (!existsSync(join(pythonRoot, "python.exe"))) throw new Error("Missing Python runtime: " + pythonRoot);
  if (variant === "full") {
    await run(join(pythonRoot, "python.exe"), ["-I", join(root, "scripts/release/prepare-full-python.py"), "--verify"]);
  }
  const output = join(root, "release", variant);
  const configPath = join(root, ".codex-tmp", "electron-builder-" + variant + ".json");
  const artifactName = "MaiBot-OK-" + version + "-win-" + variant + ".exe";
  await mkdir(join(root, ".codex-tmp"), { recursive: true });
  await mkdir(join(root, "release"), { recursive: true });
  // Keep two source environments, but ship only one at the initializer's usual path.
  const extraResources = build.extraResources.map((resource: { from: string; filter?: string[] }) =>
    resource.from === "runtime"
      ? { ...resource, filter: [...(resource.filter ?? []), "!python/**", "!python-full/**"] }
      : resource);
  extraResources.push({ from: pythonRoot, to: "runtime/python", filter: ["**/*", "!Doc/**", "!**/__pycache__/**", "!**/*.pyc"] });
  await writeFile(configPath, JSON.stringify({
    ...build,
    extraResources,
    directories: { ...build.directories, output },
    win: { ...build.win, artifactName, ...(variant === "snowluma" ? { extraResources: [] } : {}) },
  }, null, 2));
  try {
    console.log("[release] Building Windows x64 " + variant + " installer");
    await run(process.execPath, [join(root, "node_modules/electron-builder/cli.js"),
      "--win", "nsis", "--x64", "--publish", "never", "--config", configPath]);
    const resources = join(output, "win-unpacked/resources");
    if (existsSync(join(resources, "runtime/python-full"))) throw new Error("Both Python runtimes were packaged.");
    if (variant === "snowluma" && existsSync(join(resources, "modules/napcat"))) throw new Error("SnowLuma installer includes NapCat.");
    const bundledDashboard = existsSync(join(resources, "runtime/python/Lib/site-packages/maibot_dashboard"));
    if (bundledDashboard !== (variant === "full")) throw new Error("Incorrect Python payload for " + variant);
    for (const suffix of ["", ".blockmap"]) {
      await copyFile(join(output, artifactName + suffix), join(root, "release", artifactName + suffix));
    }
    await copyFile(join(output, "latest.yml"), join(root, "release", "latest-win-" + variant + ".yml"));
    if (variant === "standard") {
      await copyFile(join(output, "latest.yml"), join(root, "release", "latest.yml"));
      await copyFile(join(output, "latest.yml"), join(root, "release", "latest-win.yml"));
    }
  } finally {
    await rm(configPath, { force: true });
  }
}
if (process.argv.includes("--snowluma-only")) {
  await buildVariant("snowluma");
} else if (process.argv.includes("--standard-only")) {
  await buildVariant("standard");
} else if (process.argv.includes("--full-only")) {
  await buildVariant("full");
} else {
  await buildVariant("standard");
  await buildVariant("full");
}

