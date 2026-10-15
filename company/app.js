const $ = (id) => document.getElementById(id);

const CATEGORY_LABELS = {
  art_works: 'Three.js Art & Animated Assets',
  mini_games: 'Single-Shot Mini-Games',
  reverse_engineering: 'Reverse Engineering',
  general_files: 'Sandboxed File Operations',
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

let token = '';
let activeTab = 'jobs-panel';
let marketData = null;
let busy = false;
const idempotencyKeys = new Map();

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (cls) node.className = cls;
  return node;
}

function pill(text, kind = '') {
  return el('span', text, `status ${kind}`.trim());
}

function notice(text, isError = false) {
  const box = $('notice');
  box.textContent = text;
  box.classList.toggle('error', isError);
}

function credits(minor) {
  return `${(Number(minor || 0) / 100).toFixed(2)} cr (${minor} minor)`;
}

function formatDuration(minutes) {
  const m = Number(minutes || 30);
  if (m < 60) return `${m} min`;
  const h = (m / 60).toFixed(m % 60 === 0 ? 0 : 1);
  return `${h} hr (${m}m)`;
}

function checkPromptLocally(text) {
  const reasons = [];
  for (const rule of PROMPT_THREAT_RULES) {
    if (rule.pattern.test(text)) reasons.push(`${rule.code}: ${rule.message}`);
  }
  return { safe: reasons.length === 0, reasons };
}

function checkDeliverableLocally(text) {
  const reasons = [];
  for (const rule of DELIVERABLE_THREAT_RULES) {
    if (rule.pattern.test(text)) reasons.push(`${rule.code}: ${rule.message}`);
  }
  return { safe: reasons.length === 0, reasons };
}

async function api(path, body, authRequired = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (authRequired) throw new Error('Connect or register an account in the Workspace tab first.');
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    const sig = `${path}:${JSON.stringify(body)}`;
    if (!idempotencyKeys.has(sig)) idempotencyKeys.set(sig, crypto.randomUUID());
    headers['Idempotency-Key'] = idempotencyKeys.get(sig);
  }
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    credentials: 'omit',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || data.error?.code || 'Request failed');
  return data;
}

async function perform(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (err) {
    notice(err.message, true);
  } finally {
    busy = false;
  }
}

