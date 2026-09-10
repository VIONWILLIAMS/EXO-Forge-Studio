# EXO Forge Studio — instructions for Codex and other coding agents

This is the actual ATLAS R04 React/Three.js project. Respond in the user's language. The product has Chinese and English UI. Explain unfamiliar technical terms briefly.

## Install and start requests

Complete the runnable local workflow; do not stop at describing installation commands.

1. Locate the checkout. Read this file, `package.json`, `docs/INSTALL.md` (or `docs/INSTALL.zh-CN.md`) and Git status. Preserve existing source, models and uncommitted changes. Do not clone over an existing directory or reset it.
2. If starting from a repository URL, clone `https://github.com/VIONWILLIAMS/EXO-Forge-Studio.git` into a new local directory. `--depth 1` is sufficient to run it. Without Git, use the source archive instructions in the install guide; startup itself does not need Git. Keep roughly 2 GB free on the selected drive.
3. Run from the checkout:
   - macOS/Linux: `bash start.sh --no-open`
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 --no-open`
   Add `--lang en` for an English-speaking user. Chinese is the default.
4. Keep the server in a persistent terminal/session. Wait for `READY`, then read `.local/server.json` for the actual URL, PID and project directory. The default port is 4177; if busy, startup selects the next free port. Never kill an unrelated server. A requested explicit port, e.g. `--port 4180`, must be free or the command fails.
5. Open the actual URL with the available browser tool. Confirm the model appears, enter motion mode, play/pause a motion and switch language. Check the browser console if available. HTTP success alone does not establish that WebGL rendered correctly. With no browser/GPU access, report that limitation explicitly.
6. Return a clickable URL, the local path, verified behavior and any remaining issue. The user's computer must be running the server to use a loopback URL. A cloud agent can run the app in its cloud environment but cannot silently create a local process on the user's computer.

Use the bootstrap rather than manually assembling dependencies. It resolves Node/npm, downloads a checksum-verified portable Node if needed, installs the locked npm packages, checks bundled assets and restores missing resources from a fixed public revision. It installs only under this checkout and does not require sudo, a backend, API keys, Git LFS, Blender or external account login. Use the user's existing network/permission settings; report actual blocks rather than bypassing them.

## Verification and maintenance

- Full software check: `bash start.sh --check` or `powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1 --check`. This exits after asset verification, tests and production build.
- If Node/npm are already on PATH: `npm test`, `npm run build`, `npm run assets:check`.
- `--setup-only` prepares the environment without starting a service. `--no-open` suppresses the automatic system-browser launch so the agent can open the result itself.
- Missing assets are repaired automatically. Locally edited assets are retained and reported; strict checks fail on mismatches. Do not delete a modified model just to pass a checksum check. See the installation guide for source URLs and optional authoring tools.
- Reuse the current model pipeline. Do not regenerate Blender/CAD/video assets just to start or translate the site. Optional authoring stages in `docs/DEVELOPMENT.md` have separate prerequisites.
- Keep English/Chinese UI coverage and playback/hand/camera state preservation. Run relevant tests and the build after code changes. Never commit `.local/`, dependencies, caches, credentials or private hosting configuration.
- When asset bytes change intentionally: commit and publish the asset change first, then run `node scripts/assets.mjs --write-lock` on that clean revision and commit its updated lock. The repair URL must point to the exact published bytes. Verify with `npm run assets:check`.

## Project map and evidence limits

Entry: `src/main.tsx`; primary UI: `src/components/AtlasWorkbench.tsx`; procedural motion/rig/scenarios: `src/domain/atlasMotion.ts`, `atlasMotionRig.ts`, `atlasScenario.ts`; translations: `src/i18n/`. Current rendered rig and three-finger geometry are under `public/assets/v04/motion-m6/`. License exceptions and data attribution are in `THIRD_PARTY_NOTICES.md`.

This is a digital concept demonstration. Software tests, motion references and local geometry checks do not verify physical device control, load capacity, clinical gait safety, dynamic stability or manufacturing readiness. Hardware connection is absent and equipment-screen values are simulated. Preserve that distinction in UI, documentation and reports.
