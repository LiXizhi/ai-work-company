import { randomUUID } from 'node:crypto';
import { Fault, hash, integer, string } from './store.mjs';

export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export const TASK_CATEGORIES = {
  art_works: {
    id: 'art_works',
    title: 'Three.js Art & Animated Assets',
    judgeability: 'high',
    default_skill: 'threejs-procedural-art',
    description: 'Procedural 2D/3D Three.js scenes, custom GLSL shaders, materials, and animated assets.',
  },
  mini_games: {
    id: 'mini_games',
    title: 'Single-Shot Mini-Games',
    judgeability: 'medium_high',
    default_skill: 'minigame-single-shot',
    description: 'Self-contained playable HTML5, Canvas, or Three.js mini-games built from scratch.',
  },
  reverse_engineering: {
    id: 'reverse_engineering',
    title: 'Reverse Engineering & Clean-Room Specs',
    judgeability: 'high',
    default_skill: 'reverse-cleanroom-spec',
    description: 'Protocol, format, or state-machine analysis with deterministic test-vector verification.',
  },
  general_files: {
    id: 'general_files',
    title: 'Sandboxed File Operations',
    judgeability: 'low_medium',
    default_skill: 'sandbox-file-ops',
    description: 'General workspace file operations, refactoring, and synthesis via POSIX file broker.',
  },
};

export const DEFAULT_SKILLS = [
  {
    id: 'threejs-procedural-art',
    category: 'art_works',
    title: 'Three.js Procedural 3D/2D Art',
    worker_preamble: 'Use Three.js procedural geometry, materials, lighting, and camera composition. Deliverable must be self-contained with zero external network fetches or remote textures.',
    judge_guide: 'Evaluate Three.js scene graph completeness, procedural geometry/material quality, lighting/framing, and verify zero external network calls.',
  },
  {
    id: 'threejs-shader-animation',
    category: 'art_works',
    title: 'Three.js Shader & Keyframe Animation',
    worker_preamble: 'Create animated Three.js scenes or custom GLSL vertex/fragment shaders with deterministic time uniforms and smooth animation loops.',
    judge_guide: 'Evaluate animation loop continuity, GLSL shader validity, visual rubric compliance, and self-contained execution safety.',
  },
  {
    id: 'minigame-single-shot',
    category: 'mini_games',
    title: 'Single-Shot Playable Mini-Game',
    worker_preamble: 'Build a complete single-shot mini-game with start/play/game-over state, deterministic controls, and score tracking.',
    judge_guide: 'Evaluate playable loop completeness, input handling, win/loss states, and absence of runtime or network violations.',
  },
  {
    id: 'threejs-arcade-game',
    category: 'mini_games',
    title: 'Three.js 3D Arcade Mini-Game',
    worker_preamble: 'Build a self-contained 3D Three.js arcade mini-game with collision logic, HUD score, and responsive controls.',
    judge_guide: 'Evaluate 3D gameplay loop, collision/scoring accuracy, and self-contained script safety.',
  },
  {
    id: 'reverse-cleanroom-spec',
    category: 'reverse_engineering',
    title: 'Clean-Room Reverse Engineering & Spec',
    worker_preamble: 'Analyze authorized input artifacts in input/ and produce a clean-room specification plus deterministic verification vectors in output/.',
    judge_guide: 'Verify protocol/logic reconstruction accuracy, edge cases, and test-vector reproduction.',
  },
  {
    id: 'sandbox-file-ops',
    category: 'general_files',
    title: 'Sandboxed Workspace File Operations',
    worker_preamble: 'Operate strictly within the awc POSIX file workspace (input/, work/, output/) and seal deliverables with artifacts_seal.',
    judge_guide: 'Inspect file diffs, tool call trace, and apply whitelist spot-checking or human review.',
  },
];

export const TRUST_TIERS = {
  unqualified: { tier: 'unqualified', rank: 0, max_expected_minutes: 0, label: 'Unqualified (Trial)' },
  probation: { tier: 'probation', rank: 1, max_expected_minutes: 60, label: 'Probation (<= 60m)' },
  standard: { tier: 'standard', rank: 2, max_expected_minutes: 240, label: 'Standard (<= 240m)' },
  trusted: { tier: 'trusted', rank: 3, max_expected_minutes: 4320, label: 'Trusted (<= 72h)' },
};

