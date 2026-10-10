import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { InitManager } from "../../src/main/services/init-manager";
import type { InitState, QqBackend, RuntimePaths } from "../../src/shared/contracts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "maibot-qq-switch-"));
  roots.push(root);
  const paths = {
    maibotRoot: join(root, "MaiBot"),
    napcatRoot: join(root, "napcat"),
    snowlumaRoot: join(root, "SnowLuma"),
    userDataRoot: join(root, "userData"),
    bundledModulesRoot: join(root, "bundled"),
  } as RuntimePaths;
  const adapterPath = join(paths.maibotRoot, "plugins", "snowluma-adapter", "config.toml");
  await mkdir(join(paths.maibotRoot, "plugins", "snowluma-adapter"), { recursive: true });
  const manager = new InitManager(paths);
  // These tests exercise setup and the actual generated connection files,
  // without requiring bundled binaries or Python dependency discovery.
  manager.ensureServiceReady = async () => [];
  manager.getState = async () => ({ qqBackend: manager.getQqBackendSync() } as InitState);
  return { paths, manager, adapterPath };
}

test("SnowLuma-only payload defaults to SnowLuma and preserves a saved backend", async () => {
  const { paths, manager } = await fixture();
  await mkdir(join(paths.bundledModulesRoot, "SnowLuma"), { recursive: true });
  expect(manager.getQqBackendSync()).toBe("snowluma");
  await manager.setQqBackend("napcat");
  expect(manager.getQqBackendSync()).toBe("napcat");
});

test("full payload keeps NapCat as the default", async () => {
  const { paths, manager } = await fixture();
  await mkdir(join(paths.bundledModulesRoot, "SnowLuma"), { recursive: true });
  await mkdir(join(paths.bundledModulesRoot, "napcat"), { recursive: true });
  expect(manager.getQqBackendSync()).toBe("napcat");
});

async function endpoint(paths: RuntimePaths, backend: QqBackend) {
  if (backend === "napcat") {
    const config = JSON.parse(await readFile(join(paths.napcatRoot, "napcat", "config", "onebot11_123456.json"), "utf8"));
    const server = config.network.websocketServers[0];
    return { port: server.port, token: server.token };
  }
  const config = JSON.parse(await readFile(join(paths.snowlumaRoot, "config", "onebot_123456.json"), "utf8"));
  const server = config.networks.wsServers[0];
  return { port: server.port, token: server.accessToken };
}

for (const backend of ["napcat", "snowluma"] as const) {
  test(`${backend} requires a valid QQ account before changing configuration`, async () => {
    const { manager } = await fixture();
    const previousBackend = manager.getQqBackendSync();
    for (const account of ["", "0", "invalid"]) {
      await expect(manager.setQqAccount(account, undefined, undefined, backend)).rejects.toThrow("QQ 号必须是纯数字");
    }
    expect(manager.getQqBackendSync()).toBe(previousBackend);
    expect(manager.hasMessagePlatformConfigured()).toBe(false);
  });
}

test("SnowLuma injects the setup account even when MaiBot still has a previous account", async () => {
  const { manager } = await fixture();
  manager.readQqAccount = async () => "111111";
  expect(await manager.readSnowLumaTargetQqAccount()).toBe("111111");
  await manager.setQqAccount("2814567326", undefined, undefined, "snowluma");
  expect(await manager.readSnowLumaTargetQqAccount()).toBe("2814567326");
});
for (const backend of ["napcat", "snowluma"] as const) {
  test(`first setup with ${backend} and round-trip switching use one adapter`, async () => {
    const { paths, manager, adapterPath } = await fixture();
    await manager.setQqAccount("123456", "test-connection-token", undefined, backend);
    const original = await readFile(adapterPath, "utf8");
    const adapter = parse(original) as any;
    const expected = { port: adapter.client.port, token: adapter.client.token };
    expect(await endpoint(paths, backend)).toEqual(expected);
    const other = backend === "napcat" ? "snowluma" : "napcat";
    await manager.setQqBackend(other);
    const switched = parse(await readFile(adapterPath, "utf8")) as any;
    expect(await endpoint(paths, other)).toEqual({ port: 7988, token: switched.client.token });
    expect(switched.client.token).not.toBe(expected.token);
    await manager.setQqBackend(backend);
    expect(await endpoint(paths, backend)).toEqual(expected);
    expect(await readFile(adapterPath, "utf8")).toBe(original);
    expect(existsSync(join(paths.maibotRoot, "plugins", "napcat-adapter"))).toBe(false);
  });
}

