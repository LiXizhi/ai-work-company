import { timingSafeEqual } from 'node:crypto';
import { Fault, hash, string } from './store.mjs';
import { usageValue, CATEGORIES } from './trials.mjs';
const requireThat = (ok, code, status=400) => { if(!ok) throw new Fault(status,code,code); };
export function initAdmin(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,route TEXT NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT,'append-only audit'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT,'append-only audit'); END;`);
}
export function authenticateAdmin(configured, supplied) {
  requireThat(typeof configured==='string' && configured.length>=32 && configured.length<=512,'admin_not_configured',503);
  requireThat(typeof supplied==='string' && supplied.length<=512 && timingSafeEqual(Buffer.from(hash(configured),'hex'),Buffer.from(hash(supplied),'hex')),'admin_unauthorized',401);
}
function fields(body, allowed) { requireThat(body && typeof body==='object' && !Array.isArray(body) && Object.keys(body).every(k=>allowed.includes(k)) && allowed.every(k=>k in body),'invalid_admin_fields'); }
function paging(url) {
  const value=url.searchParams.get('offset') || '0'; requireThat(/^\d{1,8}$/.test(value),'invalid_offset'); return Number(value);
}
export function adminGet(store,url) {
  const path=url.pathname, offset=paging(url);
  const paged=(rows)=>({items:rows.slice(0,25),next_offset:rows.length>25?offset+25:null});
  if(path==='/admin/api/overview') return {workers:store.one('SELECT COUNT(*) n FROM workers').n,qualified:store.one('SELECT COUNT(*) n FROM workers WHERE qualified=1').n,pending:store.one("SELECT COUNT(*) n FROM trial_runs WHERE state IN ('submitted','expired','revoked')").n,models:store.models.length};
  if(path==='/admin/api/models') return {items:store.trials.catalog()};
  if(path==='/admin/api/templates') return paged(store.all('SELECT * FROM trial_templates ORDER BY rowid DESC LIMIT 26 OFFSET ?',offset));
  if(path==='/admin/api/workers') return paged(store.all('SELECT id,owner,name,model,qualified,suspended,verified_tokens FROM workers ORDER BY rowid DESC LIMIT 26 OFFSET ?',offset).map(w=>({...w,progress:store.trials.progress(w.owner,w.id)})));
  if(path==='/admin/api/audit') return paged(store.all('SELECT * FROM admin_audit ORDER BY id DESC LIMIT 26 OFFSET ?',offset));
  const worker=path.match(/^\/admin\/api\/workers\/([^/]+)$/);
  if(worker) {
    const w=store.one('SELECT id,owner,name,model,qualified,suspended,verified_tokens FROM workers WHERE id=?',worker[1]); requireThat(w,'worker_not_found',404);
    const totals={reported:{},reviewed:{}};
    for(const category of CATEGORIES) {
      totals.reported[category]=store.one(`SELECT COALESCE(SUM(json_extract(reported_usage,'$.${category}')),0) n FROM trial_runs WHERE worker=?`,w.id).n;
      totals.reviewed[category]=store.one(`SELECT COALESCE(SUM(json_extract(reviewed_usage,'$.${category}')),0) n FROM trial_runs WHERE worker=?`,w.id).n;
    }
    return {...w,progress:store.trials.progress(w.owner,w.id),usage:totals,model_enabled:store.models.includes(w.model)};
  }
  if(path==='/admin/api/trials') {
    const state=url.searchParams.get('state') || 'pending', workerId=url.searchParams.get('worker_id') || '';
    requireThat(['pending','all','approved','rejected'].includes(state),'invalid_filter');
    const condition=state==='pending'?"state IN ('submitted','expired','revoked')":state==='all'?'1=1':`state='${state}'`;
    return paged(store.all(`SELECT id,worker,model,state,reserved,value,created_at,evidence_ref FROM trial_runs WHERE ${condition} AND (?='' OR worker=?) ORDER BY created_at DESC,id LIMIT 26 OFFSET ?`,workerId,workerId,offset));
  }
  const trial=path.match(/^\/admin\/api\/trials\/([^/]+)$/);
  if(trial) {
    const r=store.one('SELECT * FROM trial_runs WHERE id=?',trial[1]); requireThat(r,'trial_not_found',404);
    const price=JSON.parse(r.price), reported_usage=r.reported_usage?JSON.parse(r.reported_usage):null;
    return {...r,price,reported_usage,reviewed_usage:r.reviewed_usage?JSON.parse(r.reviewed_usage):null,result_sha256:hash(r.result||''),reported_quote:reported_usage?usageValue(price,reported_usage):null,task:store.one('SELECT title,prompt FROM trial_templates WHERE id=?',r.template)};
  }
  throw new Fault(404,'not_found','Admin route not found.');
}
export function adminPost(store,path,body,key) {
  string(key,'Idempotency-Key',128);
  // Shared outer transaction includes the action, audit and replay record. Inner
  // operator methods use savepoints, so an audit failure rolls back all changes.
  return store.mutation('web-operator',path,key,body,()=>{
    let result;
    if(path==='/admin/api/models') { fields(body,['model','version','source','effective_at','rates','credit_minor_per_usd']); result=store.trials.configure(body); }
    else if(path==='/admin/api/models/disable') { fields(body,['model']);result=store.trials.disable(string(body.model,'model')); }
    else if(path==='/admin/api/templates') { fields(body,['model','title','prompt','max_tokens']);result=store.trials.template(body); }
    else if(path==='/admin/api/templates/disable') { fields(body,['id']);string(body.id,'id');requireThat(store.one('SELECT id FROM trial_templates WHERE id=?',body.id),'template_not_found',404);store.run('UPDATE trial_templates SET enabled=0 WHERE id=?',body.id);result={id:body.id,enabled:false}; }
    else {
      const review=path.match(/^\/admin\/api\/trials\/([^/]+)\/review$/), graduate=path.match(/^\/admin\/api\/workers\/([^/]+)\/graduate$/);
      if(review) {
        fields(body,['decision','model','result_sha256','usage','evidence_ref','confirmed']);requireThat(body.confirmed===true,'independent_review_required');
        result=store.trials.review(review[1],body);
      } else if(graduate) {
        fields(body,['reference','confirmed']);requireThat(body.confirmed===true,'final_review_required');result=store.trials.graduate(graduate[1],body.reference);
      } else throw new Fault(404,'not_found','Admin route not found.');
    }
    store.run('INSERT INTO admin_audit(at,route,request_key,payload_hash) VALUES(?,?,?,?)',store.now(),path,key,hash(JSON.stringify(body)));
    return result;
  });
}
export function adminOpenapiPaths() {
  const text={type:'string',minLength:1}, integer={type:'integer',minimum:0,maximum:1000000000};
  const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
  const usage=object(Object.fromEntries(CATEGORIES.map(k=>[k,integer])));
  const schemas={
    models:object({model:text,version:text,source:text,effective_at:{type:'string',format:'date-time'},rates:usage,credit_minor_per_usd:{type:'integer',minimum:1,maximum:1000000}}),
    'models/disable':object({model:text}),templates:object({model:text,title:text,prompt:text,max_tokens:{type:'integer',minimum:1,maximum:1000000}}),
    'templates/disable':object({id:text}),
    'trials/{id}/review':object({decision:{enum:['approve','reject']},model:text,result_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},usage,evidence_ref:text,confirmed:{const:true}}),
    'workers/{id}/graduate':object({reference:text,confirmed:{const:true}})
  };
  const paths={};
  for(const route of ['overview','models','templates','workers','workers/{id}','trials','trials/{id}','audit']) paths[`/admin/api/${route}`]={get:{security:[{adminBearer:[]}],parameters:[...(route.includes('{id}')?[{in:'path',name:'id',required:true,schema:{type:'string'}}]:[]),{in:'query',name:'offset',schema:{type:'integer',minimum:0}}],responses:{200:{description:'Authenticated operator data; see docs/admin-console.md.'}}}};
  for(const route of ['models','models/disable','templates','templates/disable','trials/{id}/review','workers/{id}/graduate']) {
    paths[`/admin/api/${route}`]??={};
    paths[`/admin/api/${route}`].post={security:[{adminBearer:[]}],parameters:[...(route.includes('{id}')?[{in:'path',name:'id',required:true,schema:{type:'string'}}]:[]),{in:'header',name:'Idempotency-Key',required:true,schema:{type:'string'}},{in:'header',name:'Origin',required:true,schema:{type:'string'}}],requestBody:{required:true,content:{'application/json':{schema:schemas[route]}}},responses:{200:{description:'Atomic audited action or identical replay.'}}};
  }
  paths['/admin/api/trials'].get.parameters.push({in:'query',name:'state',schema:{enum:['pending','all','approved','rejected']}},{in:'query',name:'worker_id',schema:{type:'string'}});
  return paths;
}
