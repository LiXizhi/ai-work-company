import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { runContinuous, stopContinuous, validatePolicy, workerLock, readState, atomic } from '../worker/continuous.mjs';
const wid='worker_00000000-0000-0000-0000-000000000001';
function policy(now=Date.now()) { return {version:1,server:'http://localhost:5003',worker_id:wid,model:'fixture',expires_at:new Date(now+10000).toISOString(),windows:[{start:new Date(now-1000).toISOString(),end:new Date(now+10000).toISOString()}],categories:['general_files'],max_attempts_per_window:2}; }
async function fixture() {
  const home=await mkdtemp(resolve(tmpdir(),'awc-continuous-')); const p=policy(); let count=0; const tasks=new Map();
  const api={base:p.server,request:async(path,body)=>{
    if(path==='/v1/workers') return {workers:[{id:wid,model:p.model,qualified:true}]};
    if(path.startsWith('/v1/queue')) return {tasks:[{id:`task_${++count}`,model:p.model,category:'general_files'}]};
    if(path.endsWith('/claim')) {const id=path.split('/')[3];const t={id,state:'running',epoch:1};tasks.set(id,t);return t;}
    if(path.endsWith('/submit')) {const t=tasks.get(path.split('/')[3]);t.state='submitted';return t;}
    if(tasks.has(path.split('/')[3]))return tasks.get(path.split('/')[3]);
    throw new Error(path);
  }};
  const execute=async({api,taskId})=>{await api.request(`/v1/tasks/${taskId}/claim`,{worker_id:wid});await api.request(`/v1/tasks/${taskId}/submit`,{epoch:1,result:'synthetic'});return {};};
  return {home,policy:p,api,execute,pollMs:1};
}
test('continuous multiple submissions and persisted attempt cap survive restart',async()=>{
  const f=await fixture();await runContinuous(f);let s=await readState(resolve(f.home,`continuous-${wid}/state.json`));assert.equal(s.status,'window_attempt_limit');assert.equal(Object.values(s.windows)[0],2);assert.equal(s.pending,null);
  await runContinuous({...f,execute:()=>assert.fail('restarted spent allowance')});
});
test('persistent stop blocks startup and terminates active execution',async()=>{
  const f=await fixture();let started=false;
  await runContinuous({...f,execute:async({signal})=>{started=true;await stopContinuous(f.home);await new Promise(done=>signal.addEventListener('abort',done,{once:true}));throw new Error('stopped');}});
  assert.ok(started);assert.equal((await readState(resolve(f.home,`continuous-${wid}/state.json`))).status,'stopped');
  await runContinuous({...f,execute:()=>assert.fail('stop must survive restart')});
});
test('single Worker lock rejects competing runner',async()=>{const f=await fixture();const dir=resolve(f.home,'worker');const release=await workerLock(dir);try{await assert.rejects(workerLock(dir),/worker_busy/);}finally{await release();}});
test('policy rejects overlapping windows, unbounded trials, mismatched origin',()=>{
  const p=policy();assert.throws(()=>validatePolicy(p,'https://other.example'),/invalid_policy/);
  assert.throws(()=>validatePolicy({...p,trial:{max_attempts:10}},p.server),/trial_consent/);
  assert.throws(()=>validatePolicy({...p,windows:[p.windows[0],p.windows[0]]},p.server),/windows/);
});
test('expiry and qualification prevent execution',async()=>{const f=await fixture();await runContinuous({...f,now:()=>Date.parse(f.policy.expires_at),execute:()=>assert.fail()});assert.equal((await readState(resolve(f.home,`continuous-${wid}/state.json`))).status,'authorization_expired');});
test('response loss replays durable submission key without rerunning model',async()=>{
  const f=await fixture();f.policy.max_attempts_per_window=1;const keys=[];const original=f.api.request;let lost=false;
  f.api.request=async(path,body,key)=>{if(path.endsWith('/submit')){keys.push(key);const result=await original(path,body);if(!lost){lost=true;throw new Error('network');}return result;}return original(path,body,key);};
  const a=new AbortController();let runs=0;
  await runContinuous({...f,signal:a.signal,execute:async args=>{runs++;try{return await f.execute(args);}catch(e){a.abort();throw e;}}});
  await runContinuous({...f,execute:()=>assert.fail('must not rerun model')});
  assert.equal(runs,1);assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
});
test('stale running lease is inspected before any new execution',async()=>{
  const f=await fixture();const dir=resolve(f.home,`continuous-${wid}`);const release=await workerLock(dir);await atomic(resolve(dir,'state.json'),{windows:{},trial_attempts:0,failures:0,current:{id:'task_old',epoch:1}});await release();
  const original=f.api.request;const controller=new AbortController();f.api.request=async(path,body,key)=>{if(path==='/v1/tasks/task_old'){controller.abort();return {state:'running',epoch:1};}return original(path,body,key);};
  await runContinuous({...f,signal:controller.signal,execute:()=>assert.fail('replayed old lease')});
});