test("selection preserves disabled adapter, custom settings and empty token", async () => {
  const { paths, manager, adapterPath } = await fixture();
  const original = '[plugin]\nenabled = false\ncustom_setting = true\n[client]\nserver = "127.0.0.1"\nport = 18088\ntoken = ""\n';
  await writeFile(adapterPath, original);
  const legacyDir = join(paths.maibotRoot, "plugins", "napcat-adapter");
  await mkdir(legacyDir, { recursive: true });
  const legacy = "legacy config must remain untouched";
  await writeFile(join(legacyDir, "config.toml"), legacy);
  await manager.setQqAccount("123456", undefined, undefined, "napcat");
  await manager.setQqBackend("snowluma");
  expect(await endpoint(paths, "napcat")).toEqual({ port: 18088, token: "" });
  const switched = parse(await readFile(adapterPath, "utf8")) as any;
  const expected = parse(original) as any;
  expected.client.port = 7988;
  expected.client.token = switched.client.token;
  expect(switched.client.token.length).toBeGreaterThan(0);
  expect(await endpoint(paths, "snowluma")).toEqual({ port: 7988, token: switched.client.token });
  expect(switched).toEqual(expected);
  expect(await readFile(join(legacyDir, "config.toml"), "utf8")).toBe(legacy);
  await manager.setQqBackend("napcat");
  expect(await endpoint(paths, "napcat")).toEqual({ port: 18088, token: "" });
  expect((parse(await readFile(adapterPath, "utf8")) as any).client.token).toBe("");
});

for (const backend of ["napcat", "snowluma"] as const) {
  test(`${backend} remembers live adapter ports and tokens independently across restarts`, async () => {
    const { paths, manager, adapterPath } = await fixture();
    await manager.setQqAccount("123456", "test-token", undefined, backend);
    const setConnection = async (port: number, token: string) => {
      const text = await readFile(adapterPath, "utf8");
      await writeFile(adapterPath, text.replace(/^port = \d+/m, `port = ${port}`).replace(/^token = .*$/m, `token = "${token}"`));
    };
    const getPort = async () => (parse(await readFile(adapterPath, "utf8")) as any).client.port;
    const other = backend === "napcat" ? "snowluma" : "napcat";
    await setConnection(18088, "first-custom-token");
    await manager.setQqBackend(other);
    expect(await getPort()).toBe(7988);
    expect((await endpoint(paths, other)).port).toBe(7988);
    await setConnection(19099, "second-custom-token");
    const restarted = new InitManager(paths);
    restarted.ensureServiceReady = async () => [];
    await restarted.setQqBackend(backend);
    expect(await getPort()).toBe(18088);
    expect(await endpoint(paths, backend)).toEqual({ port: 18088, token: "first-custom-token" });
    expect((parse(await readFile(adapterPath, "utf8")) as any).client.token).toBe("first-custom-token");
    await restarted.setQqBackend(other);
    expect(await getPort()).toBe(19099);
    expect(await endpoint(paths, other)).toEqual({ port: 19099, token: "second-custom-token" });
    expect((parse(await readFile(adapterPath, "utf8")) as any).client.token).toBe("second-custom-token");
    await setConnection(7988, "");
    await restarted.setQqBackend(backend);
    await restarted.setQqBackend(other);
    expect(await getPort()).toBe(7988);
    expect(await endpoint(paths, other)).toEqual({ port: 7988, token: "" });
  });
}

test("failed switch restores current selection and adapter port", async () => {
  const { manager, adapterPath } = await fixture();
  await manager.setQqAccount("123456", "test-token", undefined, "snowluma");
  const original = (await readFile(adapterPath, "utf8")).replace(/^port = \d+/m, "port = 18088");
  await writeFile(adapterPath, original);
  manager.ensureServiceReady = async () => { throw new Error("fixture preparation failed"); };
  await expect(manager.setQqBackend("napcat")).rejects.toThrow("fixture preparation failed");
  expect(manager.getQqBackendSync()).toBe("snowluma");
  expect(await readFile(adapterPath, "utf8")).toBe(original);
  manager.ensureServiceReady = async () => [];
  await manager.setQqBackend("napcat");
  await manager.setQqBackend("snowluma");
  expect((parse(await readFile(adapterPath, "utf8")) as any).client.port).toBe(18088);
});

