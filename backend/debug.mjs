import {Store,hash,Fault,integer} from './store.mjs';

// Only this function owns the simulation database. No live Store or credentials enter it.
export function runDebug(body){
 if(!body||Object.keys(body).some(k=>!['seconds','minutes_per_second','source'].includes(k)))throw new Fault(400,'invalid_debug_fields','invalid_debug_fields');
 const seconds=integer(body.seconds,'seconds',1,10),scale=integer(body.minutes_per_second,'minutes_per_second',1,60);
 if(!['consumer','system'].includes(body.source))throw new Fault(400,'invalid_debug_source','invalid_debug_source');
 let now=Date.now();const s=new Store(':memory:',{now:()=>now,models:['debug-model']});
 try{
  const payer=s.provisionPlatform('SYNTHETIC debug employer',10000),owner=s.register('SYNTHETIC debug worker owner');
  let n=0;const change=(actor,fn)=>s.mutation(actor,'debug',String(++n),{},fn);
  const w=change(owner.account_id,()=>s.registerWorker(owner.account_id,{name:'SYNTHETIC 1+1 worker',model:'debug-model',accept_trial:true}));
  const usage={input_tokens:20000,cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:0};
  s.trials.configure({model:w.model,version:'synthetic-debug-v1',source:'SYNTHETIC TEST RATE; NOT PROVIDER PRICING',effective_at:new Date(now).toISOString(),rates:{input_tokens:1000000000,cached_input_tokens:1000000000,cache_write_input_tokens:1000000000,output_tokens:1000000000},credit_minor_per_usd:100});
  s.trials.template({model:w.model,title:'SYNTHETIC trial: 1+1',prompt:'1+1 = ?',max_tokens:20000});
  const trial=change(owner.account_id,()=>s.trials.claim(owner.account_id,w.id));
  change(owner.account_id,()=>s.trials.submit(owner.account_id,trial.id,{epoch:trial.epoch,result:'2',usage}));
  s.trials.review(trial.id,{decision:'approve',model:w.model,result_sha256:hash('2'),usage,evidence_ref:'synthetic:trial'});
  s.trials.graduate(w.id,'synthetic:graduation');
  const snapshot=()=>{const wallet=s.wallet(owner.account_id);return {qualifying_minutes:wallet.qualifying_minutes,trial_locked_minor:wallet.trial_locked_minor,earned_minor:wallet.available,spendable_minor:wallet.spendable_minor,locked_earnings_minor:wallet.locked_earnings_minor,can_hire:wallet.can_hire};};
  const timeline=[{simulated_seconds:0,event:'synthetic_trial_reviewed',...snapshot()}];
  for(let tick=1;tick<=seconds;tick++){
   const task=change(payer.account_id,()=>s.createTask(payer.account_id,{title:'SYNTHETIC 1+1',description:'1+1 = ?',model:w.model,amount_minor:100,expected_minutes:scale}));
   // Synthetic historical consumer source is confined to this throwaway fixture.
   // Production tasks never have a source override endpoint.
   if(body.source==='consumer')s.run("UPDATE tasks SET source='consumer' WHERE id=?",task.id);
   const lease=change(owner.account_id,()=>s.claim(owner.account_id,task.id,w.id));
   now+=1000; // No real waiting or provider call: one simulated second represents scale minutes.
   change(owner.account_id,()=>s.submit(owner.account_id,task.id,{epoch:lease.epoch,result:'2'}));
   s.reviewTask(task.id,{model:w.model,result_sha256:hash('2'),verified_tokens:1,evidence_ref:'synthetic:'+tick});
   const accept=()=>s.mutation(payer.account_id,'debug-accept',String(tick),{rating:5},()=>s.accept(payer.account_id,task.id,{rating:5}));accept();accept();
   timeline.push({simulated_seconds:tick,event:'synthetic_task_accepted',question:'1+1',result:'2',source:body.source,agreed_minutes:scale,payment_minor:100,...snapshot()});
  }
  const final=snapshot();let hire='blocked_by_120_minute_gate';
  if(final.can_hire){change(owner.account_id,()=>s.createTask(owner.account_id,{title:'SYNTHETIC hire after work',description:'2+2 = ?',model:w.model,amount_minor:100}));hire='created_and_reserved_100_minor';}
  return {debug:true,isolated:true,simulation:'in_memory_no_model_calls_no_real_wait',notice:'All tasks, evidence, prices, time and balances are synthetic. Never export to the real ledger or public activity.',minutes_per_second:scale,credit_minor_per_task:100,timeline,final,hire,conserved_minor:s.one('SELECT SUM(available+frozen) n FROM accounts').n,seed_minor:10000};
 }finally{s.close();}
}