test('idle waits without duplicate notifications; unauthorized workers cannot execute',async()=>{
  const f=await fixture();const abort=new AbortController();let reads=0,events=[];const original=f.api.request;
  f.api.request=async(path,body,key)=>{if(path.startsWith('/v1/queue')){if(++reads===3)abort.abort();return {tasks:[]};}return original(path,body,key);};
  await runContinuous({...f,signal:abort.signal,output:e=>events.push(e.state),execute:()=>assert.fail()});assert.equal(events.filter(e=>e==='idle').length,1);
  const second=await fixture();second.api.request=async()=>({workers:[{id:wid,model:'fixture',qualified:false}]});await runContinuous({...second,execute:()=>assert.fail(),trialExecute:()=>assert.fail()});assert.equal((await readState(resolve(second.home,`continuous-${wid}/state.json`))).status,'qualification_required');
});
test('failure threshold latches across restart and auth errors fail closed',async()=>{
  const f=await fixture();f.policy.max_consecutive_failures=1;await runContinuous({...f,execute:async()=>{throw new Error('adapter failure');}});
  assert.equal((await readState(resolve(f.home,`continuous-${wid}/state.json`))).status,'paused_failures');await runContinuous({...f,execute:()=>assert.fail()});
  const second=await fixture();second.api.request=async()=>{throw Object.assign(new Error('unauthorized'),{status:401});};await runContinuous(second);assert.equal((await readState(resolve(second.home,`continuous-${wid}/state.json`))).status,'paused_unknown_outcome');
});
test('window ending aborts execution, never claims outside authorized window',async()=>{
  const f=await fixture();let clock=Date.now();f.now=()=>clock;
  await runContinuous({...f,execute:async({signal})=>{clock=Date.parse(f.policy.windows[0].end);await new Promise(done=>signal.addEventListener('abort',done,{once:true}));throw new Error('window closed');}});
  assert.ok(['outside_work_window','authorization_expired'].includes((await readState(resolve(f.home,`continuous-${wid}/state.json`))).status));
});
test('real HTTP control plane supports continuous synthetic submissions without settlement',async t=>{
  const {Store}=await import('../backend/store.mjs');const {createServer}=await import('../backend/server.mjs');const {Api}=await import('../worker/client.mjs');
  const store=new Store();const server=createServer(store);await new Promise(done=>server.listen(0,'127.0.0.1',done));t.after(async()=>{await new Promise(done=>server.close(done));store.close();});
  const owner=store.register('Synthetic continuous owner');const employer=store.provisionPlatform('Synthetic employer',1000);
  const api=new Api(`http://127.0.0.1:${server.address().port}`,owner.token);const payer=new Api(api.base,employer.token);
  const worker=await api.request('/v1/workers',{name:'Synthetic worker',model:'gpt-6-astra',accept_trial:true});store.qualifyWorker(worker.id,{model:worker.model,trial_reference_minor:2000,evidence_ref:'synthetic:continuous'});
  for(let i=0;i<2;i++)await payer.request('/v1/tasks',{title:'Synthetic task',description:'Synthetic input',model:worker.model,amount_minor:100});
  const f=await fixture();f.api=api;f.policy={...f.policy,server:api.base,worker_id:worker.id,model:worker.model};
  f.execute=async({api,taskId})=>{const lease=await api.request(`/v1/tasks/${taskId}/claim`,{worker_id:worker.id});await api.request(`/v1/tasks/${taskId}/submit`,{epoch:lease.epoch,result:'Synthetic only'});return {};};
  await runContinuous(f);assert.equal(store.one("SELECT COUNT(*) n FROM tasks WHERE state='submitted'").n,2);assert.equal(store.wallet(owner.account_id).available,0);assert.equal(store.wallet(employer.account_id).frozen,200);
});
