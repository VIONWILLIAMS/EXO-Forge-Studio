import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function assetPath(root, entry) {
  if (typeof entry.path !== 'string' || isAbsolute(entry.path) || /[\\\0]/.test(entry.path) ||
      entry.path.split('/').some(p => !p || p === '.' || p === '..') ||
      !/^(public|assets|output)\//.test(entry.path) ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new Error(`Invalid asset manifest entry: ${entry.path}`);
  }
  return resolve(root, entry.path);
}

async function download(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 2) throw new Error(`Could not download ${url}: ${error.message}`);
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

/** Restore only absent files. Keep edited models byte-for-byte intact. */
export async function verifyAssets(root = projectRoot, { repair = false, strict = true, fetchBytes = download, log = console.log } = {}) {
  const manifest = JSON.parse(await readFile(resolve(root, 'scripts/assets-lock.json'), 'utf8'));
  if (manifest.version !== 1 || !/^[a-f0-9]{40}$/.test(manifest.sourceRevision) || !Array.isArray(manifest.files)) {
    throw new Error('Invalid assets-lock.json');
  }
  // Validate every path before performing any writes.
  const targets = manifest.files.map(entry => assetPath(root, entry));
  const result = { checked: 0, restored: [], modified: [], missing: [] };
  for (const [i, entry] of manifest.files.entries()) {
    const target = targets[i];
    // Do not write through symlinks into other directories.
    for (let parent = dirname(target); parent !== root; parent = dirname(parent)) {
      if (existsSync(parent) && !(await lstat(parent)).isDirectory()) throw new Error(`Asset parent is not a directory: ${parent}`);
    }
    let stat;
    try { stat = await lstat(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!stat) {
      if (!repair) { result.missing.push(entry.path); continue; }
      log(`Restoring / 补回资源: ${entry.path}`);
      const url = `https://raw.githubusercontent.com/VIONWILLIAMS/EXO-Forge-Studio/${manifest.sourceRevision}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
      const bytes = await fetchBytes(url);
      if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`Asset checksum mismatch: ${entry.path}; nothing written.`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' });
      result.restored.push(entry.path);
    } else if (!stat.isFile()) {
      throw new Error(`Asset is not a regular file: ${entry.path}`);
    } else if (stat.size !== entry.bytes || await hashFile(target) !== entry.sha256) {
      if (stat.size < 1024 && (await readFile(target, 'utf8')).startsWith('version https://git-lfs.github.com/spec/')) {
        throw new Error(`Git LFS placeholder found: ${entry.path}. Clone the official repository without LFS substitution.`);
      }
      result.modified.push(entry.path);
    }
    result.checked++;
  }
  if (result.missing.length || strict && result.modified.length) {
    throw new Error(`Asset verification failed. Missing: ${result.missing.join(', ') || 'none'}. Modified: ${result.modified.join(', ') || 'none'}. Local changes were preserved.`);
  }
  return result;
}

async function main() {
  if (process.argv.includes('--write-lock')) {
    // Run after committing/publishing changed assets, then commit the updated lock separately.
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
    const names = execFileSync('git', ['ls-files', '-z', '--', 'public', 'assets', 'output'], { cwd: projectRoot, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'public', 'assets', 'output'], { cwd: projectRoot, encoding: 'utf8' });
    if (dirty.trim()) throw new Error('Commit resource changes before refreshing their lock; do not point new bytes at an old revision.');
    const files = [];
    for (const path of names) {
      const bytes = await readFile(resolve(projectRoot, path));
      files.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
    }
    await writeFile(resolve(projectRoot, 'scripts/assets-lock.json'), JSON.stringify({ version: 1, sourceRevision: revision, files }, null, 2) + '\n');
    console.log(`Locked ${files.length} resources at ${revision}`);
    return;
  }
  const result = await verifyAssets(projectRoot, { repair: process.argv.includes('--repair') });
  console.log(`Assets OK: ${result.checked}; restored: ${result.restored.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
