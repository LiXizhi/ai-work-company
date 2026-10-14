import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Store, hash } from '../backend/store.mjs';
import { createServer } from '../backend/server.mjs';
import { Api } from '../worker/client.mjs';
import { workOnce } from '../worker/run.mjs';
import { consume } from '../consumer/run.mjs';

await mkdir('data', { recursive: true });
const root = await mkdtemp(resolve('data/live-'));
const store = new Store(resolve(root, 'ledger.sqlite'));
const server = createServer(store);
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const abort = new AbortController(); let consumer;
try {
  const employer = store.provisionPlatform('TEST FIXTURE employer', 10000);
  const owner = store.register('Live Codex owner');
  const payer = new Api(base, employer.token), workerApi = new Api(base, owner.token);
  const worker = await workerApi.request('/v1/workers', { name: 'Live Codex MCP', model: 'gpt-6-astra', accept_trial: true });
  store.qualifyWorker(worker.id, { model: worker.model, trial_reference_minor: 2000, evidence_ref: `TEST-FIXTURE-NOT-REAL-TRIAL:${worker.id}` });
  const input = resolve(root, 'input'); await mkdir(input);
  await writeFile(resolve(input, 'orders.csv'), 'item,quantity,unit_price\nPencil,3,2\nBook,2,12\n');
  const job = await payer.request('/v1/tasks', { title: 'Summarize orders', description: 'Read input/orders.csv. Write output/report.txt with each item subtotal and total 30. Explain the arithmetic. Use only sandbox MCP tools.', model: worker.model, amount_minor: 100, workspace_required: true });
  const events = [];
  const onEvent = event => { events.push(event); console.log(JSON.stringify(event)); };
  consumer = consume({ api: payer, taskId: job.id, input, root: resolve(root, 'workspace'), signal: abort.signal, onEvent });
  consumer.catch(() => {});
  const result = await workOnce({ api: workerApi, workerId: worker.id, taskId: job.id, runDir: resolve(root, 'agent'), onEvent });
  await consumer;
  const output = await readFile(resolve(root, `workspace/attempt-${result.epoch}/output/report.txt`), 'utf8');
  const seal = JSON.parse(store.one('SELECT result FROM tool_calls WHERE id=?', result.seal_id).result);
  assert.equal(seal.manifest.files.find(file => file.path === 'output/report.txt').sha256, hash(output));
  assert.match(output, /30/); assert.match(output, /6/); assert.match(output, /24/);
  store.reviewTask(job.id, { model: worker.model, result_sha256: hash(result.result), verified_tokens: result.usage.input_tokens + result.usage.output_tokens, evidence_ref: `LOCAL-CLI-OBSERVATION:${job.id}` });
  await payer.request(`/v1/tasks/${job.id}/accept`, { rating: 5 }, 'live-accept');
  await payer.request(`/v1/tasks/${job.id}/accept`, { rating: 5 }, 'live-accept');
  assert.equal(store.wallet(owner.account_id).available, 100);
  assert.equal(store.wallet(employer.account_id).available, 9900);
  assert.equal(store.wallet(employer.account_id).frozen, 0);
  const report = { timestamp: new Date().toISOString(), fixture: 'Synthetic seed credits and trial qualification; actual model invocation, MCP file operations and settlement.', requested_model: result.requested_model, evidence_kind: result.evidence_kind, usage: result.usage, toolEvents: result.toolEvents, output_sha256: hash(output), output, settlement: { worker_minor: 100, employer_minor: 9900, frozen_minor: 0, duplicate_accept: 'no duplicate payment' } };
  await writeFile(resolve(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ success: true, report: resolve(root, 'report.json') }));
} catch (error) {
  console.error(error.message); if (error.diagnostics) console.error(error.diagnostics); process.exitCode = 1;
} finally {
  abort.abort(); await consumer?.catch(() => {});
  await new Promise(done => server.close(done)); store.close();
}
