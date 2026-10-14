import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, hash } from '../backend/store.mjs';
import { createServer, openapi } from '../backend/server.mjs';
import { readFileSync, existsSync } from 'node:fs';
import http from 'node:http';

async function serverFixture(t) {
  const store = new Store(); const server = createServer(store);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(async () => { await new Promise((done) => server.close(done)); store.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  let count = 0;
  const request = async (path, { token, body, key, headers = {} } = {}) => {
    const response = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { 'Content-Type': 'application/json', 'Idempotency-Key': key || `test-${++count}` }), ...headers },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { status: response.status, value: await response.json(), headers: response.headers };
  };
  return { store, url, request };
}

test('HTTP earn-and-hire roundtrip uses auth, reviewed evidence and one settlement', async (t) => {
  const { store, request } = await serverFixture(t);
  const p = store.provisionPlatform('Synthetic HTTP employer', 10000);
  const a = (await request('/v1/accounts', { body: { name: 'Synthetic owner' } })).value;
  const w = (await request('/v1/workers', { token: a.token, body: { name: 'Synthetic Worker', model: 'gpt-6-astra', accept_trial: true } })).value;
  store.qualifyWorker(w.id, { model: w.model, trial_reference_minor: 2000, evidence_ref: 'synthetic:http-trial' });
  const job = (await request('/v1/tasks', { token: p.token, body: { title: 'HTTP task', description: 'Private description', model: w.model, amount_minor: 500 } })).value;
  const queue = await request(`/v1/queue?worker_id=${w.id}`, { token: a.token });
  assert.equal(queue.status, 200); assert.ok(!('description' in queue.value.tasks[0]));
  const claimed = (await request(`/v1/tasks/${job.id}/claim`, { token: a.token, body: { worker_id: w.id } })).value;
  assert.equal(claimed.description, 'Private description');
  const submission = await request(`/v1/tasks/${job.id}/submit`, { token: a.token, body: { epoch: claimed.epoch, result: 'HTTP result' } });
  assert.equal(submission.status, 200);
  assert.equal((await request(`/v1/tasks/${job.id}/accept`, { token: p.token, body: { rating: 5 } })).value.error.code, 'evidence_pending');
  store.reviewTask(job.id, { model: w.model, result_sha256: hash('HTTP result'), verified_tokens: 100, evidence_ref: 'synthetic:http-task' });
  for (let i = 0; i < 2; i++) assert.equal((await request(`/v1/tasks/${job.id}/accept`, { token: p.token, key: 'accept-once', body: { rating: 5 } })).status, 200);
  assert.equal((await request('/v1/me', { token: a.token })).value.available, 500);
  assert.equal((await request('/v1/tasks', { token: a.token, body: { title: 'Spend earnings', description: 'A real next task', model: w.model, amount_minor: 500 } })).status, 200);
});

test('HTTP rejects privilege escalation, forged evidence, malformed money and unsupported tools', async (t) => {
  const { request } = await serverFixture(t);
  assert.equal((await request('/v1/me')).status, 401);
  const a = (await request('/v1/accounts', { body: { name: 'Synthetic user' } })).value;
  assert.equal((await request('/v1/accounts', { body: { name: 'Forged', available: 9999 } })).status, 400);
  assert.equal((await request('/v1/workers', { token: a.token, body: { name: 'Forged', model: 'gpt-6-astra', accept_trial: true, qualified: 1 } })).status, 400);
  for (const path of ['/v1/recharge', '/v1/tools/call', '/v1/files/read', '/v1/admin/qualify', '/v1/mcp']) {
    assert.equal((await request(path, { token: a.token, body: {} })).status, 404);
  }
  const base = { title: 'Task', description: 'Text', model: 'gpt-6-astra', amount_minor: 500 };
  assert.equal((await request('/v1/tasks', { token: a.token, body: base })).status, 402);
  for (const amount_minor of [-1, 0, 0.5, '500', Number.MAX_SAFE_INTEGER]) {
    assert.equal((await request('/v1/tasks', { token: a.token, body: { ...base, amount_minor } })).status, 400);
  }
});

test('HTTP blocks cross-origin requests and unexpected Host, bounds bodies, sanitizes errors', async (t) => {
  const { request, url } = await serverFixture(t);
  // Fetch controls Host itself; use a raw HTTP request to exercise DNS rebinding protection.
  const hostStatus = await new Promise((resolve, reject) => {
    http.get(url + '/health', { headers: { Host: 'attacker.example' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  assert.equal((await request('/health', { headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await request('/v1/accounts', { body: { name: 'x'.repeat(70000) } })).status, 413);
  const bad = await request('/v1/accounts', { body: { name: '' } });
  assert.equal(bad.status, 400); assert.ok(!JSON.stringify(bad.value).includes('store.mjs'));
  assert.equal(bad.headers.get('x-content-type-options'), 'nosniff');
});

test('concurrent HTTP claims produce exactly one assignee and one daily reservation', async (t) => {
  const { store, request } = await serverFixture(t);
  const p = store.provisionPlatform('Synthetic race employer', 10000);
  const owners = [store.register('Synthetic A'), store.register('Synthetic B')];
  const workers = [];
  for (const owner of owners) {
    const w = (await request('/v1/workers', { token: owner.token, body: { name: 'Race worker', model: 'gpt-6-astra', accept_trial: true } })).value;
    store.qualifyWorker(w.id, { model: w.model, trial_reference_minor: 2000, evidence_ref: `synthetic:race:${w.id}` }); workers.push(w);
  }
  const task = (await request('/v1/tasks', { token: p.token, body: { title: 'Race', description: 'One assignee', model: 'gpt-6-astra', amount_minor: 500 } })).value;
  const results = await Promise.all(owners.map((owner, index) => request(`/v1/tasks/${task.id}/claim`, { token: owner.token, body: { worker_id: workers[index].id } })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(store.wallet(p.account_id).reserved_daily, 500);
  assert.equal(store.wallet(p.account_id).frozen, 500);
});

test('static discovery is honest, subpath-safe, with matching OpenAPI routes', async (t) => {
  const { request, url } = await serverFixture(t);
  const capability = (await request('/v1/capabilities')).value;
  assert.ok(capability.available.includes('posix_file_broker'));
  assert.ok(capability.unavailable.includes('arbitrary_code_sandbox'));
  const discovery = (await request('/.well-known/agent.json')).value;
  assert.equal(discovery.hosted_api, null);
  const base = 'https://lixizhi.github.io/ai-work-company/.well-known/agent.json';
  assert.equal(new URL(discovery.instructions, base).pathname, '/ai-work-company/agent.md');
  const spec = (await request('/openapi.json')).value;
  assert.deepEqual(spec, openapi());
  assert.equal(spec.paths['/v1/tasks/{id}/submit'].post.requestBody.content['application/json'].schema.additionalProperties, false);
  const page = await fetch(url + '/'); assert.equal(page.status, 200);
  assert.match(await page.text(), /No hosted marketplace|Public marketplace not live/);
  const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (target.startsWith('http') || target.startsWith('#') || target === './' || target === 'openapi.json') continue;
    assert.ok(existsSync(new URL(`../site/${target}`, import.meta.url)), `Missing local asset ${target}`);
  }
});
