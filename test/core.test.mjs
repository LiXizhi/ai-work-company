import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, DAY, LEASE, hash } from '../backend/store.mjs';

function fixture(t, path = ':memory:') {
  let now = Date.UTC(2026, 9, 14), count = 0;
  const store = new Store(path, { now: () => now });
  t.after(() => store.close());
  const platform = store.provisionPlatform('Synthetic company', 10000);
  const alice = store.register('Synthetic Alice'), bob = store.register('Synthetic Bob');
  const mutate = (actor, fn) => store.mutation(actor, `test-${++count}`, `k-${count}`, {}, fn);
  const worker = (owner, model = 'gpt-6-astra', qualified = true) => {
    const w = mutate(owner.account_id, () => store.registerWorker(owner.account_id, { name: 'Fixture Worker', model, accept_trial: true }));
    if (qualified) store.qualifyWorker(w.id, { model, trial_reference_minor: 2000, evidence_ref: `synthetic:trial:${w.id}` });
    return w;
  };
  const create = (owner = platform, amount = 500, model = 'gpt-6-astra') => mutate(owner.account_id, () => store.createTask(owner.account_id, { title: 'Synthetic task', description: 'Synthetic input', model, amount_minor: amount }));
  const claim = (owner, w, job) => mutate(owner.account_id, () => store.claim(owner.account_id, job.id, w.id));
  const submit = (owner, job) => mutate(owner.account_id, () => store.submit(owner.account_id, job.id, { epoch: job.epoch, result: 'Synthetic delivery' }));
  const review = (job) => store.reviewTask(job.id, { model: job.model, result_sha256: hash('Synthetic delivery'), verified_tokens: 100, evidence_ref: `synthetic:task:${job.id}` });
  const accept = (owner, job) => mutate(owner.account_id, () => store.accept(owner.account_id, job.id, { rating: 5 }));
  const paidJob = (owner, w, payer = platform, amount = 500) => { const job = claim(owner, w, create(payer, amount)); submit(owner, job); review(job); accept(payer, job); return job; };
  return { store, platform, alice, bob, mutate, worker, create, claim, submit, review, accept, paidJob, advance: (ms) => { now += ms; } };
}
const throwsCode = (fn, code) => assert.throws(fn, (error) => error.code === code);

test('registration and operator-reviewed unpaid trial never create spending credits', (t) => {
  const f = fixture(t); f.worker(f.alice);
  assert.equal(f.store.wallet(f.alice.account_id).available, 0);
  throwsCode(() => f.create(f.alice), 'insufficient_balance');
  assert.equal(f.store.all('SELECT * FROM ledger WHERE account=?', f.alice.account_id).length, 0);
  throwsCode(() => f.store.provisionPlatform('Another company', 100), 'already_provisioned');
});

test('earn → hire → accept conserves credits and updates real-order ratings', (t) => {
  const f = fixture(t), wa = f.worker(f.alice), wb = f.worker(f.bob);
  f.paidJob(f.alice, wa, f.platform, 1000);
  f.paidJob(f.bob, wb, f.alice, 600);
  assert.equal(f.store.wallet(f.alice.account_id).available, 400);
  assert.equal(f.store.wallet(f.bob.account_id).available, 600);
  assert.equal(f.store.one('SELECT SUM(available+frozen) AS n FROM accounts').n, 10000);
  assert.equal(f.store.one('SELECT rating_count FROM workers WHERE id=?', wb.id).rating_count, 1);
  assert.equal(f.store.one('SELECT verified_tokens FROM workers WHERE id=?', wb.id).verified_tokens, 100);
});

test('idempotent task reservation and acceptance cannot double debit or credit', (t) => {
  const f = fixture(t), w = f.worker(f.alice);
  const body = { title: 'One order', description: 'Only once', model: w.model, amount_minor: 500 };
  const post = () => f.store.mutation(f.platform.account_id, 'create', 'same', body, () => f.store.createTask(f.platform.account_id, body));
  const job = post(); assert.equal(post().id, job.id);
  assert.equal(f.store.wallet(f.platform.account_id).frozen, 500);
  throwsCode(() => f.store.mutation(f.platform.account_id, 'create', 'same', { changed: true }, () => null), 'idempotency_conflict');
  const lease = f.claim(f.alice, w, job); f.submit(f.alice, lease); f.review(job);
  const accept = () => f.store.mutation(f.platform.account_id, 'accept', 'same', { rating: 5 }, () => f.store.accept(f.platform.account_id, job.id, { rating: 5 }));
  accept(); accept();
  assert.equal(f.store.wallet(f.alice.account_id).available, 500);
  throwsCode(() => f.accept(f.platform, job), 'invalid_state');
});

