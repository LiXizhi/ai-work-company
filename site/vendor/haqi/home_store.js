import {homeCapacity,isHomeChunk,assertHomeCapacity} from './home_capacity_core.js';
// Inventory was retired: keep legacy saves readable without retaining counts.
function withoutInventory(home){const copy=structuredClone(home);delete copy.parts?.inventory;for(const key of ['remote','source']){delete copy[key]?.parts?.inventory;delete copy[key]?.localParts?.inventory;}return copy;}
// All mutations (including speech receipts) commit in one IndexedDB transaction.
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export function createHomeStore(scope,{indexedDB=globalThis.indexedDB,name='haqi-homes-v1'}={}){
 let opening;
 async function db(){if(!indexedDB)throw Error('本机存储不可用，家园尚未保存');if(!opening)opening=new Promise((resolve,reject)=>{const r=indexedDB.open(name,2);r.onupgradeneeded=event=>{if(event.oldVersion===0){r.result.createObjectStore('homes');r.result.createObjectStore('parts');}else{const tx=r.transaction;const homes=tx.objectStore('homes').openCursor();homes.onsuccess=()=>{const c=homes.result;if(!c)return;const next=withoutInventory(c.value);if(c.value.parts?.inventory!==undefined){next.dirty=true;next.revision=(next.revision||0)+1;}c.update(next);c.continue();};const parts=tx.objectStore('parts').openCursor();parts.onsuccess=()=>{const c=parts.result;if(!c)return;if(c.key[2]==='inventory')c.delete();c.continue();};}};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();opening=null;};resolve(r.result);};r.onerror=()=>{opening=null;reject(r.error);};r.onblocked=()=>{opening=null;reject(Error('请关闭其他旧版家园页面后重试'));};});return opening;}
 async function transact(mode,run){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(['homes','parts'],mode);let value;tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error||Error('本机保存失败'));try{Promise.resolve(run(tx.objectStore('homes'),tx.objectStore('parts'))).then(v=>{value=v;},e=>{reject(e);tx.abort();});}catch(e){reject(e);tx.abort();}});}
 async function measure(home,p){
  home.objectCounts||={};
  for(const key of Object.keys(home.parts||{}).filter(isHomeChunk))if(!Number.isSafeInteger(home.objectCounts[key])||home.objectCounts[key]<0){
   const data=await request(p.get([scope,home.id,key]));if(data!==undefined)home.objectCounts[key]=Object.keys(data).length;
  }
  return homeCapacity(home);
 }
 const api={scope,
  measureCapacity:id=>transact('readwrite',async(h,p)=>{const home=await request(h.get([scope,id]));if(!home||home.deleted)throw Error('家园已移除');await measure(home,p);h.put(home,[scope,id]);return home;}),
  async listGuests(){return transact('readonly',async(h)=>{const all=await request(h.getAll()),keys=await request(h.getAllKeys());return all.map((row,i)=>({...row,sourceScope:keys[i][0]})).filter(row=>!row.deleted&&JSON.parse(row.sourceScope)[0]==='guest');});},
  async list(){return transact('readonly',async(h,p)=>{const all=await request(h.getAll(IDBKeyRange.bound([scope,''],[scope,'\uffff'])));const rows=all.filter(row=>!row.deleted);return Promise.all(rows.sort((a,b)=>b.updatedAt-a.updatedAt).map(async row=>({...row,localVisit:await request(p.get([scope,row.id,'local:visit']))})));});},
  saveVisit:(id,{elapsedMs=0,preview=null,lastPlayedAt=Date.now()}={})=>transact('readwrite',async(h,p)=>{
   const home=await request(h.get([scope,id]));if(!home||home.deleted)return;
   const previous=await request(p.get([scope,id,'local:visit']))||{};
   const visit={...previous,playedMs:(previous.playedMs||0)+Math.max(0,elapsedMs),lastPlayedAt};
   if(preview){visit.preview=preview;visit.previewAt=lastPlayedAt;}
   // Local-only: never enter home.parts, revision, dirty or cloud snapshots.
   p.put(visit,[scope,id,'local:visit']);return visit;
  }),
  updateLocal:(id,key,reduce)=>transact('readwrite',async(_,p)=>{if(!key.startsWith('local:'))throw Error('需要本机记录');const data=await request(p.get([scope,id,key]))||{};reduce(data);p.put(data,[scope,id,key]);return data;}),
  get:id=>transact('readonly',h=>request(h.get([scope,id]))),
  read:(id,part)=>part==='inventory'?Promise.resolve({}):transact('readonly',(_,p)=>request(p.get([scope,id,part]))).then(v=>v||{}),
  peek:(id,part)=>part==='inventory'?Promise.resolve(undefined):transact('readonly',(_,p)=>request(p.get([scope,id,part]))),
  cachePart:(id,key,data)=>key==='inventory'?Promise.resolve({}):transact('readwrite',async(h,p)=>{const home=await request(h.get([scope,id]));if(!home||home.deleted)throw Error('家园已移除');const existing=await request(p.get([scope,id,key]));if(existing!==undefined)return existing;p.put(data,[scope,id,key]);if(isHomeChunk(key)){home.objectCounts||={};home.objectCounts[key]=Object.keys(data).length;h.put(home,[scope,id]);}return data;}),
  create:home=>transact('readwrite',async(h)=>{if(await request(h.get([scope,home.id])))throw Error('家园编号已存在');h.put(withoutInventory(home),[scope,home.id]);return withoutInventory(home);}),
  mutate:(id,keys,fn)=>transact('readwrite',async(h,p)=>{
   keys=keys.filter(k=>k!=='inventory');
   const pending=[request(h.get([scope,id])),...keys.map(k=>request(p.get([scope,id,k])))],values=await Promise.all(pending),home=values[0];
   if(!home||home.deleted)throw Error('家园已移除');const data=Object.fromEntries(keys.map((k,i)=>[k,values[i+1]||{}]));
   const chunkKeys=keys.filter(isHomeChunk),capacity=chunkKeys.length?await measure(home,p):null;
   if(capacity&&capacity.used===null)throw Error('请先加载其余家园地块以核对总容量');
   const oldCounts=Object.fromEntries(chunkKeys.map(k=>[k,Object.keys(data[k]).length]));
   const before=Object.fromEntries(keys.map(k=>[k,JSON.stringify(data[k])])),outcome=fn(home,data);
   if(capacity){const after=capacity.used+chunkKeys.reduce((sum,k)=>sum+Object.keys(data[k]).length-oldCounts[k],0);assertHomeCapacity(capacity.used,after);for(const key of chunkKeys)home.objectCounts[key]=Object.keys(data[key]).length;}
   if(outcome===false)return {home,data,changed:false};home.revision++;home.dirty=true;home.updatedAt=Date.now();
   for(const key of keys)if(before[key]!==JSON.stringify(data[key])){p.put(data[key],[scope,id,key]);if(!key.startsWith('receipt:')&&!key.startsWith('local:'))home.parts[key]=home.revision;}
   h.put(withoutInventory(home),[scope,id]);return {home:withoutInventory(home),data,changed:true,outcome};
  }),
  async snapshot(id){return transact('readonly',async(h,p)=>{const home=await request(h.get([scope,id]));if(!home)throw Error('家园不存在');const keys=Object.keys(home.parts);const parts=await Promise.all(keys.map(k=>request(p.get([scope,id,k]))));return {home,parts:Object.fromEntries(keys.map((k,i)=>[k,parts[i]]))};});},
  install:(home,parts)=>transact('readwrite',async(h,p)=>{if(await request(h.get([scope,home.id])))throw Error('本地已存在该家园，请保留副本');home={...home,objectCounts:Object.fromEntries(Object.entries(parts).filter(([k,v])=>isHomeChunk(k)&&v!==undefined).map(([k,v])=>[k,Object.keys(v).length]))};for(const [k,v]of Object.entries(parts))if(k!=='inventory')p.put(v,[scope,home.id,k]);h.put(withoutInventory(home),[scope,home.id]);return withoutInventory(home);}),
  acknowledge:(id,revision,remote)=>transact('readwrite',async(h)=>{const home=await request(h.get([scope,id]));if(!home)return;home.baseRevision=remote.revision;home.remote=remote;home.dirty=home.revision!==revision;h.put(withoutInventory(home),[scope,id]);return withoutInventory(home);}),
  remove:id=>api.mutate(id,[],home=>{home.deleted=true;}),
  async close(){const database=await opening;database?.close();opening=null;}
 };return api;
}