const PROMPT_THREAT_RULES = [
  { code: 'host_credential_access', pattern: /(?:\/etc\/passwd|\/etc\/shadow|~\/\.ssh|\.ssh\/id_|CODEX_HOME|AWC_TOKEN|AWC_ADMIN_TOKEN|process\.env|os\.environ)/i, message: 'Prompt attempts to read host credentials or sensitive environment variables.' },
  { code: 'host_shell_escape', pattern: /(?:child_process|\/bin\/sh|\/bin\/bash|\bbash\s+-c\b|\bsh\s+-c\b|\bpowershell\b|\bcmd\.exe\b|os\.system\s*\(|subprocess\.Popen)/i, message: 'Prompt attempts to invoke host shell or spawn OS processes.' },
  { code: 'network_exfiltration', pattern: /(?:\bcurl\s+https?:\/\/|\bwget\s+https?:\/\/|\bnc\s+-e\b|\bInvoke-WebRequest\b)/i, message: 'Prompt instructs unauthorized outbound network exfiltration.' },
  { code: 'sandbox_override', pattern: /(?:ignore-user-config|bypass\s+sandbox|escape\s+sandbox|disable\s+mcp|ignore\s+all\s+safety\s+boundaries)/i, message: 'Prompt attempts to disable or escape the Worker sandbox.' },
];

const DELIVERABLE_THREAT_RULES = [
  { code: 'judge_prompt_injection', pattern: /(?:ignore\s+(?:all\s+)?previous\s+instructions|disregard\s+(?:the\s+)?judg(?:e|ing)\s+rubric|system\s+override\s*:\s*pay\s+100|override_judge_payout)/i, message: 'Deliverable contains prompt injection targeting the Consumer AI Judger.' },
  { code: 'external_network_call', pattern: /(?:\bfetch\s*\(\s*['"`]https?:\/\/|\bnew\s+XMLHttpRequest\b|\bnew\s+WebSocket\s*\(|\bnavigator\.sendBeacon\s*\(|<script[^>]+src\s*=\s*['"]https?:\/\/)/i, message: 'Deliverable contains unauthorized external network calls.' },
  { code: 'dynamic_code_or_host_api', pattern: /(?:\beval\s*\(|\bnew\s+Function\s*\(|\brequire\s*\(\s*['"](?:fs|child_process|net|http|https)['"]\s*\)|\bprocess\.env\b)/i, message: 'Deliverable contains unsafe dynamic code evaluation or host API access.' },
];

export function verifyConsumerPrompt({ category = 'general_files', skill_id = '', system_prompt = '', description = '', judge_rubric = '' } = {}) {
  const combined = `${system_prompt || ''}\n${description || ''}\n${judge_rubric || ''}`;
  const reasons = [];
  const flags = [];
  if (!(category in TASK_CATEGORIES)) {
    reasons.push('unknown_category');
    flags.push('unknown_category');
  }
  for (const rule of PROMPT_THREAT_RULES) {
    if (rule.pattern.test(combined)) {
      reasons.push(`${rule.code}: ${rule.message}`);
      flags.push(rule.code);
    }
  }
  return {
    safe: reasons.length === 0,
    reasons,
    flags,
    category,
    skill_id: skill_id || TASK_CATEGORIES[category]?.default_skill || 'sandbox-file-ops',
    verification_hash: hash(JSON.stringify({ category, skill_id, system_prompt, description })),
  };
}

export function verifyWorkerDeliverable(arg1 = {}, arg2 = '') {
  const opts = typeof arg1 === 'string' ? { category: arg1, result: arg2 } : (arg1 || {});
  const { category = 'general_files', skill_id = '', result = '' } = opts;
  const text = String(result || '');
  const reasons = [];
  const flags = [];
  for (const rule of DELIVERABLE_THREAT_RULES) {
    if (rule.pattern.test(text)) {
      reasons.push(`${rule.code}: ${rule.message}`);
      flags.push(rule.code);
    }
  }
  return {
    safe: reasons.length === 0,
    reasons,
    flags,
    category,
    skill_id,
    digest: hash(text),
  };
}

export function workerTrustTier(worker) {
  if (!worker || !worker.qualified || worker.suspended) return TRUST_TIERS.unqualified;
  const completed = Number(worker.completed_count || 0);
  const avgRating = worker.rating_count > 0 ? worker.rating_sum / worker.rating_count : 5;
  const strikes = Number(worker.strikes || 0);
  if (strikes === 0 && completed >= 10 && avgRating >= 4.5) return TRUST_TIERS.trusted;
  if (strikes === 0 && completed >= 3 && avgRating >= 4.0) return TRUST_TIERS.standard;
  return TRUST_TIERS.probation;
}

const need = (ok, code, message = code, status = 409) => {
  if (!ok) throw new Fault(status, code, message);
};

export class Market {
  constructor(store) {
    this.s = store;
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_catalog (
        id TEXT PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL,
        worker_preamble TEXT NOT NULL, judge_guide TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS worker_category_stats (
        worker TEXT NOT NULL REFERENCES workers(id), category TEXT NOT NULL,
        completed_count INTEGER NOT NULL DEFAULT 0, rating_sum INTEGER NOT NULL DEFAULT 0,
        payout_pct_sum INTEGER NOT NULL DEFAULT 0, verified_tokens INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(worker, category)
      );
      CREATE TABLE IF NOT EXISTS consumer_category_stats (
        account TEXT NOT NULL REFERENCES accounts(id), category TEXT NOT NULL,
        tasks_created INTEGER NOT NULL DEFAULT 0, tasks_settled INTEGER NOT NULL DEFAULT 0,
        total_spent_minor INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(account, category)
      );
      CREATE TABLE IF NOT EXISTS consumer_whitelist (
        consumer TEXT NOT NULL REFERENCES accounts(id), worker TEXT NOT NULL REFERENCES workers(id),
        category TEXT NOT NULL, spotcheck_percent INTEGER NOT NULL DEFAULT 20,
        created_at INTEGER NOT NULL, PRIMARY KEY(consumer, worker, category)
      );
      CREATE TABLE IF NOT EXISTS ban_log (
        id TEXT PRIMARY KEY, account TEXT REFERENCES accounts(id), worker TEXT REFERENCES workers(id),
        reason TEXT NOT NULL, evidence_ref TEXT NOT NULL UNIQUE, at INTEGER NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS ban_log_no_update BEFORE UPDATE ON ban_log BEGIN SELECT RAISE(ABORT,'append-only ban_log'); END;
      CREATE TRIGGER IF NOT EXISTS ban_log_no_delete BEFORE DELETE ON ban_log BEGIN SELECT RAISE(ABORT,'append-only ban_log'); END;
    `);
    for (const skill of DEFAULT_SKILLS) {
      store.run(
        'INSERT OR IGNORE INTO skill_catalog(id,category,title,worker_preamble,judge_guide,enabled) VALUES(?,?,?,?,?,1)',
        skill.id, skill.category, skill.title, skill.worker_preamble, skill.judge_guide,
      );
    }
  }

  skills(category) {
    if (category) {
      need(category in TASK_CATEGORIES, 'invalid_category', 'Unknown task category.', 400);
      return this.s.all('SELECT * FROM skill_catalog WHERE enabled=1 AND category=? ORDER BY id', category);
    }
    return this.s.all('SELECT * FROM skill_catalog WHERE enabled=1 ORDER BY category, id');
  }

  skill(skillId) {
    return this.s.one('SELECT * FROM skill_catalog WHERE id=? AND enabled=1', skillId);
  }

  validateTaskMetadata(body) {
    const category = body.category === undefined ? 'general_files' : string(body.category, 'category', 64);
    need(category in TASK_CATEGORIES, 'invalid_category', 'Task category must be one of art_works, mini_games, reverse_engineering, general_files.', 400);
    const defaultSkill = TASK_CATEGORIES[category].default_skill;
    const skill_id = body.skill_id === undefined ? defaultSkill : string(body.skill_id, 'skill_id', 120);
    const skillRow = this.skill(skill_id);
    need(skillRow && skillRow.category === category, 'invalid_skill', 'Skill does not match the selected category.', 400);
    const system_prompt = body.system_prompt === undefined || body.system_prompt === '' ? null : string(body.system_prompt, 'system_prompt', 4000);
    const expected_minutes = body.expected_minutes === undefined ? 30 : integer(body.expected_minutes, 'expected_minutes', 1, 4320);
    const min_trust_tier = body.min_trust_tier === undefined ? 'probation' : string(body.min_trust_tier, 'min_trust_tier', 32);
    need(['probation', 'standard', 'trusted'].includes(min_trust_tier), 'invalid_trust_tier', 'min_trust_tier must be probation, standard, or trusted.', 400);
    const rawJudgeMode = body.judge_mode !== undefined ? body.judge_mode : body.judger_mode;
    const judge_mode = rawJudgeMode === undefined ? 'human' : string(rawJudgeMode, 'judge_mode', 32);
    need(['human', 'consumer_ai', 'whitelist_spotcheck'].includes(judge_mode), 'invalid_judge_mode', 'judge_mode must be human, consumer_ai, or whitelist_spotcheck.', 400);
    const judge_rubric = body.judge_rubric === undefined || body.judge_rubric === '' ? null : string(body.judge_rubric, 'judge_rubric', 4000);
    const min_payout_percent = body.min_payout_percent === undefined ? 100 : integer(body.min_payout_percent, 'min_payout_percent', 50, 100);
    return { category, skill_id, system_prompt, expected_minutes, min_trust_tier, judge_mode, judge_rubric, min_payout_percent };
  }

  recordTaskCreated(owner, category) {
    this.s.run(
      'INSERT INTO consumer_category_stats(account,category,tasks_created,tasks_settled,total_spent_minor) VALUES(?,?,1,0,0) ON CONFLICT(account,category) DO UPDATE SET tasks_created=tasks_created+1',
      owner, category,
    );
    const top = this.s.one('SELECT category FROM consumer_category_stats WHERE account=? ORDER BY tasks_created DESC, rowid ASC LIMIT 1', owner);
    if (top) this.s.run('UPDATE accounts SET primary_category=?, last_seen_at=? WHERE id=?', top.category, this.s.now(), owner);
  }

  checkClaimEligibility(worker, task) {
    const tier = workerTrustTier(worker);
    const requiredTier = TRUST_TIERS[task.min_trust_tier || 'probation'] || TRUST_TIERS.probation;
    need(tier.rank >= requiredTier.rank, 'trust_tier_insufficient', `Task requires at least ${requiredTier.tier} worker tier.`);
    const expected = Number(task.expected_minutes || 30);
    need(expected <= tier.max_expected_minutes, 'complexity_exceeds_trust_tier', `Worker trust tier (${tier.tier}) allows up to ${tier.max_expected_minutes} expected minutes, but task requires ${expected} minutes.`);
  }

  computeSubmissionTelemetry(task, resultText) {
    const now = this.s.now();
    const flags = [];
    const elapsedMs = task.claimed_at ? Math.max(0, now - task.claimed_at) : 0;
    const expectedMs = Number(task.expected_minutes || 30) * 60_000;
    if (Number(task.expected_minutes || 30) >= 60 && elapsedMs > 0 && elapsedMs < expectedMs * 0.02) {
      flags.push('duration_too_fast');
    }
    const hasRelay = this.s.one("SELECT name FROM sqlite_master WHERE type='table' AND name='task_workspaces'");
    const workspace = hasRelay ? this.s.one('SELECT required FROM task_workspaces WHERE task=?', task.id) : null;
    const toolCalls = hasRelay ? (this.s.one('SELECT COUNT(*) AS n FROM tool_calls WHERE task=? AND epoch=?', task.id, task.epoch)?.n || 0) : 0;
    if (workspace?.required && toolCalls < 2) {
      flags.push('missing_tool_chain');
    }
    const deliverableCheck = verifyWorkerDeliverable({ category: task.category, skill_id: task.skill_id, result: resultText });
    if (!deliverableCheck.safe) {
      flags.push('unsafe_deliverable');
    }
    return {
      elapsed_ms: elapsedMs,
      expected_minutes: task.expected_minutes || 30,
      tool_calls: toolCalls,
      deliverable_safe: deliverableCheck.safe,
      deliverable_reasons: deliverableCheck.reasons,
      flags,
    };
  }

  evaluateWhitelistOnSubmit(task) {
    const wl = this.s.one(
      'SELECT * FROM consumer_whitelist WHERE consumer=? AND worker=? AND category=?',
      task.owner, task.worker, task.category || 'general_files',
    );
    if (!wl) return { whitelisted: false, auto_approved: false };
    const sampleVal = parseInt(hash(`${task.id}:${task.epoch}:${wl.created_at}`).slice(0, 8), 16) % 100;
    const spotcheckNeeded = sampleVal < wl.spotcheck_percent;
    if (!spotcheckNeeded) {
      const verdict = {
        mode: 'whitelist_auto_pass',
        payout_percent: 100,
        rating: 5,
        reason: 'Auto-approved via Consumer trusted Worker whitelist (not selected for random spot-check).',
        spotcheck_percent: wl.spotcheck_percent,
        at: this.s.now(),
      };
      const autoRef = `whitelist:${task.id}:${task.epoch}`;
      this.s.run('UPDATE tasks SET payout_percent=100, judge_verdict=?, evidence_ref=COALESCE(evidence_ref,?) WHERE id=?', JSON.stringify(verdict), autoRef, task.id);
      return { whitelisted: true, auto_approved: true, verdict };
    }
    return { whitelisted: true, auto_approved: false, spotcheck_selected: true, spotcheck_percent: wl.spotcheck_percent };
  }

  presence(accountId, body = {}) {
    return this.s.tx(() => {
      const now = this.s.now();
      if (body.category !== undefined) {
        const category = string(body.category, 'category', 64);
        need(category in TASK_CATEGORIES, 'invalid_category', 'Unknown category.', 400);
        this.s.run('UPDATE accounts SET primary_category=?, last_seen_at=? WHERE id=?', category, now, accountId);
      } else {
        this.s.run('UPDATE accounts SET last_seen_at=? WHERE id=?', now, accountId);
      }
      if (body.worker_id !== undefined) {
        const w = this.s.worker(accountId, body.worker_id);
        this.s.run('UPDATE workers SET last_seen_at=? WHERE id=?', now, w.id);
      }
      return { account_id: accountId, online_until: now + ONLINE_WINDOW_MS };
    });
  }

  setWhitelist(owner, body) {
    const workerId = string(body.worker_id, 'worker_id', 120);
    const categories = Array.isArray(body.categories) && body.categories.length > 0
      ? body.categories.map((c) => string(c, 'category', 64))
      : [body.category === undefined ? 'general_files' : string(body.category, 'category', 64)];
    for (const category of categories) {
      need(category in TASK_CATEGORIES, 'invalid_category', 'Invalid task category.', 400);
    }
    const spotcheck = body.spotcheck_percent === undefined ? 20 : integer(body.spotcheck_percent, 'spotcheck_percent', 0, 100);
    const w = this.s.one('SELECT * FROM workers WHERE id=?', workerId);
    need(w && w.owner !== owner, 'invalid_worker', 'Worker not found or owned by same account.', 400);
    for (const category of categories) {
      this.s.run(
        'INSERT INTO consumer_whitelist(consumer,worker,category,spotcheck_percent,created_at) VALUES(?,?,?,?,?) ON CONFLICT(consumer,worker,category) DO UPDATE SET spotcheck_percent=excluded.spotcheck_percent',
        owner, workerId, category, spotcheck, this.s.now(),
      );
    }
    return { consumer: owner, worker_id: workerId, category: categories[0], categories, spotcheck_percent: spotcheck };
  }

  listWhitelist(owner) {
    return this.s.all('SELECT * FROM consumer_whitelist WHERE consumer=? ORDER BY created_at DESC', owner);
  }

  abortUnsafeTask(workerOwner, taskId, body) {
    const t = this.s.leasedTask(workerOwner, taskId, body.epoch);
    const reason = string(body.reason, 'reason', 1000);
    const check = verifyConsumerPrompt({
      category: t.category,
      skill_id: t.skill_id,
      system_prompt: t.system_prompt || '',
      description: t.description || '',
      judge_rubric: t.judge_rubric || '',
    });
    // Release the Consumer's reserved budget and stop the task without penalizing the Worker.
    this.s.release(t, 'security_stopped');
    this.s.run('UPDATE tasks SET attempts=MAX(0,attempts-1), judge_verdict=? WHERE id=?', JSON.stringify({
      aborted_by_worker: t.worker,
      reason,
      local_safety_reasons: check.reasons,
      at: this.s.now(),
    }), taskId);
    this.s.run('UPDATE accounts SET consumer_strikes=consumer_strikes+1 WHERE id=?', t.owner);
    const consumerAcct = this.s.one('SELECT * FROM accounts WHERE id=?', t.owner);
    if (consumerAcct.consumer_strikes >= 3 && !consumerAcct.banned) {
      this.banAccount(t.owner, {
        reason: `Auto-banned after ${consumerAcct.consumer_strikes} Worker-reported unsafe system prompts (${reason})`,
        evidence_ref: `auto-ban:unsafe-prompt:${taskId}:${t.epoch}`,
      });
    }
    return {
      task_id: taskId,
      state: 'security_stopped',
      worker_penalized: false,
      consumer_strikes: consumerAcct.consumer_strikes,
    };
  }

  judgeTask(owner, taskId, body) {
    const t = this.s.task(owner, taskId);
    need(t.owner === owner, 'forbidden', 'Only the Consumer may judge this task.', 403);
    need(t.state === 'submitted', 'invalid_state', 'Only submitted work can be judged.');
    const payout_percent = integer(body.payout_percent, 'payout_percent', 0, 100);
    const rating = integer(body.rating, 'rating', 1, 5);
    const reason = body.reason === undefined ? 'Judged by Consumer AI' : string(body.reason, 'reason', 2000);
    const recommend_whitelist = Boolean(body.recommend_whitelist);
    const suspect_model_spoofing = Boolean(body.suspect_model_spoofing);
    const unsafe_deliverable = Boolean(body.unsafe_deliverable);

    if (payout_percent > 0) {
      need(
        payout_percent >= (t.min_payout_percent || 100),
        'payout_below_minimum_floor',
        `payout_percent must be at least the task min_payout_percent (${t.min_payout_percent || 100}%) or 0 for dispute/fraud rejection.`,
        400,
      );
    }

    const deliverableCheck = verifyWorkerDeliverable({ category: t.category, skill_id: t.skill_id, result: t.result || '' });
    const existingFlags = t.telemetry_flags ? JSON.parse(t.telemetry_flags) : { flags: [] };
    const flagSet = new Set(existingFlags.flags || []);
    if (suspect_model_spoofing) flagSet.add('suspect_model_spoofing');
    if (unsafe_deliverable || !deliverableCheck.safe) flagSet.add('unsafe_deliverable');
    existingFlags.flags = [...flagSet];

    const verdict = {
      mode: 'consumer_ai_judger',
      payout_percent,
      rating,
      reason,
      recommend_whitelist,
      suspect_model_spoofing,
      unsafe_deliverable: unsafe_deliverable || !deliverableCheck.safe,
      deliverable_reasons: deliverableCheck.reasons,
      at: this.s.now(),
    };

    this.s.run(
      'UPDATE tasks SET payout_percent=?, judge_verdict=?, telemetry_flags=? WHERE id=?',
      payout_percent, JSON.stringify(verdict), JSON.stringify(existingFlags), taskId,
    );

    if (suspect_model_spoofing || unsafe_deliverable || !deliverableCheck.safe) {
      this.s.run('UPDATE workers SET strikes=strikes+1 WHERE id=?', t.worker);
    } else if (recommend_whitelist && payout_percent >= 90 && rating >= 4) {
      this.setWhitelist(owner, { worker_id: t.worker, category: t.category || 'general_files', spotcheck_percent: 20 });
    }

    return {
      task_id: taskId,
      payout_percent,
      rating,
      verdict,
      telemetry_flags: existingFlags.flags,
    };
  }

  rateConsumer(workerOwner, taskId, body) {
    const t = this.s.task(workerOwner, taskId);
    const w = t.worker ? this.s.one('SELECT * FROM workers WHERE id=?', t.worker) : null;
    need(w && w.owner === workerOwner, 'forbidden', 'Only the assigned Worker owner may rate the Consumer.', 403);
    need(t.state === 'completed', 'invalid_state', 'Consumer can only be rated after task completion.');
    need(!t.consumer_rating, 'already_rated', 'Consumer was already rated for this task.');
    const rating = integer(body.rating, 'rating', 1, 5);
    this.s.run('UPDATE tasks SET consumer_rating=? WHERE id=?', rating, taskId);
    this.s.run('UPDATE accounts SET consumer_rating_sum=consumer_rating_sum+?, consumer_rating_count=consumer_rating_count+1 WHERE id=?', rating, t.owner);
    return { task_id: taskId, consumer_rating: rating };
  }

  banWorker(workerId, optsOrReason) {
    const opts = typeof optsOrReason === 'string'
      ? { reason: optsOrReason, evidence_ref: `ban:worker:${workerId}:${randomUUID()}` }
      : (optsOrReason || {});
    return this.s.tx(() => {
      const w = this.s.one('SELECT * FROM workers WHERE id=?', workerId);
      need(w, 'not_found', 'Worker not found.', 404);
      const cleanReason = string(opts.reason, 'reason', 500);
      const ref = string(opts.evidence_ref || `ban:worker:${workerId}:${randomUUID()}`, 'evidence_ref', 500);
      need(!this.s.one('SELECT id FROM ban_log WHERE evidence_ref=?', ref), 'duplicate_evidence', 'Ban evidence reference already used.');
      this.s.suspend(workerId);
      this.s.run('UPDATE workers SET strikes=strikes+1, ban_reason=? WHERE id=?', cleanReason, workerId);
      // Refund any unpaid submitted tasks from this banned worker so fake/downgraded work is never paid.
      const submitted = this.s.all("SELECT * FROM tasks WHERE worker=? AND state='submitted'", workerId);
      for (const t of submitted) {
        this.s.entry(t.owner, t.id, 'fraud_refund', t.amount, -t.amount, `${ref}:${t.id}`);
        this.s.run("UPDATE tasks SET state='refunded', epoch=epoch+1 WHERE id=?", t.id);
      }
      const banId = `ban_${randomUUID()}`;
      this.s.run('INSERT INTO ban_log(id,account,worker,reason,evidence_ref,at) VALUES(?,?,?,?,?,?)', banId, w.owner, workerId, cleanReason, ref, this.s.now());
      return { ban_id: banId, worker_id: workerId, account_id: w.owner, banned: 1, suspended: true, refunded_tasks: submitted.length };
    });
  }

  banAccount(accountId, optsOrReason) {
    const opts = typeof optsOrReason === 'string'
      ? { reason: optsOrReason, evidence_ref: `ban:account:${accountId}:${randomUUID()}` }
      : (optsOrReason || {});
    return this.s.tx(() => {
      const acct = this.s.one('SELECT * FROM accounts WHERE id=?', accountId);
      need(acct, 'not_found', 'Account not found.', 404);
      const cleanReason = string(opts.reason, 'reason', 500);
      const ref = string(opts.evidence_ref || `ban:account:${accountId}:${randomUUID()}`, 'evidence_ref', 500);
      need(!this.s.one('SELECT id FROM ban_log WHERE evidence_ref=?', ref), 'duplicate_evidence', 'Ban evidence reference already used.');
      this.s.run('UPDATE accounts SET banned=1, ban_reason=? WHERE id=?', cleanReason, accountId);
      const workers = this.s.all('SELECT * FROM workers WHERE owner=?', accountId);
      let refundedTasks = 0;
      for (const w of workers) {
        this.s.suspend(w.id);
        this.s.run('UPDATE workers SET strikes=strikes+1, ban_reason=? WHERE id=?', cleanReason, w.id);
        const submitted = this.s.all("SELECT * FROM tasks WHERE worker=? AND state='submitted'", w.id);
        for (const t of submitted) {
          this.s.entry(t.owner, t.id, 'fraud_refund', t.amount, -t.amount, `${ref}:${t.id}`);
          this.s.run("UPDATE tasks SET state='refunded', epoch=epoch+1 WHERE id=?", t.id);
          refundedTasks++;
        }
      }
      // Also cancel any queued/running tasks owned by this banned account
      const ownedActive = this.s.all("SELECT * FROM tasks WHERE owner=? AND state IN ('queued','running')", accountId);
      for (const t of ownedActive) {
        this.s.release(t, 'cancelled');
      }
      const banId = `ban_${randomUUID()}`;
      this.s.run('INSERT INTO ban_log(id,account,worker,reason,evidence_ref,at) VALUES(?,?,?,?,?,?)', banId, accountId, null, cleanReason, ref, this.s.now());
      return { ban_id: banId, account_id: accountId, banned: true, workers_suspended: workers.length, refunded_tasks: refundedTasks };
    });
  }

  snapshot() {
    const now = this.s.now();
    const onlineCutoff = now - ONLINE_WINDOW_MS;

    const openJobs = this.s.all(
      `SELECT t.id, t.owner, t.title, t.model, t.amount, t.created_at, t.deadline,
              t.category, t.skill_id, t.expected_minutes, t.min_trust_tier,
              t.judge_mode, t.min_payout_percent,
              a.name AS consumer_name, a.settled_tasks_count, a.payout_pct_sum,
              a.consumer_rating_sum, a.consumer_rating_count, a.consumer_strikes
       FROM tasks t
       JOIN accounts a ON a.id = t.owner
       WHERE t.state='queued' AND t.deadline>? AND a.banned=0
       ORDER BY t.deadline ASC, t.created_at DESC LIMIT 100`,
      now,
    ).map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category || 'general_files',
      skill_id: row.skill_id || TASK_CATEGORIES[row.category || 'general_files']?.default_skill,
      model: row.model,
      amount_minor: row.amount,
      expected_minutes: row.expected_minutes || 30,
      min_trust_tier: row.min_trust_tier || 'probation',
      judge_mode: row.judge_mode || 'human',
      min_payout_percent: row.min_payout_percent || 100,
      created_at: row.created_at,
      deadline: row.deadline,
      consumer: {
        id: row.owner,
        name: row.consumer_name,
        avg_payout_percent: row.settled_tasks_count > 0 ? Math.round(row.payout_pct_sum / row.settled_tasks_count) : 100,
        rating: row.consumer_rating_count > 0 ? Number((row.consumer_rating_sum / row.consumer_rating_count).toFixed(2)) : null,
        rating_count: row.consumer_rating_count,
        strikes: row.consumer_strikes || 0,
      },
    }));

    const workers = this.s.all(
      `SELECT w.id, w.owner, w.name, w.model, w.qualified, w.suspended, w.rating_sum, w.rating_count,
              w.verified_tokens, w.completed_count, w.strikes, w.last_seen_at, w.ban_reason
       FROM workers w
       JOIN accounts a ON a.id = w.owner
       WHERE a.banned=0
       ORDER BY w.qualified DESC, w.completed_count DESC, w.verified_tokens DESC LIMIT 100`,
    ).map((w) => {
      const tier = workerTrustTier(w);
      const busy = !!this.s.one("SELECT id FROM tasks WHERE worker=? AND state='running'", w.id);
      const catStats = this.s.all('SELECT category, completed_count, rating_sum, payout_pct_sum, verified_tokens FROM worker_category_stats WHERE worker=?', w.id)
        .map((c) => ({
          category: c.category,
          completed_count: c.completed_count,
          avg_rating: c.completed_count > 0 ? Number((c.rating_sum / c.completed_count).toFixed(2)) : null,
          avg_payout_percent: c.completed_count > 0 ? Math.round(c.payout_pct_sum / c.completed_count) : null,
          verified_tokens: c.verified_tokens,
        }));
      return {
        id: w.id,
        name: w.name,
        model: w.model,
        qualified: !!w.qualified,
        suspended: !!w.suspended,
        online: busy || (w.last_seen_at != null && w.last_seen_at >= onlineCutoff),
        busy,
        trust_tier: tier.tier,
        max_expected_minutes: tier.max_expected_minutes,
        completed_count: w.completed_count || 0,
        avg_rating: w.rating_count > 0 ? Number((w.rating_sum / w.rating_count).toFixed(2)) : null,
        rating_count: w.rating_count,
        verified_tokens: w.verified_tokens,
        strikes: w.strikes || 0,
        categories: catStats,
      };
    });

    const consumers = this.s.all(
      `SELECT a.id, a.name, a.role, a.primary_category, a.last_seen_at,
              a.settled_tasks_count, a.payout_pct_sum, a.consumer_rating_sum, a.consumer_rating_count, a.consumer_strikes
       FROM accounts a
       WHERE a.banned=0 AND (a.settled_tasks_count>0 OR a.last_seen_at IS NOT NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.owner=a.id))
       ORDER BY a.settled_tasks_count DESC, a.rowid DESC LIMIT 100`,
    ).map((a) => {
      const catBreakdown = this.s.all('SELECT category, tasks_created, tasks_settled, total_spent_minor FROM consumer_category_stats WHERE account=?', a.id);
      const activeTasks = this.s.one("SELECT COUNT(*) AS n FROM tasks WHERE owner=? AND state IN ('queued','running','submitted')", a.id).n;
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        primary_category: a.primary_category || 'general_files',
        online: activeTasks > 0 || (a.last_seen_at != null && a.last_seen_at >= onlineCutoff),
        active_tasks: activeTasks,
        settled_tasks_count: a.settled_tasks_count || 0,
        avg_payout_percent: a.settled_tasks_count > 0 ? Math.round(a.payout_pct_sum / a.settled_tasks_count) : 100,
        avg_rating: a.consumer_rating_count > 0 ? Number((a.consumer_rating_sum / a.consumer_rating_count).toFixed(2)) : null,
        rating_count: a.consumer_rating_count || 0,
        strikes: a.consumer_strikes || 0,
        categories: catBreakdown,
      };
    });

    const bans = this.s.all('SELECT id, account, worker, reason, evidence_ref, at FROM ban_log ORDER BY at DESC LIMIT 25');

    return {
      server_time: now,
      stats: {
        open_jobs: openJobs.length,
        online_workers: workers.filter((w) => w.online).length,
        online_consumers: consumers.filter((c) => c.online).length,
      },
      categories: Object.values(TASK_CATEGORIES),
      skills: this.skills(),
      trust_tiers: Object.values(TRUST_TIERS),
      open_jobs: openJobs,
      workers,
      consumers,
      enforcement: {
        banned_accounts: this.s.one('SELECT COUNT(*) AS n FROM accounts WHERE banned=1').n,
        suspended_workers: this.s.one('SELECT COUNT(*) AS n FROM workers WHERE suspended=1').n,
        recent_bans: bans,
      },
    };
  }
}
