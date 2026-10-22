import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, hash } from '../backend/store.mjs';
import { usageValue } from '../backend/trials.mjs';
import { createServer } from '../backend/server.mjs';
import { Api } from '../worker/client.mjs';
import { runTrial, normalizeUsage } from '../worker/trial.mjs';
import { main } from '../cli/awc.mjs';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const counts=n=>({input_tokens:n,cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:0});
function price(version='fixture-v1',rate=1000000000) { return { model:'gpt-6-astra',version,source:'SYNTHETIC TEST PRICE, NOT PROVIDER PRICE',effective_at:'2026-01-01T00:00:00Z',rates:{input_tokens:rate,cached_input_tokens:rate,cache_write_input_tokens:rate,output_tokens:rate},credit_minor_per_usd:100 }; }
function fixture() { let now=Date.now();const s=new Store(':memory:',{now:()=>now});const a=s.register('Trial owner');let seq=0;const change=fn=>s.mutation(a.account_id,'test',String(++seq),{},fn);const w=change(()=>s.registerWorker(a.account_id,{name:'Trial',model:'gpt-6-astra',accept_trial:true}));s.trials.configure(price());s.trials.template({model:w.model,title:'Company work',prompt:'Summarize this fixture.',max_tokens:20000});return {s,a,w,change,advance:()=>{now+=61000;}}; }
function review(s,r,n=20000,decision='approve',ref=r.id) { return s.trials.review(r.id,{model:r.model,result_sha256:hash('Output'),usage:counts(n),decision,evidence_ref:ref}); }
test('exact token category arithmetic and credit conversion reject invalid counters',()=>{
  const p=price('mixed');p.rates={input_tokens:2000000,cached_input_tokens:500000,cache_write_input_tokens:2500000,output_tokens:10000000};
  assert.equal(usageValue(p,{input_tokens:100,cached_input_tokens:100,cache_write_input_tokens:100,output_tokens:100}).usd_micro,1500);
  assert.equal(usageValue(p,counts(1)).credit_minor,1);
  assert.throws(()=>usageValue(p,{...counts(1),extra:1})); assert.throws(()=>usageValue(p,counts(-1)));assert.throws(()=>usageValue(p,counts(1.5)));
  assert.deepEqual(normalizeUsage({input_tokens:100,cached_input_tokens:20,cache_write_input_tokens:0,output_tokens:3}),{input_tokens:80,cached_input_tokens:20,cache_write_input_tokens:0,output_tokens:3});
  assert.throws(()=>normalizeUsage({input_tokens:1,cached_input_tokens:2,output_tokens:1}));
});
test('trial reservations cap total exposure, review binds result, final approval unlocks paid queue without wages',()=>{
  const {s,a,w,change}=fixture();try {
    assert.throws(()=>s.queue(a.account_id,w.id));
    const r=change(()=>s.trials.claim(a.account_id,w.id));assert.equal(r.reserved,20000000);
    assert.throws(()=>change(()=>s.trials.claim(a.account_id,w.id)),/worker_busy/);
    assert.throws(()=>change(()=>s.trials.submit(a.account_id,r.id,{epoch:1,result:'Output',usage:counts(20001)})),/trial_budget_exceeded/);
    change(()=>s.trials.submit(a.account_id,r.id,{epoch:1,result:'Output',usage:counts(20000)}));
    assert.equal(s.trials.progress(a.account_id,w.id).approved_usd_micro,0);
    assert.equal(change(()=>s.trials.claim(a.account_id,w.id)).state,'review_required');
    assert.throws(()=>s.trials.graduate(w.id,'early'),/trial_incomplete/);
    assert.throws(()=>s.trials.review(r.id,{model:r.model,result_sha256:'forged',usage:counts(20000),decision:'approve',evidence_ref:'bad'}),/evidence_mismatch/);
    s.trials.configure(price('fixture-v2',500000000));
    assert.equal(review(s,r).approved_usd_micro,20000000); // locked original price
    assert.throws(()=>review(s,r),/invalid_trial_state/);
    s.trials.graduate(w.id,'final-review');assert.deepEqual(s.queue(a.account_id,w.id),[]);
    assert.equal(s.wallet(a.account_id).available,0); assert.equal(s.one('SELECT COUNT(*) n FROM ledger').n,0);
    assert.equal(s.wallet(a.account_id).trial_locked_minor,2000);
    assert.equal(s.wallet(a.account_id).spendable_minor,0);
    assert.equal(s.trials.progress(a.account_id,w.id).trial_locked_minor,2000);
    assert.throws(()=>change(()=>s.trials.claim(a.account_id,w.id)),/trial_not_eligible/);
  }finally{s.close();}
});
test('unknown expired work holds exposure; rejected work consumes quota; model disable revokes trial',()=>{
  const {s,a,w,change,advance}=fixture();try {
    const r=change(()=>s.trials.claim(a.account_id,w.id));advance();s.sweep();
    assert.equal(s.trials.progress(a.account_id,w.id).reserved_usd_micro,20000000);
    assert.throws(()=>change(()=>s.trials.submit(a.account_id,r.id,{epoch:1,result:'Output',usage:counts(1)})),/lease_expired/);
    s.trials.review(r.id,{model:r.model,result_sha256:hash(''),usage:counts(20000),decision:'reject',evidence_ref:'expired-usage'});
    assert.equal(change(()=>s.trials.claim(a.account_id,w.id)).state,'trial_budget_exhausted');
    assert.throws(()=>s.trials.graduate(w.id,'bad'),/trial_incomplete/);
    s.trials.disable(w.model); assert.ok(!s.models.includes(w.model));
    assert.throws(()=>change(()=>s.trials.claim(a.account_id,w.id)),/model_not_allowed/);
  }finally{s.close();}
});
test('HTTP trial adapter and one-command Worker progress to reviewed qualification; no self-review or cross-owner access',async t=>{
  const {s,a,w}=fixture(),server=createServer(s);await new Promise(done=>server.listen(0,'127.0.0.1',done));
  t.after(async()=>{await new Promise(done=>server.close(done));s.close();});
  const base=`http://127.0.0.1:${server.address().port}`,api=new Api(base,a.token),other=new Api(base,s.register('Other').token);
  const output=[];
  await main(['work','--trial-tasks','2'],{env:{AWC_BASE_URL:base,AWC_TOKEN:a.token,AWC_CLIENT_DIR:join(await mkdtemp(join(tmpdir(),'awc-trial-')),'client')},output:x=>output.push(x),trialRunner:opts=>runTrial({...opts,execute:async()=>({result:'Output',usage:{input_tokens:20000,output_tokens:0}})})});
  assert.ok(output.some(x=>x.trial_state==='submitted'));assert.equal(output.at(-1).trial_state,'review_required');
  const r=s.one('SELECT * FROM trial_runs');
  await assert.rejects(other.request(`/v1/trials?worker_id=${w.id}`));
  await assert.rejects(api.request('/v1/admin/review-trial',{id:r.id}));
  await assert.rejects(api.request(`/v1/trials/${r.id}/submit`,{epoch:1,result:'Changed',usage:counts(20000)}));
  review(s,r);s.trials.graduate(w.id,'independent-final');
  assert.equal((await api.request(`/v1/trials?worker_id=${w.id}`)).qualified,true);
  assert.equal((await api.request('/v1/models')).models.find(m=>m.model===w.model).price.version,'fixture-v1');
  assert.equal((await api.request('/v1/quote',{model:w.model,usage:counts(1000)})).usd_micro,1000000);
  await assert.rejects(api.request('/v1/quote',{model:w.model,usage:counts(1000),rates:{}}));
});

