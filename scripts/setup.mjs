import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { projectRoot, sha256, verifyAssets } from './assets.mjs';

export function parseOptions(args) {
  const options = { port: 4177, strictPort: false, lang: 'zh', open: true, check: false, setupOnly: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port': options.port = Number(args[++i]); options.strictPort = true; break;
      case '--lang': options.lang = args[++i]; break;
      case '--no-open': options.open = false; break;
      case '--check': options.check = true; break;
      case '--setup-only': options.setupOnly = true; break;
      case '--help': options.help = true; break;
      default: throw new Error(`Unknown option: ${args[i]}. Use --help.`);
    }
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('--port must be between 1024 and 65535.');
  if (!['zh', 'en'].includes(options.lang)) throw new Error('--lang must be zh or en.');
  return options;
}

function runNode(script, args = [], env = {}) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: projectRoot, stdio: 'inherit', env: { ...process.env, ...env },
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? done() : reject(new Error(`${script} failed (${signal || code}).`)));
  });
}

function openBrowser(url) {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.log(`Open this address in your browser / 请打开: ${url}`));
  child.unref();
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log('EXO Forge: start.sh / start.ps1 [--lang zh|en] [--port 4180] [--no-open] [--setup-only] [--check]\n--check: install, verify assets, run tests and build, then exit.\n--setup-only: install and repair missing resources, then exit.\nDefault: start on 127.0.0.1:4177 (next available port if occupied) and open a browser.');
    return;
  }
  process.chdir(projectRoot);
  const local = resolve(projectRoot, '.local');
  await mkdir(resolve(local, 'tmp'), { recursive: true });
  console.log(`EXO Forge Studio / Node ${process.versions.node} / ${process.platform}-${process.arch}\nProject / 项目: ${projectRoot}`);
  const assets = await verifyAssets(projectRoot, { repair: true, strict: options.check });
  console.log(`Assets / 资源: ${assets.checked} checked, ${assets.restored.length} restored.`);
  if (assets.modified.length) console.warn(`Using ${assets.modified.length} locally edited assets; preserved / 保留本地资源修改:\n${assets.modified.join('\n')}`);

  const npmCli = process.env.EXO_NPM_CLI;
  if (!npmCli || !existsSync(npmCli)) throw new Error('Use start.sh or start.ps1 so Node and npm are resolved together.');
  const env = {
    PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`,
    npm_config_cache: resolve(local, 'npm-cache'),
    npm_config_update_notifier: 'false',
    TMPDIR: resolve(local, 'tmp'), TMP: resolve(local, 'tmp'), TEMP: resolve(local, 'tmp'),
  };
  const stampPath = resolve(local, 'dependencies.json');
  const fingerprint = sha256(Buffer.concat([
    await readFile(resolve(projectRoot, 'package-lock.json')),
    await readFile(resolve(projectRoot, 'package.json')),
    Buffer.from(`${process.platform}/${process.arch}/${process.versions.node}`),
  ]));
  let stamp;
  try { stamp = JSON.parse(await readFile(stampPath, 'utf8')); } catch { /* First or interrupted install. */ }
  if (stamp?.fingerprint !== fingerprint || !existsSync(resolve(projectRoot, 'node_modules/.package-lock.json')) ||
      !existsSync(resolve(projectRoot, 'node_modules/vite/bin/vite.js'))) {
    console.log('Installing locked npm dependencies / 正在安装网页依赖…');
    await rm(stampPath, { force: true });
    await runNode(npmCli, ['ci', '--no-audit', '--no-fund'], env);
    await writeFile(stampPath, JSON.stringify({ fingerprint, node: process.versions.node }) + '\n');
  } else console.log('Dependencies already ready / 依赖已就绪，跳过重复安装。');

  if (options.check) {
    await runNode(npmCli, ['test'], env);
    await runNode(npmCli, ['run', 'build'], env);
    console.log('CHECK PASS / 资源、测试和构建通过。');
    return;
  }
  if (options.setupOnly) { console.log('SETUP PASS / 安装完成。Run start.sh / start.ps1 to open the workbench.'); return; }

  const { createServer } = await import('vite');
  const server = await createServer({ root: projectRoot, clearScreen: false,
    server: { host: '127.0.0.1', port: options.port, strictPort: options.strictPort },
  });
  try {
    await server.listen();
    const port = server.httpServer.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const url = `${baseUrl}/?lang=${options.lang}`;
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok || !(await response.text()).includes('/src/main.tsx')) throw new Error('The local application did not pass its HTTP startup check.');
    const statePath = resolve(local, 'server.json');
    const state = { pid: process.pid, root: projectRoot, node: process.execPath, url, introUrl: `${baseUrl}/?demo=intro&lang=${options.lang}`, startedAt: new Date().toISOString() };
    await writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
    console.log(`\nREADY / 网站已启动\n${state.url}\n50s intro / 50 秒介绍: ${state.introUrl}\nKeep this terminal running. Ctrl+C stops the server. / 保持终端运行，Ctrl+C 停止。\nState / 启动记录: ${statePath}`);
    const stop = async () => {
      await server.close();
      try {
        if (JSON.parse(await readFile(statePath, 'utf8')).pid === process.pid) await rm(statePath, { force: true });
      } catch { /* The launch record may have been removed after server shutdown. */ }
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    if (options.open) openBrowser(url);
  } catch (error) { await server.close(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`\nSETUP FAILED / 未完成: ${error.message}\nSee docs/INSTALL.md or docs/INSTALL.zh-CN.md. No project sources were reset.`); process.exitCode = 1; });
}
