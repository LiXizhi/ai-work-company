import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Store, hash } from '../backend/store.mjs';
import { createServer } from '../backend/server.mjs';
import { readFileSync } from 'node:fs';
async function fixture(t,enabled=true){
  const store=new Store(),token=randomBytes(32).toString('hex'),server=createServer(store,{adminToken:enabled?token:null});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  t.after(async()=>{await new Promise(done=>server.close(done));store.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,{body,key=randomUUID(),secret=token,origin=base}={})=>{
    const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(secret?{Authorization:'Bearer '+secret}:{}),...(origin?{Origin:origin}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':key})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,value:await r.json()};
  };return {store,token,base,request};
}
const counts=n=>({input_tokens:n,cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:0});
const price=()=>({model:'gpt-6-astra',version:'SYNTHETIC-price',source:'TEST ONLY',effective_at:'2026-01-01T00:00:00Z',rates:{input_tokens:1000000000,cached_input_tokens:1000000000,cache_write_input_tokens:1000000000,output_tokens:1000000000},credit_minor_per_usd:100});
test('admin is separate from accounts, denies missing/cross-origin auth and does not ship with Pages',async t=>{
  const {store,request,base,token}=await fixture(t);
  for(const secret of ['',store.register('Worker').token,'awct_fake'])assert.equal((await request('/admin/api/workers',{secret})).status,401);
  assert.equal((await request('/admin/api/models',{body:price(),origin:'https://evil.example'})).status,403);
  assert.equal((await request('/admin/api/models',{body:price(),origin:null})).status,403);
  assert.equal(store.one('SELECT COUNT(*) n FROM model_prices').n,0);
  const page=await fetch(base+'/admin/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(page.headers.get('cache-control'),'no-store');assert.ok(!(await page.text()).includes(token));
  const js=await (await fetch(base+'/admin/app.js')).text();assert.ok(!/innerHTML|localStorage|sessionStorage/.test(js));
  const build=readFileSync(new URL('../scripts/build-site.mjs',import.meta.url),'utf8');assert.ok(!build.includes("'admin'"));
});
test('admin remains disabled without separate configured secret',async t=>{
  const {request}=await fixture(t,false);assert.equal((await request('/admin/api/overview')).status,503);
});
test('admin model/template writes are atomic, audited, validated and replayable',async t=>{
  const {store,request}=await fixture(t);
  const body=price();for(let i=0;i<2;i++)assert.equal((await request('/admin/api/models',{body,key:'price-once'})).status,200);
  assert.equal(store.one('SELECT COUNT(*) n FROM model_prices').n,1);assert.equal(store.one('SELECT COUNT(*) n FROM admin_audit').n,1);
  assert.equal((await request('/admin/api/models',{body:{...body,version:'changed'},key:'price-once'})).value.error.code,'idempotency_conflict');
  assert.equal((await request('/admin/api/models',{body:{...body,version:'bad',rates:{...body.rates,input_tokens:-1}}})).status,400);
  store.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON admin_audit BEGIN SELECT RAISE(ABORT,'test audit failure'); END;");
  assert.equal((await request('/admin/api/models',{body:{...body,version:'rollback'}})).status,500);
  assert.equal(store.one('SELECT version FROM model_prices WHERE version=?','rollback'),undefined);store.db.exec('DROP TRIGGER fail_audit');
  const task={model:body.model,title:'<img src=x onerror=alert(1)>',prompt:'Untrusted task text',max_tokens:20000};
  const created=await request('/admin/api/templates',{body:task,key:'template-once'});assert.equal(created.status,200);
  assert.equal((await request('/admin/api/templates',{body:task,key:'template-once'})).value.id,created.value.id);
  assert.equal((await request('/admin/api/templates/disable',{body:{id:created.value.id}})).status,200);
  assert.equal((await request('/admin/api/models/disable',{body:{model:body.model}})).status,200);assert.ok(!store.models.includes(body.model));
  assert.throws(()=>store.run('DELETE FROM admin_audit'),/append-only/);
});
test('review and graduation UI API preserve evidence, independent confirmation, quotas and zero wages',async t=>{
  const {store,request}=await fixture(t);await request('/admin/api/models',{body:price()});
  await request('/admin/api/templates',{body:{model:'gpt-6-astra',title:'Fixture',prompt:'Fixture',max_tokens:20000}});
  const a=store.register('Fixture owner');let n=0;const change=fn=>store.mutation(a.account_id,'fixture',String(++n),{},fn);
  const w=change(()=>store.registerWorker(a.account_id,{name:'Fixture Worker',model:'gpt-6-astra',accept_trial:true}));
  const trial=change(()=>store.trials.claim(a.account_id,w.id));change(()=>store.trials.submit(a.account_id,trial.id,{epoch:1,result:'<script>untrusted</script>',usage:counts(20000)}));
  const details=(await request('/admin/api/trials/'+trial.id)).value;assert.equal(details.result_sha256,hash('<script>untrusted</script>'));assert.equal(details.reported_usage.input_tokens,20000);
  const path='/admin/api/workers/'+w.id+'/graduate';assert.equal((await request(path,{body:{reference:'early',confirmed:true}})).value.error.code,'trial_incomplete');
  const review={decision:'approve',model:w.model,result_sha256:details.result_sha256,usage:counts(20000),evidence_ref:'independent-fixture',confirmed:false};
  const rp='/admin/api/trials/'+trial.id+'/review';assert.equal((await request(rp,{body:review})).value.error.code,'independent_review_required');review.confirmed=true;
  for(let i=0;i<2;i++)assert.equal((await request(rp,{body:review,key:'review-once'})).status,200);
  const worker=(await request('/admin/api/workers/'+w.id)).value;assert.equal(worker.progress.approved_usd_micro,20000000);assert.equal(worker.usage.reviewed.input_tokens,20000);
  for(let i=0;i<2;i++)assert.equal((await request(path,{body:{reference:'final-fixture',confirmed:true},key:'graduate-once'})).status,200);
  assert.equal(store.worker(a.account_id,w.id).qualified,1);assert.equal(store.wallet(a.account_id).available,0);
  assert.equal((await request('/admin/api/trials?state=approved&worker_id='+w.id)).value.items.length,1);
  assert.equal(store.one('SELECT COUNT(*) n FROM admin_audit').n,4);
});
