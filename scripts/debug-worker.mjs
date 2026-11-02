import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {Api,identifier} from '../worker/client.mjs';
import {workOnce} from '../worker/run.mjs';
process.umask(0o077);
const base='http://127.0.0.1:5005',root=resolve('data/debug-worker');
const capabilities=await (await fetch(base+'/v1/capabilities')).json();
if(!capabilities.debug||capabilities.ledger_scope!=='isolated_test_only')throw Error('isolated_debug_instance_required');
mkdirSync(root,{recursive:true,mode:0o700});const path=resolve(root,'identity.json');
const [command='register',taskId]=process.argv.slice(2);
if(!['register','work','hire','status'].includes(command))throw Error('Usage: debug:worker register|work [task_id]|hire|status');
let identity;
if(existsSync(path))identity=JSON.parse(readFileSync(path,'utf8'));
else {
 if(command!=='register')throw Error('Run register first.');
 const response=await fetch(base+'/v1/accounts',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'debug-worker-register'},body:JSON.stringify({name:'Debug real Worker owner'})});
 if(!response.ok)throw Error('registration_failed');identity=await response.json();
 writeFileSync(path,JSON.stringify(identity),{mode:0o600,flag:'wx'});
}
const api=new Api(base,identity.token);
if(!identity.worker){identity.worker=await api.request('/v1/workers',{name:'Debug real Worker',model:'gpt-6-astra',accept_trial:true},'debug-worker-register');writeFileSync(path,JSON.stringify(identity),{mode:0o600});}
if(command==='register')console.log(JSON.stringify({worker_id:identity.worker.id,next:'Grant test eligibility in the isolated admin Debug panel.'}));
if(command==='status')console.log(JSON.stringify(await api.request('/v1/me')));
if(command==='work'){
 if(!taskId)throw Error('Task ID required; one actual model call only.');
 identifier(taskId);
 const abort=new AbortController();
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>abort.abort());
 const result=await workOnce({api,workerId:identity.worker.id,taskId,runDir:resolve(root,'runs',taskId),signal:abort.signal});
 console.log(JSON.stringify({task:result.task,result:result.result,usage:result.usage,evidence_kind:result.evidence_kind}));
}
if(command==='hire')console.log(JSON.stringify(await api.request('/v1/tasks',{title:'DEBUG earned-credit hire',description:'Calculate 2+2. Return exactly 4.',model:'gpt-6-astra',amount_minor:100,expected_minutes:1},'debug-earned-hire-v1')));
