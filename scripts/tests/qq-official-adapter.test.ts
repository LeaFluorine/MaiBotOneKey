import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InitManager } from "../../src/main/services/init-manager";
import { QQ_OFFICIAL_ADAPTER_DIRECTORY, QQ_OFFICIAL_ADAPTER_PLUGIN_ID } from "../../src/shared/qq-official-adapter";
import type { RuntimePaths } from "../../src/shared/contracts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

test("first Core preparation installs both adapters and preserves an existing official configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "maibot-official-bundle-"));
  roots.push(root);
  const paths = {
    bundledModulesRoot: join(root, "modules"),
    maibotRoot: join(root, "instance", "MaiBot"),
    logsRoot: join(root, "logs"),
    userDataRoot: join(root, "userData"),
  } as RuntimePaths;
  const bundledCore = join(paths.bundledModulesRoot, "MaiBot");
  const bundledSnowLuma = join(bundledCore, "plugins", "snowluma-adapter");
  await mkdir(bundledSnowLuma, { recursive: true });
  await writeFile(join(bundledCore, "bot.py"), "# fixture");
  await writeFile(join(bundledSnowLuma, "plugin.py"), "# fixture");
  await writeFile(join(bundledSnowLuma, "_manifest.json"), JSON.stringify({ id: "maibot-team.snowluma-adapter" }));
  await cp(
    join(process.cwd(), "resources", "bundled-plugins", QQ_OFFICIAL_ADAPTER_DIRECTORY),
    join(root, "resources", "bundled-plugins", QQ_OFFICIAL_ADAPTER_DIRECTORY),
    { recursive: true },
  );
  const manager = new InitManager(paths);
  await manager.ensureServiceReady("maibot");
  const official = join(paths.maibotRoot, "plugins", QQ_OFFICIAL_ADAPTER_DIRECTORY);
  expect(existsSync(join(paths.maibotRoot, "plugins", "snowluma-adapter", "plugin.py"))).toBe(true);
  for (const file of ["plugin.py", "settings.py", "codec.py", "_manifest.json", "LICENSE"]) {
    expect(existsSync(join(official, file))).toBe(true);
  }
  expect(JSON.parse(await readFile(join(official, "_manifest.json"), "utf8")).id).toBe(QQ_OFFICIAL_ADAPTER_PLUGIN_ID);
  const config = '[plugin]\nenabled = false\n[qq_official]\napp_id = "saved-app-id"\napp_secret = "fixture-secret"\n';
  await writeFile(join(official, "config.toml"), config);
  const custom = join(paths.maibotRoot, "plugins", "custom-official-location");
  await rename(official, custom);
  await manager.ensureServiceReady("maibot");
  expect(await readFile(join(custom, "config.toml"), "utf8")).toBe(config);
  expect(existsSync(official)).toBe(false);
  await mkdir(paths.userDataRoot, { recursive: true });
  const backendStatePath = join(paths.userDataRoot, "qq-backend.json");
  const connections = { snowluma: { port: 7988, token: "preserved-token" } };
  await writeFile(backendStatePath, JSON.stringify({ backend: "snowluma", connections }));
  const snowConfig = manager.snowlumaAdapterConfigPath();
  await writeFile(snowConfig, '[plugin]\nenabled = true\n[client]\nport = 7988\ntoken = "saved-token"\n');
  expect(manager.getQqProtocolSync()).toBe("snowluma");
  expect(manager.hasOfficialQqCredentials()).toBe(true);
  await expect(manager.setQqProtocol("official", { officialCredentials: { appId: "new-id", appSecret: " " } })).rejects.toThrow("请填写 AppID 和 AppSecret");
  expect(manager.getQqProtocolSync()).toBe("snowluma");
  expect(await readFile(join(custom, "config.toml"), "utf8")).toBe(config);
  await manager.setQqProtocol("official");
  const reloaded = new InitManager(paths);
  expect(reloaded.getQqProtocolSync()).toBe("official");
  expect(reloaded.getQqBackendSync()).toBe("snowluma");
  expect(JSON.parse(await readFile(backendStatePath, "utf8")).connections).toEqual(connections);
  const officialConfig = await readFile(join(custom, "config.toml"), "utf8");
  expect(officialConfig).toContain("enabled = true");
  expect(officialConfig).toContain('app_id = "saved-app-id"');
  const disabledSnowConfig = await readFile(snowConfig, "utf8");
  expect(disabledSnowConfig).toContain("enabled = false");
  expect(disabledSnowConfig).toContain('token = "saved-token"');
  await manager.setQqProtocol("official", { officialCredentials: { appId: " updated-id ", appSecret: " updated-fixture-secret " } });
  const updatedCredentialsConfig = await readFile(join(custom, "config.toml"), "utf8");
  expect(updatedCredentialsConfig).toContain('app_id = "updated-id"');
  expect(updatedCredentialsConfig).toContain('app_secret = "updated-fixture-secret"');
  await writeFile(snowConfig, '[plugin\nbroken = true');
  await expect(manager.setQqProtocol("official")).rejects.toThrow();
  expect(await readFile(join(custom, "config.toml"), "utf8")).toBe(updatedCredentialsConfig);
});

test("release resources include the official plugin without user configuration", async () => {
  const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
  const resource = packageJson.build.extraResources.find((item: { to: string }) => item.to === "modules/MaiBot/plugins/qq_official_adapter");
  expect(resource.from).toBe("resources/bundled-plugins/qq_official_adapter");
  expect(resource.filter).toContain("!config.toml");
  expect(resource.filter).toContain("!data/**");
});
