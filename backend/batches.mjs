import { randomUUID } from 'node:crypto';
import { DAY, Fault, integer, string } from './store.mjs';

const need = (ok, code, message = code, status = 409) => {
  if (!ok) throw new Fault(status, code, message);
};

export class Batches {
  constructor(store) {
    this.s = store;
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS task_batches (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL REFERENCES accounts(id),
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        model TEXT NOT NULL,
        system_prompt TEXT,
        judge_mode TEXT NOT NULL DEFAULT 'consumer_ai',
        judge_rubric TEXT,
        expected_minutes INTEGER NOT NULL DEFAULT 30,
        min_trust_tier TEXT NOT NULL DEFAULT 'probation',
        min_payout_percent INTEGER NOT NULL DEFAULT 100,
        unit_amount INTEGER NOT NULL CHECK(unit_amount > 0),
        total_items INTEGER NOT NULL CHECK(total_items >= 1 AND total_items <= 100),
        sample_size INTEGER NOT NULL CHECK(sample_size >= 1 AND sample_size <= 20),
        retry_used INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'sampling',
        created_at INTEGER NOT NULL,
        released_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS task_batch_items (
        batch TEXT NOT NULL REFERENCES task_batches(id),
        idx INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        deadline INTEGER NOT NULL,
        workspace_required INTEGER NOT NULL DEFAULT 0,
        task_id TEXT REFERENCES tasks(id),
        retried INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'held_for_sample',
        PRIMARY KEY(batch, idx)
      );
      CREATE TABLE IF NOT EXISTS task_workspaces (
        task TEXT PRIMARY KEY REFERENCES tasks(id),
        required INTEGER NOT NULL,
        seal_id TEXT
      );
    `);
  }

  create(owner, body = {}) {
    return this.s.tx(() => {
      const ownerAcct = this.s.one('SELECT banned FROM accounts WHERE id=?', owner);
      need(ownerAcct && !ownerAcct.banned, 'account_banned', 'Banned accounts cannot create batches.', 403);
      const title = string(body.title, 'title', 160);
      const model = string(body.model, 'model');
      need(this.s.models.includes(model), 'model_not_allowed', 'Choose an allowed model.', 400);
      const unitAmount = integer(body.unit_amount_minor, 'unit_amount_minor', 1, 1_000_000);
      need(Array.isArray(body.items) && body.items.length >= 1 && body.items.length <= 100,
        'invalid_items', 'Batch items must be an array of 1 to 100 subtask specifications.', 400);

      const sampleSize = body.sample_size === undefined
        ? Math.min(2, body.items.length)
        : integer(body.sample_size, 'sample_size', 1, Math.min(20, body.items.length));

      if (body.deadline !== undefined) {
        need(typeof body.deadline === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.deadline),
          'invalid_deadline', 'Use an ISO 8601 timestamp with a timezone.', 400);
      }
      const deadline = body.deadline === undefined ? this.s.now() + 3 * DAY : Date.parse(body.deadline);
      need(Number.isFinite(deadline) && deadline > this.s.now() && deadline <= this.s.now() + 30 * DAY,
        'invalid_deadline', 'Deadline must be in the next 30 days.', 400);

      const meta = this.s.market.validateTaskMetadata({
        ...body,
        judge_mode: body.judge_mode === undefined ? 'consumer_ai' : body.judge_mode,
      });

      const normalizedItems = body.items.map((raw, idx) => {
        need(raw && typeof raw === 'object' && !Array.isArray(raw), 'invalid_items', `Item ${idx} must be an object.`, 400);
        return {
          idx,
          title: string(raw.title, `items[${idx}].title`, 160),
          description: string(raw.description, `items[${idx}].description`, 20_000),
          workspace_required: Boolean(raw.workspace_required ?? body.workspace_required ?? false),
        };
      });

      const totalBudget = unitAmount * normalizedItems.length;
      const wallet = this.s.wallet(owner);
      need(wallet.available >= totalBudget, 'insufficient_balance', 'Available balance must cover the full batch budget before starting samples.', 402);
      need(wallet.can_hire, 'work_threshold_required', `Complete ${wallet.required_minutes} accepted minutes of non-system work before spending earnings.`, 409);
      need(unitAmount <= wallet.daily_limit, 'milestone_too_large', 'Each subtask unit_amount_minor must fit within the account daily_limit.', 400);

      const batchId = `batch_${randomUUID()}`;
      const now = this.s.now();
      const initialState = sampleSize >= normalizedItems.length ? 'active' : 'sampling';
      this.s.run(
        `INSERT INTO task_batches(
          id,owner,title,category,skill_id,model,system_prompt,judge_mode,judge_rubric,
          expected_minutes,min_trust_tier,min_payout_percent,unit_amount,total_items,sample_size,
          state,created_at,released_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        batchId, owner, title, meta.category, meta.skill_id, model, meta.system_prompt,
        meta.judge_mode, meta.judge_rubric, meta.expected_minutes, meta.min_trust_tier,
        meta.min_payout_percent, unitAmount, normalizedItems.length, sampleSize,
        initialState, now, initialState === 'active' ? now : null,
      );

      for (const item of normalizedItems) {
        if (item.idx < sampleSize) {
          const created = this.#spawnSubtask(owner, batchId, meta, model, unitAmount, deadline, item);
          this.s.run(
            'INSERT INTO task_batch_items(batch,idx,title,description,deadline,workspace_required,task_id,state) VALUES(?,?,?,?,?,?,?,?)',
            batchId, item.idx, item.title, item.description, deadline, item.workspace_required ? 1 : 0, created.id, 'dispatched',
          );
        } else {
          this.s.run(
            'INSERT INTO task_batch_items(batch,idx,title,description,deadline,workspace_required,task_id,state) VALUES(?,?,?,?,?,?,NULL,?)',
            batchId, item.idx, item.title, item.description, deadline, item.workspace_required ? 1 : 0, 'held_for_sample',
          );
        }
      }
      return this.get(owner, batchId);
    });
  }

  #spawnSubtask(owner, batchId, meta, model, unitAmount, deadline, item) {
    const deadlineIso = new Date(Math.max(this.s.now() + 60_000, deadline)).toISOString();
    const task = this.s.createTask(owner, {
      title: item.title,
      description: item.description,
      model,
      amount_minor: unitAmount,
      deadline: deadlineIso,
      category: meta.category,
      skill_id: meta.skill_id,
      ...(meta.system_prompt ? { system_prompt: meta.system_prompt } : {}),
      expected_minutes: meta.expected_minutes,
      min_trust_tier: meta.min_trust_tier,
      judge_mode: meta.judge_mode,
      ...(meta.judge_rubric ? { judge_rubric: meta.judge_rubric } : {}),
      min_payout_percent: meta.min_payout_percent,
    });
    this.s.run('UPDATE tasks SET batch_id=?, batch_index=? WHERE id=?', batchId, item.idx, task.id);
    this.s.run(
      'INSERT INTO task_workspaces(task,required) VALUES(?,?) ON CONFLICT(task) DO UPDATE SET required=excluded.required',
      task.id, item.workspace_required ? 1 : 0,
    );
    return task;
  }

  release(owner, batchId) {
    return this.s.tx(() => {
      const b = this.#ownedBatch(owner, batchId);
      need(b.state === 'sampling', 'invalid_batch_state', 'Batch is already released or closed.');
      const sampleTasks = this.s.all(
        `SELECT t.state FROM task_batch_items bi JOIN tasks t ON t.id=bi.task_id
         WHERE bi.batch=? AND bi.idx < ?`,
        batchId, b.sample_size,
      );
      need(
        sampleTasks.some((t) => t.state === 'submitted' || t.state === 'completed'),
        'sample_not_verified',
        'At least one sample subtask must be submitted or accepted before releasing the remaining batch.',
      );
      const held = this.s.all("SELECT * FROM task_batch_items WHERE batch=? AND state='held_for_sample' ORDER BY idx ASC", batchId);
      const neededBudget = held.length * b.unit_amount;
      const wallet = this.s.wallet(owner);
      need(wallet.available >= neededBudget, 'insufficient_balance', 'Insufficient available balance to freeze the remaining batch subtasks.', 402);

      for (const item of held) {
        need(item.deadline > this.s.now(), 'expired', 'Batch deadline has already passed.');
        const task = this.#spawnSubtask(owner, batchId, b, b.model, b.unit_amount, item.deadline, {
          idx: item.idx,
          title: item.title,
          description: item.description,
          workspace_required: Boolean(item.workspace_required),
        });
        this.s.run("UPDATE task_batch_items SET task_id=?, state='dispatched' WHERE batch=? AND idx=?", task.id, batchId, item.idx);
      }
      this.s.run("UPDATE task_batches SET state='active', released_at=? WHERE id=?", this.s.now(), batchId);
      return this.get(owner, batchId);
    });
  }

  retryFailed(owner, batchId) {
    return this.s.tx(() => {
      const b = this.#ownedBatch(owner, batchId);
      need(['sampling', 'active'].includes(b.state), 'invalid_batch_state', 'Cancelled batches cannot retry items.');
      const failedItems = this.s.all(
        `SELECT bi.*, t.state AS task_state
         FROM task_batch_items bi
         JOIN tasks t ON t.id = bi.task_id
         WHERE bi.batch=? AND bi.retried=0 AND t.state IN ('failed','expired','refunded')
         ORDER BY bi.idx ASC`,
        batchId,
      );
      need(failedItems.length > 0, 'no_retryable_items', 'No failed/expired subtasks eligible for single-pass recovery.');
      const wallet = this.s.wallet(owner);
      need(wallet.available >= failedItems.length * b.unit_amount, 'insufficient_balance', 'Insufficient balance to re-freeze failed subtasks.', 402);

      for (const item of failedItems) {
        const nextDeadline = Math.max(item.deadline, this.s.now() + DAY);
        const replacement = this.#spawnSubtask(owner, batchId, b, b.model, b.unit_amount, nextDeadline, {
          idx: item.idx,
          title: item.title,
          description: item.description,
          workspace_required: Boolean(item.workspace_required),
        });
        this.s.run(
          'UPDATE task_batch_items SET task_id=?, retried=1, deadline=? WHERE batch=? AND idx=?',
          replacement.id, nextDeadline, batchId, item.idx,
        );
      }
      this.s.run('UPDATE task_batches SET retry_used=retry_used+1 WHERE id=?', batchId);
      return this.get(owner, batchId);
    });
  }

  cancel(owner, batchId) {
    return this.s.tx(() => {
      const b = this.#ownedBatch(owner, batchId);
      need(b.state !== 'cancelled', 'invalid_batch_state', 'Batch is already cancelled.');
      this.s.run("UPDATE task_batch_items SET state='cancelled' WHERE batch=? AND state='held_for_sample'", batchId);
      const activeTasks = this.s.all(
        `SELECT t.* FROM task_batch_items bi JOIN tasks t ON t.id=bi.task_id
         WHERE bi.batch=? AND t.state IN ('queued','running')`,
        batchId,
      );
      for (const t of activeTasks) {
        this.s.release(t, 'cancelled');
      }
      this.s.run("UPDATE task_batches SET state='cancelled' WHERE id=?", batchId);
      return this.get(owner, batchId);
    });
  }

  list(owner) {
    return this.s.all('SELECT id FROM task_batches WHERE owner=? ORDER BY created_at DESC LIMIT 50', owner)
      .map((row) => this.get(owner, row.id));
  }

  get(owner, batchId) {
    const b = this.#ownedBatch(owner, batchId);
    const rows = this.s.all(
      `SELECT bi.idx, bi.title, bi.state AS item_state, bi.retried, bi.task_id,
              t.state AS task_state, t.worker, t.amount, t.payout_percent, t.rating
       FROM task_batch_items bi
       LEFT JOIN tasks t ON t.id = bi.task_id
       WHERE bi.batch=?
       ORDER BY bi.idx ASC`,
      batchId,
    );
    const counts = {
      held_for_sample: 0,
      queued: 0,
      running: 0,
      submitted: 0,
      completed: 0,
      failed_or_expired: 0,
      cancelled: 0,
    };
    for (const r of rows) {
      if (r.item_state === 'held_for_sample') counts.held_for_sample++;
      else if (r.item_state === 'cancelled' && !r.task_id) counts.cancelled++;
      else if (r.task_state === 'queued') counts.queued++;
      else if (r.task_state === 'running') counts.running++;
      else if (r.task_state === 'submitted') counts.submitted++;
      else if (r.task_state === 'completed') counts.completed++;
      else if (r.task_state === 'cancelled') counts.cancelled++;
      else if (['failed', 'expired', 'refunded', 'security_stopped'].includes(r.task_state)) counts.failed_or_expired++;
    }
    const effectiveState = b.state === 'cancelled'
      ? 'cancelled'
      : (counts.completed === b.total_items ? 'completed' : b.state);
    return {
      id: b.id,
      owner: b.owner,
      title: b.title,
      category: b.category,
      skill_id: b.skill_id,
      model: b.model,
      judge_mode: b.judge_mode,
      expected_minutes: b.expected_minutes,
      min_payout_percent: b.min_payout_percent,
      unit_amount_minor: b.unit_amount,
      total_items: b.total_items,
      sample_size: b.sample_size,
      state: effectiveState,
      created_at: b.created_at,
      released_at: b.released_at,
      counts,
      items: rows.map((r) => ({
        index: r.idx,
        title: r.title,
        state: r.task_state || r.item_state,
        task_id: r.task_id,
        worker_id: r.worker || null,
        retried: Boolean(r.retried),
        payout_percent: r.payout_percent ?? null,
        rating: r.rating ?? null,
      })),
    };
  }

  #ownedBatch(owner, batchId) {
    const b = this.s.one('SELECT * FROM task_batches WHERE id=?', batchId);
    need(b && b.owner === owner, 'not_found', 'Batch not found.', 404);
    return b;
  }
}

