import {hashSeed} from './rng_core.js';
// Small summaries are safe to enumerate; memories and decks stay in individual files.
export function ownedPetRecords(save){return Object.fromEntries(Object.entries({...Object.fromEntries(Object.entries(save.petFileRefs||{}).filter(([,r])=>r.group==='pets').map(([id,r])=>[id,r.summary])),...save.pets}).filter(([id])=>!save.petMergedIds?.includes(id)));}
export function ownedPetSpecies(save){return [...new Set(Object.values(ownedPetRecords(save)).map(p=>p.speciesId))].sort();}
export function petSummary(p){return {id:p.id,speciesId:p.speciesId,ownerId:p.ownerId,xp:p.xp,level:p.level,gender:p.gender,appearanceStage:p.appearanceStage??null,zone:p.birth?.zone||p.homeZone||null,baby:!!p.birth,...(p.passiveTraits!==undefined?{passiveTraits:{...p.passiveTraits}}:{}),...(p.captureCount!==undefined?{captureCount:p.captureCount}:{}),...(p.obtainedCount!==undefined?{obtainedCount:p.obtainedCount}:{})};}
export const petFilePath=(id,version)=>`pets/${Array.from(id,c=>c.codePointAt(0).toString(16)).join('-')}/${version}.json`;
export function validPetFileRef(id,row){return row&&['pets','petWorld'].includes(row.group)&&row.summary?.id===id&&typeof row.path==='string'&&/^[a-zA-Z0-9_-]+\.json$/.test(row.path.split('/').at(-1))&&row.path===petFilePath(id,row.path.split('/').at(-1).slice(0,-5));}
export function initialPetIds(save){
    const refs=save.petFileRefs||{},owned=Object.entries(refs).filter(([,r])=>r.group==='pets').map(([id])=>id);
    const counts={};for(const id of owned){const species=refs[id].summary.speciesId;counts[species]=(counts[species]||0)+1;}
    const duplicates=owned.filter(id=>counts[refs[id].summary.speciesId]>1&&!save.petMergedIds?.includes(id));
    return [...new Set([...duplicates,...(save.formation||[]).filter(Boolean),...(!(save.formation||[]).some(Boolean)&&owned.length?[owned[0]]:[]),...Object.entries(refs).filter(([,r])=>r.group==='petWorld'&&r.summary.ownerId===null&&r.summary.zone===save.zone).map(([id])=>id)])];
}

export function petContentKey(p){const {hp,hunger,...data}=p;const text=JSON.stringify(data,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);return `${text.length}:${hashSeed(text)}:${hashSeed('pet:'+text)}`;}