function renderTable(targetId, headers, rows, emptyText = 'No records in this view yet.') {
  const host = $(targetId);
  host.replaceChildren();
  if (!rows.length) {
    host.append(el('p', emptyText, 'empty'));
    return;
  }
  const table = el('table');
  const thead = el('thead');
  const trHead = el('tr');
  for (const h of headers) trHead.append(el('th', h));
  thead.append(trHead);
  table.append(thead);
  const tbody = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    for (const cell of r) {
      const td = el('td');
      if (cell instanceof Node) td.append(cell);
      else td.textContent = String(cell ?? '—');
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  host.append(table);
}

function populateSkillSelect() {
  if (!marketData) return;
  const cat = $('post-category').value;
  const select = $('post-skill');
  select.replaceChildren();
  for (const s of marketData.skills.filter((item) => item.category === cat)) {
    const opt = el('option', `${s.title} (${s.id})`);
    opt.value = s.id;
    select.append(opt);
  }
}

function renderMarket() {
  if (!marketData) return;
  const onlineWorkersCount = marketData.workers.filter((w) => w.online && !w.suspended).length;
  const onlineConsumersCount = marketData.consumers.filter((c) => c.online).length;
  const bannedCount = (marketData.enforcement?.banned_accounts || 0) + (marketData.enforcement?.suspended_workers || 0);

  $('metrics').replaceChildren(
    ...[
      ['Open Queued Jobs', marketData.open_jobs.length],
      ['Online / Total Workers', `${onlineWorkersCount} / ${marketData.workers.length}`],
      ['Online / Total Consumers', `${onlineConsumersCount} / ${marketData.consumers.length}`],
      ['Banned / Suspended Spoofers', bannedCount],
    ].map(([label, val]) => {
      const card = el('div', null, 'metric');
      card.append(el('strong', val), el('span', label));
      return card;
    }),
  );

  const catFilter = $('filter-category').value;
  const modelFilter = $('filter-model').value;
  const jobs = marketData.open_jobs.filter((j) => (!catFilter || j.category === catFilter) && (!modelFilter || j.model === modelFilter));

  renderTable(
    'jobs-list',
    ['Job Title & ID', 'Category & Skill', 'Model & Complexity', 'Budget & Floor', 'Judge Mode', 'Consumer Profile'],
    jobs.map((j) => {
      const titleBox = el('div');
      titleBox.append(el('strong', j.title), el('div', j.id, 'muted'));
      const catBox = el('div');
      catBox.append(pill(CATEGORY_LABELS[j.category] || j.category), el('div', `Skill: ${j.skill_id}`, 'muted'));
      const modBox = el('div');
      modBox.append(el('strong', j.model), el('div', `${formatDuration(j.expected_minutes)} · Tier >= ${j.min_trust_tier}`, 'muted'));
      const budgetBox = el('div');
      budgetBox.append(el('strong', credits(j.amount_minor)), el('div', `Min Payout: ${j.min_payout_percent}%`, 'muted'));
      const consumerBox = el('div');
      const ratingStr = j.consumer.rating ? `★ ${j.consumer.rating} (${j.consumer.rating_count})` : 'New Consumer';
      consumerBox.append(
        el('strong', j.consumer.name),
        el('div', `Avg Payout: ${j.consumer.avg_payout_percent}% · ${ratingStr} · Strikes: ${j.consumer.strikes}`, 'muted'),
      );
      return [titleBox, catBox, modBox, budgetBox, pill(j.judge_mode), consumerBox];
    }),
    'No open queued jobs match the selected filters.',
  );

  renderTable(
    'workers-list',
    ['Presence', 'Worker & ID', 'Declared Model', 'Trust Tier & Cap', 'Global Reputation', 'Category Mastery', 'Strikes'],
    marketData.workers.map((w) => {
      const statusPill = w.suspended ? pill('SUSPENDED', 'warn') : w.online ? pill(w.busy ? 'ONLINE · WORKING' : 'ONLINE · IDLE', 'online') : pill('OFFLINE');
      const nameBox = el('div');
      nameBox.append(el('strong', w.name), el('div', w.id, 'muted'));
      const tierBox = el('div');
      tierBox.append(pill(w.trust_tier.toUpperCase()), el('div', `Max job: ${formatDuration(w.max_expected_minutes)}`, 'muted'));
      const repBox = el('div');
      repBox.append(
        el('strong', w.avg_rating ? `★ ${w.avg_rating} (${w.rating_count})` : 'Unrated'),
        el('div', `${w.completed_count} settled · ${w.verified_tokens} verified tokens`, 'muted'),
      );
      const catsBox = el('div');
      if (!w.categories.length) catsBox.textContent = 'No settled category history yet';
      else {
        for (const c of w.categories) {
          catsBox.append(el('div', `${CATEGORY_LABELS[c.category] || c.category}: ${c.completed_count} jobs, ★ ${c.avg_rating ?? '—'} (${c.avg_payout_percent}% avg pay)`));
        }
      }
      return [statusPill, nameBox, w.model, tierBox, repBox, catsBox, w.strikes > 0 ? pill(`${w.strikes} strikes`, 'warn') : '0'];
    }),
    'No workers registered yet.',
  );

  renderTable(
    'consumers-list',
    ['Presence', 'Consumer & ID', 'Primary Task Domain', 'Settled Jobs & Avg Payout %', 'Worker Fairness Rating', 'Category Breakdown', 'Prompt Strikes'],
    marketData.consumers.map((c) => {
      const statusPill = c.online ? pill('ONLINE', 'online') : pill('OFFLINE');
      const nameBox = el('div');
      nameBox.append(el('strong', c.name), el('div', `${c.id} (${c.role})`, 'muted'));
      const payoutBox = el('div');
      payoutBox.append(el('strong', `${c.avg_payout_percent}% avg payout`), el('div', `${c.settled_tasks_count} settled · ${c.active_tasks} active`, 'muted'));
      const ratingStr = c.avg_rating ? `★ ${c.avg_rating} (${c.rating_count})` : 'No worker ratings yet';
      const breakdown = el('div');
      if (!c.categories.length) breakdown.textContent = 'No tasks published yet';
      else {
        for (const cb of c.categories) {
          breakdown.append(el('div', `${CATEGORY_LABELS[cb.category] || cb.category}: ${cb.tasks_created} posted, ${cb.tasks_settled} settled (${credits(cb.total_spent_minor)})`));
        }
      }
      return [statusPill, nameBox, pill(CATEGORY_LABELS[c.primary_category] || c.primary_category), payoutBox, ratingStr, breakdown, c.strikes > 0 ? pill(`${c.strikes} strikes`, 'warn') : '0'];
    }),
    'No active consumers yet.',
  );

  renderTable(
    'skills-list',
    ['Skill ID', 'Category', 'Title', 'Worker Immutable Safety Preamble', 'Consumer AI Judger Guide'],
    marketData.skills.map((s) => [
      el('code', s.id),
      pill(CATEGORY_LABELS[s.category] || s.category),
      el('strong', s.title),
      s.worker_preamble,
      s.judge_guide,
    ]),
  );

  renderTable(
    'tiers-list',
    ['Trust Tier', 'Max Job Complexity', 'Qualification & Advancement Rule', 'Anti-Spoofing Enforcement'],
    marketData.trust_tiers.map((t) => [
      pill(t.tier.toUpperCase()),
      formatDuration(t.max_expected_minutes),
      t.label,
      t.tier === 'unqualified'
        ? 'Must complete ~$20 unpaid reference-token trial and pass independent operator review.'
        : 'Requires model match, telemetry consistency, and zero lower-priced model spoofing strikes.',
    ]),
  );

  renderTable(
    'bans-list',
    ['Timestamp', 'Ban ID', 'Account / Worker', 'Reason (Fake Work / Model Spoofing / Unsafe Prompt)', 'Evidence Reference'],
    (marketData.enforcement?.recent_bans || []).map((b) => [
      new Date(b.at).toLocaleString(),
      b.id,
      `${b.account || '—'} / ${b.worker || 'All Workers'}`,
      b.reason,
      b.evidence_ref,
    ]),
    'No fraud or model-spoofing bans recorded on this instance.',
  );
}

async function loadMarket() {
  const [market, caps] = await Promise.all([api('/v1/market'), api('/v1/capabilities')]);
  marketData = market;
  const models = caps.models || ['gpt-6-astra', 'claude-opus-5.5'];
  const filterModel = $('filter-model');
  const currentFilter = filterModel.value;
  filterModel.replaceChildren(el('option', 'All Models'));
  filterModel.firstChild.value = '';
  for (const targetId of ['post-model', 'worker-model']) {
    const sel = $(targetId);
    sel.replaceChildren();
    for (const m of models) {
      const opt = el('option', m);
      opt.value = m;
      sel.append(opt);
    }
  }
  for (const m of models) {
    const opt = el('option', m);
    opt.value = m;
    filterModel.append(opt);
  }
  filterModel.value = currentFilter;
  populateSkillSelect();
  renderMarket();
}

async function loadWorkspace() {
  if (!token) {
    $('auth-gate').hidden = false;
    $('member-workspace').hidden = true;
    $('logout-btn').hidden = true;
    $('connection-pill').textContent = 'Public Visitor (Read-Only)';
    $('connection-pill').className = 'status';
    return;
  }
  const [wallet, workersResp, tasksResp] = await Promise.all([
    api('/v1/me', undefined, true),
    api('/v1/workers', undefined, true),
    api('/v1/tasks', undefined, true),
  ]);
  $('auth-gate').hidden = true;
  $('member-workspace').hidden = false;
  $('logout-btn').hidden = false;
  $('connection-pill').textContent = `Connected: ${wallet.name} (${wallet.id})`;
  $('connection-pill').className = 'status online';
  $('presence-category').value = wallet.primary_category || 'art_works';

  const summary = $('wallet-summary');
  summary.replaceChildren(
    el('strong', `${wallet.name} · Available: ${credits(wallet.available)} · Frozen: ${credits(wallet.frozen)}`),
    el('div', `Account ID: ${wallet.id} · Daily Limit: ${credits(wallet.daily_limit)} · Avg Payout: ${wallet.settled_tasks_count ? Math.round(wallet.payout_pct_sum / wallet.settled_tasks_count) : 100}%`, 'muted'),
  );

  renderTable(
    'my-workers-list',
    ['Worker ID', 'Name', 'Model', 'Qualification', 'Completed & Tokens', 'Actions'],
    workersResp.workers.map((w) => {
      const act = el('div', null, 'actions');
      const pingBtn = el('button', 'Ping Online');
      pingBtn.type = 'button';
      pingBtn.addEventListener('click', () => perform(async () => {
        await api('/v1/presence', { worker_id: w.id }, true);
        await loadMarket();
        notice(`Worker ${w.name} is now marked ONLINE.`);
      }));
      act.append(pingBtn);
      return [
        w.id,
        w.name,
        w.model,
        w.suspended ? pill('Suspended', 'warn') : w.qualified ? pill('Qualified', 'online') : pill('In Unpaid Trial'),
        `${w.completed_count || 0} jobs · ${w.verified_tokens} tokens`,
        act,
      ];
    }),
    'No workers registered under this account yet.',
  );

  renderTable(
    'my-tasks-list',
    ['Task ID & Title', 'Category & Skill', 'Model & Duration', 'State & Budget', 'Payout % & Verdict', 'Actions'],
    tasksResp.tasks.map((t) => {
      const actions = el('div', null, 'actions');
      const inspectBtn = el('button', 'Inspect / Act');
      inspectBtn.type = 'button';
      inspectBtn.addEventListener('click', () => showTaskDetail(t, wallet, workersResp.workers));
      actions.append(inspectBtn);
      return [
        `${t.title} (${t.id})`,
        `${CATEGORY_LABELS[t.category] || t.category} · ${t.skill_id}`,
        `${t.model} · ${formatDuration(t.expected_minutes)}`,
        `${t.state} · ${credits(t.amount)}`,
        t.payout_percent != null ? `${t.payout_percent}% (floor ${t.min_payout_percent || 100}%)` : `Floor ${t.min_payout_percent || 100}%`,
        actions,
      ];
    }),
    'No tasks created or claimed by this account yet.',
  );
}

function showTaskDetail(task, wallet, myWorkers) {
  const host = $('task-action-detail');
  host.hidden = false;
  host.replaceChildren();
  host.append(el('h3', `Task: ${task.title} (${task.state})`));
  const promptSafety = checkPromptLocally(`${task.system_prompt || ''}\n${task.description || ''}`);
  const meta = el('pre', JSON.stringify({
    id: task.id,
    category: task.category,
    skill_id: task.skill_id,
    model: task.model,
    expected_minutes: task.expected_minutes,
    min_trust_tier: task.min_trust_tier,
    judge_mode: task.judge_mode,
    min_payout_percent: task.min_payout_percent,
    payout_percent: task.payout_percent,
    system_prompt: task.system_prompt,
    description: task.description,
    result: task.result,
    worker_local_prompt_safety: promptSafety,
    telemetry_flags: task.telemetry_flags ? JSON.parse(task.telemetry_flags) : null,
    judge_verdict: task.judge_verdict ? JSON.parse(task.judge_verdict) : null,
  }, null, 2));
  host.append(meta);

  const bar = el('div', null, 'actions');
  const isOwner = task.owner === wallet.id;
  const assignedWorker = myWorkers.find((w) => w.id === task.worker);

  if (!isOwner && task.state === 'running' && assignedWorker) {
    const abortBtn = el('button', 'Worker Guard: Abort Unsafe Consumer Prompt', 'danger');
    abortBtn.type = 'button';
    abortBtn.addEventListener('click', () => perform(async () => {
      const reason = promptSafety.reasons.join('; ') || 'Consumer prompt violates Worker local safety boundary';
      await api(`/v1/tasks/${task.id}/abort-unsafe`, { epoch: task.epoch, reason }, true);
      await loadWorkspace();
      await loadMarket();
      host.hidden = true;
      notice('Aborted unsafe task without Worker penalty; Consumer strike recorded.');
    }));
    const submitBtn = el('button', 'Submit Deliverable', 'primary');
    submitBtn.type = 'button';
    submitBtn.addEventListener('click', () => perform(async () => {
      const text = prompt('Enter UTF-8 deliverable summary / Three.js scene code:');
      if (!text) return;
      await api(`/v1/tasks/${task.id}/submit`, { epoch: task.epoch, result: text }, true);
      await loadWorkspace();
      await loadMarket();
      host.hidden = true;
      notice('Deliverable submitted.');
    }));
    bar.append(submitBtn, abortBtn);
  }

  if (isOwner && task.state === 'submitted') {
    const judgeBtn = el('button', 'Run Consumer AI Judger Verdict', 'primary');
    judgeBtn.type = 'button';
    judgeBtn.addEventListener('click', () => perform(async () => {
      const pct = Number(prompt(`Enter payout_percent (${task.min_payout_percent || 100}..100, or 0 to flag/reject):`, String(task.payout_percent ?? 100)));
      const rating = Number(prompt('Enter rating (1..5):', '5'));
      await api(`/v1/tasks/${task.id}/judge`, {
        payout_percent: pct,
        rating,
        reason: 'Evaluated via Company Portal Consumer Judger',
        recommend_whitelist: pct >= 95 && rating >= 5,
        suspect_model_spoofing: pct === 0,
      }, true);
      await loadWorkspace();
      await loadMarket();
      notice(`Judger verdict recorded (${pct}% payout).`);
    }));
    const acceptBtn = el('button', 'Accept & Settle Credits', 'primary');
    acceptBtn.type = 'button';
    acceptBtn.addEventListener('click', () => perform(async () => {
      await api(`/v1/tasks/${task.id}/accept`, {
        rating: task.rating || 5,
        payout_percent: task.payout_percent ?? 100,
      }, true);
      await loadWorkspace();
      await loadMarket();
      host.hidden = true;
      notice('Task accepted and settled.');
    }));
    bar.append(judgeBtn, acceptBtn);
  }

  if (!isOwner && task.state === 'completed' && assignedWorker && !task.consumer_rating) {
    const rateBtn = el('button', 'Rate Consumer Fairness (1-5 ★)', 'primary');
    rateBtn.type = 'button';
    rateBtn.addEventListener('click', () => perform(async () => {
      const rating = Number(prompt('Rate this Consumer (1..5):', '5'));
      await api(`/v1/tasks/${task.id}/rate-consumer`, { rating }, true);
      await loadWorkspace();
      await loadMarket();
      host.hidden = true;
      notice('Consumer fairness rating recorded.');
    }));
    bar.append(rateBtn);
  }

  host.append(bar);
}

function switchTab(nextTab) {
  activeTab = nextTab;
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== activeTab; });
  document.querySelectorAll('nav button[data-tab]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === activeTab));
  });
}

