import { afterEach, expect, test } from "bun:test";
import { scryptSync } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SnowLumaWebuiAuth } from "../../src/main/services/snowluma-webui-auth";

const roots: string[] = [];
const fallback = "http://127.0.0.1:5099/";
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "snowluma-webui-auth-"));
  roots.push(root);
  const data = join(root, "launcher");
  await mkdir(join(root, "config"));
  const configPath = join(root, "config", "webui.json");
  const writeConfig = (config: unknown) => writeFile(configPath, JSON.stringify(config));
  const writePassword = (password: string) => {
    const salt = Buffer.alloc(16, 42);
    return writeConfig({
      passwordSalt: salt.toString("hex"),
      passwordHash: scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex"),
      mustChangePassword: false,
    });
  };
  return { root, data, auth: new SnowLumaWebuiAuth(root, data), configPath, writeConfig, writePassword };
}

test("fresh bootstrap survives launcher restart and stops supplying a changed password", async () => {
  const f = await fixture();
  const env = await f.auth.prepareEnvironment();
  const password = env.SNOWLUMA_WEBUI_BOOTSTRAP_PASSWORD;
  expect(password.length).toBeGreaterThanOrEqual(32);
  await f.writePassword(password);
  expect(new URL(await f.auth.resolveUrl(fallback)).searchParams.get("token")).toBe(password);
  const restarted = new SnowLumaWebuiAuth(f.root, f.data);
  expect(await restarted.prepareEnvironment()).toEqual({});
  expect(new URL(await restarted.resolveUrl(fallback)).searchParams.get("token")).toBe(password);
  await f.writePassword("user-changed-password");
  expect(await restarted.resolveUrl(fallback)).toBe(fallback);
});

test("captures current initial password from ANSI logs without replacing existing configuration", async () => {
  const f = await fixture();
  await f.writePassword("initial-password");
  const original = await readFile(f.configPath, "utf8");
  expect(await f.auth.prepareEnvironment()).toEqual({});
  expect(await f.auth.resolveUrl(fallback)).toBe(fallback);
  f.auth.captureOutput("12:00 INFO \x1b[32m[WebUI]\x1b[0m initial credentials: user=admin password=initial-password");
  expect(new URL(await f.auth.resolveUrl(fallback)).searchParams.get("token")).toBe("initial-password");
  expect(await readFile(f.configPath, "utf8")).toBe(original);
  await f.auth.prepareEnvironment();
  expect(await f.auth.resolveUrl(fallback)).toBe(fallback);
});

test("legacy WebUI token is encoded and never taken from OneBot or sent to a remote origin", async () => {
  const f = await fixture();
  await f.writeConfig({ token: "test+/=?#&" });
  const result = new URL(await f.auth.resolveUrl(`${fallback}?existing=1`));
  expect(result.searchParams.get("token")).toBe("test+/=?#&");
  expect(result.searchParams.get("existing")).toBe("1");
  expect(await f.auth.resolveUrl("http://example.com:5099/")).toBe("http://example.com:5099/");
  await f.writeConfig({ accessToken: "onebot-token" });
  expect(await f.auth.resolveUrl(fallback)).toBe(fallback);
});

test("missing, malformed or unknown credentials fall back without overwriting them", async () => {
  const f = await fixture();
  expect(await f.auth.resolveUrl(fallback)).toBe(fallback);
  await writeFile(f.configPath, "invalid json");
  expect(await f.auth.prepareEnvironment()).toEqual({});
  expect(await f.auth.resolveUrl(fallback)).toBe(fallback);
  expect(await readFile(f.configPath, "utf8")).toBe("invalid json");
});