test('model policy and immutable price history persist across process connections',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'awc-prices-')),path=join(dir,'db.sqlite');
  let s=new Store(path); s.trials.configure(price());s.trials.disable('gpt-6-astra');s.close();
  s=new Store(path,{models:['gpt-6-astra','UNREQUESTED']});try {
    assert.ok(!s.models.includes('gpt-6-astra'));assert.ok(!s.models.includes('UNREQUESTED'));
    assert.equal(s.trials.price('fixture-v1').rates.input_tokens,1000000000);
    assert.throws(()=>s.run("UPDATE model_prices SET body='{}'"),/immutable/);
    assert.throws(()=>s.trials.configure(price()),/duplicate_price_version/);
    s.trials.configure(price('reenabled'));assert.ok(s.models.includes('gpt-6-astra'));
  }finally{s.close();}
});
test('suspension blocks old trial leases and recorded rejected overrun prevents more unpaid work',()=>{
  const {s,a,w,change}=fixture();try {
    const r=change(()=>s.trials.claim(a.account_id,w.id));s.suspend(w.id);
    assert.throws(()=>change(()=>s.trials.heartbeat(a.account_id,r.id,1)),/lease_expired/);
    assert.equal(s.trials.progress(a.account_id,w.id).reserved_usd_micro,20000000);
    s.trials.review(r.id,{model:r.model,result_sha256:hash(''),usage:counts(21000),decision:'reject',evidence_ref:'actual-overrun'});
    assert.equal(s.trials.progress(a.account_id,w.id).rejected_usd_micro,21000000);
    assert.equal(s.trials.progress(a.account_id,w.id).remaining_usd_micro,0);
    assert.throws(()=>s.trials.graduate(w.id,'no'),/invalid_worker/);
  }finally{s.close();}
});

test('same work invocation transitions to paid task after independent graduation',async t=>{
  const {s,a,w}=fixture(),server=createServer(s);await new Promise(done=>server.listen(0,'127.0.0.1',done));
  t.after(async()=>{await new Promise(done=>server.close(done));s.close();});
  const company=s.provisionPlatform('Fixture employer',1000);
  const job=s.mutation(company.account_id,'fixture','paid',{},()=>s.createTask(company.account_id,{title:'Paid next',description:'Test',model:w.model,amount_minor:100}));
  let paid=0;
  await main(['work'],{env:{AWC_BASE_URL:`http://127.0.0.1:${server.address().port}`,AWC_TOKEN:a.token,AWC_CLIENT_DIR:join(await mkdtemp(join(tmpdir(),'awc-graduate-')),'client')},output:()=>{},trialRunner:async opts=>{
    const result=await runTrial({...opts,execute:async()=>({result:'Output',usage:{input_tokens:20000,output_tokens:0}})});
    const r=s.one('SELECT * FROM trial_runs WHERE id=?',result.id);review(s,r);s.trials.graduate(w.id,'separate-final-review');return result;
  },runWorker:async opts=>{paid++;assert.equal(opts.taskId,job.id);return {task:job.id};}});
  assert.equal(paid,1);assert.equal(s.wallet(a.account_id).available,0);
});