export function batchOpenapiPaths() {
  const auth = [{ bearerAuth: [] }];
  const idem = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128 } };
  const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
  const ok = { 200: { description: 'Batch state response.', content: { 'application/json': { schema: { type: 'object' } } } }, default: { description: 'Structured failure.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } };
  return {
    '/v1/batches': {
      get: { operationId: 'get_v1_batches', security: auth, parameters: [], responses: ok },
      post: {
        operationId: 'post_v1_batches',
        security: auth,
        parameters: [idem],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'model', 'unit_amount_minor', 'items'],
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 160 },
                  category: { type: 'string', enum: ['art_works', 'mini_games', 'reverse_engineering', 'general_files'] },
                  skill_id: { type: 'string', minLength: 1, maxLength: 120 },
                  model: { type: 'string', minLength: 1, maxLength: 200 },
                  system_prompt: { type: 'string', maxLength: 4000 },
                  judge_mode: { type: 'string', enum: ['human', 'consumer_ai', 'whitelist_spotcheck'] },
                  judge_rubric: { type: 'string', maxLength: 4000 },
                  expected_minutes: { type: 'integer', minimum: 1, maximum: 4320 },
                  min_trust_tier: { type: 'string', enum: ['probation', 'standard', 'trusted'] },
                  min_payout_percent: { type: 'integer', minimum: 50, maximum: 100 },
                  unit_amount_minor: { type: 'integer', minimum: 1, maximum: 1000000 },
                  sample_size: { type: 'integer', minimum: 1, maximum: 20 },
                  deadline: { type: 'string', format: 'date-time' },
                  workspace_required: { type: 'boolean' },
                  items: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 100,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['title', 'description'],
                      properties: {
                        title: { type: 'string', minLength: 1, maxLength: 160 },
                        description: { type: 'string', minLength: 1, maxLength: 20000 },
                        workspace_required: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: ok,
      },
    },
    '/v1/batches/{id}': {
      get: { operationId: 'get_v1_batches_id', security: auth, parameters: [idParam], responses: ok },
    },
    '/v1/batches/{id}/release': {
      post: { operationId: 'post_v1_batches_id_release', security: auth, parameters: [idParam, idem], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties: {} } } } }, responses: ok },
    },
    '/v1/batches/{id}/retry-failed': {
      post: { operationId: 'post_v1_batches_id_retry_failed', security: auth, parameters: [idParam, idem], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties: {} } } } }, responses: ok },
    },
    '/v1/batches/{id}/cancel': {
      post: { operationId: 'post_v1_batches_id_cancel', security: auth, parameters: [idParam, idem], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties: {} } } } }, responses: ok },
    },
  };
}
