import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// WebUI credentials are independent of OneBot websocket accessToken.
export class SnowLumaWebuiAuth {
  private initialPassword?: string;
  private verifiedKey?: string;
  private verifiedPassword?: string;

  constructor(private readonly root: string, private readonly userDataRoot: string) {}

  private get credentialPath(): string {
    return join(this.userDataRoot, "snowluma-webui-credential.json");
  }

  async prepareEnvironment(): Promise<Record<string, string>> {
    this.initialPassword = undefined;
    try {
      await readFile(join(this.root, "config", "webui.json"), "utf8");
      return {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return {};
    }
    // Let SnowLuma create its own hash/config using its supported bootstrap API.
    const password = randomBytes(24).toString("base64url");
    await mkdir(dirname(this.credentialPath), { recursive: true });
    await writeFile(this.credentialPath, JSON.stringify({ password }), { mode: 0o600 });
    return { SNOWLUMA_WEBUI_BOOTSTRAP_PASSWORD: password };
  }

  captureOutput(line: string): void {
    const clean = line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, "");
    const match = /\[WebUI\].*initial credentials: user=admin password=(\S+)/u.exec(clean);
    if (match) this.initialPassword = match[1];
  }

  async resolveUrl(fallback: string): Promise<string> {
    try {
      const url = new URL(fallback);
      if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return fallback;
      const config = JSON.parse(await readFile(join(this.root, "config", "webui.json"), "utf8"));
      let password: string | undefined;
      if (typeof config.passwordHash === "string") {
        if (!/^[a-f0-9]{128}$/iu.test(config.passwordHash) || !/^[a-f0-9]{32}$/iu.test(config.passwordSalt)) return fallback;
        const saved = await readFile(this.credentialPath, "utf8").then((text) => JSON.parse(text)).catch(() => ({}));
        const candidate = this.initialPassword ?? saved.password;
        if (typeof candidate !== "string" || !candidate) return fallback;
        const key = JSON.stringify([candidate, config.passwordHash, config.passwordSalt]);
        if (key !== this.verifiedKey) {
          const hash = scryptSync(candidate, Buffer.from(config.passwordSalt, "hex"), 64, { N: 16384, r: 8, p: 1 });
          this.verifiedPassword = timingSafeEqual(hash, Buffer.from(config.passwordHash, "hex")) ? candidate : undefined;
          this.verifiedKey = key;
        }
        password = this.verifiedPassword;
      } else if (typeof config.token === "string") {
        password = config.token;
      }
      if (!password) return fallback;
      url.searchParams.set("token", password);
      return url.toString();
    } catch {
      return fallback;
    }
  }
}
