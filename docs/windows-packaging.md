# Windows 两种 Python 安装包

工程长期保留两个环境（均由 .gitignore 排除，不提交环境二进制）：

- `runtime/python`：标准包使用的干净 Python，仅包含 pip、packaging 等引导工具。
- `runtime/python-full`：完整包使用的 Python，预装当前 `modules/MaiBot/pyproject.toml` 的运行依赖、Dashboard 及依赖约束。

`bun run release:python:full` 首次从干净环境复制完整环境并安装依赖，以后复用环境、补齐声明的依赖并校验版本、`pip check` 和主要原生模块。标准环境不会被安装应用依赖。

`bun run release:win` 依次检查资源、准备完整环境、构建应用，生成：

- `release/MaiBot-OK-<version>-win-standard.exe`
- `release/MaiBot-OK-<version>-win-full.exe`

两个包的协议端资源一致，均保留 NapCat、SnowLuma 和官方适配器。每个包只把选中的 Python 环境放入 `resources/runtime/python`，首次运行复制到可写的 `python-env`，完整包已满足声明的依赖时无需再次下载；后续更新引入新依赖时仍可能安装依赖。

单独打包使用 `release:win:standard` 或 `release:win:full`；原 `release:win:snowluma` 仍可构建不含 NapCat 的标准环境包。

构建目录分别为 `release/standard` 与 `release/full`，避免缓存和更新元数据互相覆盖。生成的安装程序、blockmap 复制到 `release` 根目录。根目录 `latest.yml`、`latest-win.yml` 默认指向标准包，各包还有独立的 `latest-win-standard.yml` 与 `latest-win-full.yml`。

打包命令仅生成本地安装程序，不上传或发布 GitHub Release。
