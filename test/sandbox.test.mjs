import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { startBroker } from '../consumer/run.mjs';

test('file broker confines hostile paths and links, enforces leases, CAS and sealing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awc-security-'));
  const source = join(dir, 'source'), root = join(dir, 'sandbox');
  await mkdir(source); await writeFile(join(source, 'data.txt'), 'selected input');
  const sentinel = randomUUID(); await writeFile(join(dir, 'outside.txt'), sentinel);
  const broker = startBroker(root, source); await broker.ready;
  const call = (name, args, extra = {}) => broker.invoke({ id: randomUUID(), name, arguments: args, remaining_ms: 30000, ...extra });
  try {
    await writeFile(join(source, 'data.txt'), 'changed original');
    assert.equal((await call('files_read', { path: 'input/data.txt' })).content, 'selected input');
    for (const path of ['../outside.txt', '/etc/passwd', join(dir, 'outside.txt'), 'input/../../outside.txt', 'input/%2e%2e/outside.txt', 'input/..\\outside.txt', 'file:///etc/passwd', 'C:\\Windows\\win.ini', 'input/a\0b', 'input//data.txt']) {
      const result = await call('files_read', { path }); assert.equal(result.ok, false, path); assert.ok(!JSON.stringify(result).includes(sentinel));
    }
    await symlink(join(dir, 'outside.txt'), join(root, 'work', 'sym'));
    await link(join(dir, 'outside.txt'), join(root, 'work', 'hard'));
    await symlink(dir, join(root, 'work', 'parent'));
    execFileSync('mkfifo', [join(root, 'work', 'fifo')]);
    for (const path of ['work/sym', 'work/hard', 'work/parent/outside.txt', 'work/fifo']) {
      assert.equal((await call('files_read', { path })).ok, false);
      assert.equal((await call('files_write', { path, content: 'attack', expected_sha256: null })).ok, false);
    }
    assert.equal((await call('shell', { command: 'cat /etc/passwd' })).ok, false);
    assert.equal((await call('files_read', { path: 'input/data.txt' }, { remaining_ms: 0 })).ok, false);
    assert.equal((await call('files_write', { path: 'input/data.txt', content: 'attack', expected_sha256: null })).ok, false);
    assert.equal((await call('files_write', { path: 'output/large', content: 'x'.repeat(16001), expected_sha256: null })).ok, false);
    const args = { path: 'output/result.txt', content: 'done', expected_sha256: null }, id = randomUUID();
    const written = await call('files_write', args, { id }); assert.equal(written.ok, true);
    assert.deepEqual(await call('files_write', args, { id }), written);
    assert.equal((await call('files_write', { ...args, content: 'changed' }, { id })).error, 'idempotency_conflict');
    assert.equal((await call('files_write', args)).error, 'version_conflict');
    const sealed = await call('artifacts_seal', {}); assert.equal(sealed.ok, true);
    assert.equal(sealed.manifest.files[0].sha256, written.sha256);
    assert.equal((await call('files_write', { ...args, expected_sha256: written.sha256 })).error, 'artifacts_sealed');
    assert.equal(await readFile(join(dir, 'outside.txt'), 'utf8'), sentinel);
  } finally { broker.stop(); }
  const again = startBroker(root, source); await assert.rejects(again.ready); again.stop();
});

for (const kind of ['symlink', 'hardlink']) test(`input snapshot rejects ${kind} to outside files`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'awc-input-')), source = join(dir, 'source');
  await mkdir(source); await writeFile(join(dir, 'outside'), 'synthetic secret');
  await (kind === 'symlink' ? symlink : link)(join(dir, 'outside'), join(source, 'escape'));
  const broker = startBroker(join(dir, 'workspace'), source);
  await assert.rejects(broker.ready); broker.stop();
});
