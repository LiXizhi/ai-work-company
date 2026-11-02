import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store,hash} from '../backend/store.mjs';
import {adminPost,initAdmin} from '../backend/admin-web.mjs';

test('persistent debug ledger rejects mode mixing in both directions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'awc-debug-'));
 try{const p=join(dir,'test.db');let s=new Store(p,{debug:true});s.close();assert.throws(()=>new Store(p),/mode_mismatch/);s=new Store(p,{debug:true});s.close();const q=join(dir,'normal.db');s=new Store(q);s.close();assert.throws(()=>new Store(q,{debug:true}),/mode_mismatch/);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('debug actual protocol settles two submissions then spends earned credits without minting',()=>{
 const s=new Store(':memory:',{debug:true});initAdmin(s);let n=0;
 const action=(a,b,key=String(++n))=>adminPost(s,'/admin/api/debug/live/'+a,b,key);
 try{
 s.provisionPlatform('TEST',10000);const o=s.register('worker owner');const w=s.registerWorker(o.account_id,{name:'worker',model:'gpt-6-astra',accept_trial:true});
 action('qualify',{id:w.id,confirmed:true});assert.equal(s.wallet(o.account_id).available,0);
 for(let i=0;i<2;i++){
 const t=action('publish',{model:w.model});const l=s.mutation(o.account_id,'claim',String(++n),{},()=>s.claim(o.account_id,t.id,w.id));
 assert.throws(()=>action('accept',{id:t.id,result_sha256:hash('2'),confirmed:true}),/Review/);
 s.mutation(o.account_id,'submit',String(++n),{},()=>s.submit(o.account_id,t.id,{epoch:l.epoch,result:'2'}));
 const b={id:t.id,result_sha256:hash('2'),confirmed:true};const key=String(++n);action('accept',b,key);action('accept',b,key);
 assert.equal(s.wallet(o.account_id).can_hire,i===1);
 }
 const t=s.mutation(o.account_id,'hire','new',{},()=>s.createTask(o.account_id,{title:'Earned hire',description:'2+2',model:w.model,amount_minor:100}));assert.equal(t.source,'consumer');
 assert.equal(s.wallet(o.account_id).frozen,100);assert.equal(s.one('SELECT SUM(available+frozen) n FROM accounts').n,10000);
 }finally{s.close();}
 const normal=new Store();initAdmin(normal);try{assert.throws(()=>adminPost(normal,'/admin/api/debug/live/publish',{model:'gpt-6-astra'},'1'),/separate debug/);assert.equal(normal.one('SELECT COUNT(*) n FROM accounts').n,0);}finally{normal.close();}
});
