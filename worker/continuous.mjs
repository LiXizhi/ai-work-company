import { mkdir, readFile, writeFile, rename, rm, mkdtemp, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { workOnce } from './run.mjs';
import { runTrial } from './trial.mjs';
import { identifier } from './client.mjs';

export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function atomic(path, value) {
  const temp = `${path}.${randomUUID()}`;
  await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
  await rename(temp, path);
}
export async function readState(path, fallback = {}) {
  try {
    const s = await lstat(path);
    if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || (s.mode & 0o077)) throw new Error('unsafe_runtime_state');
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
export function validatePolicy(p, base) {
  if (!p || p.version !== 1 || p.server !== base || !p.model || !Array.isArray(p.windows) || !p.windows.length || p.windows.length > 100) throw new Error('invalid_policy');
  identifier(p.worker_id);
  const until = Date.parse(p.expires_at);
  if (!Number.isFinite(until) || !/Z$|[+-]\d\d:\d\d$/.test(p.expires_at)) throw new Error('invalid_policy_expiry');
  if (!Array.isArray(p.categories) || !p.categories.length || p.categories.some(x => !['general_files','art_works','mini_games','reverse_engineering'].includes(x))) throw new Error('invalid_policy_categories');
  const positive = n => Number.isSafeInteger(n) && n > 0;
  if (!positive(p.max_attempts_per_window) || !positive(p.max_consecutive_failures ?? 3)) throw new Error('invalid_policy_limits');
  let end = 0;
  for (const w of p.windows) {
    const a = Date.parse(w.start), b = Date.parse(w.end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < end || b <= a || b > until || !/Z$|[+-]\d\d:\d\d$/.test(w.start) || !/Z$|[+-]\d\d:\d\d$/.test(w.end)) throw new Error('invalid_policy_windows');
    end = b;
  }
  if (p.trial && (p.trial.accept_unpaid_commercial_use !== true || !positive(p.trial.max_attempts))) throw new Error('invalid_trial_consent');
  return p;
}
export async function workerLock(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw new Error('unsafe_runtime_directory');
  const lock = resolve(directory, 'lock');
  const acquire = async () => { await mkdir(lock, { mode: 0o700 }); await atomic(resolve(lock,'owner.json'), { pid: process.pid }); };
  try { await acquire(); }
  catch(e) {
    if(e.code !== 'EEXIST') throw e;
    const recovery = resolve(directory,'recover-lock');
    try { await mkdir(recovery, { mode: 0o700 }); } catch { throw new Error('worker_busy_or_recovery_pending'); }
    try {
      const owner = await readState(resolve(lock,'owner.json'));
      if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('worker_lock_requires_inspection');
      try { process.kill(owner.pid, 0); throw new Error('worker_busy'); } catch (err) { if(err.code !== 'ESRCH') throw err; }
      await rm(lock,{recursive:true}); await acquire();
    } finally { await rm(recovery,{recursive:true}); }
  }
  return () => rm(lock,{recursive:true});
}
export async function stopContinuous(home) {
  await atomic(resolve(home,'continuous-stop.json'), { stopped_at: new Date().toISOString() });
  return { state:'stop_requested', next_action:'Persistent stop applies to all continuous Workers for this instance. Use a new explicitly authorized policy with resume_after_stop matching stopped_at to resume.' };
}
export async function runContinuous({ api, home, policy, signal, output=()=>{}, execute=workOnce, trialExecute=runTrial, now=Date.now, pollMs=5000 }) {
  validatePolicy(policy, api.base);
  const directory = resolve(home, `continuous-${policy.worker_id}`);
  const unlock = await workerLock(directory);
  const path = resolve(directory,'state.json');
  let state, watcher, busy=false;
  const abort = new AbortController(); const stop = () => abort.abort();
  signal?.addEventListener('abort',stop,{once:true}); if(signal?.aborted) stop();
  const persist = () => atomic(path,state);
  const transition = async reason => { if(state.status !== reason) { state.status=reason; await persist(); output({state:reason,worker_id:policy.worker_id}); } };
  const sleep = ms => new Promise(done => { const timer=setTimeout(finish,ms); function finish(){clearTimeout(timer);abort.signal.removeEventListener('abort',finish);done();} if(abort.signal.aborted) finish(); else abort.signal.addEventListener('abort',finish,{once:true}); });
  const stopped = async () => { const marker=await readState(resolve(home,'continuous-stop.json')); return marker.stopped_at && marker.stopped_at !== policy.resume_after_stop; };
  try {
    state=await readState(path,{ windows:{}, trial_attempts:0, failures:0 });
    const signature=fingerprint(policy);
    if(state.policy !== signature) { state.policy=signature; state.status='authorized'; state.failures=0; await persist(); }
    if(['paused_failures','paused_configuration','paused_unknown_outcome'].includes(state.status)) { output({state:state.status,worker_id:policy.worker_id}); return; }
    if(await stopped()) { await transition('stopped'); return; }
    watcher=setInterval(async()=>{ if(busy) return; busy=true; try { if(await stopped() || now()>=Date.parse(policy.expires_at)) stop(); } catch { stop(); } finally {busy=false;} },250);
    // Journal mutations before sending. Never replay execution after a crash.
    const durable = { base:api.base, request:async(route,body,key) => {
      if(body !== undefined && /\/(claim|submit|abort-unsafe)$/.test(route)) {
        state.pending={route,body,key:key||randomUUID()}; await persist();
        const result=await api.request(route,body,state.pending.key);
        if(route.endsWith('/claim') && result.state==='running') state.current={ id:result.id, epoch:result.epoch, trial:route.includes('/trials/') };
        state.pending=null; await persist(); return result;
      }
      return api.request(route,body,key);
    }};
    let networkFailures=0;
    while(!abort.signal.aborted) {
      if(await stopped()) { await transition('stopped'); break; }
      if(now()>=Date.parse(policy.expires_at)) { await transition('authorization_expired'); break; }
      try {
        // Reconcile a previously sent mutation with the same key, never start its model again.
        if(state.pending) {
          const p=state.pending;
          const result=await api.request(p.route,p.body,p.key);
          if(p.route.endsWith('/claim') && result.state==='running') state.current={id:result.id,epoch:result.epoch,trial:p.route.includes('/trials/')};
          state.pending=null; await persist();
        }
        if(state.current) {
          let task;
          if(state.current.trial) {
            const progress=await api.request(`/v1/trials?worker_id=${policy.worker_id}`);
            task=progress.runs.find(r=>r.id===state.current.id);
            if(!task) throw new Error('unknown_recovery_outcome');
          } else task=await api.request(`/v1/tasks/${state.current.id}`);
          if(task.state==='running' && (state.current.trial || task.epoch===state.current.epoch)) { await transition('waiting_lease_recovery'); await sleep(pollMs); continue; }
          state.current=null; await persist();
        }
        const w=policy.windows.find(w=>now()>=Date.parse(w.start)&&now()<Date.parse(w.end));
        if(!w) { state.active_window=null; await transition('outside_work_window'); if(policy.windows.every(w=>now()>=Date.parse(w.end))) break; await sleep(pollMs); continue; }
        state.active_window=w;
        const windowKey=`${w.start}/${w.end}`;
        if((state.windows[windowKey]||0)>=policy.max_attempts_per_window) { await transition('window_attempt_limit'); if(!policy.windows.some(next=>Date.parse(next.start)>=Date.parse(w.end))) break; await sleep(pollMs); continue; }
        const worker=(await api.request('/v1/workers')).workers.find(w=>w.id===policy.worker_id);
        if(!worker || worker.model!==policy.model || worker.suspended || worker.banned) { await transition('paused_configuration'); break; }
        const trial=!worker.qualified;
        if(trial && (!policy.trial || state.trial_attempts>=policy.trial.max_attempts)) { await transition('qualification_required'); break; }
        let task;
        if(!trial) {
          task=(await api.request(`/v1/queue?worker_id=${worker.id}`)).tasks.find(t=>t.model===policy.model && policy.categories.includes(t.category||'general_files'));
          if(!task) { networkFailures=0; await transition('idle'); await sleep(pollMs); continue; }
        }
        if(abort.signal.aborted || await stopped() || now()>=Date.parse(w.end) || now()>=Date.parse(policy.expires_at)) break;
        state.windows[windowKey]=(state.windows[windowKey]||0)+1;
        if(trial) state.trial_attempts++;
        await transition('working'); await persist();
        const attemptAbort=new AbortController(); const abortAttempt=()=>attemptAbort.abort();
        abort.signal.addEventListener('abort',abortAttempt,{once:true});
        if(abort.signal.aborted) abortAttempt();
        const windowTimer=setInterval(()=>{if(now()>=Date.parse(w.end)) abortAttempt();},100);
        try {
          const result=await (trial?trialExecute:execute)({api:durable,workerId:worker.id,taskId:task?.id,runDir:await mkdtemp(resolve(directory,'attempt-')),signal:attemptAbort.signal,onEvent:()=>{}});
          state.current=null; state.failures=0; networkFailures=0;
          await transition(result.state==='aborted_unsafe_prompt'?'security_stopped':trial && result.state!=='submitted'?result.state:'evidence_pending');
          await persist();
          if(trial && result.state!=='submitted') break;
        } catch(e) {
          if(attemptAbort.signal.aborted && !abort.signal.aborted) { await transition('outside_work_window'); continue; }
          state.failures++; await persist();
          if(state.failures >= (policy.max_consecutive_failures??3)) { await transition('paused_failures'); break; }
          throw e;
        } finally {clearInterval(windowTimer);abort.signal.removeEventListener('abort',abortAttempt);}
      } catch(e) {
        if(abort.signal.aborted) break;
        if(e.status && e.status<500 && e.status!==429 || e.message==='unknown_recovery_outcome') { await transition('paused_unknown_outcome'); break; }
        networkFailures++;
        await transition('retry_wait');
        await sleep(Math.min(60000,1000*2**Math.min(networkFailures,6))*(0.8+Math.random()*0.2));
      }
    }
    if(abort.signal.aborted) await transition(await stopped()?'stopped':now()>=Date.parse(policy.expires_at)?'authorization_expired':'stopped_or_window_closed');
  } finally { clearInterval(watcher); signal?.removeEventListener('abort',stop); await unlock(); }
}
