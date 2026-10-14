import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../backend/store.mjs';
import { createServer } from '../backend/server.mjs';
import { Api } from '../worker/client.mjs';
import { consume } from '../consumer/run.mjs';

test('real CLI relay cannot escape Consumer files or promote task capability; seal binds submission', async () => {
  const store = new Store(), server = createServer(store);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const employer = store.provisionPlatform('Fixture', 10000), owner = store.register('Worker');
  const payer = new Api(base, employer.token), workerApi = new Api(base, owner.token);
  const abort = new AbortController(); let consumer;
  try {
    const w = await workerApi.request('/v1/workers', { name: 'Fixture', model: 'gpt-6-astra', accept_trial: true });
    store.qualifyWorker(w.id, { model: w.model, trial_reference_minor: 2000, evidence_ref: 'synthetic:relay' });
    const task = await payer.request('/v1/tasks', { title: 'Files', description: 'Test', model: w.model, amount_minor: 100, workspace_required: true });
    const lease = await workerApi.request(`/v1/tasks/${task.id}/claim`, { worker_id: w.id });
    const cap = new Api(base, lease.tool_token);
    await assert.rejects(cap.request('/v1/me'));
    await assert.rejects(cap.request(`/v1/tasks/${task.id}/accept`, { rating: 5 }));
    await assert.rejects(workerApi.request(`/v1/tasks/${task.id}/execution`));
    await assert.rejects(workerApi.request(`/v1/tasks/${task.id}/tools`, { name: 'files_list', arguments: { path: 'input' } }));
    await assert.rejects(cap.request(`/v1/tasks/task_${randomUUID()}/tools`, { name: 'files_list', arguments: { path: 'input' } }));
    await assert.rejects(workerApi.request(`/v1/tasks/${task.id}/submit`, { epoch: lease.epoch, result: 'No files' }));
    assert.equal(store.task(owner.account_id, task.id).state, 'running');
    const root = await mkdtemp(join(tmpdir(), 'awc-relay-')), input = join(root, 'input');
    await mkdir(input); await writeFile(join(input, 'hello.txt'), 'hello');
    const sentinel = randomUUID(); await writeFile(join(root, 'outside.txt'), sentinel);
    consumer = consume({ api: payer, taskId: task.id, input, root: join(root, 'workspace'), signal: abort.signal }); consumer.catch(() => {});
    const cli = async (name, args) => {
      const child = spawn(process.execPath, [resolve('worker/cli.mjs'), 'call'], { env: { PATH: process.env.PATH, AWC_BASE_URL: base, AWC_TASK_ID: task.id, AWC_TOOL_TOKEN: lease.tool_token } });
      let output = ''; child.stdout.on('data', c => output += c); child.stderr.resume();
      child.stdin.end(JSON.stringify({ name, arguments: args }) + '\n');
      await new Promise((done, reject) => { child.on('exit', done); child.on('error', reject); });
      assert.ok(!output.includes(sentinel)); return JSON.parse(output);
    };
    for (const path of [join(root, 'outside.txt'), 'input/../../outside.txt']) assert.equal((await cli('files_read', { path })).ok, false);
    assert.equal((await cli('files_read', { path: 'input/hello.txt' })).content, 'hello');
    assert.equal((await cli('files_write', { path: 'output/result.txt', content: 'delivered', expected_sha256: null })).ok, true);
    const sealed = await cli('artifacts_seal', {}); assert.equal(sealed.ok, true);
    await workerApi.request(`/v1/tasks/${task.id}/submit`, { epoch: lease.epoch, result: 'Delivered', seal_id: sealed.receipt_id });
    await assert.rejects(cap.request(`/v1/tasks/${task.id}/tools`, { name: 'files_list', arguments: { path: 'input' } }));
    assert.equal(await readFile(join(root, 'outside.txt'), 'utf8'), sentinel);
    assert.equal(await readFile(join(root, 'workspace/attempt-1/output/result.txt'), 'utf8'), 'delivered');
  } finally { abort.abort(); await consumer?.catch(() => {}); await new Promise(done => server.close(done)); store.close(); }
});

test('expired epochs and suspended Workers cannot call tools or forge Consumer receipts', async () => {
  let now = Date.now(); const store = new Store(':memory:', { now: () => now }), server = createServer(store);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const payerAccount = store.provisionPlatform('Fixture', 10000), owner = store.register('Worker');
    const payer = new Api(base, payerAccount.token), worker = new Api(base, owner.token);
    const w = await worker.request('/v1/workers', { name: 'Fixture', model: 'gpt-6-astra', accept_trial: true });
    store.qualifyWorker(w.id, { model: w.model, trial_reference_minor: 2000, evidence_ref: 'synthetic:expiry' });
    const task = await payer.request('/v1/tasks', { title: 'Lease test', description: 'Test', model: w.model, amount_minor: 100 });
    const lease = await worker.request(`/v1/tasks/${task.id}/claim`, { worker_id: w.id });
    const cap = new Api(base, lease.tool_token), path = `/v1/tasks/${task.id}/tools`, body = { name: 'files_list', arguments: { path: 'input' } };
    const call = await cap.request(path, body);
    await assert.rejects(worker.request(`/v1/tasks/${task.id}/tool-results/${call.id}`, { result: { ok: true } }));
    now += 61000;
    await assert.rejects(cap.request(path, body));
    await assert.rejects(payer.request(`/v1/tasks/${task.id}/tool-results/${call.id}`, { result: { ok: true } }));
    const next = await worker.request(`/v1/tasks/${task.id}/claim`, { worker_id: w.id });
    assert.ok(next.epoch > lease.epoch);
    await assert.rejects(cap.request(path, body));
    const current = new Api(base, next.tool_token);
    await assert.rejects(current.request(`/v1/tasks/${task.id}/tool-results/${call.id}`));
    store.suspend(w.id);
    await assert.rejects(current.request(path, body));
  } finally { await new Promise(done => server.close(done)); store.close(); }
});

test('stdio MCP advertises only file tools and rejects host resource access', async () => {
  const child = spawn(process.execPath, [resolve('worker/cli.mjs'), 'mcp'], { env: { PATH: process.env.PATH, AWC_TASK_ID: `task_${randomUUID()}`, AWC_TOOL_TOKEN: 'synthetic-token', AWC_BASE_URL: 'http://127.0.0.1:1' } });
  let output = ''; child.stdout.on('data', c => output += c); child.stderr.resume();
  const messages = [
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { method: 'notifications/initialized' }, { id: 2, method: 'tools/list' },
    { id: 3, method: 'resources/read', params: { uri: 'file:///etc/passwd' } },
  ];
  child.stdin.end(messages.map(m => JSON.stringify({ jsonrpc: '2.0', ...m })).join('\n') + '\n');
  await new Promise((done, reject) => { child.on('exit', done); child.on('error', reject); });
  const replies = output.trim().split('\n').map(JSON.parse);
  assert.equal(replies.length, 3);
  assert.deepEqual(replies[1].result.tools.map(t => t.name), ['files_list', 'files_read', 'files_write', 'artifacts_seal']);
  assert.equal(replies[2].error.code, -32601);
});
