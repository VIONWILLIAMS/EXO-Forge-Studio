# Public release verification · 2026-09-10

Checks below apply to the prepared R04 public snapshot. [GitHub Actions](https://github.com/VIONWILLIAMS/EXO-Forge-Studio/actions/workflows/ci.yml) provides commit-specific Linux results after publication.

| Check | Result | What it establishes |
| --- | --- | --- |
| Fresh dependency installation | PASS | `npm ci --no-audit --no-fund` completed in an independent directory without the original `node_modules` |
| Regression tests | PASS — 78/78 across 11 files | Translation, state preservation, motion/rig/scenario checks and bundled CAD report contracts |
| Public production build | PASS | `npm run build` succeeds with no `.openai/hosting.json`; output is `dist/` |
| Original local build | PASS | The existing Sites-aware workspace still builds with its original local configuration |
| Production preview | PASS | Opened the public build in a real browser, loaded the animated model and selected the carry chapter at 17.30 s |
| Language and pause | PASS | Switched Chinese → English and back at the picking chapter; paused time remained 31.30 s |
| Manual hand state | PASS | Three-finger opening set to 0%, then language switched; manual mode, opening and paused time remained unchanged |
| English layout | PASS for observed 1280 × 720 and 851 × 994 windows | Corrected clipped header actions and the crowded motion-workbench heading at the narrow viewport |
| Video playback | PASS | Production preview decoded and played the included 50-second MP4; original recording is Chinese |
| Browser console | PASS for inspected session | No errors returned during the production preview check |
| Reference integrity | PASS — 72 files | SHA256 agrees with retained download provenance |
| Model/CAD/video integrity | PASS — 723 files | Public `.glb`, `.blend`, `.step`, `.stl`, `.mp4`, `.zip` and `.3mf` binaries match the original workspace |
| Publication file review | PASS for bounded checks | No credential files, high-confidence credential markers or files at least 50 MiB in the candidate; 9 archives inspected; two unlicensed local visual references excluded |

The publication review is a bounded file check, not a comprehensive security audit. The original third-party spreadsheet retains its upstream metadata unchanged. The project screenshot in `docs/images/` is an actual browser capture.

## Changes made for this release

- Added English and Chinese READMEs, license/source notices, contributor notes and an install/test/build workflow.
- Kept local hosting metadata out of the public snapshot; made its build plugin conditional so a fresh clone builds without it.
- Replaced author-machine absolute paths in the M6 build helpers with package-relative/project-relative lookup.
- Let motion-mode header controls wrap on narrow screens and removed the machine-specific footer label.
- Preserved existing model, CAD and video files; no remodelling or rerecording was performed.

## Limits

The JavaScript build still reports a large 3D chunk (approximately 1.51 MB minified, 446 kB gzip); this warning is not a failed build. Other viewport sizes, touch/mobile operation and all possible browser/GPU combinations have not been exhaustively tested in this release pass.

The CAD tests read existing geometry reports; this release pass did not regenerate those solids or rerun all historical geometry audits. Physical hardware control, clinical validation, whole-body collision safety, dynamic stability, real load capacity and manufacturing readiness remain **NOT RUN / unverified**. See the R04 engineering handoff for the established boundaries.

中文：本次在独立发布副本完成安装、78 项测试、构建和真实浏览器检查；保留了 723 个工程/模型/视频文件及 72 个参考输入的内容。几何历史报告和本次软件检查分开记录，没有新增实机、承重、临床或生产验证。
