# MaiBot Lite 测试包

这是独立的 Electron 实验入口，仅用于测试，不走正式版发布或更新流程。

## 构建与使用

需要 Node.js 24、已安装的仓库依赖，以及 `runtime/python` 和 `modules/MaiBot` payload。

```powershell
bun run typecheck
bun run lite:pack
```

输出：`release/lite-test/MaiBot-Lite-Test-<版本>-win.exe`。运行 EXE 后自动启动 MaiBot，窗口直接加载 MaiBot 原生 WebUI，沿用其样式、首次配置和聊天室；没有额外启动页。首次使用通过系统原生弹窗确认 MaiBot 协议；首次依赖安装在后台进行，可能需要几分钟。进入 WebUI 后配置模型 API，再使用本地聊天室。

默认数据目录为 `%APPDATA%\MaiBotLiteTest`，包括独立的 MaiBot 配置、聊天数据、Python 环境和 `logs/lite.log`。关闭 WebUI 窗口会退出应用并终止所启动的 MaiBot 进程树。

默认 WebUI 使用 `127.0.0.1:18001`，旧版消息 WS 使用 `127.0.0.1:18000`。测试版不读取正式版的实例路径、模型密钥、QQ 配置或聊天数据。

## 范围

- 包含 Electron、干净的 Python、MaiBot 源码及所需静态资源。
- 不包含 NapCat、SnowLuma、它们的插件、Git、PTY 终端或正式版首页。
- 没有 QQ 登录、自动更新和启动器插件管理。MaiBot 原生 WebUI 仍可能显示这些入口；需要外部设施的功能不在本实验支持范围内。
- Python 核心依赖没有裁剪；安装包大小不代表首次依赖安装后的占用。
- 保留源码和动态依赖安装，方便后续实验，尚未尝试将 Python 冻结成单个程序。
- 测试包未签名，不覆盖正式版安装包。

## 初始化冒烟检查

```powershell
bun run lite:pack:dir
$env:MAIBOT_LITE_TEST_DATA = Join-Path $PWD '.codex-tmp/lite-smoke'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& '.\release\lite-test\win-unpacked\MaiBot Lite Test.exe' --lite-smoke-check
Remove-Item Env:MAIBOT_LITE_TEST_DATA
```

该检查复制干净的 MaiBot 和独立 Python，验证协议文件、初始配置以及 Python 的 SSL / SQLite / TOML 支持；不接受协议、不安装核心依赖、不启动模型聊天。成功时独立日志中包含 `LITE_SMOKE_OK`，进程返回 0。

## 本次验证

- 类型检查、独立 Electron 构建、Windows 便携包构建通过。
- 打包资源检查通过：仅包含 MaiBot 和 Python，不包含 QQ 后端、Git、用户配置、数据和插件。
- 独立数据目录中的初始化和 Python 标准库检查通过。入口不再使用预加载桥接或自写 HTML 页面。
- 使用已有开发 Python 依赖加载测试目录中的干净 MaiBot：两个独立端口保持正确，16 个聊天 HTTP 路由存在，WebUI 首页返回 HTTP 200。
- 改为直接打开 WebUI 后，以真实的 MaiBot HTTP 服务验证 Electron 原生窗口：加载 MaiBot Dashboard 1.7.5 登录页，页面渲染和关闭后进程清理通过，并保存 `native-webui.png` 截图。该检查不启动模型聊天。
- 后续使用测试版实际安装的 Python 依赖完整启动 MaiBot，自动登录并进入原生 `/setup` 页面成功。页面连接检查使用与窗口相同的 Chromium Session，本机请求直连；初次页面加载失败会自动重试最多 8 次，不再因单次加载错误立即终止后台。
- 尚未验证从网络首次安装全部核心依赖，以及填入模型 API 后的完整聊天流程。

测试 EXE 约 99 MB（十进制），使用普通压缩；正式版当前采用 `store` 压缩，因此不能将两个 EXE 的体积差全部归因于删除组件。

完整启动的开发检查可运行 `--lite-core-smoke`，同时指定 `MAIBOT_LITE_TEST_DATA`（独立测试目录，须有已确认的 `agreement.json`）及 `MAIBOT_LITE_TEST_PYTHON`（已经安装核心依赖的 Python 路径）。它使用真实的 `bot.py` 启动，加载并截取原生 WebUI，然后退出并清理进程；不安装依赖、不发送聊天消息。
