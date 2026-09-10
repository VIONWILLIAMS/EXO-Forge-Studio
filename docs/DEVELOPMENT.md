# Development and asset provenance

## Run the application

Start with `bash start.sh` on macOS/Linux, or `powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1` on Windows. `--check` installs the runtime, verifies resources, runs tests and builds. See [automatic installation](INSTALL.md) / [中文安装说明](INSTALL.zh-CN.md), including upstream asset URLs and the agent workflow in root `AGENTS.md`.

The entrypoint is `src/main.tsx`, built by Vite. The default route loads `AtlasWorkbench`; `?view=legacy` opens the earlier parameterized concept workbench. The app needs no backend or API key. In a public checkout, `npm run build` writes a normal static site to `dist/`. The original Sites build pipeline is enabled only when a local `.openai/hosting.json` exists; it then writes `dist/client` and a worker in `dist/server/index.js`. Private hosting registration files are intentionally absent.

The current UI is R04 with M8 motion choreography and M6 articulated geometry. `src/domain/atlasMotion.ts` calculates poses, `atlasMotionRig.ts` applies them to the existing rig, and `atlasScenario.ts` coordinates props/tasks. `src/i18n/en.json` maps Chinese source text to English; `zh.json` contains Chinese overrides for shared secondary labels. Locale lives in `exo-forge-language` browser storage and optional `lang` URL parameters.

## CAD and Blender

Viewing the website does not require CAD or Blender installation. For optional source work, use Python 3.11, the pinned CAD requirements and Blender 5.0.1 (the original authoring version). Build outputs can replace files: make a branch or working copy before intentionally regenerating a revision.

```sh
python3 -m venv .venv-cad
# macOS / Linux
. .venv-cad/bin/activate
python -m pip install -r cad/requirements-cad.txt
python cad/v04/build_engineering.py
python cad/v04/check_interfaces.py
blender -b --python tools/blender/build_atlas_r04.py
node tools/validate_atlas.mjs --r04
python cad/v04/engineering_package.py
```

These are optional authoring steps, not prerequisites for `npm test`. The CAD reports are retained from the original development work. See `cad/v04/README.zh-CN.md` for geometry assumptions and remaining engineering work. The R04 static CAD has an earlier hand; the current three-finger display derivative is not a production-ready replacement.

The M6 hand scripts under `tools/blender/` preserve the R04-M3 source. `derive_atlas_m6_hands.py` accepts `--project` and `--out`; its default project is derived from the script location. `build_static_m6.mjs` resolves Three.js through npm and accepts `ATLAS_M6_OUTPUT` for its working directory. Other M6 patch/audit helpers use `/tmp/exo-m6-hands` as their original staging directory. Inspect their inputs before running; they are individual authoring stages, not a one-command rebuild of every revision.

## Reference data

Run `python3 tools/build_gait_reference.py` to regenerate the derived curves from retained inputs. The optional importer retrieves public source data and records hashes; consult `assets/reference/gait/README.md`. License and alteration notices are in `THIRD_PARTY_NOTICES.md`.

## Recordings

The finished M8 MP4 files are included and playable through Product videos. `tools/render_m8_videos.py` is an encoder for existing browser capture frames and needs FFmpeg/ffprobe. The multi-gigabyte raw frames and their local recording manifests are not included, so that script alone does not reproduce the recordings from a fresh clone. Capture new frames first if producing a new video. Existing films retain their Chinese interface.

## Public snapshot

The initial public repository is a clean snapshot of the working product, not a dump of the author's local Git/editor history. It includes runtime assets, source models, CAD outputs, reference inputs and the two historical geometry reports referenced by tests. It excludes unused starter-framework files, private hosting IDs, dependencies, caches, raw capture frames, two local visual-reference images without established redistribution licenses, and `.blend1` backups. The original local engineering workspace remains separate and unchanged apart from the documented publishing/portability edits.

中文补充：网页运行不需要 CAD 工具。CAD/Blender 重建会写入输出，应在独立分支或副本中有目的地执行。录制脚本需要原始帧，开源仓库只带成片；历史报告也不代表本次重新进行了实体几何或设备测试。
