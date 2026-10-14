import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Store, hash } from '../backend/store.mjs';
import { createServer } from '../backend/server.mjs';
import { main } from '../cli/awc.mjs';

await mkdir('data',{recursive:true});const root=await mkdtemp(resolve('data/trial-live-'));
const s=new Store(resolve(root,'trial.sqlite')), server=createServer(s);
await new Promise(done=>server.listen(0,'127.0.0.1',done));
try {
  s.trials.configure({model:'gpt-6-astra',version:'synthetic-smoke-v1',source:'FICTIONAL test rates; not actual provider prices',effective_at:'2026-01-01T00:00:00Z',rates:{input_tokens:1000000,cached_input_tokens:1000000,cache_write_input_tokens:1000000,output_tokens:1000000},credit_minor_per_usd:100});
  s.trials.template({model:'gpt-6-astra',title:'Synthetic integration trial',prompt:'Return exactly TRIAL_READY as the result. This is a synthetic integration test, not real commercial work.',max_tokens:100000});
  const events=[];
  await main(['work','--accept-trial','--trial-tasks','1'],{env:{AWC_BASE_URL:`http://127.0.0.1:${server.address().port}`,AWC_CLIENT_DIR:resolve(root,'client')},output:e=>{events.push(e);console.log(JSON.stringify(e));}});
  const run=s.one('SELECT * FROM trial_runs'); assert.equal(run.state,'submitted');assert.equal(run.result,'TRIAL_READY');
  const worker=s.one('SELECT * FROM workers');assert.equal(worker.qualified,0);
  assert.equal(s.trials.progress(worker.owner,worker.id).approved_usd_micro,0);
  const usage=JSON.parse(run.reported_usage);
  const reviewed=s.trials.review(run.id,{decision:'approve',model:run.model,result_sha256:hash(run.result),usage,evidence_ref:'LOCAL-TEST-CLI-OBSERVATION-NOT-PROVIDER-ATTESTATION'});
  assert.ok(reviewed.approved_usd_micro>0 && reviewed.approved_usd_micro<19750000);assert.equal(s.wallet(worker.owner).available,0);
  const report={timestamp:new Date().toISOString(),fixture:'Real Codex call, synthetic prompt and fictional price; local test observation only, not provider-certified usage or completion of $20 trial.',model:run.model,raw_usage:events.find(e=>e.raw_usage)?.raw_usage,normalized_usage:usage,result:run.result,price:JSON.parse(run.price),progress:reviewed,trial_income_minor:0};
  await writeFile(resolve(root,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:true,report:resolve(root,'report.json')}));
} finally {await new Promise(done=>server.close(done));s.close();}
