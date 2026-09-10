# Contributing / 参与开发

Use Node.js 22.13+ and `npm ci`, then `npm run dev -- --strictPort`. Before submitting a focused pull request, run `npm test` and `npm run build`. Include the relevant screenshot or short recording for visible motion/UI changes, the viewport and browser used, and the checks you actually ran.

- Keep the Chinese and English UI catalogs consistent; use `tr()` instead of adding untranslated interface text.
- Preserve part IDs, existing model sources, millimetre/metre conventions and motion state when changing presentation.
- Use a new asset revision for geometry/rig changes and describe how to reproduce it. Do not silently replace CAD with a display-only derivative.
- Keep third-party attribution and clearly distinguish choreography, geometric checks, historical reports and physical tests.
- Do not include local credentials, `.openai` hosting metadata, caches, editor backups or raw recording frames.
- Contributions are submitted under the applicable repository license, with third-party licenses preserved.

中文：请保持修改聚焦，提交前运行测试和构建；界面/动作改动附实际截图或短视频。同步维护中英文文案，保留零件 ID、单位和旧资产。说明哪些检查是本次执行、哪些只是历史报告，避免把数字演示写成实机验证。不提交个人配置、密钥、缓存或录制中间帧。

For bug reports, include the app URL parameters, browser/OS, action name and timeline position, expected behavior, actual behavior and a screenshot when useful. Remove personal information from logs and images before posting.
