import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { Trials } from './trials.mjs';
import { Market, workerTrustTier } from './market.mjs';

export const DAY = 86_400_000;
export const LEASE = 60_000;
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export class Fault extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const requireThat = (ok, code, message, status = 409) => {
  if (!ok) throw new Fault(status, code, message);
};
const id = (prefix) => `${prefix}_${randomUUID()}`;
const token = () => `awc_${randomBytes(32).toString('base64url')}`;
export function string(value, name, max = 200) {
  requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    'invalid_input', `${name} must be a nonempty string of at most ${max} characters.`, 400);
  return value.trim();
}
export function integer(value, name, min = 1, max = 1_000_000) {
  requireThat(Number.isSafeInteger(value) && value >= min && value <= max,
    'invalid_input', `${name} must be an integer between ${min} and ${max}.`, 400);
  return value;
}

export class Store {
  constructor(path = ':memory:', { now = Date.now, models = ['claude-opus-5.5', 'gpt-6-astra'] } = {}) {
    this.now = now;

    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'user', available INTEGER NOT NULL DEFAULT 0 CHECK(available>=0),
        frozen INTEGER NOT NULL DEFAULT 0 CHECK(frozen>=0),
        daily_limit INTEGER NOT NULL DEFAULT 1000, concurrency INTEGER NOT NULL DEFAULT 1,
        banned INTEGER NOT NULL DEFAULT 0, ban_reason TEXT, last_seen_at INTEGER,
        primary_category TEXT NOT NULL DEFAULT 'general_files',
        consumer_rating_sum INTEGER NOT NULL DEFAULT 0, consumer_rating_count INTEGER NOT NULL DEFAULT 0,
        payout_pct_sum INTEGER NOT NULL DEFAULT 0, settled_tasks_count INTEGER NOT NULL DEFAULT 0,
        consumer_strikes INTEGER NOT NULL DEFAULT 0);
      CREATE UNIQUE INDEX IF NOT EXISTS one_platform ON accounts(role) WHERE role='platform';
      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES accounts(id), name TEXT NOT NULL,
        model TEXT NOT NULL, consent_at INTEGER NOT NULL, qualified INTEGER NOT NULL DEFAULT 0,
        suspended INTEGER NOT NULL DEFAULT 0, trial_minor INTEGER NOT NULL DEFAULT 0,
        evidence_ref TEXT, rating_sum INTEGER NOT NULL DEFAULT 0, rating_count INTEGER NOT NULL DEFAULT 0,
        verified_tokens INTEGER NOT NULL DEFAULT 0, completed_count INTEGER NOT NULL DEFAULT 0,
        strikes INTEGER NOT NULL DEFAULT 0, last_seen_at INTEGER, ban_reason TEXT);
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES accounts(id), title TEXT NOT NULL,
        description TEXT NOT NULL, model TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
        created_at INTEGER NOT NULL, deadline INTEGER NOT NULL, state TEXT NOT NULL,
        worker TEXT REFERENCES workers(id), attempts INTEGER NOT NULL DEFAULT 0,
        epoch INTEGER NOT NULL DEFAULT 0, lease_until INTEGER, result TEXT,
        evidence_ref TEXT, verified_tokens INTEGER NOT NULL DEFAULT 0, submitted_at INTEGER,
        settled_at INTEGER, rating INTEGER,
        category TEXT NOT NULL DEFAULT 'general_files',
        skill_id TEXT NOT NULL DEFAULT 'sandbox-file-ops',
        system_prompt TEXT,
        expected_minutes INTEGER NOT NULL DEFAULT 30,
        min_trust_tier TEXT NOT NULL DEFAULT 'probation',
        judge_mode TEXT NOT NULL DEFAULT 'human',
        judge_rubric TEXT,
        min_payout_percent INTEGER NOT NULL DEFAULT 100,
        payout_percent INTEGER,
        judge_verdict TEXT,
        telemetry_flags TEXT,
        claimed_at INTEGER,
        consumer_rating INTEGER);
      CREATE TABLE IF NOT EXISTS ledger (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL REFERENCES accounts(id),
        task TEXT REFERENCES tasks(id), kind TEXT NOT NULL, available_delta INTEGER NOT NULL,
        frozen_delta INTEGER NOT NULL, at INTEGER NOT NULL, reference TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS daily_spend (
        task TEXT PRIMARY KEY REFERENCES tasks(id), account TEXT NOT NULL REFERENCES accounts(id),
        amount INTEGER NOT NULL, settled_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (
        reference TEXT PRIMARY KEY, task TEXT UNIQUE REFERENCES tasks(id), worker TEXT REFERENCES workers(id));
      CREATE TABLE IF NOT EXISTS idempotency (
        actor TEXT NOT NULL, route TEXT NOT NULL, key TEXT NOT NULL, digest TEXT NOT NULL,
        response TEXT NOT NULL, PRIMARY KEY(actor,route,key));
      CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'append-only ledger'); END;
      CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'append-only ledger'); END;
    `);
    this.ensureColumns();
    this.trials = new Trials(this, models);
    this.market = new Market(this);
  }
  ensureColumns() {
    const alterIfMissing = (table, col, def) => {
      const cols = this.all(`PRAGMA table_info(${table})`).map((r) => r.name);
      if (!cols.includes(col)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    };
    for (const [col, def] of [
      ['banned', 'INTEGER NOT NULL DEFAULT 0'], ['ban_reason', 'TEXT'], ['last_seen_at', 'INTEGER'],
      ['primary_category', "TEXT NOT NULL DEFAULT 'general_files'"],
      ['consumer_rating_sum', 'INTEGER NOT NULL DEFAULT 0'], ['consumer_rating_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['payout_pct_sum', 'INTEGER NOT NULL DEFAULT 0'], ['settled_tasks_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['consumer_strikes', 'INTEGER NOT NULL DEFAULT 0'],
    ]) alterIfMissing('accounts', col, def);
    for (const [col, def] of [
      ['completed_count', 'INTEGER NOT NULL DEFAULT 0'], ['strikes', 'INTEGER NOT NULL DEFAULT 0'],
      ['last_seen_at', 'INTEGER'], ['ban_reason', 'TEXT'],
    ]) alterIfMissing('workers', col, def);
    for (const [col, def] of [
      ['category', "TEXT NOT NULL DEFAULT 'general_files'"], ['skill_id', "TEXT NOT NULL DEFAULT 'sandbox-file-ops'"],
      ['system_prompt', 'TEXT'], ['expected_minutes', 'INTEGER NOT NULL DEFAULT 30'],
      ['min_trust_tier', "TEXT NOT NULL DEFAULT 'probation'"], ['judge_mode', "TEXT NOT NULL DEFAULT 'human'"],
      ['judge_rubric', 'TEXT'], ['min_payout_percent', 'INTEGER NOT NULL DEFAULT 100'],
      ['payout_percent', 'INTEGER'], ['judge_verdict', 'TEXT'], ['telemetry_flags', 'TEXT'],
      ['claimed_at', 'INTEGER'], ['consumer_rating', 'INTEGER'],
    ]) alterIfMissing('tasks', col, def);
  }
  get models() { return this.all('SELECT model FROM model_catalog WHERE enabled=1').map(row=>row.model); }
  one(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  close() { this.db.close(); }
  tx(fn) {
    const nested = (this.transactionDepth || 0) > 0;
    const savepoint = `awc_${this.transactionDepth || 0}`;
    this.db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
    this.transactionDepth = (this.transactionDepth || 0) + 1;
    try { const value = fn(); this.db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT'); return value; }
    catch (error) {
      if (nested) { this.db.exec(`ROLLBACK TO ${savepoint}`); this.db.exec(`RELEASE ${savepoint}`); }
      else this.db.exec('ROLLBACK');
      throw error;
    } finally { this.transactionDepth--; }
  }
  // Called inside the same transaction as the business operation.
  entry(account, task, kind, available, frozen, reference) {
    this.run('UPDATE accounts SET available=available+?, frozen=frozen+? WHERE id=?', available, frozen, account);
    this.run('INSERT INTO ledger(account,task,kind,available_delta,frozen_delta,at,reference) VALUES(?,?,?,?,?,?,?)',
      account, task, kind, available, frozen, this.now(), reference);
  }
  mutation(actor, route, key, body, fn) {
    string(key, 'Idempotency-Key', 128);
    return this.tx(() => {
      const digest = hash(JSON.stringify(body));
      const previous = this.one('SELECT * FROM idempotency WHERE actor=? AND route=? AND key=?', actor, route, key);
      if (previous) {
        requireThat(previous.digest === digest, 'idempotency_conflict', 'Key was used with different input.');
        return JSON.parse(previous.response);
      }
      const response = fn();
      this.run('INSERT INTO idempotency VALUES(?,?,?,?,?)', actor, route, key, digest, JSON.stringify(response));
      return response;
    });
  }
  register(name) {
    name = string(name, 'name', 80);
    const account = id('acct'), secret = token();
    this.run('INSERT INTO accounts(id,name,token_hash,last_seen_at) VALUES(?,?,?,?)', account, name, hash(secret), this.now());
    return { account_id: account, token: secret, available_minor: 0, unit: 'work_credit_minor' };
  }
  authenticate(secret) {
    const account = this.one('SELECT * FROM accounts WHERE token_hash=?', hash(secret || ''));
    requireThat(account, 'unauthorized', 'A valid Bearer token is required.', 401);
    requireThat(!account.banned, 'account_banned', 'Account has been banned for policy or model-spoofing violations.', 403);
    return account;
  }
  wallet(owner) {
    const a = this.one('SELECT id,name,available,frozen,daily_limit,concurrency,banned,ban_reason,primary_category,settled_tasks_count,payout_pct_sum,consumer_rating_sum,consumer_rating_count,consumer_strikes FROM accounts WHERE id=?', owner);
    const spent = this.one('SELECT COALESCE(SUM(amount),0) AS n FROM daily_spend WHERE account=? AND settled_at>?', owner, this.now() - DAY).n;
    const reserved = this.one("SELECT COALESCE(SUM(amount),0) AS n FROM tasks WHERE owner=? AND state IN ('running','submitted')", owner).n;
    return { ...a, spent_24h: spent, reserved_daily: reserved, unit: 'work_credit_minor', withdrawable: false };
  }
  registerWorker(owner, body) {
    requireThat(body.accept_trial === true, 'trial_consent_required', 'Owner must authorize approximately $20 of unpaid reference-token service.', 400);
    const name = string(body.name, 'name', 80), model = string(body.model, 'model');
    requireThat(this.models.includes(model), 'model_not_allowed', 'Model is not on the configured allowlist.', 400);
    const worker = id('worker');
    this.run('INSERT INTO workers(id,owner,name,model,consent_at,last_seen_at) VALUES(?,?,?,?,?,?)', worker, owner, name, model, this.now(), this.now());
    return this.one('SELECT * FROM workers WHERE id=?', worker);
  }
  worker(owner, workerId) {
    const w = this.one('SELECT * FROM workers WHERE id=? AND owner=?', workerId, owner);
    requireThat(w, 'not_found', 'Worker not found.', 404);
    return w;
  }
  createTask(owner, body) {
    const ownerAcct = this.one('SELECT banned FROM accounts WHERE id=?', owner);
    requireThat(ownerAcct && !ownerAcct.banned, 'account_banned', 'Banned accounts cannot create tasks.', 403);
    const title = string(body.title, 'title', 160), description = string(body.description, 'description', 20_000);
    const model = string(body.model, 'model');
    requireThat(this.models.includes(model), 'model_not_allowed', 'Choose an allowed model.', 400);
    const amount = integer(body.amount_minor, 'amount_minor');
    if (body.deadline !== undefined) requireThat(typeof body.deadline === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.deadline),
      'invalid_deadline', 'Use an ISO 8601 timestamp with a timezone.', 400);
    const deadline = body.deadline === undefined ? this.now() + 3 * DAY : Date.parse(body.deadline);
    requireThat(Number.isFinite(deadline) && deadline > this.now() && deadline <= this.now() + 30 * DAY,
      'invalid_deadline', 'Deadline must be in the next 30 days.', 400);
    const meta = this.market.validateTaskMetadata(body);
    const a = this.wallet(owner);
    requireThat(a.available >= amount, 'insufficient_balance', 'Earn settled work credits or recharge before hiring.', 402);
    requireThat(amount <= a.daily_limit, 'milestone_too_large', 'This release supports one milestone per task. Split the job or change the owner budget locally.', 400);
    const task = id('task');
    this.run(
      `INSERT INTO tasks(
        id,owner,title,description,model,amount,created_at,deadline,state,
        category,skill_id,system_prompt,expected_minutes,min_trust_tier,judge_mode,judge_rubric,min_payout_percent
      ) VALUES(?,?,?,?,?,?,?,?,'queued',?,?,?,?,?,?,?,?)`,
      task, owner, title, description, model, amount, this.now(), deadline,
      meta.category, meta.skill_id, meta.system_prompt, meta.expected_minutes, meta.min_trust_tier, meta.judge_mode, meta.judge_rubric, meta.min_payout_percent,
    );
    this.entry(owner, task, 'reserve', -amount, amount, task);
    this.market.recordTaskCreated(owner, meta.category);
    return this.task(owner, task);
  }
  task(actor, taskId) {
    const t = this.one('SELECT * FROM tasks WHERE id=?', taskId);
    requireThat(t && (t.owner === actor || (t.worker && this.one('SELECT id FROM workers WHERE id=? AND owner=?', t.worker, actor))),
      'not_found', 'Task not found.', 404);
    return t;
  }
  queue(owner, workerId) {
    const w = this.worker(owner, workerId);
    requireThat(this.models.includes(w.model), 'model_not_allowed', 'Model is disabled.');
    requireThat(w.qualified && !w.suspended, 'worker_not_qualified', 'Trial and model review must be completed before claiming.');
    this.run('UPDATE workers SET last_seen_at=? WHERE id=?', this.now(), workerId);
    this.run('UPDATE accounts SET last_seen_at=? WHERE id=?', this.now(), owner);
    const tier = workerTrustTier(w);
    return this.all(
      "SELECT id,title,model,amount,deadline,category,skill_id,expected_minutes,min_trust_tier,judge_mode,min_payout_percent FROM tasks WHERE state='queued' AND model=? AND owner<>? AND deadline>? AND expected_minutes<=? ORDER BY deadline,created_at LIMIT 100",
      w.model, owner, this.now(), tier.max_expected_minutes,
    );
  }
  claim(owner, taskId, workerId) {
    const w = this.worker(owner, workerId);
    requireThat(this.models.includes(w.model), 'model_not_allowed', 'Model is disabled.');
    requireThat(w.qualified && !w.suspended, 'worker_not_qualified', 'Worker has not passed operator review.');
    const t = this.one('SELECT * FROM tasks WHERE id=?', taskId);
    requireThat(t && t.state === 'queued' && t.owner !== owner, 'not_claimable', 'Task is unavailable.');
    requireThat(t.model === w.model, 'model_mismatch', 'No model substitution is allowed.');
    requireThat(t.deadline > this.now(), 'expired', 'Task deadline has passed.');
    requireThat(t.attempts < 3, 'attempts_exhausted', 'No automatic attempts remain.');
    requireThat(!this.one("SELECT id FROM tasks WHERE worker=? AND state='running'", workerId), 'worker_busy', 'Worker is already running a task.');
    this.market.checkClaimEligibility(w, t);
    const a = this.wallet(t.owner);
    const active = this.one("SELECT COUNT(*) AS n FROM tasks WHERE owner=? AND state='running'", t.owner).n;
    requireThat(active < a.concurrency, 'concurrency_limit', 'Consumer concurrency limit reached.');
    requireThat(a.spent_24h + a.reserved_daily + t.amount <= a.daily_limit, 'daily_limit', 'Rolling 24-hour budget exhausted.');
    const now = this.now();
    this.run("UPDATE tasks SET state='running',worker=?,attempts=attempts+1,epoch=epoch+1,lease_until=?,claimed_at=? WHERE id=?",
      workerId, Math.min(now + LEASE, t.deadline), now, taskId);
    this.run('UPDATE workers SET last_seen_at=? WHERE id=?', now, workerId);
    return this.task(owner, taskId);
  }
  leasedTask(owner, taskId, epoch) {
    integer(epoch, 'epoch');
    const t = this.task(owner, taskId);
    requireThat(t.worker && this.one('SELECT id FROM workers WHERE id=? AND owner=? AND suspended=0', t.worker, owner),
      'not_worker', 'Only the assigned active Worker may execute.', 403);
    requireThat(this.models.includes(t.model), 'model_not_allowed', 'Model is disabled.');
    requireThat(t.state === 'running' && t.epoch === epoch && t.lease_until > this.now() && t.deadline > this.now(),
      'lease_expired', 'Lease is stale, revoked or expired.');
    return t;
  }
  heartbeat(owner, taskId, epoch) {
    const t = this.leasedTask(owner, taskId, epoch);
    const now = this.now();
    this.run('UPDATE tasks SET lease_until=? WHERE id=?', Math.min(now + LEASE, t.deadline), taskId);
    this.run('UPDATE workers SET last_seen_at=? WHERE id=?', now, t.worker);
    return this.task(owner, taskId);
  }
  submit(owner, taskId, body) {
    const t = this.leasedTask(owner, taskId, body.epoch);
    const result = string(body.result, 'result', 30_000);
    const telemetry = this.market.computeSubmissionTelemetry(t, result);
    this.run(
      "UPDATE tasks SET state='submitted',result=?,submitted_at=?,lease_until=NULL,telemetry_flags=? WHERE id=?",
      result, this.now(), JSON.stringify(telemetry), taskId,
    );
    this.market.evaluateWhitelistOnSubmit(t);
    return this.task(owner, taskId);
  }
  accept(owner, taskId, body) {
    const t = this.task(owner, taskId);
    requireThat(t.owner === owner, 'forbidden', 'Only the Consumer may accept.', 403);
    requireThat(t.state === 'submitted', 'invalid_state', 'Only submitted work can be accepted.');
    requireThat(t.evidence_ref, 'evidence_pending', 'An independent operator must review per-task model evidence before payment.');
    const rating = integer(body.rating, 'rating', 1, 5);
    const w = this.one('SELECT * FROM workers WHERE id=?', t.worker);
    requireThat(!w.suspended, 'worker_suspended', 'Settlement is paused for review.');
    const minPayout = t.min_payout_percent || 100;
    const rawPayoutPct = body.payout_percent !== undefined ? body.payout_percent : (t.payout_percent != null ? t.payout_percent : 100);
    requireThat(rawPayoutPct !== 0, 'judge_rejected', 'Judger rejected deliverable with 0% payout; resolve via dispute refund.');
    const payoutPct = integer(rawPayoutPct, 'payout_percent', minPayout, 100);
    const workerPay = Math.floor((t.amount * payoutPct) / 100);
    const consumerRefund = t.amount - workerPay;
    if (workerPay > 0) {
      this.entry(owner, taskId, 'pay', 0, -workerPay, taskId);
      this.entry(w.owner, taskId, 'earn', workerPay, 0, taskId);
    }
    if (consumerRefund > 0) {
      this.entry(owner, taskId, 'partial_release', consumerRefund, -consumerRefund, `${taskId}:partial_release`);
    }
    this.run('INSERT INTO daily_spend VALUES(?,?,?,?)', taskId, owner, workerPay, this.now());
    this.run("UPDATE tasks SET state='completed',settled_at=?,rating=?,payout_percent=? WHERE id=?", this.now(), rating, payoutPct, taskId);
    this.run('UPDATE workers SET rating_sum=rating_sum+?,rating_count=rating_count+1,verified_tokens=verified_tokens+?,completed_count=completed_count+1 WHERE id=?', rating, t.verified_tokens, w.id);
    const cat = t.category || 'general_files';
    this.run(
      `INSERT INTO worker_category_stats(worker,category,completed_count,rating_sum,payout_pct_sum,verified_tokens)
       VALUES(?,?,1,?,?,?)
       ON CONFLICT(worker,category) DO UPDATE SET
         completed_count=completed_count+1, rating_sum=rating_sum+excluded.rating_sum,
         payout_pct_sum=payout_pct_sum+excluded.payout_pct_sum, verified_tokens=verified_tokens+excluded.verified_tokens`,
      w.id, cat, rating, payoutPct, t.verified_tokens,
    );
    this.run(
      `INSERT INTO consumer_category_stats(account,category,tasks_created,tasks_settled,total_spent_minor)
       VALUES(?,?,1,1,?)
       ON CONFLICT(account,category) DO UPDATE SET
         tasks_settled=tasks_settled+1, total_spent_minor=total_spent_minor+excluded.total_spent_minor`,
      owner, cat, workerPay,
    );
    this.run('UPDATE accounts SET settled_tasks_count=settled_tasks_count+1, payout_pct_sum=payout_pct_sum+? WHERE id=?', payoutPct, owner);
    return this.task(owner, taskId);
  }
  cancel(owner, taskId) {
    const t = this.task(owner, taskId);
    requireThat(t.owner === owner, 'forbidden', 'Only the Consumer may cancel.', 403);
    requireThat(['queued','running'].includes(t.state), 'invalid_state', 'Submitted work needs acceptance or an operator dispute decision.');
    this.release(t, 'cancelled');
    return this.task(owner, taskId);
  }
  release(t, state) {
    this.entry(t.owner, t.id, 'release', t.amount, -t.amount, `${t.id}:${state}`);
    this.run('UPDATE tasks SET state=?,epoch=epoch+1,lease_until=NULL WHERE id=?', state, t.id);
  }
  sweep() {
    return this.tx(() => {
      this.trials.expire();
      for (const t of this.all("SELECT * FROM tasks WHERE state IN ('queued','running') AND deadline<=?", this.now())) this.release(t, 'expired');
      for (const t of this.all("SELECT * FROM tasks WHERE state='running' AND lease_until<=?", this.now())) {
        if (t.attempts >= 3) this.release(t, 'failed');
        else this.run("UPDATE tasks SET state='queued',worker=NULL,epoch=epoch+1,lease_until=NULL WHERE id=?", t.id);
      }
    });
  }
  // Operator-only local methods: never expose these through consumer/worker HTTP.
  provisionPlatform(name, budget) {
    return this.tx(() => {
      integer(budget, 'budget_minor', 1, 100_000_000);
      requireThat(!this.one("SELECT id FROM accounts WHERE role='platform'"), 'already_provisioned', 'Platform seed can only be issued once.');
      const account = this.register(name);
      this.run("UPDATE accounts SET role='platform',daily_limit=? WHERE id=?", budget, account.account_id);
      this.entry(account.account_id, null, 'platform_seed', budget, 0, 'initial-platform-budget');
      return { ...account, available_minor: budget, role: 'platform' };
    });
  }
  qualifyWorker(workerId, evidence) {
    return this.tx(() => {
      const w = this.one('SELECT * FROM workers WHERE id=?', workerId);
      requireThat(w && !w.qualified, 'invalid_worker', 'Worker not found or already qualified.');
      requireThat(evidence.model === w.model, 'model_mismatch', 'Evidence model must match declared model.');
      requireThat(!this.one('SELECT id FROM trial_runs WHERE worker=?', workerId), 'use_trial_graduation', 'Use reviewed automatic trial graduation.');
      const trial = integer(evidence.trial_reference_minor, 'trial_reference_minor', 1975, 2000);
      const ref = string(evidence.evidence_ref, 'evidence_ref', 500);
      requireThat(!this.one('SELECT reference FROM receipts WHERE reference=?', ref), 'duplicate_evidence', 'Evidence has already been used.');
      this.run('INSERT INTO receipts(reference,worker) VALUES(?,?)', ref, workerId);
      this.run('UPDATE workers SET qualified=1,trial_minor=?,evidence_ref=? WHERE id=?', trial, ref, workerId);
      return { worker_id: workerId, status: 'operator_approved', trial_income_minor: 0 };
    });
  }
  reviewTask(taskId, evidence) {
    return this.tx(() => {
      const t = this.one("SELECT * FROM tasks WHERE id=? AND state='submitted'", taskId);
      requireThat(t && !t.evidence_ref, 'invalid_task', 'Submitted task awaiting review required.');
      requireThat(evidence.model === t.model, 'model_mismatch', 'Evidence model must match ordered model.');
      requireThat(evidence.result_sha256 === hash(t.result), 'result_mismatch', 'Evidence must bind the submitted result.');
      const ref = string(evidence.evidence_ref, 'evidence_ref', 500);
      const tokens = integer(evidence.verified_tokens, 'verified_tokens', 1, 1_000_000_000);
      requireThat(!this.one('SELECT reference FROM receipts WHERE reference=?', ref), 'duplicate_evidence', 'Evidence has already been used.');
      this.run('INSERT INTO receipts(reference,task,worker) VALUES(?,?,?)', ref, taskId, t.worker);
      this.run('UPDATE tasks SET evidence_ref=?,verified_tokens=? WHERE id=?', ref, tokens, taskId);
      return { task_id: taskId, status: 'operator_reviewed' };
    });
  }
  suspend(workerId) {
    return this.tx(() => {
      requireThat(this.one('SELECT id FROM workers WHERE id=?', workerId), 'not_found', 'Worker not found.', 404);
      this.run('UPDATE workers SET suspended=1 WHERE id=?', workerId);
      this.run("UPDATE trial_runs SET state='revoked',epoch=epoch+1,lease_until=NULL WHERE worker=? AND state='running'", workerId);
      for (const t of this.all("SELECT * FROM tasks WHERE worker=? AND state='running'", workerId)) this.release(t, 'security_stopped');
      return { worker_id: workerId, suspended: true };
    });
  }
  resolveDispute(taskId, decision, reference) {
    return this.tx(() => {
      string(reference, 'decision_reference', 500);
      const t = this.one("SELECT * FROM tasks WHERE id=? AND state='submitted'", taskId);
      requireThat(t, 'invalid_state', 'Only submitted work may enter dispute resolution.');
      requireThat(decision === 'refund', 'invalid_decision', 'Only a documented refund is supported; payment requires customer acceptance.', 400);
      this.entry(t.owner, t.id, 'dispute_refund', t.amount, -t.amount, reference);
      this.run("UPDATE tasks SET state='refunded',epoch=epoch+1 WHERE id=?", taskId);
      return { task_id: taskId, state: 'refunded', reference };
    });
  }
  limits(accountId, daily, concurrency) {
    return this.tx(() => {
      const a = this.wallet(accountId);
      requireThat(a.id, 'not_found', 'Account not found.', 404);
      integer(daily, 'daily_limit_minor'); integer(concurrency, 'concurrency', 1, 20);
      requireThat(daily >= a.reserved_daily + a.spent_24h, 'budget_in_use', 'New limit is below committed daily usage.');
      this.run('UPDATE accounts SET daily_limit=?,concurrency=? WHERE id=?', daily, concurrency, accountId);
      return this.wallet(accountId);
    });
  }
}
