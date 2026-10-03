import { app, BrowserWindow, dialog, Menu, session } from "electron";
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { createServer } from "node:net";
import type { RuntimePaths } from "../shared/contracts";
import { InitManager } from "../main/services/init-manager";
import { PythonDependencyManager } from "../main/services/python-dependency-manager";

app.setName("MaiBot Lite Test");
const dataRoot = resolve(process.env.MAIBOT_LITE_TEST_DATA || join(app.getPath("appData"), "MaiBotLiteTest"));
app.setPath("userData", dataRoot);
const payloadRoot = app.isPackaged ? process.resourcesPath : process.cwd();
const maibotRoot = join(dataRoot, "modules", "MaiBot");
const paths: RuntimePaths = {
  installRoot: app.isPackaged ? dirname(process.execPath) : process.cwd(),
  userDataRoot: dataRoot, defaultResourceRoot: dataRoot, resourceRoot: dataRoot,
  modulesRoot: join(dataRoot, "modules"), maibotRoot, defaultMaibotRoot: maibotRoot,
  napcatRoot: join(dataRoot, "unused-napcat"), defaultNapcatRoot: join(dataRoot, "unused-napcat"),
  snowlumaRoot: join(dataRoot, "unused-snowluma"), defaultSnowlumaRoot: join(dataRoot, "unused-snowluma"),
  bundledModulesRoot: join(payloadRoot, "modules"), runtimeRoot: join(payloadRoot, "runtime"),
  pythonEnvRoot: join(dataRoot, "python-env"), pluginBuilderRoot: join(dataRoot, "plugins"),
  logsRoot: join(dataRoot, "logs"),
};
const init = new InitManager(paths);
const python = new PythonDependencyManager(paths, init);
let webui: BrowserWindow | undefined;
let child: ChildProcessWithoutNullStreams | undefined;
let quitting = false;
const smoke = process.argv.includes("--lite-smoke-check");
const webuiSmoke = process.argv.includes("--lite-webui-smoke");
const coreSmoke = process.argv.includes("--lite-core-smoke");
const logPath = join(paths.logsRoot, "lite.log");

function log(message: string | Buffer): void {
  const line = message.toString().replace(/\x1b\[[0-9;]*m/g, "").replace(/([?&]token=)[^&\s'"]+/g, "$1[redacted]");
  void appendFile(logPath, line + "\n").catch(() => undefined);
}

async function prepare(): Promise<void> {
  await mkdir(paths.logsRoot, { recursive: true });
  if (!existsSync(join(maibotRoot, "bot.py"))) {
    const source = join(paths.bundledModulesRoot, "MaiBot");
    const staging = join(dataRoot, "modules", `MaiBot-staging-${process.pid}`);
    const excluded = new Set(["config", "data", "logs", "temp", "plugins", "dashboard", ".venv", ".git", ".github", ".devcontainer", "tests", "pytests", "docs", "changelogs"]);
    await cp(source, staging, {
      recursive: true,
      filter: (file) => {
        const parts = relative(source, file).split(/[\\/]/);
        return !excluded.has(parts[0]) && !parts.includes("__pycache__") && !file.endsWith(".pyc") && !parts.includes(".env");
      },
    });
    await rename(staging, maibotRoot);
    log("已复制干净的 MaiBot；没有复制正式版配置、数据或 QQ 插件。");
  }
  await mkdir(join(maibotRoot, "config"), { recursive: true });
  const config = join(maibotRoot, "config", "bot_config.toml");
  if (!existsSync(config)) {
    // Core fills in its own defaults. Use a separate loopback port from the standard app.
    const coreConfig = await readFile(join(maibotRoot, "src", "config", "config.py"), "utf8");
    const version = coreConfig.match(/^CONFIG_VERSION:\s*str\s*=\s*"([^"]+)"/m)?.[1];
    if (!version) throw new Error("无法读取 MaiBot 配置版本。");
    await writeFile(config, `[inner]\nversion = "${version}"\n\n[webui]\nenabled = true\nhost = ["127.0.0.1"]\nport = 18001\n\n[maim_message]\nws_server_host = "127.0.0.1"\nws_server_port = 18000\nenable_api_server = false\n`, "utf8");
  }
}

function checkPort(port: number): Promise<void> {
  return new Promise((resolveCheck, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`端口 ${port} 已被占用，请关闭占用程序或修改测试配置。`)));
    server.listen(port, "127.0.0.1", () => server.close(() => resolveCheck()));
  });
}

