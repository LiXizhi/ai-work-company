#!/usr/bin/env node
import { mkdir, readFile, writeFile, rename, lstat, rm, mkdtemp, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Api } from '../worker/client.mjs';
import { workOnce } from '../worker/run.mjs';
import { runTrial } from '../worker/trial.mjs';
import { consume, startBroker } from '../consumer/run.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const emit = value => console.log(JSON.stringify(value));
const help = `AI Work Company — local CLI (JSON output, no interactive prompts)
  npm run -s awc -- work --accept-trial [--model gpt-6-astra] [--wait-seconds 300] [--trial-tasks 100]
  npm run -s awc -- hire --request REPORT-1 --input ./input --task "Write output/report.txt" --budget 100
  npm run -s awc -- status
  npm run -s awc -- accept --id TASK_ID --rating 5
  npm run -s awc -- cancel --id TASK_ID
Options: --server URL (default http://127.0.0.1:8787), --model MODEL, --name NAME
Tokens: AWC_TOKEN imports an existing account; otherwise first work/hire creates one.
Local state: AWC_CLIENT_DIR or repository data/client; never commit this directory.
Budget: integer minor units; 100 = 1 internal credit. No recharge/withdrawal.
Trial: --accept-trial explicitly authorizes ~$20 unpaid reference-token service,
commercial use by company, zero trial wages. Operator qualification is still required.
Work handles up to 100 unpaid trials then at most one paid task per invocation; waiting defaults to zero seconds.
Hire stays foreground serving files until submission; Ctrl-C stops local execution,
not the funded order. Reuse --request with identical arguments to recover publication.
Acceptance is explicit and still requires operator evidence review.`;

export function parse(argv) {
  const [command = 'help', ...rest] = argv;
  if (!['help', 'work', 'hire', 'status', 'accept', 'cancel'].includes(command)) throw new Error('unknown_command');
  const allowed = { help: [], work: ['server','model','name','accept-trial','wait-seconds','trial-tasks'], hire: ['server','model','name','request','input','task','budget'], status: ['server'], accept: ['server','id','rating'], cancel: ['server','id'] }[command];
  const options = {};
  for (let i=0; i<rest.length; i++) {
    const key = rest[i].slice(2);
    if (!rest[i].startsWith('--') || !allowed.includes(key) || key in options) throw new Error('invalid_option');
    if (key === 'accept-trial') options[key] = true;
    else { const value = rest[++i]; if (!value || value.startsWith('--')) throw new Error('missing_option_value'); options[key] = value; }
  }
  return { command, options };
}
function integer(value, max) {
  if (!/^[0-9]+$/.test(value || '') || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) throw new Error('invalid_integer');
  return Number(value);
}
function contains(parent, child) { const r = relative(parent, child); return !r || (!r.startsWith('..') && !isAbsolute(r)); }
async function secureDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw new Error('client_directory_must_be_private');
}
async function save(path, state) {
  const temporary = path + '.' + randomUUID();
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}
async function load(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077)) throw new Error('unsafe_client_state');
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) { if (e.code === 'ENOENT') return { jobs: {} }; throw e; }
}

