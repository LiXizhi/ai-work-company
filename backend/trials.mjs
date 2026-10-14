import { randomUUID } from 'node:crypto';
import { Fault, string, integer, hash, LEASE, DAY } from './store.mjs';
export const TARGET = 20_000_000, PASS = 19_750_000;
export const CATEGORIES = ['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens'];
const need = (ok, code) => { if (!ok) throw new Fault(409, code, code); };
export function usageValue(price, usage) {
  need(usage && typeof usage === 'object' && !Array.isArray(usage) && Object.keys(usage).length === 4 && CATEGORIES.every(k => k in usage), 'invalid_usage');
  let numerator = 0n, tokens = 0;
  for (const k of CATEGORIES) { integer(usage[k], k, 0, 1_000_000_000); tokens += usage[k]; numerator += BigInt(usage[k]) * BigInt(price.rates[k]); }
  const usd_micro = Number((numerator + 999999n) / 1000000n);
  need(Number.isSafeInteger(usd_micro), 'value_overflow');
  const credit_minor = Number((BigInt(usd_micro) * BigInt(price.credit_minor_per_usd) + 999999n) / 1000000n);
  need(Number.isSafeInteger(credit_minor), 'value_overflow');
  return { usd_micro, credit_minor, tokens, price_version: price.version, payable: false };
}
export class Trials {
  constructor(s, models) {
    this.s=s;
    s.db.exec(`CREATE TABLE IF NOT EXISTS model_catalog (model TEXT PRIMARY KEY,enabled INTEGER NOT NULL,price_version TEXT);
      CREATE TABLE IF NOT EXISTS model_prices (version TEXT PRIMARY KEY,model TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS trial_templates (id TEXT PRIMARY KEY,model TEXT NOT NULL,title TEXT NOT NULL,prompt TEXT NOT NULL,max_tokens INTEGER NOT NULL,enabled INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS trial_runs (id TEXT PRIMARY KEY,worker TEXT NOT NULL REFERENCES workers(id),template TEXT NOT NULL REFERENCES trial_templates(id),model TEXT NOT NULL,price TEXT NOT NULL,max_tokens INTEGER NOT NULL,reserved INTEGER NOT NULL,state TEXT NOT NULL,epoch INTEGER NOT NULL DEFAULT 1,lease_until INTEGER,created_at INTEGER NOT NULL,deadline INTEGER NOT NULL,result TEXT,reported_usage TEXT,reviewed_usage TEXT,value INTEGER NOT NULL DEFAULT 0,evidence_ref TEXT UNIQUE,decision_ref TEXT);
      CREATE INDEX IF NOT EXISTS trial_worker ON trial_runs(worker,state);
      CREATE TRIGGER IF NOT EXISTS price_no_update BEFORE UPDATE ON model_prices BEGIN SELECT RAISE(ABORT,'immutable price'); END;
      CREATE TRIGGER IF NOT EXISTS price_no_delete BEFORE DELETE ON model_prices BEGIN SELECT RAISE(ABORT,'immutable price'); END;`);
    if (!s.one('SELECT model FROM model_catalog LIMIT 1')) for (const model of models) s.run('INSERT INTO model_catalog VALUES(?,1,NULL)', model);
  }
  catalog() { return this.s.all('SELECT * FROM model_catalog').map(m=>({...m, price: m.price_version ? this.price(m.price_version):null})); }
  price(version) { const p=this.s.one('SELECT body FROM model_prices WHERE version=?',version); need(p,'price_not_configured'); return JSON.parse(p.body); }
  configure(body) {
    return this.s.tx(()=>{
      need(body && typeof body==='object' && !Array.isArray(body) && Object.keys(body).every(k=>['model','version','source','effective_at','rates','credit_minor_per_usd'].includes(k)), 'invalid_price_fields');
      const model=string(body.model,'model'), version=string(body.version,'version');
      string(body.source,'source',500); string(body.effective_at,'effective_at'); need(/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.effective_at) && Number.isFinite(Date.parse(body.effective_at)) && Date.parse(body.effective_at)<=this.s.now(),'invalid_effective_at');
      need(body.rates && Object.keys(body.rates).length===4,'invalid_rates');
      for(const k of CATEGORIES) integer(body.rates[k],k,0,1_000_000_000);
      need(Math.max(...Object.values(body.rates))>0,'zero_price');
      integer(body.credit_minor_per_usd,'credit_minor_per_usd',1,1000000);
      need(!this.s.one('SELECT version FROM model_prices WHERE version=?',version),'duplicate_price_version');
      const price={model,version,source:body.source,effective_at:body.effective_at,rates:body.rates,credit_minor_per_usd:body.credit_minor_per_usd};
      this.s.run('INSERT INTO model_prices VALUES(?,?,?,?)',version,model,JSON.stringify(price),this.s.now());
      this.s.run('INSERT INTO model_catalog VALUES(?,1,?) ON CONFLICT(model) DO UPDATE SET enabled=1,price_version=excluded.price_version',model,version);
      return price;
    });
  }
  disable(model) { return this.s.tx(()=>{ need(this.s.one('SELECT model FROM model_catalog WHERE model=?',model),'model_not_found'); this.s.run('UPDATE model_catalog SET enabled=0 WHERE model=?',model); this.s.run("UPDATE trial_runs SET state='revoked',epoch=epoch+1,lease_until=NULL WHERE model=? AND state='running'",model); return {model,enabled:false}; }); }
  quote(model, usage) { const m=this.s.one('SELECT * FROM model_catalog WHERE model=? AND enabled=1',model); need(m,'model_not_allowed'); return usageValue(this.price(m.price_version||''),usage); }
  template(body) {
    return this.s.tx(()=>{
      const model=string(body.model,'model'), title=string(body.title,'title',160), prompt=string(body.prompt,'prompt',20000);
      need(this.s.models.includes(model),'model_not_allowed'); integer(body.max_tokens,'max_tokens',1,1000000);
      const id='template_'+randomUUID(); this.s.run('INSERT INTO trial_templates(id,model,title,prompt,max_tokens) VALUES(?,?,?,?,?)',id,model,title,prompt,body.max_tokens); return {id,model,title,max_tokens:body.max_tokens};
    });
  }
  expire() { this.s.run("UPDATE trial_runs SET state='expired',epoch=epoch+1,lease_until=NULL WHERE state='running' AND (lease_until<=? OR deadline<=?)",this.s.now(),this.s.now()); }
  progress(owner, worker) {
    const w=this.s.worker(owner,worker);
    const approved=this.s.one("SELECT COALESCE(SUM(value),0) n FROM trial_runs WHERE worker=? AND state='approved'",worker).n;
    const reserved=this.s.one("SELECT COALESCE(SUM(reserved),0) n FROM trial_runs WHERE worker=? AND state IN ('running','submitted','expired','revoked')",worker).n;
    const rejected = this.s.one("SELECT COALESCE(SUM(value),0) n FROM trial_runs WHERE worker=? AND state='rejected'",worker).n;
    return {worker_id:worker,qualified:!!w.qualified,suspended:!!w.suspended,approved_usd_micro:approved,reserved_usd_micro:reserved,rejected_usd_micro:rejected,target_usd_micro:TARGET,pass_usd_micro:PASS,remaining_usd_micro:Math.max(0,TARGET-approved-reserved-rejected),trial_income_minor:0};
  }
  claim(owner, worker) {
    this.expire(); const s=this.s,w=s.worker(owner,worker); need(!w.qualified && !w.suspended,'trial_not_eligible'); need(s.models.includes(w.model),'model_not_allowed');
    need(!s.one("SELECT id FROM trial_runs WHERE worker=? AND state='running'",worker),'worker_busy');
    const p=this.progress(owner,worker); if(p.approved_usd_micro>=PASS) return {state:'review_required',...p};
    const m=s.one('SELECT * FROM model_catalog WHERE model=?',w.model);
    if(!m.price_version) return {state:'price_required',...p};
    const price=this.price(m.price_version), highest=Math.max(...Object.values(price.rates));
    const templates=s.all("SELECT * FROM trial_templates t WHERE model=? AND enabled=1 AND NOT EXISTS(SELECT 1 FROM trial_runs r WHERE r.worker=? AND r.template=t.id AND r.state IN ('running','submitted','approved','rejected')) ORDER BY rowid",w.model,worker);
    if(p.remaining_usd_micro===0) return {state:p.reserved_usd_micro ? 'review_required' : 'trial_budget_exhausted',...p};
    if(!templates.length) return {state:'trial_idle',...p};
    need(s.one('SELECT COUNT(*) n FROM trial_runs WHERE worker=?',worker).n<1000,'trial_attempt_limit');
    const t=templates[0], max_tokens=Math.min(t.max_tokens,Math.floor(p.remaining_usd_micro*1_000_000/highest));
    if(max_tokens<1) return {state:'review_required',...p};
    const reserved=Number((BigInt(max_tokens)*BigInt(highest)+999999n)/1000000n);
    const id='trial_'+randomUUID(), now=s.now();
    s.run("INSERT INTO trial_runs(id,worker,template,model,price,max_tokens,reserved,state,lease_until,created_at,deadline) VALUES(?,?,?,?,?,?,?,'running',?,?,?)",id,worker,t.id,w.model,JSON.stringify(price),max_tokens,reserved,now+LEASE,now,now+DAY);
    return {...s.one('SELECT id,model,max_tokens,reserved,state,epoch,lease_until,deadline FROM trial_runs WHERE id=?',id),title:t.title,description:t.prompt,price,trial:true};
  }
  owned(owner,id) { const r=this.s.one('SELECT * FROM trial_runs WHERE id=?',id); need(r && this.s.one('SELECT id FROM workers WHERE id=? AND owner=?',r.worker,owner),'trial_not_found'); return r; }
  lease(owner,id,epoch) { const r=this.owned(owner,id),w=this.s.worker(owner,r.worker); need(!w.suspended && this.s.models.includes(r.model) && r.state==='running' && r.epoch===epoch && r.lease_until>this.s.now() && r.deadline>this.s.now(),'lease_expired'); return r; }
  heartbeat(owner,id,epoch) { this.lease(owner,id,epoch); this.s.run('UPDATE trial_runs SET lease_until=? WHERE id=?',Math.min(this.s.now()+LEASE,this.owned(owner,id).deadline),id); return {id,state:'running'}; }
  submit(owner,id,body) {
    const r=this.lease(owner,id,body.epoch); const result=string(body.result,'result',30000), q=usageValue(JSON.parse(r.price),body.usage);
    need(q.tokens<=r.max_tokens && q.usd_micro<=r.reserved,'trial_budget_exceeded');
    this.s.run("UPDATE trial_runs SET state='submitted',lease_until=NULL,result=?,reported_usage=? WHERE id=?",result,JSON.stringify(body.usage),id);
    return {id,state:'submitted',reported_value_usd_micro:q.usd_micro,verified:false,trial_income_minor:0};
  }
  review(id, body) {
    return this.s.tx(()=>{
      const r=this.s.one('SELECT * FROM trial_runs WHERE id=?',id); need(r && ['submitted','expired','revoked'].includes(r.state),'invalid_trial_state');
      need(body.decision==='reject' || r.state==='submitted','cannot_approve_unsubmitted');
      const ref=string(body.evidence_ref,'evidence_ref',500); need(!this.s.one('SELECT reference FROM receipts WHERE reference=?',ref),'duplicate_evidence');
      need(body.model===r.model && body.result_sha256===hash(r.result || ''),'evidence_mismatch'); need(['approve','reject'].includes(body.decision),'invalid_decision');
      const q=usageValue(JSON.parse(r.price),body.usage); if(body.decision==='approve') need(q.tokens<=r.max_tokens && q.usd_micro<=r.reserved,'trial_budget_exceeded');
      this.s.run('INSERT INTO receipts(reference,worker) VALUES(?,?)',ref,r.worker);
      this.s.run('UPDATE trial_runs SET state=?,reviewed_usage=?,value=?,evidence_ref=? WHERE id=?',body.decision==='approve'?'approved':'rejected',JSON.stringify(body.usage),q.usd_micro,ref,id);
      const w=this.s.one('SELECT * FROM workers WHERE id=?',r.worker); return this.progress(w.owner,w.id);
    });
  }
  graduate(worker, reference) {
    return this.s.tx(()=>{
      const w=this.s.one('SELECT * FROM workers WHERE id=?',worker); need(w && !w.qualified && !w.suspended && this.s.models.includes(w.model),'invalid_worker');
      const p=this.progress(w.owner,worker); need(p.approved_usd_micro>=PASS && p.approved_usd_micro<=TARGET && p.reserved_usd_micro===0,'trial_incomplete');
      string(reference,'decision_reference',500); need(!this.s.one('SELECT reference FROM receipts WHERE reference=?',reference),'duplicate_evidence');
      this.s.run('INSERT INTO receipts(reference,worker) VALUES(?,?)',reference,worker);
      this.s.run('UPDATE workers SET qualified=1,trial_minor=?,evidence_ref=? WHERE id=?',Math.floor(p.approved_usd_micro/10000),reference,worker);
      const rejected = this.s.one("SELECT COALESCE(SUM(value),0) n FROM trial_runs WHERE worker=? AND state='rejected'",worker).n;
    return {worker_id:worker,qualified:true,trial_income_minor:0};
    });
  }
}