document.querySelectorAll('nav button[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

$('enter-company-btn').addEventListener('click', () => switchTab('workspace-panel'));
$('refresh-market').addEventListener('click', () => perform(async () => {
  await loadMarket();
  if (token) await loadWorkspace();
  notice('Live market board refreshed.');
}));

$('filter-category').addEventListener('change', renderMarket);
$('filter-model').addEventListener('change', renderMarket);
$('post-category').addEventListener('change', populateSkillSelect);

$('verify-prompt-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const res = checkPromptLocally(f.elements.prompt.value);
  $('verify-prompt-output').textContent = JSON.stringify({
    verifier: 'worker_local_prompt_guard',
    category: f.elements.category.value,
    safe_for_worker_computer: res.safe,
    action_if_claimed: res.safe ? 'Execute with Company Skill preamble' : 'Call POST /v1/tasks/{id}/abort-unsafe & penalize Consumer',
    reasons: res.reasons,
  }, null, 2);
});

$('verify-deliverable-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const res = checkDeliverableLocally(f.elements.deliverable.value);
  $('verify-deliverable-output').textContent = JSON.stringify({
    verifier: 'consumer_local_deliverable_guard',
    safe_for_consumer_computer_and_judger: res.safe,
    reasons: res.reasons,
  }, null, 2);
});

