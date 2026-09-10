import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyAssets, sha256 } from '../assets.mjs';
import { parseOptions } from '../setup.mjs';

const revision = 'a'.repeat(40);
async function fixture(t, content = Buffer.from('glTF-test-resource')) {
  const root = await mkdtemp(join(tmpdir(), 'exo setup test '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'public/assets'), { recursive: true });
  const entry = { path: 'public/assets/model.glb', bytes: content.length, sha256: sha256(content) };
  const manifest = { version: 1, sourceRevision: revision, files: [entry] };
  const lock = join(root, 'scripts/assets-lock.json');
  await writeFile(lock, JSON.stringify(manifest));
  return { root, content, entry, manifest, lock, target: join(root, entry.path) };
}

test('a complete clone needs no asset network requests, including a path with spaces', async t => {
  const f = await fixture(t);
  await writeFile(f.target, f.content);
  const result = await verifyAssets(f.root, { repair: true, fetchBytes: () => assert.fail('No asset download expected') });
  assert.equal(result.checked, 1);
  assert.deepEqual(result.restored, []);
});

test('missing assets restore from a pinned revision and repeated setup is offline', async t => {
  const f = await fixture(t);
  const result = await verifyAssets(f.root, { repair: true, log: () => {}, fetchBytes: async url => {
    assert.equal(url, `https://raw.githubusercontent.com/VIONWILLIAMS/EXO-Forge-Studio/${revision}/public/assets/model.glb`);
    return f.content;
  } });
  assert.deepEqual(result.restored, [f.entry.path]);
  assert.deepEqual(await readFile(f.target), f.content);
  await verifyAssets(f.root, { repair: true, fetchBytes: () => assert.fail('Must reuse restored file') });
});

test('a bad download is rejected before writing any model bytes', async t => {
  const f = await fixture(t);
  await assert.rejects(verifyAssets(f.root, { repair: true, log: () => {}, fetchBytes: async () => Buffer.from('bad') }), /checksum mismatch/);
  await assert.rejects(readFile(f.target), { code: 'ENOENT' });
});

test('customized models stay untouched on startup and strict checks identify the mismatch', async t => {
  const f = await fixture(t);
  await writeFile(f.target, 'my edited model');
  const result = await verifyAssets(f.root, { repair: true, strict: false, fetchBytes: () => assert.fail('Never replace edits') });
  assert.deepEqual(result.modified, [f.entry.path]);
  await assert.rejects(verifyAssets(f.root), /Local changes were preserved/);
  assert.equal(await readFile(f.target, 'utf8'), 'my edited model');
});

test('read-only verification reports missing assets without downloading', async t => {
  const f = await fixture(t);
  await assert.rejects(verifyAssets(f.root, { fetchBytes: () => assert.fail('Read-only check') }), /Missing: public\/assets\/model.glb/);
});

test('manifest paths cannot escape the checkout or target project source', async t => {
  const f = await fixture(t);
  for (const path of ['public/../../outside.glb', '/tmp/outside.glb', 'public\\outside.glb', 'src/main.tsx']) {
    f.manifest.files[0].path = path;
    await writeFile(f.lock, JSON.stringify(f.manifest));
    await assert.rejects(verifyAssets(f.root, { repair: true }), /Invalid asset manifest entry/);
  }
});

test('restoring an asset never overwrites a file created while the download was in flight', async t => {
  const f = await fixture(t);
  await assert.rejects(verifyAssets(f.root, { repair: true, log: () => {}, fetchBytes: async () => {
    await writeFile(f.target, 'concurrent user edit');
    return f.content;
  } }), { code: 'EEXIST' });
  assert.equal(await readFile(f.target, 'utf8'), 'concurrent user edit');
});

test('asset recovery does not follow a directory symlink', async t => {
  const f = await fixture(t);
  await rm(join(f.root, 'public/assets'), { recursive: true });
  await mkdir(join(f.root, 'other'));
  await symlink(join(f.root, 'other'), join(f.root, 'public/assets'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyAssets(f.root, { repair: true }), /not a directory/);
});

test('Git LFS pointer text is identified instead of being accepted as a working model', async t => {
  const f = await fixture(t);
  await writeFile(f.target, 'version https://git-lfs.github.com/spec/v1\noid sha256:example');
  await assert.rejects(verifyAssets(f.root, { repair: true, strict: false }), /Git LFS placeholder/);
});

test('startup validates port, language and unknown flags before installation', () => {
  assert.equal(parseOptions([]).strictPort, false);
  assert.deepEqual(parseOptions(['--port', '4190', '--lang', 'en', '--no-open', '--check']), {
    port: 4190, strictPort: true, lang: 'en', open: false, check: true, setupOnly: false,
  });
  for (const args of [['--port'], ['--port', '80'], ['--port', 'abc'], ['--port', '65536'], ['--lang', 'fr'], ['--typo']]) {
    assert.throws(() => parseOptions(args));
  }
});
