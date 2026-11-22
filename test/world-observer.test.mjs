import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Store } from '../backend/store.mjs';
import { createServer } from '../backend/server.mjs';
import { personaPortraits, personaLabel } from '../site/personas.mjs';

test('sprite-lab and world share unified partner WebP portraits without legacy sprite sheet slicing', () => {
  assert.deepEqual(Object.keys(personaPortraits).sort(), ['astra', 'claude', 'deepseek', 'gemini']);
  for (const path of Object.values(personaPortraits)) {
    assert.match(path, /\.webp$/);
  }
  assert.equal(personaLabel.astra, 'GPT · OPENAI');
  const spriteLabJs = readFileSync(new URL('../site/sprite-lab.js', import.meta.url), 'utf8');
  assert.match(spriteLabJs, /applyPersonaPortrait/);
  assert.doesNotMatch(spriteLabJs, /100\/3/);
});

test('read-only World Observer token exposes sanitized Worker status and credits without leaking task secrets or write access', async (t) => {
  const store = new Store();
  const server = createServer(store);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(async () => { await new Promise((done) => server.close(done)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let seq = 0;
  const req = async (path, { token, body } = {}) => {
    const res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json', 'Idempotency-Key': `obs-k-${++seq}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, value: await res.json(), headers: res.headers };
  };

  // Slashless portal routes redirect with relative subpath-safe 308 Location
  for (const portal of ['admin', 'company', 'free']) {
    const slashless = await fetch(`${base}/${portal}?state=open`, { redirect: 'manual' });
    assert.equal(slashless.status, 308);
    assert.equal(slashless.headers.get('location'), `${portal}/?state=open`);
  }

  // /index.html receives world CSP; WebP images omit text charset
  const idx = await fetch(`${base}/index.html`);
  assert.equal(idx.status, 200);
  assert.match(idx.headers.get('content-security-policy'), /cdn\.keepwork\.com/);
  const avatarImg = await fetch(`${base}/assets/avatars/gpt.webp`);
  assert.equal(avatarImg.headers.get('content-type'), 'image/webp');

  const employer = store.provisionPlatform('Secret Employer', 5000);
  const owner = (await req('/v1/accounts', { body: { name: 'Night Worker Owner' } })).value;
  const worker = (await req('/v1/workers', { token: owner.token, body: { name: 'NightOwl', model: 'gpt-6-astra', accept_trial: true } })).value;
  store.qualifyWorker(worker.id, { model: 'gpt-6-astra', trial_reference_minor: 2000, evidence_ref: 'syn:obs:qual' });

  const secretPrompt = 'CONFIDENTIAL_CUSTOMER_PROMPT_DO_NOT_LEAK';
  const task = (await req('/v1/tasks', {
    token: employer.token,
    body: {
      title: 'Private Task Title',
      description: secretPrompt,
      system_prompt: secretPrompt,
      category: 'art_works',
      skill_id: 'hanzi-story-animation',
      model: 'gpt-6-astra',
      amount_minor: 300,
    },
  })).value;
  await req(`/v1/tasks/${task.id}/claim`, { token: owner.token, body: { worker_id: worker.id } });

  // Account Bearer token is NOT accepted on observer endpoint
  assert.equal((await req('/v1/observer/worker', { token: owner.token })).status, 401);

  const issued1 = await req(`/v1/workers/${worker.id}/observer-token`, { token: owner.token, body: {} });
  assert.equal(issued1.status, 200);
  assert.match(issued1.value.observer_token, /^obs_/);

  // Observer token CANNOT access account or mutation endpoints
  assert.equal((await req('/v1/me', { token: issued1.value.observer_token })).status, 401);
  assert.equal((await req('/v1/tasks', { token: issued1.value.observer_token })).status, 401);

  // Observer token reads sanitized working state and credits without secret prompt/description
  const snap = await req('/v1/observer/worker', { token: issued1.value.observer_token });
  assert.equal(snap.status, 200);
  assert.equal(snap.value.worker.activity_state, 'working');
  assert.equal(snap.value.worker.active_skill_id, 'hanzi-story-animation');
  assert.equal(snap.value.credits.available_minor, 0);
  assert.ok(!JSON.stringify(snap.value).includes(secretPrompt));
  assert.ok(!JSON.stringify(snap.value).includes('Private Task Title'));

  // Rotating invalidates the previous observer token immediately
  const issued2 = await req(`/v1/workers/${worker.id}/observer-token`, { token: owner.token, body: {} });
  assert.equal((await req('/v1/observer/worker', { token: issued1.value.observer_token })).status, 401);
  assert.equal((await req('/v1/observer/worker', { token: issued2.value.observer_token })).status, 200);

  // Revoking denies subsequent reads immediately
  assert.equal((await req(`/v1/workers/${worker.id}/observer-revoke`, { token: owner.token, body: {} })).status, 200);
  assert.equal((await req('/v1/observer/worker', { token: issued2.value.observer_token })).status, 401);
});
