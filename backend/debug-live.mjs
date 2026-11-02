import {Fault,hash} from './store.mjs';
function enabled(s){if(!s.debug)throw new Fault(409,'isolated_debug_instance_required','Use the separate debug server.');}
export function debugStatus(s){
 if(!s.debug)return {enabled:false};
 return {enabled:true,minutes_per_simulated_second:60,seed_minor:10000,notice:'TEST ONLY: synthetic eligibility and evidence; real participant compute; no model certification.',
 wallets:s.all('SELECT id FROM accounts').map(a=>({id:a.id,...s.wallet(a.id)})),
 workers:s.all('SELECT id,name,model,qualified FROM workers'),
 tasks:s.all('SELECT id,title,state,source,result FROM tasks ORDER BY created_at DESC LIMIT 100').map(t=>({...t,result_sha256:hash(t.result||'')}))};
}
export function debugAction(s,action,b){
 enabled(s);
 const allowed={publish:['model'],qualify:['id','confirmed'],accept:['id','result_sha256','confirmed']}[action];
 if(!allowed||!b||Object.keys(b).length!==allowed.length||!allowed.every(k=>k in b))throw new Fault(400,'invalid_debug_fields','Invalid fields.');
 if(action==='publish'){
  const payer=s.one("SELECT id FROM accounts WHERE role='platform'");
  const t=s.createTask(payer.id,{title:'DEBUG 1+1 · 1 simulated second = 60 minutes',description:'Calculate 1+1. Return exactly 2. Isolated test credits only.',model:b.model,amount_minor:100,expected_minutes:60});
  // Explicit consumer fixture ONLY in a marked, isolated test database.
  s.run("UPDATE tasks SET source='consumer' WHERE id=?",t.id);
  return {...t,source:'consumer',debug:true};
 }
 if(b.confirmed!==true)throw new Fault(400,'debug_confirmation_required','Confirm test-only operation.');
 if(action==='qualify'){
  const w=s.one('SELECT * FROM workers WHERE id=?',b.id);if(!w)throw new Fault(404,'worker_not_found','Worker not found.');
  return s.qualifyWorker(w.id,{model:w.model,trial_reference_minor:2000,evidence_ref:'DEBUG-SYNTHETIC-ELIGIBILITY:'+w.id});
 }
 const t=s.one("SELECT * FROM tasks WHERE id=? AND owner IN (SELECT id FROM accounts WHERE role='platform')",b.id);
 if(!t||t.state!=='submitted'||hash(t.result)!==b.result_sha256||t.result.trim()!=='2')throw new Fault(409,'debug_result_mismatch','Review the submitted answer; expected exactly 2.');
 // One synthetic accounting token, never a claim of verified provider usage.
 s.reviewTask(t.id,{model:t.model,result_sha256:b.result_sha256,verified_tokens:1,evidence_ref:'DEBUG-ANSWER-ONLY-NOT-MODEL-PROOF:'+t.id});
 return s.accept(t.owner,t.id,{rating:5});
}