export async function main(argv, { env = process.env, output = emit, runWorker = workOnce, trialRunner = runTrial, runConsumer = consume } = {}) {
  const { command, options: o } = parse(argv);
  if (command === 'help') { output({ help }); return; }
  const base = new Api(o.server || env.AWC_BASE_URL || 'http://127.0.0.1:8787', 'validation').base;
  const model = o.model || 'gpt-6-astra';
  let amount;
  if (command === 'hire') {
    amount = integer(o.budget, 1000000);
    if (!o.input || !o.task || !o.request || !/^[a-zA-Z0-9_-]{1,64}$/.test(o.request)) throw new Error('hire_requires_input_task_budget_and_request');
  }
  if (['accept','cancel'].includes(command) && !/^task_[a-f0-9-]{36}$/.test(o.id || '')) throw new Error('invalid_task_id');
  const rating = command === 'accept' ? integer(o.rating, 5) : undefined;
  const trialLimit = o['trial-tasks'] === undefined ? 100 : integer(o['trial-tasks'], 1000);
  const wait = o['wait-seconds'] === undefined || o['wait-seconds'] === '0' ? 0 : integer(o['wait-seconds'], 3600);
  const clientRoot = resolve(env.AWC_CLIENT_DIR || resolve(project, 'data/client'));
  await secureDirectory(clientRoot);
  const home = resolve(clientRoot, digest(base)); await secureDirectory(home);
  const lock = resolve(home, 'lock');
  try { await mkdir(lock, { mode: 0o700 }); } catch (e) { if (e.code === 'EEXIST') throw new Error('client_busy_or_stale_lock'); throw e; }
  let locked = true;
  const unlock = async () => { if (locked) { await rm(lock, { recursive: true }); locked = false; } };
  const statePath = resolve(home, 'account.json');
  const abort = new AbortController(); const stop = () => abort.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const state = await load(statePath);
    if (env.AWC_TOKEN) {
      if (state.token && state.token !== env.AWC_TOKEN) throw new Error('account_mismatch_use_separate_client_directory');
      const wallet = await new Api(base, env.AWC_TOKEN).request('/v1/me');
      state.token = env.AWC_TOKEN; state.account_id = wallet.account_id || wallet.id || state.account_id;
      await save(statePath, state);
    }
    if (!state.token) {
      if (!['work','hire'].includes(command)) { output({ state: 'not_registered', next_action: 'Run work with owner trial consent, or hire with an explicit task and budget.' }); return; }
      if (command === 'work' && !o['accept-trial']) throw new Error('owner_trial_consent_required');
      if (state.registration_pending) throw new Error('registration_outcome_unknown_do_not_retry_contact_operator');
      state.registration_pending = true; await save(statePath, state);
      const response = await fetch(base + '/v1/accounts', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: o.name || 'AWC owner' }) });
      if (!response.ok) { if (response.status < 500) { state.registration_pending = false; await save(statePath, state); } throw new Error('registration_failed'); }
      const account = await response.json();
      if (typeof account.token !== 'string' || !account.token || typeof account.account_id !== 'string') throw new Error('invalid_registration_response');
      state.token = account.token; state.account_id = account.account_id; state.registration_pending = false;
      await save(statePath, state);
    }
    const api = new Api(base, state.token);
    if (command === 'status') {
      const workers=(await api.request('/v1/workers')).workers;
      const trial_progress=[]; for(const w of workers.slice(0,20)) { const {runs,...progress}=await api.request(`/v1/trials?worker_id=${w.id}`); trial_progress.push(progress); }
      output({ state: 'connected', wallet: await api.request('/v1/me'), workers, trial_progress, trial_progress_truncated: workers.length>20, tasks: (await api.request('/v1/tasks')).tasks }); return;
    }
    if (command === 'accept' || command === 'cancel') {
      output(await api.request(`/v1/tasks/${o.id}/${command}`, command === 'accept' ? { rating } : {}, `cli:${command}:${o.id}`)); return;
    }
    if (command === 'work') {
      let worker = (await api.request('/v1/workers')).workers.find(w => w.model === model);
      if (!worker) {
        if (!o['accept-trial']) throw new Error('owner_trial_consent_required');
        const body = { name: 'AWC Worker', model, accept_trial: true };
        worker = await api.request('/v1/workers', body, `cli:worker:${digest(model)}`);
      }
      if (worker.suspended) { output({state:'suspended',worker_id:worker.id}); return; }
      if (!worker.qualified) {
        await unlock();
        const reviewDeadline=Date.now()+wait*1000; let completedTrials=0;
        while(completedTrials<trialLimit && !abort.signal.aborted) {
          const result=await trialRunner({api,workerId:worker.id,runDir:await mkdtemp(resolve(home,'trial-')),signal:abort.signal,onEvent:output});
          output({...result, state:result.state==='price_required'?'qualification_required':result.state,trial_state:result.state,worker_id:worker.id,next_action:result.state==='price_required'?'Operator must configure model pricing and trial tasks.':'Only independently reviewed usage counts; trial wages are zero.'});
          worker=(await api.request('/v1/workers')).workers.find(w=>w.id===worker.id);
          if(worker.qualified) break;
          if(result.state==='submitted') completedTrials++;
          else {
            if(Date.now()>=reviewDeadline || !['review_required','trial_idle','price_required'].includes(result.state)) return;
            await new Promise(done=>{ const timer=setTimeout(finish,Math.min(5000,reviewDeadline-Date.now())); function finish(){clearTimeout(timer);abort.signal.removeEventListener('abort',finish);done();} abort.signal.addEventListener('abort',finish,{once:true}); });
            worker=(await api.request('/v1/workers')).workers.find(w=>w.id===worker.id);
            if(worker.qualified) break;
          }
        }
        if(!worker.qualified) { output({state:'trial_run_limit',worker_id:worker.id,next_action:'Review progress before another bounded work invocation.'}); return; }
      }
      await unlock();
      const end = Date.now() + wait * 1000;
      do {
        if (abort.signal.aborted) break;
        const queue = await api.request(`/v1/queue?worker_id=${worker.id}`);
        if (queue.tasks.length) {
          const runDir = await mkdtemp(resolve(home, 'run-'));
          const result = await runWorker({ api, workerId: worker.id, taskId: queue.tasks[0].id, runDir, signal: abort.signal, onEvent: output });
          output({ state: 'submitted', ...result, next_action: 'Wait for operator evidence review and Consumer acceptance; submission is not yet earnings.' }); return;
        }
        if (Date.now() >= end) break;
        await new Promise(done => { const timer = setTimeout(finish, Math.min(5000, end-Date.now())); function finish() { clearTimeout(timer); abort.signal.removeEventListener('abort', finish); done(); } abort.signal.addEventListener('abort', finish, { once: true }); });
      } while (Date.now() < end);
      output({ state: abort.signal.aborted ? 'stopped' : 'idle', worker_id: worker.id, next_action: 'Run work again when capacity is available; --wait-seconds bounds queue waiting.' }); return;
    }
    const source = await realpath(resolve(o.input));
    const privateRoot = await realpath(clientRoot);
    if (contains(source, privateRoot) || contains(privateRoot, source)) throw new Error('input_must_not_contain_client_credentials');
    const body = { title: o.task.slice(0,160), description: o.task, model, amount_minor: amount, workspace_required: true };
    const signature = digest(JSON.stringify({ source, body }));
    let job = state.jobs[o.request];
    if (job && job.signature !== signature) throw new Error('request_conflict_use_original_arguments_or_new_request');
    if (!job) {
      const wallet = await api.request('/v1/me');
      if (wallet.available < amount) { output({ state: 'funding_required', available_minor: wallet.available, required_minor: amount, next_action: 'Earn settled credits first. Recharge is not implemented.' }); return; }
      const directory = await mkdtemp(resolve(home, 'job-'));
      const broker = startBroker(resolve(directory, 'snapshot'), source);
      try { await broker.ready; } finally { broker.stop(); }
      job = { signature, body, directory, key: randomUUID() };
      state.jobs[o.request] = job; await save(statePath, state);
    }
    if (!job.id) {
      const task = await api.request('/v1/tasks', job.body, job.key);
      job.id = task.id; await save(statePath, state);
    }
    output({ state: 'published', task_id: job.id, request: o.request, workspace: resolve(job.directory, 'workspace'), next_action: 'Keep this process running for local file operations. Inspect output before explicit acceptance.' });
    await unlock();
    const result = await runConsumer({ api, taskId: job.id, input: resolve(job.directory, 'snapshot/input'), root: resolve(job.directory, 'workspace'), signal: abort.signal, onEvent: output });
    output({ ...result, task_id: job.id, next_action: 'Use status; review delivered files and operator evidence before accept. Local stop does not cancel the order.' });
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    await unlock();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(JSON.stringify({ state: 'error', code: error.code || error.message })); process.exitCode = 1; });
}
