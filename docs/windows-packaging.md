# Windows 标准安装包

工程保留 `runtime/python` 作为干净 Python 环境，仅包含 pip、packaging 等引导工具。环境二进制由 .gitignore 排除，不提交到 Git。

`bun run release:win` 依次检查资源、构建应用，生成：

- `release/MaiBot-OK-<version>-win.exe`

标准包保留 NapCat、SnowLuma 和官方适配器。干净 Python 环境放入 `resources/runtime/python`，首次运行复制到可写的 `python-env` 并安装 MaiBot、Dashboard 等应用依赖。

`release:win:standard` 是默认打包命令的别名；`release:win:snowluma` 可构建不含 NapCat 的标准环境包。

构建目录为 `release/standard`；SnowLuma 版使用 `release/snowluma`，避免缓存和更新元数据互相覆盖。生成的安装程序、blockmap 复制到 `release` 根目录。根目录 `latest.yml`、`latest-win.yml` 指向标准包；SnowLuma 版使用 `latest-win-snowluma.yml`。

打包命令仅生成本地安装程序，不上传或发布 GitHub Release。
