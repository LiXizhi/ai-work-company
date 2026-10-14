import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, parse } from '../cli/awc.mjs';
import { Store, hash } from '../backend/store.mjs';
import { createServer } from '../backend/server.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'awc-onboarding-'));
  const store = new Store(), server = createServer(store);
  await new Promise(done => server.listen(0,'127.0.0.1',done));
  t.after(async () => { await new Promise(done => server.close(done)); store.close(); });
  return { root, store, env: { AWC_BASE_URL: `http://127.0.0.1:${server.address().port}`, AWC_CLIENT_DIR: join(root,'client') } };
}
test('worker one-command onboarding preserves consent, zero balance and qualification gates', async t => {
  const { store, env } = await fixture(t); const output=[];
  const run = argv => main(argv,{ env, output: x=>output.push(x), runWorker: ()=>assert.fail('Unqualified worker executed') });
  await assert.rejects(run(['work']), /owner_trial_consent_required/);
  assert.equal(store.one('SELECT COUNT(*) n FROM accounts').n,0);
  await run(['work','--accept-trial']);
  assert.equal(output.at(-1).state,'qualification_required');
  await run(['work']);
  assert.equal(store.one('SELECT COUNT(*) n FROM workers').n,1);
  assert.equal(store.one('SELECT available FROM accounts').available,0);
  const instance=(await readdir(env.AWC_CLIENT_DIR))[0];
  assert.equal((await stat(join(env.AWC_CLIENT_DIR,instance,'account.json'))).mode & 0o777,0o600);
  assert.ok(!JSON.stringify(output).includes('token'));
});
test('hire snapshots selected input, recovers same request without duplicate freeze and requires explicit acceptance', async t => {
  const { root, store, env } = await fixture(t);
  const payer=store.provisionPlatform('Fixture',10000); env.AWC_TOKEN=payer.token;
  const input=join(root,'input'); await mkdir(input); await writeFile(join(input,'data.txt'),'hello');
  const output=[]; let consumer;
  const argv=['hire','--request','report-1','--input',input,'--task','Write output/report.txt','--budget','100'];
  const run= args => main(args,{env,output:x=>output.push(x),runConsumer:async opts=>{consumer=opts;return {state:'locally_stopped'};}});
  await run(argv); const id=output.find(x=>x.state==='published').task_id;
  assert.equal(store.wallet(payer.account_id).frozen,100);
  assert.ok(consumer.input.endsWith('snapshot/input'));
  await run(argv);
  assert.equal(store.one('SELECT COUNT(*) n FROM tasks').n,1);
  assert.equal(store.wallet(payer.account_id).frozen,100);
  await assert.rejects(run([...argv.slice(0,-1),'200']),/request_conflict/);
  await run(['status']);
  await run(['cancel','--id',id]);
  assert.equal(store.wallet(payer.account_id).available,10000);
  await run(['cancel','--id',id]);
  assert.equal(store.wallet(payer.account_id).available,10000);
});
test('hire does not mint credits, publish on bad input or expose client credentials', async t => {
  const { root,store,env } = await fixture(t); const output=[];
  const input=join(root,'input'); await mkdir(input);
  const args=['hire','--request','a','--input',input,'--task','Test','--budget','100'];
  await main(args,{env,output:x=>output.push(x)});
  assert.equal(output.at(-1).state,'funding_required');
  assert.equal(store.one('SELECT COUNT(*) n FROM tasks').n,0);
  await assert.rejects(main(['hire','--request','b','--input',root,'--task','Test','--budget','100'],{env,output:()=>{}}),/credentials/);
  const profile=(await readdir(env.AWC_CLIENT_DIR))[0];
  await assert.rejects(main(['hire','--request','c','--input',join(env.AWC_CLIENT_DIR,profile),'--task','Test','--budget','100'],{env,output:()=>{}}),/credentials/);
  assert.throws(()=>parse(['hire','--budget','1','--budget','2']),/invalid_option/);
});
test('qualified worker uses saved identity, runs only one job and returns idle without supply', async t => {
  const { store,env }=await fixture(t); const out=[];
  await main(['work','--accept-trial'],{env,output:x=>out.push(x)});
  const w=store.one('SELECT * FROM workers');
  store.qualifyWorker(w.id,{model:w.model,trial_reference_minor:2000,evidence_ref:'synthetic:onboarding'});
  await main(['work'],{env,output:x=>out.push(x)}); assert.equal(out.at(-1).state,'idle');
  const payer=store.provisionPlatform('Fixture',10000);
  store.mutation(payer.account_id,'fixture','1',{},()=>store.createTask(payer.account_id,{title:'Test',description:'Test',model:w.model,amount_minor:100}));
  let calls=0;
  await main(['work'],{env,output:x=>out.push(x),runWorker:async options=>{ calls++; assert.equal(options.workerId,w.id); return {task:options.taskId}; }});
  assert.equal(calls,1); assert.equal(out.at(-1).state,'submitted');
});

test('explicit CLI acceptance requires reviewed evidence and pays once', async t => {
  const { store,env } = await fixture(t);
  const payer=store.provisionPlatform('Fixture',10000), owner=store.register('Fixture worker');
  env.AWC_TOKEN=payer.token;
  let n=0; const change=fn=>store.mutation(owner.account_id,'fixture',String(++n),{},fn);
  const w=change(()=>store.registerWorker(owner.account_id,{name:'Fixture',model:'gpt-6-astra',accept_trial:true}));
  store.qualifyWorker(w.id,{model:w.model,trial_reference_minor:2000,evidence_ref:'synthetic:cli-trial'});
  const job=change(()=>store.createTask(payer.account_id,{title:'Fixture',description:'Fixture',model:w.model,amount_minor:100}));
  const lease=change(()=>store.claim(owner.account_id,job.id,w.id));
  change(()=>store.submit(owner.account_id,job.id,{epoch:lease.epoch,result:'Fixture result'}));
  const args=['accept','--id',job.id,'--rating','5'];
  await assert.rejects(main(args,{env,output:()=>{}}),/evidence_pending/);
  store.reviewTask(job.id,{model:w.model,result_sha256:hash('Fixture result'),verified_tokens:100,evidence_ref:'synthetic:cli-review'});
  await main(args,{env,output:()=>{}}); await main(args,{env,output:()=>{}});
  assert.equal(store.wallet(owner.account_id).available,100);
  assert.equal(store.wallet(payer.account_id).frozen,0);
});