test('failed mutations roll back reservations and do not save idempotency success', (t) => {
  const f = fixture(t);
  assert.throws(() => f.store.mutation(f.platform.account_id, 'broken', 'key', {}, () => {
    f.store.createTask(f.platform.account_id, { title: 'Rollback', description: 'Synthetic', model: 'gpt-6-astra', amount_minor: 500 });
    throw new Error('synthetic failure');
  }));
  assert.equal(f.store.wallet(f.platform.account_id).frozen, 0);
  assert.equal(f.store.all('SELECT * FROM tasks').length, 0);
  assert.equal(f.store.all('SELECT * FROM idempotency').length, 0);
});

test('shared rolling daily budget cannot be bypassed with more Workers or midnight', (t) => {
  const f = fixture(t), w1 = f.worker(f.alice), w2 = f.worker(f.bob);
  f.store.limits(f.platform.account_id, 1000, 2);
  const a = f.claim(f.alice, w1, f.create(f.platform, 600)), b = f.create(f.platform, 600);
  throwsCode(() => f.claim(f.bob, w2, b), 'daily_limit');
  f.submit(f.alice, a); f.advance(DAY + 1); f.store.sweep();
  throwsCode(() => f.claim(f.bob, w2, b), 'daily_limit');
  f.review(a); f.accept(f.platform, a);
  throwsCode(() => f.claim(f.bob, w2, b), 'daily_limit');
  f.advance(DAY + 1); f.store.sweep();
  assert.equal(f.claim(f.bob, w2, b).state, 'running');
});

test('Consumer concurrency, Worker occupancy and model matching are independent gates', (t) => {
  const f = fixture(t), w1 = f.worker(f.alice), w2 = f.worker(f.bob), other = f.worker(f.bob, 'claude-opus-5.5');
  const a = f.create(), b = f.create(); f.claim(f.alice, w1, a);
  throwsCode(() => f.claim(f.alice, w1, b), 'worker_busy');
  throwsCode(() => f.claim(f.bob, w2, b), 'concurrency_limit');
  throwsCode(() => f.claim(f.bob, other, b), 'model_mismatch');
});

test('unqualified workers cannot inspect descriptions or claim and owners cannot self-deal', (t) => {
  const f = fixture(t), w = f.worker(f.alice, 'gpt-6-astra', false), job = f.create();
  throwsCode(() => f.claim(f.alice, w, job), 'worker_not_qualified');
  throwsCode(() => f.store.task(f.alice.account_id, job.id), 'not_found');
  const platformWorker = f.worker(f.platform);
  throwsCode(() => f.claim(f.platform, platformWorker, job), 'not_claimable');
});

test('lease expiry invalidates old attempts and only two automatic reassignments exist', (t) => {
  const f = fixture(t), w = f.worker(f.alice), job = f.create();
  const first = f.claim(f.alice, w, job);
  f.advance(LEASE + 1); f.store.sweep();
  const second = f.claim(f.alice, w, job);
  throwsCode(() => f.submit(f.alice, first), 'lease_expired');
  assert.ok(second.epoch > first.epoch);
  f.advance(LEASE + 1); f.store.sweep(); f.claim(f.alice, w, job);
  f.advance(LEASE + 1); f.store.sweep();
  assert.equal(f.store.task(f.platform.account_id, job.id).state, 'failed');
  assert.equal(f.store.wallet(f.platform.account_id).frozen, 0);
});

test('no Worker means expiry refund; timely submitted work retains reservation', (t) => {
  const f = fixture(t), w = f.worker(f.alice), queued = f.create(), submitted = f.claim(f.alice, w, f.create());
  f.submit(f.alice, submitted); f.advance(3 * DAY + 1); f.store.sweep(); f.store.sweep();
  assert.equal(f.store.task(f.platform.account_id, queued.id).state, 'expired');
  assert.equal(f.store.task(f.platform.account_id, submitted.id).state, 'submitted');
  assert.equal(f.store.wallet(f.platform.account_id).frozen, 500);
  throwsCode(() => f.mutate(f.platform.account_id, () => f.store.cancel(f.platform.account_id, submitted.id)), 'invalid_state');
});

