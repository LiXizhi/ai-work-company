import { runCodex } from './run.mjs';
import { identifier } from './client.mjs';
// Normalize cached reads out of total input. Nonzero cache writes need a verified adapter mapping.
// Preserve raw usage separately; only an independent reviewer can certify it.
export function normalizeUsage(raw) {
  const cached=raw.cached_input_tokens || 0, write=raw.cache_write_input_tokens || 0;
  if(write!==0) throw new Error('unsupported_cache_write_accounting');
  const value={ input_tokens: raw.input_tokens-cached-write, cached_input_tokens:cached, cache_write_input_tokens:write, output_tokens:raw.output_tokens };
  if(!Object.values(value).every(n=>Number.isSafeInteger(n)&&n>=0)) throw new Error('unsupported_usage_accounting');
  return value;
}
export async function runTrial({ api,workerId,runDir,signal,onEvent=()=>{},execute=runCodex }) {
  identifier(workerId); if(signal?.aborted) throw new Error('worker_stopped');
  const lease=await api.request('/v1/trials/claim',{worker_id:workerId});
  if(lease.state!=='running') return lease;
  onEvent({event:'trial_claimed',id:lease.id,price_version:lease.price.version,reserved_usd_micro:lease.reserved,max_tokens:lease.max_tokens});
  const abort=new AbortController(); const stop=()=>abort.abort(); signal?.addEventListener('abort',stop,{once:true}); if(signal?.aborted) stop();
  let failed;
  const timer=setInterval(async()=>{ try{await api.request(`/v1/trials/${lease.id}/heartbeat`,{epoch:lease.epoch});}catch(e){failed=e;stop();}},15000);
  try {
    const result=await execute({base:api.base,lease,runDir,signal:abort.signal,onEvent});
    if(abort.signal.aborted) throw failed || new Error('worker_stopped');
    if(failed) throw failed;
    const usage=normalizeUsage(result.usage);
    const submitted=await api.request(`/v1/trials/${lease.id}/submit`,{epoch:lease.epoch,result:result.result,usage});
    return {...submitted,raw_usage:result.usage,usage,model:lease.model};
  } finally {clearInterval(timer);signal?.removeEventListener('abort',stop);}
}
