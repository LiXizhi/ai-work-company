import {resolve} from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {runCodex} from './run.mjs';
import {verifyConsumerPrompt} from '../backend/market.mjs';
import {workerLock,readState,atomic} from './continuous.mjs';
export async function freeWork({api,home,workerId,taskId,signal,execute=runCodex}){
 if(!/^worker_[a-f0-9-]{36}$/.test(workerId||'')||!/^free_[a-f0-9-]{36}$/.test(taskId||''))throw new Error('invalid_free_task_or_worker');
 const directory=resolve(home,'free-'+workerId),unlock=await workerLock(directory);const file=resolve(directory,'state.json');let state;const abort=new AbortController();const stop=()=>abort.abort();signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();let timer;
 try{
  state=await readState(file,{});
  if(state.pending){const p=state.pending;let value;try{value=await api.request(p.path,p.body,p.key);}catch(e){if(e.status>=400&&e.status<500&&e.status!==429){state.pending=null;await atomic(file,state);}throw e;}state.pending=null;state.previous={task:p.task,epoch:value.epoch};await atomic(file,state);return {state:'reconciled_without_reexecution',task:p.task};}
  if(state.previous){const t=await api.request('/v1/free-tasks/'+state.previous.task);if(t.state==='running')return {state:'waiting_lease_recovery',task:t.id};state.previous=null;await atomic(file,state);}
  const request=async(path,body)=>{state.pending={path,body,key:randomUUID(),task:taskId};await atomic(file,state);let value;try{value=await api.request(path,body,state.pending.key);}catch(e){if(e.status>=400&&e.status<500&&e.status!==429){state.pending=null;await atomic(file,state);}throw e;}state.pending=null;state.previous={task:taskId,epoch:value.epoch};await atomic(file,state);return value;};
  if(abort.signal.aborted)throw new Error('worker_stopped');
  const lease=await request(`/v1/free-tasks/${taskId}/claim`,{worker_id:workerId,public:true});
  if(!verifyConsumerPrompt({description:lease.description,system_prompt:'',category:'general_files'}).safe)throw new Error('unsafe_free_task_prompt');
  timer=setInterval(async()=>{try{await api.request(`/v1/free-tasks/${taskId}/heartbeat`,{epoch:lease.epoch});}catch{stop();}},15000);
  const result=await execute({base:api.base,lease,runDir:await mkdtemp(resolve(directory,'attempt-')),signal:abort.signal});if(abort.signal.aborted)throw new Error('worker_stopped');
  const submitted=await request(`/v1/free-tasks/${taskId}/submit`,{epoch:lease.epoch,result:result.result,public:true});state.previous=null;await atomic(file,state);return {state:'publicly_delivered',task:submitted.id,reward_minor:0};
 }finally{clearInterval(timer);signal?.removeEventListener('abort',stop);await unlock();}
}
