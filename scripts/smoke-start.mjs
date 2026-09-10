// Integration check for the real bootstrap and HTTP server, on macOS/Linux/Windows.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { projectRoot } from './assets.mjs';

const stateFile = resolve(projectRoot, '.local/server.json');
let child, state, blocker;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function launch(args) {
  const windows = process.platform === 'win32';
  const child = spawn(windows ? 'powershell.exe' : 'bash', windows ?
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'start.ps1', ...args] : ['start.sh', ...args], {
    cwd: projectRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', b => { child.output += b; process.stdout.write(b); });
  child.on('error', error => { child.failure = error; });
  return child;
}

try {
  // Reserve the default port. An existing local service also demonstrates a busy port.
  blocker = createServer();
  await new Promise((done, reject) => {
    blocker.once('error', e => e.code === 'EADDRINUSE' ? done() : reject(e));
    blocker.listen(4177, '127.0.0.1', done);
  });
  child = launch(['--no-open', '--lang', 'en']);
  const deadline = Date.now() + 120000;
  while (!child.output.includes('READY /')) {
    if (child.failure || child.exitCode !== null) throw child.failure || new Error('Bootstrap exited before READY.');
    if (Date.now() > deadline) throw new Error('Startup smoke test timed out.');
    await sleep(250);
  }
  state = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.notEqual(new URL(state.url).port, '4177');
  assert.equal(state.root, projectRoot);
  assert.match(child.output, /Dependencies already ready/);
  const base = new URL(state.url).origin;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /\/src\/main.tsx/);
  const manifest = await fetch(`${base}/assets/v04/assembly.json`);
  assert.equal(manifest.status, 200);
  assert.ok(Object.keys(await manifest.json()).length > 0);
  for (const path of ['/assets/v04/motion-m6/atlas-motion.glb', '/assets/v04/motion-m6/static-atlas-m6.glb']) {
    const response = await fetch(base + path, { headers: { Range: 'bytes=0-11' } });
    assert.equal(response.status, 206);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
  }
  // An explicitly selected busy port must fail without taking down the first server.
  const conflict = launch(['--port', new URL(state.url).port, '--no-open']);
  const code = await new Promise((done, reject) => {
    const timer = setTimeout(() => { conflict.kill(); reject(new Error('Conflict test timed out')); }, 30000);
    conflict.once('exit', code => { clearTimeout(timer); done(code); });
    conflict.once('error', error => { clearTimeout(timer); reject(error); });
  });
  assert.notEqual(code, 0);
  assert.match(conflict.output, /already in use/);
  assert.equal((await fetch(base)).status, 200);
  console.log('BOOTSTRAP SMOKE PASS: reused install, busy-port fallback, HTTP, assembly, GLBs, explicit-port failure.');
} finally {
  if (state?.pid) { try { process.kill(state.pid, 'SIGTERM'); } catch { /* Already exited. */ } }
  if (child && child.exitCode === null) child.kill();
  if (blocker?.listening) blocker.close();
  // Windows terminates Node immediately on SIGTERM; no async signal cleanup there.
  if (state?.pid) await rm(stateFile, { force: true });
}