test('self-reported result cannot settle; evidence binds model, result and unique record', (t) => {
  const f = fixture(t), w = f.worker(f.alice), a = f.claim(f.alice, w, f.create()); f.submit(f.alice, a);
  throwsCode(() => f.accept(f.platform, a), 'evidence_pending');
  const evidence = { model: w.model, result_sha256: hash('Synthetic delivery'), verified_tokens: 50, evidence_ref: 'synthetic:unique' };
  throwsCode(() => f.store.reviewTask(a.id, { ...evidence, model: 'cheap-model' }), 'model_mismatch');
  throwsCode(() => f.store.reviewTask(a.id, { ...evidence, result_sha256: hash('tampered') }), 'result_mismatch');
  f.store.reviewTask(a.id, evidence); f.accept(f.platform, a);
  const b = f.claim(f.alice, w, f.create()); f.submit(f.alice, b);
  throwsCode(() => f.store.reviewTask(b.id, evidence), 'duplicate_evidence');
});

test('Worker cannot accept/cancel employer tasks and strangers cannot read results', (t) => {
  const f = fixture(t), w = f.worker(f.alice), job = f.claim(f.alice, w, f.create());
  throwsCode(() => f.mutate(f.alice.account_id, () => f.store.cancel(f.alice.account_id, job.id)), 'forbidden');
  f.submit(f.alice, job); f.review(job);
  throwsCode(() => f.accept(f.alice, job), 'forbidden');
  throwsCode(() => f.store.task(f.bob.account_id, job.id), 'not_found');
});

test('suspension revokes running lease and holds submitted settlement', (t) => {
  const f = fixture(t), w = f.worker(f.alice), first = f.claim(f.alice, w, f.create());
  f.submit(f.alice, first); f.review(first);
  const second = f.claim(f.alice, w, f.create());
  f.store.suspend(w.id);
  throwsCode(() => f.submit(f.alice, second), 'not_worker');
  throwsCode(() => f.accept(f.platform, first), 'worker_suspended');
  assert.equal(f.store.wallet(f.platform.account_id).frozen, 500);
  f.store.resolveDispute(first.id, 'refund', 'synthetic:dispute');
  assert.equal(f.store.wallet(f.platform.account_id).frozen, 0);
});

test('ledger is append-only, reconstructs wallet and contains no raw tokens', (t) => {
  const f = fixture(t), w = f.worker(f.alice); f.paidJob(f.alice, w);
  for (const account of f.store.all('SELECT * FROM accounts')) {
    const sums = f.store.one('SELECT COALESCE(SUM(available_delta),0) AS a,COALESCE(SUM(frozen_delta),0) AS f FROM ledger WHERE account=?', account.id);
    assert.equal(sums.a, account.available); assert.equal(sums.f, account.frozen);
    assert.ok(!JSON.stringify(account).includes(f.alice.token));
  }
  assert.throws(() => f.store.run("UPDATE ledger SET kind='tampered'"), /append-only/);
  assert.throws(() => f.store.run('DELETE FROM ledger'), /append-only/);
});

test('SQLite state and idempotency survive restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awc-test-')), path = join(dir, 'state.sqlite');
  let s;
  try {
    s = new Store(path); const p = s.provisionPlatform('Synthetic', 1000);
    const body = { title: 'Persist', description: 'Across restarts', model: 'gpt-6-astra', amount_minor: 500 };
    const job = s.mutation(p.account_id, 'create', 'persistent', body, () => s.createTask(p.account_id, body));
    s.close(); s = new Store(path);
    assert.equal(s.authenticate(p.token).id, p.account_id);
    assert.equal(s.mutation(p.account_id, 'create', 'persistent', body, () => { throw new Error('must not repeat'); }).id, job.id);
    assert.equal(s.wallet(p.account_id).frozen, 500);
  } finally { s?.close(); rmSync(dir, { recursive: true, force: true }); }
});
