# 自动安装与启动

简体中文 · [English](INSTALL.md)

## 把仓库交给 Codex

在**能够执行本地终端命令的 Codex 任务**中发送：

> 请安装并启动这个项目：https://github.com/VIONWILLIAMS/EXO-Forge-Studio 。读取仓库的 AGENTS.md 和安装说明，自动准备运行环境与资源，打开网页并检查模型加载和动作播放。

根目录的 [AGENTS.md](../AGENTS.md) 已写好安装、启动和检查流程。Codex 拿到本地代码后可读取这些项目指令，机制见 [OpenAI 官方说明](https://learn.chatgpt.com/docs/agent-configuration/agents-md)。链接确定项目，“安装并启动”确定任务。所在任务需要联网和执行本地命令的权限；云端任务启动的是云端进程，不能直接在你的电脑上创建本地服务。

## 克隆后，一条命令启动

macOS / Linux：

```sh
git clone --depth 1 https://github.com/VIONWILLIAMS/EXO-Forge-Studio.git
cd EXO-Forge-Studio
bash start.sh
```

Windows，在 PowerShell 中：

```powershell
git clone --depth 1 https://github.com/VIONWILLIAMS/EXO-Forge-Studio.git
cd EXO-Forge-Studio
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
```

以后仍运行同一条启动命令即可。安装内容放在项目目录，不需要管理员权限，不修改系统 Node 或终端配置。PowerShell 的执行策略参数只对这一次进程生效。

脚本会依次完成：

1. 检查现有 Node.js ≥22.13 和 npm；没有可用版本时，从 [Node.js 官网](https://nodejs.org/en/download/archive/v22.23.2) 下载独立的 **22.23.2** 到 `.local/`。Node.js 就是运行网页开发服务的环境。下载校验值锁定在 `scripts/node-sha256.txt`，来源为官方 [SHA256 清单](https://nodejs.org/dist/v22.23.2/SHASUMS256.txt)。
2. 检查 `scripts/assets-lock.json` 中的 **368 个模型、视频、参考及配套资源**。缺少的文件会从 GitHub 固定版本补回，并核对大小和 SHA256——也就是确认下载内容与发布文件一致。
3. 根据 `package-lock.json` 执行 `npm ci`，安装网页所需的精确依赖。依赖放进 `node_modules/`，缓存和临时文件放进 `.local/`。后续环境未变时跳过重复安装。
4. 启动本地网页服务，默认 **127.0.0.1:4177**。端口被占用会自动换到下一个空闲端口，检查网页响应后打印真实地址并打开浏览器。`.local/server.json` 记录地址、进程和项目路径，便于 Codex 读取。

第一次需要下载依赖，可能耗时几分钟。保持终端运行；按 **Ctrl+C** 停止网站。脚本不安装系统常驻服务。完整安装后，模型和动作可离线运行。

自动安装支持 macOS arm64/x64、使用兼容 Node 的 glibc 环境的 Linux arm64/x64，以及 Windows arm64/x64（PowerShell 5.1+）。macOS/Linux 需要 Bash、curl、tar 及 shasum/sha256sum，通常随系统提供。Alpine/musl 不适用本脚本的 Linux 官方二进制包，可使用已兼容安装的 Node/npm 或 glibc 系统。三维画面需要支持 WebGL2 的桌面浏览器。

## 参数与排错

| 参数 | 作用 |
| --- | --- |
| `--lang zh` / `--lang en` | 启动中文或英文界面 |
| `--no-open` | 启动服务并打印地址，让 Codex 自己打开浏览器 |
| `--port 4180` | 指定端口；该端口被占用时明确报错 |
| `--setup-only` | 只安装环境、补全资源，然后退出 |
| `--check` | 安装后严格检查资源，运行测试和构建，然后退出 |
| `--help` | 查看参数 |

例如：`bash start.sh --check`；Windows 在上面的 PowerShell 命令末尾追加 `--check`。如果 npm 已能直接使用，`npm run assets:check` 只检查资源，`npm run assets:repair` 补回缺少的资源。验证独立 Node 安装分支时，可设置环境变量 `EXO_USE_LOCAL_NODE=1`。

- **本地模型已经修改：**普通启动会提示并使用这些文件，不覆盖修改；严格检查会报告与发布基准不同，供开发者确认。
- **安装被中断：**重新执行同一命令。依赖安装成功后才记录完成标记；Node 下载包通过校验后才安装。
- **网络或代理失败：**保留实际错误，确认能访问 `nodejs.org`、`registry.npmjs.org`、`github.com` / `raw.githubusercontent.com` 后重试。脚本不全局更换 npm 镜像或代理。资源齐全时不会联系外部素材网站。
- **网页打开但模型空白：**检查浏览器 WebGL2、显卡加速及控制台错误。安装和 HTTP 请求成功，并不等于显卡已经正确渲染。
- **端口被占用：**使用 `READY` 后打印的真实地址。脚本不会结束占用原端口的其他项目。

## 没有安装 Git

也可以下载 GitHub 源码压缩包，解压后直接启动；启动流程不依赖 `.git`。请使用新目录，不覆盖已有项目。

macOS / Linux：

```sh
curl --fail --location --retry 3 https://codeload.github.com/VIONWILLIAMS/EXO-Forge-Studio/tar.gz/refs/heads/main -o exo-forge.tar.gz
tar -xzf exo-forge.tar.gz
cd EXO-Forge-Studio-main
bash start.sh
```

Windows：

```powershell
Invoke-WebRequest -UseBasicParsing https://github.com/VIONWILLIAMS/EXO-Forge-Studio/archive/refs/heads/main.zip -OutFile exo-forge.zip
Expand-Archive exo-forge.zip -DestinationPath .
cd EXO-Forge-Studio-main
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
```

## 网格、骨骼和外部资源

**浏览、动作、视频和工程下载所需的资源都已经在仓库里。** 无需再登录素材网站，也无需向外部服务申请人体骨骼。

| 资源 | 仓库位置及原始来源 | 启动时如何处理 |
| --- | --- | --- |
| 人体网格、动作骨骼、三指机械手 | `public/assets/v04/motion-m6/` | GLB 已包含网格、蒙皮权重和骨骼层级；通俗说，外形及带动外形的关节都在文件里 |
| 楼梯、箱子、苹果树、篮子、果实 | `public/assets/v04/environment-m6/` | 已带 GLB |
| 50 秒介绍、产品操作实录 | `public/assets/v04/video-m8/` | 已带 MP4，观看和下载无需 FFmpeg |
| 可编辑模型与 CAD 下载 | `assets/source/`、`cad/`、`public/assets/` | 已带 Blender、STEP/STL/3MF 和 ZIP 输出 |
| MakeHuman hm08 人体基网格，CC0 | `assets/vendor/makehuman/base.obj`；[上游原文件](https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj) | 已保留文件、来源和许可；缺失时从本项目固定版本补回 |
| 步行数据，CC BY 4.0 | `assets/reference/gait/`；[Fukuchi 步行数据集](https://doi.org/10.6084/m9.figshare.5722711) | 已保留 42 份处理后的角度数据及受试者元数据 |
| 跑步数据，CC BY 4.0 | 同上；[Fukuchi 跑步数据集](https://doi.org/10.6084/m9.figshare.4543435) | 已保留 28 份处理后的记录及受试者元数据 |
| 网页使用的派生步态曲线 | `src/domain/data/gaitReference.json` | 已随代码提供，来自上述保留输入 |

逐文件的原始下载地址和校验值见 [provenance.json](../assets/reference/gait/provenance.json)。若要重新导入上游数据，可执行 `python3 tools/import_gait_reference.py`：它通过 HTTP Range 只取大型步行 ZIP 中需要的小文件，不下载整套动捕资料。地址末尾 `#WBDS...txt` 表示 ZIP 内部成员，不能当作单独文件直链。普通启动使用仓库已保留的固定数据，完全不需要重新导入。转发资源时请保留 [第三方来源与授权](../THIRD_PARTY_NOTICES.md)。

## 可选的建模与视频制作环境

以下用于修改模型或重新制作视频，不是运行网站的必需软件：

| 工作 | 工具与下载地址 | 后续操作 |
| --- | --- | --- |
| 编辑或重建几何 | [Blender 5.0 下载](https://download.blender.org/release/Blender5.0/)，原始版本 5.0.1 | 见 `docs/DEVELOPMENT.md`、`tools/blender/` |
| 重新生成 CAD | [Python](https://www.python.org/downloads/) 3.11 与 `cad/requirements-cad.txt` | 创建 `.venv-cad`，再执行 `python -m pip install -r cad/requirements-cad.txt` |
| 重算派生步态曲线 | Python 标准库 | `python3 tools/build_gait_reference.py` |
| 编码新录制的视频 | [FFmpeg/ffprobe](https://ffmpeg.org/download.html) | 先录制新网页帧，再用 `tools/render_m8_videos.py` |

原来数 GB 的录制原始帧和两张本地参考图不公开分发，也没有公共下载地址。它们不参与网页运行，仓库已经包含成片。历史建模脚本分成若干阶段，尚未承诺一条命令重建全部历史版本；具体输入见 [开发说明](DEVELOPMENT.md)。

## 占用空间

macOS arm64 全新克隆实测：版本文件约 **342 MB**，浅克隆的 Git 压缩包约 **144 MB**。npm 依赖增加约 **278 MB**，项目独立 Node 和 npm 缓存约 **249 MB**，生产构建增加约 **206 MB**。包含 `.git` 和构建的完整安装目录约 **1.22 GB**。普通克隆、自动安装和构建建议**预留 2 GB**；Blender/CAD 开发工具另计。压缩下载量、解压后的大小和磁盘实际分配不是同一个数，不同系统会有差异。这不包含作者原来的大量视频帧和缓存工作区。
