import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Store, hash } from '../backend/store.mjs';
import { createServer } from '../backend/server.mjs';
import { Api } from '../worker/client.mjs';
import { main } from '../cli/awc.mjs';
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
  const events = [];
  const onEvent = event => { events.push(event); console.log(JSON.stringify(event)); };
  let published;
  const publication = new Promise(done => { published = done; });
  const hire = main(['hire', '--request', 'orders-1', '--input', input, '--task', 'Read input/orders.csv. Write output/report.txt with each item subtotal and total 30. Explain the arithmetic. Use only sandbox MCP tools.', '--budget', '100'], {
    env: { AWC_BASE_URL: base, AWC_TOKEN: employer.token, AWC_CLIENT_DIR: resolve(root, 'consumer-client') },
    runConsumer: options => consume({ ...options, signal: abort.signal }),
    output: event => { onEvent(event); if (event.state === 'published') published(event); },
  });
  consumer = hire; hire.catch(() => {});
  const publicationResult = await Promise.race([publication, hire.then(() => { throw new Error('publication_failed'); })]);
  const job = { id: publicationResult.task_id };
  let result;
  await main(['work'], {
    env: { AWC_BASE_URL: base, AWC_TOKEN: owner.token, AWC_CLIENT_DIR: resolve(root, 'worker-client') },
    output: event => { onEvent(event); if (event.state === 'submitted') result = event; },
  });
  if (!result) throw new Error('worker_did_not_submit');
  await consumer;
  const output = await readFile(resolve(publicationResult.workspace, `attempt-${result.epoch}/output/report.txt`), 'utf8');
  const seal = JSON.parse(store.one('SELECT result FROM tool_calls WHERE id=?', result.seal_id).result);
  assert.equal(seal.manifest.files.find(file => file.path === 'output/report.txt').sha256, hash(output));
  assert.match(output, /30/); assert.match(output, /6/); assert.match(output, /24/);
  store.reviewTask(job.id, { model: worker.model, result_sha256: hash(result.result), verified_tokens: result.usage.input_tokens + result.usage.output_tokens, evidence_ref: `LOCAL-CLI-OBSERVATION:${job.id}` });
  await main(['accept', '--id', job.id, '--rating', '5'], { env: { AWC_BASE_URL: base, AWC_CLIENT_DIR: resolve(root, 'consumer-client') }, output: () => {} });
  await main(['accept', '--id', job.id, '--rating', '5'], { env: { AWC_BASE_URL: base, AWC_CLIENT_DIR: resolve(root, 'consumer-client') }, output: () => {} });
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