async function confirmAgreements(): Promise<boolean> {
  const agreements = await init.getAgreementState();
  if (agreements.isConfirmed) return true;
  for (const document of agreements.documents) {
    if (!document.exists) throw new Error(`缺少协议文件: ${document.sourcePath}`);
    if (document.confirmed) continue;
    const { response } = await dialog.showMessageBox({
      type: "info", title: document.title,
      message: document.title,
      detail: await readFile(document.sourcePath, "utf8"),
      buttons: ["同意", "退出"], defaultId: 1, cancelId: 1, noLink: true,
    });
    if (response !== 0) return false;
  }
  await init.confirmAgreements();
  return true;
}

async function stopChild(): Promise<void> {
  const pid = child?.pid;
  if (!pid) return;
  await new Promise<void>((done) => {
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 10000 }, () => done());
  });
}

async function openWebUi(): Promise<void> {
  const endpoint = init.readMaiBotWebUiEndpointSync();
  const url = new URL(endpoint.url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("测试版仅允许本机 WebUI 地址。");
  await checkPort(endpoint.port);
  // Use Chromium's connection path for both readiness checks and the real window.
  // Keep local WebUI traffic out of system proxies and old launcher page caches.
  const webuiSession = session.fromPartition("persist:maibot-lite-webui");
  await webuiSession.setProxy({ mode: "direct" });
  let executable = python.getPythonPath();
  let args = ["-u", "bot.py"];
  if (webuiSmoke || coreSmoke) {
    // Exercise the real dashboard and HTTP routes without accepting agreements or calling a model.
    executable = process.env.MAIBOT_LITE_TEST_PYTHON || "";
    if (!executable || !existsSync(executable) || !process.env.MAIBOT_LITE_TEST_DATA) throw new Error("WebUI smoke requires explicit test Python and data paths.");
    if (webuiSmoke) args = ["-u", "-c", `from src.webui.app import create_app; import uvicorn; uvicorn.run(create_app(),host='127.0.0.1',port=${endpoint.port})`];
  } else {
    log("正在检查和安装 MaiBot 核心依赖…");
    await python.upgradeStartupDependencies(log);
  }
  if (quitting) return;
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUTF8: "1", PYTHONUNBUFFERED: "1", ...(webuiSmoke ? {} : await init.getAgreementEnvVars()) };
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  const processChild = spawn(executable, args, { cwd: maibotRoot, windowsHide: true, env, stdio: "pipe" });
  child = processChild;
  processChild.stdout.on("data", log);
  processChild.stderr.on("data", log);
  let processError: Error | undefined;
  processChild.on("error", (error) => { processError = error; log(String(error)); });
  processChild.on("close", (code) => {
    if (child === processChild) child = undefined;
    log(`MaiBot 已退出（${code}）`);
    if (webui && !quitting) {
      dialog.showErrorBox("MaiBot 已退出", `退出码 ${code}。日志：${logPath}`);
      app.quit();
    }
  });
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline && child === processChild && !quitting) {
    let ready = false;
    try {
      const response = await webuiSession.fetch(endpoint.url, { signal: AbortSignal.timeout(2000) });
      ready = response.ok && (response.headers.get("content-type") || "").includes("text/html");
      await response.body?.cancel();
    } catch { /* Wait for the core to bind its WebUI. */ }
    if (ready) {
      webui = new BrowserWindow({
        width: 1200, height: 850, title: "MaiBot Lite · 测试版", autoHideMenuBar: true, show: false,
        webPreferences: { session: webuiSession, nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
      webui.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      webui.webContents.on("did-fail-load", (_event, code, description, failedUrl, mainFrame) => {
        log(`WebUI load failed: code=${code} description=${description} mainFrame=${mainFrame} url=${failedUrl.split("?")[0]}`);
      });
      webui.webContents.on("render-process-gone", (_event, details) => log(`WebUI renderer exited: ${details.reason}, code=${details.exitCode}`));
      webui.webContents.on("will-navigate", (event, destination) => {
        if (new URL(destination).origin !== url.origin) {
          log(`Blocked navigation to ${new URL(destination).origin}`);
          event.preventDefault();
        }
      });
      webui.on("closed", () => { webui = undefined; if (!quitting) app.quit(); });
      let loaded = false;
      let lastLoadError = "unknown";
      for (let attempt = 1; attempt <= 8 && child === processChild && !quitting; attempt++) {
        const { token } = await init.readMaiBotWebUiToken();
        try {
          await webui.loadURL(token ? `${url.origin}/auth?token=${encodeURIComponent(token)}` : endpoint.url);
          loaded = true;
          log(`WebUI loaded successfully (attempt ${attempt})`);
          break;
        } catch (error) {
          lastLoadError = String(error).split(" loading ")[0];
          log(`WebUI load attempt ${attempt}/8 failed: ${lastLoadError}`);
          if (attempt < 8) await new Promise((done) => setTimeout(done, 1000));
        }
      }
      if (!loaded) throw new Error(`WebUI 页面加载重试失败：${lastLoadError}。日志：${logPath}`);
      // The first and only application page is MaiBot's own WebUI.
      webui.show();
      if (webuiSmoke || coreSmoke) {
        const uiDeadline = Date.now() + 30000;
        while (Date.now() < uiDeadline) {
          const rendered = await webui.webContents.executeJavaScript("!!document.querySelector('#root')?.children.length && !window.lite");
          if (rendered) {
            await writeFile(join(dataRoot, "native-webui.png"), (await webui.webContents.capturePage()).toPNG());
            await appendFile(logPath, `LITE_NATIVE_WEBUI_OK ${webui.webContents.getURL().split("?")[0]}\n`);
            app.quit();
            return;
          }
          await new Promise((done) => setTimeout(done, 500));
        }
        throw new Error("MaiBot 原生 WebUI 未完成渲染。");
      }
      return;
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  if (!quitting) throw processError ?? new Error(`MaiBot WebUI 未就绪，请查看日志：${logPath}`);
}

async function smokeCheck(): Promise<void> {
  const agreements = await init.getAgreementState();
  if (agreements.documents.some((document) => !document.exists)) throw new Error("协议文件缺失。");
  await python.ensurePythonEnvironment(log);
  await new Promise<void>((done, reject) => {
    const probe = spawn(python.getPythonPath(), ["-c", "import ssl, sqlite3, tomllib; print('LITE_PYTHON_OK')"], { windowsHide: true });
    probe.stdout.on("data", log);
    probe.stderr.on("data", log);
    probe.on("error", reject);
    probe.on("close", (code) => code === 0 ? done() : reject(new Error(`Python probe exited ${code}`)));
  });
  await appendFile(logPath, "LITE_SMOKE_OK\n");
  app.exit(0);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { webui?.show(); webui?.focus(); });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await prepare();
    if (smoke) { await smokeCheck(); return; }
    if (!webuiSmoke && !(await confirmAgreements())) { app.quit(); return; }
    await openWebUi();
  }).catch(async (error) => {
    log(String(error));
    await stopChild();
    if (smoke || webuiSmoke || coreSmoke) {
      await appendFile(logPath, `LITE_CHECK_FAILED ${String(error)}\n`).catch(() => undefined);
      app.exit(1);
    } else {
      dialog.showErrorBox("MaiBot 启动失败", `${String(error)}\n日志：${logPath}`);
      app.quit();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    python.cancelStartupUpgrade();
    void Promise.allSettled([stopChild(), python.waitForStartupUpgradeIdle()]).then(() => app.quit());
  });
}
