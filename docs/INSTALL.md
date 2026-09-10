# Automatic local installation

[简体中文](INSTALL.zh-CN.md) · English

## Give the repository to Codex

Paste this into a **local Codex task with terminal access**:

> Install and start https://github.com/VIONWILLIAMS/EXO-Forge-Studio locally. Read its AGENTS.md and installation guide, prepare the runtime and assets, open the workbench, and verify model loading and motion playback.

The root [AGENTS.md](../AGENTS.md) contains the execution and verification instructions. Codex reads repository instructions once the checkout is available; see [OpenAI's AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md). The link identifies the repository; “install and start” supplies the task. Network access and local command execution must be available. A cloud-only task starts a cloud process, not a server on your laptop.

## One command after cloning

```sh
git clone --depth 1 https://github.com/VIONWILLIAMS/EXO-Forge-Studio.git
cd EXO-Forge-Studio
bash start.sh --lang en
```

Windows, in PowerShell:

```powershell
git clone --depth 1 https://github.com/VIONWILLIAMS/EXO-Forge-Studio.git
cd EXO-Forge-Studio
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 --lang en
```

Use the same start command next time. It reuses the installed environment. No administrator rights or global shell/profile changes are needed. The PowerShell execution-policy option applies only to that process.

The script:

1. Reuses an executable Node.js ≥22.13/npm pair, or downloads portable **Node.js 22.23.2** from [nodejs.org](https://nodejs.org/en/download/archive/v22.23.2) into `.local/`. Download hashes are pinned in `scripts/node-sha256.txt` from the official [SHA256 list](https://nodejs.org/dist/v22.23.2/SHASUMS256.txt).
2. Checks 368 bundled model, video, reference and support files against `scripts/assets-lock.json`. Absent files download from the exact recorded public Git revision, then pass size and SHA256 checks before use. No separate skeleton provider or asset account is required.
3. Runs `npm ci` with `package-lock.json`. Dependencies go into `node_modules/`; the npm cache and temporary files stay in `.local/`. Repeat runs skip installation when the dependency fingerprint is unchanged.
4. Starts the local Vite web server on **127.0.0.1:4177**, selects a free port if needed, verifies an HTTP response, prints the actual URL and opens the browser. Startup details are saved in `.local/server.json`.

The first run downloads dependencies and may take several minutes. Keep the terminal running; **Ctrl+C** stops the site. No persistent system service is installed. Offline startup works once the environment and complete assets are installed.

Supported bootstrap targets: macOS arm64/x64, Linux arm64/x64 with a Node-compatible glibc environment, and Windows arm64/x64 with PowerShell 5.1+. macOS/Linux need Bash, curl, tar and either shasum or sha256sum, normally supplied by the OS. Alpine/musl is not a target of the portable Linux download; use a compatible Node/npm installation or a glibc distribution. A desktop browser with WebGL2 is needed for the 3D viewport.

## Controls and diagnostics

| Option | Behavior |
| --- | --- |
| `--lang zh` / `--lang en` | Language of the opened workbench |
| `--no-open` | Start the server and print URLs without opening the system browser |
| `--port 4180` | Require that exact port; fail if occupied instead of changing it |
| `--setup-only` | Prepare Node, dependencies and resources, then exit |
| `--check` | Prepare the environment, strictly verify assets, run tests and build, then exit |
| `--help` | Show the available options |

Examples: `bash start.sh --check`; on Windows, append `--check` to the PowerShell command above. If npm is already on PATH, `npm run assets:check` is read-only and `npm run assets:repair` restores missing files. To exercise the portable runtime even with Node installed, set `EXO_USE_LOCAL_NODE=1` for that invocation.

- **Local model edits:** regular startup reports and uses edited assets; it never overwrites them. `--check` reports a checksum mismatch so a maintainer can distinguish custom bytes from the published baseline.
- **Interrupted install:** rerun the same command. A successful dependency stamp is written only after npm finishes. A partially downloaded Node archive is never installed before checksum verification.
- **Network/proxy failure:** retain the actual error and retry after access to `nodejs.org`, `registry.npmjs.org`, `github.com` / `raw.githubusercontent.com` is available. No npm registry or proxy settings are changed globally. Resource repair only contacts GitHub when files are absent.
- **Blank viewport:** confirm WebGL2/browser graphics availability and browser-console errors. A successful installation/HTTP response is not proof of successful GPU rendering.
- **Port conflict:** use the URL printed after `READY`; do not assume 4177. The script leaves the other process running.

## No Git installed

Startup also works from GitHub's source archive, with no `.git` directory. Download into a new directory and inspect the included instructions before starting.

macOS/Linux:

```sh
curl --fail --location --retry 3 https://codeload.github.com/VIONWILLIAMS/EXO-Forge-Studio/tar.gz/refs/heads/main -o exo-forge.tar.gz
tar -xzf exo-forge.tar.gz
cd EXO-Forge-Studio-main
bash start.sh --lang en
```

Windows:

```powershell
Invoke-WebRequest -UseBasicParsing https://github.com/VIONWILLIAMS/EXO-Forge-Studio/archive/refs/heads/main.zip -OutFile exo-forge.zip
Expand-Archive exo-forge.zip -DestinationPath .
cd EXO-Forge-Studio-main
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 --lang en
```

## Assets and external sources

**Every resource needed for browsing, motion, video playback and engineering downloads is already in the repository.** The browser does not fetch a human model, skeleton or motion dataset from an external service.

| Resource | Included path / upstream source | Installation behavior |
| --- | --- | --- |
| Current human mesh, rig and three-finger robot hands | `public/assets/v04/motion-m6/` | Included GLB geometry, skin weights and joint hierarchy; no external rig download |
| Stairs, crate, apple tree, basket, fruit | `public/assets/v04/environment-m6/` | Included GLB files |
| Finished introduction and product tour | `public/assets/v04/video-m8/` | Included MP4s; FFmpeg is not required to watch/download them |
| Editable models and CAD downloads | `assets/source/`, `cad/`, `public/assets/` | Included Blender/STEP/STL/3MF and ZIP outputs |
| MakeHuman hm08 base mesh, CC0 | `assets/vendor/makehuman/base.obj`; [upstream file](https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj) | Included with license/source notices; missing retained files restore from this project's fixed snapshot |
| Walking inputs, CC BY 4.0 | `assets/reference/gait/`; [Fukuchi walking dataset](https://doi.org/10.6084/m9.figshare.5722711) | Included 42 processed angle files plus participant metadata |
| Running inputs, CC BY 4.0 | Same directory; [Fukuchi running dataset](https://doi.org/10.6084/m9.figshare.4543435) | Included 28 processed records plus participant metadata |
| Derived motion reference curves | `src/domain/data/gaitReference.json` | Bundled with source code, generated from the retained inputs |

Exact gait download URLs and per-file hashes are in [provenance.json](../assets/reference/gait/provenance.json). `python3 tools/import_gait_reference.py` is an optional upstream importer; it extracts only the required small members of the walking ZIP using HTTP Range. A URL ending in `#WBDS...txt` identifies a ZIP member, not a separate direct download. Normal startup uses the bundled/pinned project snapshot and does not download the large original capture archives. Read [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) before redistributing these resources.

## Optional authoring environment

These tools are for changing geometry or recording new films; they are outside the website's runtime installation:

| Work | Tool/download | Reproduction instructions |
| --- | --- | --- |
| Edit/rebuild Blender geometry | [Blender 5.0 downloads](https://download.blender.org/release/Blender5.0/) — original authoring version 5.0.1 | `docs/DEVELOPMENT.md`, `tools/blender/` |
| Regenerate CAD | [Python](https://www.python.org/downloads/) 3.11 and `cad/requirements-cad.txt` | Create `.venv-cad`, then `python -m pip install -r cad/requirements-cad.txt` |
| Recompute retained gait curves | Python standard library | `python3 tools/build_gait_reference.py` |
| Encode a newly captured product film | [FFmpeg/ffprobe](https://ffmpeg.org/download.html) | `tools/render_m8_videos.py`, after recording new browser frames |

Original multi-gigabyte capture frames and two local visual-reference images are not distributed, have no public download, and are not needed to run the product. Finished videos are included. The individual historical modelling scripts do not constitute a guaranteed one-command rebuild of every revision. See [development details](DEVELOPMENT.md).

## Disk space

Measured from a fresh clone on macOS arm64: approximately **342 MB** of tracked content and **144 MB** in the shallow Git pack. npm dependencies add **278 MB**, portable Node plus npm caches add **249 MB**, and a production build adds **206 MB**. The installed checkout including `.git` and a build totals approximately **1.22 GB**. **Reserve 2 GB** for a normal clone, automatic installation and build; optional CAD/Blender tools need extra. Downloads are compressed; installed size and physical allocation vary by OS/filesystem. These measurements exclude the author's much larger private recording/cache workspace.
