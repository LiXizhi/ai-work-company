import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, hash } from '../backend/store.mjs';
import { createServer } from '../backend/server.mjs';
import { verifyDeliverableStructure } from '../backend/verifiers.mjs';
import { main } from '../cli/awc.mjs';

function totalSystemCredits(store) {
  return store.one('SELECT COALESCE(SUM(available + frozen), 0) AS total FROM accounts').total;
}

test('standardized skills and static deliverable preflight validate domain contracts without code execution', () => {
  const polyGood = `
    function buildHead(params) { return { r: params.headRadius, color: params.furColor }; }
    function buildBody(params) { return { l: params.bodyLength, color: params.furColor }; }
    // 参数对照：headRadius 控制头部半径，bodyLength 控制体长，furColor 控制毛色
    // 打印前检查 checklist：最小壁厚 >= 1.6mm，耳朵悬空角 < 45°
  `;
  assert.equal(verifyDeliverableStructure({ category: 'general_files', skill_id: 'poly-code3d-art', result: polyGood }).valid, true);
  assert.equal(verifyDeliverableStructure({ category: 'general_files', skill_id: 'poly-code3d-art', result: 'mesh blob only' }).valid, false);

  const hanziGood = `
    字源核对：「山」甲骨文象三峰并立之形，本义山峰。
    分镜 1：远景晨雾群山，旁白：太阳升起，三座山峰露出了轮廓。 / Narration: Three peaks rise in the mist.
    分镜 2：甲骨文字形浮现，旁白：古人把三座相连的山画成了「山」。
    分镜 3：篆书到楷书演变动画，角色跟随笔画跳跃。
    分镜 4：词语互动「高山」「山川」，旁白：山川相连。
    分镜 5：登顶远眺高潮镜头，旁白：站在山上望向远方。
    分镜 6：收尾复习发音 shān，旁白：记住这个象形字「山」。
  `;
  assert.equal(verifyDeliverableStructure({ category: 'art_works', skill_id: 'hanzi-story-animation', result: hanziGood }).valid, true);
  assert.equal(verifyDeliverableStructure({ category: 'art_works', skill_id: 'hanzi-story-animation', result: '分镜 1：只有一镜' }).valid, false);

  const lifeGood = `
    年代与地点：1986 年 · 安徽蚌埠老街巷
    场景分层：前景为二八大杠自行车与搪瓷茶缸，中景为红砖家属院门口纳凉竹床，远景为傍晚广播喇叭与炊烟。
    时光记者追问：
    1. 那时候夏天傍晚大家在院子里乘凉，您最常和邻居聊些什么？
    2. 您家里第一辆自行车是什么牌子的？当时买它攒了多久的票？
    3. 听到巷口广播响起来的时候，家里人一般正在忙什么？
  `;
  assert.equal(verifyDeliverableStructure({ category: 'general_files', skill_id: 'lifestory-history-scene', result: lifeGood }).valid, true);

  const auditGood = `
    核验结论：
    - 交付周期为 72 小时（出处：input/spec-a.md#L12）
    矛盾与冲突：
    - input/spec-a.md#L20 写并发上限 2，而 input/spec-b.md#L8 写并发上限 1。
    缺失与待确认：
    - 缺少发票税率字段定义（missing tax_rate）。
  `;
  assert.equal(verifyDeliverableStructure({ category: 'general_files', skill_id: 'second-brain-doc-audit', result: auditGood }).valid, true);
});