$('register-account-form').addEventListener('submit', (e) => {
  e.preventDefault();
  perform(async () => {
    const f = e.target;
    const acct = await api('/v1/accounts', { name: f.elements.name.value });
    token = acct.token;
    f.reset();
    await loadWorkspace();
    await loadMarket();
    notice(`Registered account ${acct.account_id}. Save your Bearer token securely: ${acct.token}`);
  });
});

$('connect-account-form').addEventListener('submit', (e) => {
  e.preventDefault();
  perform(async () => {
    const f = e.target;
    token = f.elements.token.value.trim();
    f.reset();
    try {
      await loadWorkspace();
      notice('Connected to Company Workspace.');
    } catch (err) {
      token = '';
      await loadWorkspace();
      throw err;
    }
  });
});

$('logout-btn').addEventListener('click', () => {
  token = '';
  idempotencyKeys.clear();
  loadWorkspace();
  notice('Disconnected token from page memory.');
});

$('ping-presence-btn').addEventListener('click', () => perform(async () => {
  await api('/v1/presence', { category: $('presence-category').value }, true);
  await loadMarket();
  await loadWorkspace();
  notice('Online presence broadcasted to the market board.');
}));

$('post-task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  perform(async () => {
    const f = e.target;
    const body = {
      title: f.elements.title.value,
      description: f.elements.description.value,
      category: f.elements.category.value,
      skill_id: f.elements.skill_id.value,
      model: f.elements.model.value,
      expected_minutes: Number(f.elements.expected_minutes.value),
      min_trust_tier: f.elements.min_trust_tier.value,
      amount_minor: Number(f.elements.amount_minor.value),
      judge_mode: f.elements.judge_mode.value,
      min_payout_percent: Number(f.elements.min_payout_percent.value),
      ...(f.elements.system_prompt.value.trim() ? { system_prompt: f.elements.system_prompt.value.trim() } : {}),
      ...(f.elements.judge_rubric.value.trim() ? { judge_rubric: f.elements.judge_rubric.value.trim() } : {}),
    };
    const task = await api('/v1/tasks', body, true);
    f.reset();
    populateSkillSelect();
    await loadMarket();
    await loadWorkspace();
    notice(`Published categorized job ${task.id} (${task.category} · ${task.skill_id}).`);
  });
});

$('register-worker-form').addEventListener('submit', (e) => {
  e.preventDefault();
  perform(async () => {
    const f = e.target;
    const w = await api('/v1/workers', {
      name: f.elements.name.value,
      model: f.elements.model.value,
      accept_trial: f.elements.accept_trial.checked,
    }, true);
    f.reset();
    await loadMarket();
    await loadWorkspace();
    notice(`Registered Worker ${w.id} (${w.model}).`);
  });
});

$('whitelist-form').addEventListener('submit', (e) => {
  e.preventDefault();
  perform(async () => {
    const f = e.target;
    await api('/v1/whitelist', {
      worker_id: f.elements.worker_id.value.trim(),
      category: f.elements.category.value,
      spotcheck_percent: Number(f.elements.spotcheck_percent.value),
    }, true);
    f.reset();
    notice('Worker saved to your trusted category whitelist.');
  });
});

window.addEventListener('pagehide', () => { token = ''; idempotencyKeys.clear(); });

perform(async () => {
  await loadMarket();
});