test("current [client] wins over stale [luma_client] in the same config", async () => {
  const { manager, adapterPath, paths } = await fixture();
  await writeFile(adapterPath, '[plugin]\nenabled = false\n[client]\nserver = "127.0.0.1"\nclient_type = "auto"\nport = 7998\ntoken = "active-token"\n[luma_client]\nport = 7988\ntoken = "stale-token"\n');
  await manager.setQqAccount("123456", undefined, undefined, "snowluma");
  expect(await endpoint(paths, "snowluma")).toEqual({ port: 7998, token: "active-token" });
  await manager.setQqBackend("napcat");
  const switched = parse(await readFile(adapterPath, "utf8")) as any;
  expect(switched.client.port).toBe(7988);
  expect(switched.client.token).not.toBe("active-token");
  expect(switched.client.token).not.toBe("stale-token");
  expect(switched.client.client_type).toBe("auto");
  expect(switched.plugin.enabled).toBe(false);
  expect(await endpoint(paths, "napcat")).toEqual({ port: 7988, token: switched.client.token });
  await manager.setQqBackend("snowluma");
  const restored = parse(await readFile(adapterPath, "utf8")) as any;
  expect(restored.client.port).toBe(7998);
  expect(restored.client.token).toBe("active-token");
  expect(await endpoint(paths, "snowluma")).toEqual({ port: 7998, token: "active-token" });
});

test("backend accounts retain separately entered values across protocol switches", async () => {
  const { paths, manager } = await fixture();
  await manager.setQqAccount("123456", undefined, undefined, "napcat");
  await manager.setQqBackend("snowluma");
  expect(manager.getQqBackendAccounts()).toEqual({ napcat: "123456", snowluma: undefined });
  await manager.setQqAccount("654321", undefined, undefined, "snowluma");
  await manager.setQqBackend("napcat");
  expect(manager.getQqBackendAccounts()).toEqual({ napcat: "123456", snowluma: "654321" });
  expect(new InitManager(paths).getQqBackendAccounts()).toEqual({ napcat: "123456", snowluma: "654321" });
});

test("legacy message platform account belongs only to its saved backend", async () => {
  const { paths, manager } = await fixture();
  await mkdir(paths.userDataRoot, { recursive: true });
  await writeFile(join(paths.userDataRoot, "message-platform.json"), JSON.stringify({ version: 1, backend: "snowluma", qqAccount: "654321" }));
  expect(manager.getQqBackendAccounts()).toEqual({ napcat: undefined, snowluma: "654321" });
});
for (const backend of ["napcat", "snowluma"] as const) {
  test(`environment repair preserves ${backend} connection files until explicit synchronization`, async () => {
    const { paths, manager, adapterPath } = await fixture();
    await manager.setQqAccount("123456", "shared-token", undefined, backend);
    manager.ensureModulesReady = async () => [];
    const configPath = backend === "napcat"
      ? join(paths.napcatRoot, "napcat", "config", "onebot11_123456.json")
      : join(paths.snowlumaRoot, "config", "onebot_123456.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const server = backend === "napcat" ? config.network.websocketServers[0] : config.networks.wsServers[0];
    if (backend === "napcat") server.token = "different-token";
    else server.accessToken = "different-token";
    const changed = JSON.stringify(config);
    await writeFile(configPath, changed);
    const adapterBefore = await readFile(adapterPath, "utf8");
    await manager.repair();
    expect(await readFile(configPath, "utf8")).toBe(changed);
    expect(await readFile(adapterPath, "utf8")).toBe(adapterBefore);
    await manager.syncQqConnections();
    expect((await endpoint(paths, backend)).token).toBe("shared-token");
    expect((parse(await readFile(adapterPath, "utf8")) as any).client.token).toBe("shared-token");
  });
}

test("explicit connection synchronization requires configured account", async () => {
  const { manager } = await fixture();
  await expect(manager.syncQqConnections()).rejects.toThrow("请先在消息平台中配置");
});