test('batch campaigns enforce 2-sample gate, release parallel subtasks, recover failed items once, and conserve credits', async (t) => {
  let now = Date.now();
  const store = new Store(':memory:', { now: () => now });
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
        ...(body !== undefined ? { 'Content-Type': 'application/json', 'Idempotency-Key': `batch-k-${++seq}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, value: await res.json() };
  };

  for (const skillDoc of ['poly-code3d-art', 'hanzi-story-animation', 'lifestory-history-scene', 'second-brain-doc-audit', 'awc-night-shift']) {
    const docRes = await fetch(`${base}/skills/${skillDoc}.md`);
    assert.equal(docRes.status, 200, skillDoc);
  }
  const allSkills = (await req('/v1/skills')).value.skills.map((s) => s.id);
  for (const expected of ['poly-code3d-art', 'hanzi-story-animation', 'lifestory-history-scene', 'second-brain-doc-audit']) {
    assert.ok(allSkills.includes(expected), expected);
  }

  const employer = store.provisionPlatform('Batch Studio', 2000);
  store.limits(employer.account_id, 2000, 5);
  const initialTotal = totalSystemCredits(store);
  assert.equal(initialTotal, 2000);

  const workerOwner1 = (await req('/v1/accounts', { body: { name: 'Worker A' } })).value;
  const workerOwner2 = (await req('/v1/accounts', { body: { name: 'Worker B' } })).value;
  const w1 = (await req('/v1/workers', { token: workerOwner1.token, body: { name: 'W1', model: 'gpt-6-astra', accept_trial: true } })).value;
  const w2 = (await req('/v1/workers', { token: workerOwner2.token, body: { name: 'W2', model: 'gpt-6-astra', accept_trial: true } })).value;
  store.qualifyWorker(w1.id, { model: w1.model, trial_reference_minor: 2000, evidence_ref: 'syn:batch:w1' });
  store.qualifyWorker(w2.id, { model: w2.model, trial_reference_minor: 2000, evidence_ref: 'syn:batch:w2' });

  const created = await req('/v1/batches', {
    token: employer.token,
    body: {
      title: 'Hanzi Batch',
      category: 'art_works',
      skill_id: 'hanzi-story-animation',
      model: 'gpt-6-astra',
      unit_amount_minor: 200,
      sample_size: 2,
      expected_minutes: 30,
      items: [
        { title: '山', description: 'Generate 6-shot storyboard for 山' },
        { title: '水', description: 'Generate 6-shot storyboard for 水' },
        { title: '火', description: 'Generate 6-shot storyboard for 火' },
        { title: '木', description: 'Generate 6-shot storyboard for 木' },
      ],
    },
  });
  assert.equal(created.status, 200);
  const batchId = created.value.id;
  assert.equal(created.value.state, 'sampling');
  assert.equal(created.value.counts.queued, 2);
  assert.equal(created.value.counts.held_for_sample, 2);
  // Only the 2 sample subtasks (400 minor) are frozen initially!
  assert.equal(store.wallet(employer.account_id).frozen, 400);
  assert.equal(store.wallet(employer.account_id).available, 1600);
  assert.equal(totalSystemCredits(store), initialTotal);

  // Cannot release remaining items before at least one sample is submitted/completed
  const earlyRelease = await req(`/v1/batches/${batchId}/release`, { token: employer.token, body: {} });
  assert.equal(earlyRelease.status, 409);
  assert.equal(earlyRelease.value.error.code, 'sample_not_verified');

  // Worker 1 claims & submits sample 0 with valid 6-shot Hanzi deliverable
  const sampleTaskId = created.value.items[0].task_id;
  const claim0 = (await req(`/v1/tasks/${sampleTaskId}/claim`, { token: workerOwner1.token, body: { worker_id: w1.id } })).value;
  const validHanzi = '字源核对：象形。\n分镜 1：旁白 A\n分镜 2：旁白 B\n分镜 3：旁白 C\n分镜 4：旁白 D\n分镜 5：旁白 E\n分镜 6：旁白 F';
  assert.equal((await req(`/v1/tasks/${sampleTaskId}/submit`, { token: workerOwner1.token, body: { epoch: claim0.epoch, result: validHanzi } })).status, 200);

  // Verify judge_evaluate received structure_preflight.valid === true
  const exec0 = (await req(`/v1/tasks/${sampleTaskId}/execution`, { token: employer.token })).value;
  const judgeCall = exec0.calls.find((c) => c.name === 'judge_evaluate');
  assert.equal(judgeCall.args.deliverable_envelope.structure_preflight.valid, true);

  // Settle sample 0
  store.reviewTask(sampleTaskId, { model: 'gpt-6-astra', result_sha256: hash(validHanzi), verified_tokens: 200, evidence_ref: 'syn:batch:t0' });
  assert.equal((await req(`/v1/tasks/${sampleTaskId}/accept`, { token: employer.token, body: { rating: 5, payout_percent: 100 } })).status, 200);
  assert.equal(store.wallet(workerOwner1.account_id).available, 200);

  // Release remaining 2 subtasks via CLI batch-release & inspect via batch-status
  const cliDir = await mkdtemp(join(tmpdir(), 'awc-batch-cli-'));
  const cliOut = [];
  await main(['batch-release', '--id', batchId], {
    env: { AWC_BASE_URL: base, AWC_CLIENT_DIR: cliDir, AWC_TOKEN: employer.token },
    output: (x) => cliOut.push(x),
  });
  assert.equal(cliOut.at(-1).state, 'active');
  assert.equal(cliOut.at(-1).counts.held_for_sample, 0);
  assert.equal(cliOut.at(-1).counts.queued, 3); // sample #1 + items #2 & #3

  // Let item #2 fail all 3 lease attempts, then recover ONLY item #2 via retry-failed without touching settled sample #0!
  const item2TaskId = cliOut.at(-1).items[2].task_id;
  for (let attempt = 0; attempt < 3; attempt++) {
    await req(`/v1/tasks/${item2TaskId}/claim`, { token: workerOwner2.token, body: { worker_id: w2.id } });
    now += 61_000;
    store.sweep();
  }
  assert.equal((await req(`/v1/batches/${batchId}`, { token: employer.token })).value.counts.failed_or_expired, 1);
  assert.equal(store.wallet(workerOwner1.account_id).available, 200); // Settled sibling untouched!

  const retried = await req(`/v1/batches/${batchId}/retry-failed`, { token: employer.token, body: {} });
  assert.equal(retried.status, 200);
  assert.equal(retried.value.items[2].retried, true);
  assert.notEqual(retried.value.items[2].task_id, item2TaskId);
  assert.equal(totalSystemCredits(store), initialTotal);

  // Also verify CLI batch-hire idempotent manifest recovery
  const manifestPath = join(cliDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    title: 'CLI Manifest Batch',
    category: 'general_files',
    skill_id: 'second-brain-doc-audit',
    model: 'gpt-6-astra',
    unit_amount_minor: 100,
    items: [{ title: 'Doc 1', description: 'Audit doc 1' }],
  }));
  const hireOut = [];
  for (let i = 0; i < 2; i++) {
    await main(['batch-hire', '--request', 'cli-b1', '--manifest', manifestPath], {
      env: { AWC_BASE_URL: base, AWC_CLIENT_DIR: cliDir, AWC_TOKEN: employer.token },
      output: (x) => hireOut.push(x),
    });
  }
  assert.equal(hireOut[0].state, 'batch_published');
  assert.equal(hireOut[1].state, 'batch_recovered');
  assert.equal(hireOut[0].batch.id, hireOut[1].batch.id);
  assert.equal(totalSystemCredits(store), initialTotal);
});

test('configurable Store policyMode and requiredMinutes preserve default v0_2 gate while supporting custom thresholds', () => {
  const customStore = new Store(':memory:', { requiredMinutes: 180 });
  const a = customStore.register('Three-hour trial owner');
  assert.equal(customStore.wallet(a.account_id).required_minutes, 180);
  assert.equal(customStore.wallet(a.account_id).can_hire, false);
  customStore.close();

  const bpV2Store = new Store(':memory:', { policyMode: 'bp_v2' });
  const b = bpV2Store.register('Pure consumer candidate');
  assert.equal(bpV2Store.wallet(b.account_id).policy_mode, 'bp_v2');
  assert.equal(bpV2Store.wallet(b.account_id).required_minutes, 0);
  assert.equal(bpV2Store.wallet(b.account_id).can_hire, true);
  bpV2Store.close();
});
