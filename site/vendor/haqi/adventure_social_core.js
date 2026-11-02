// Public social projections and deterministic discovery. No account tokens or message bodies.
import {createRng,hashSeed} from './rng_core.js';
import {createUnit} from './combat_unit_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {isSupportedType} from './combat_cards_core.js';
import {publicPhotoHead} from './photo_head_core.js';
export const SOCIAL_VERSION=1;
export const DAY_MS=86400000;
export const SOCIAL_DEFAULTS=Object.freeze(defaultParams('kids').islandSocial);
const schools=['fire','ice','storm','life','death'];
const safeName=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value);
export function socialCapacity(world,config={}) {
    const size=config.size|| (world==='camp'?'camp':'large');
    const [min,max]=size==='camp'?[5,8]:size==='medium'?[10,14]:[14,20];
    return Math.max(min,Math.min(max,Math.floor(config.capacity||SOCIAL_DEFAULTS[size]||16)));
}
export function utcDay(now){return new Date(now).toISOString().slice(0,10);}
export function utcWeek(now){const d=new Date(now);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return utcDay(d);}
export function boardGroup({world,native,target,now,type='daily',mode='activity'}) {
    if(![world,native,target].every(v=>typeof v==='string'&&/^[\w-]{1,50}$/.test(v)))throw Error('榜单分组无效');
    return `haqi-v1-${mode}-${world}-${native}-to-${target}-${type==='weekly'?utcWeek(now):utcDay(now)}`;
}
export function recordInteraction(ledger,event,now) {
    if(!event||!['mail','chat'].includes(event.source)||event.status!=='confirmed'||event.system||event.generated||!event.peerId||!event.messageId)return ledger;
    const at=Number(event.at);if(!Number.isFinite(at)||at>now||at<now-30*DAY_MS)return ledger;
    const key=String(event.peerId),prior=ledger[key];
    return !prior||at>prior.at?{...ledger,[key]:{at,source:event.source}}:ledger;
}
export function markSocialActivity(activity,world,kind,now) {
    if(!['learning','quest','battle'].includes(kind))return activity;
    const day=utcDay(now),days=[...new Set([...(activity?.[world]||[]),day])].filter(d=>d>=utcDay(now-30*DAY_MS)).sort();
    return {...activity,[world]:days};
}
export function weeklyActivity(activity,world,now){return (activity?.[world]||[]).filter(d=>d>=utcWeek(now)&&d<=utcDay(now)).length;}
export function validatePublicProfile(row,username=null) {
    let customHead;try{if(row?.customHead)customHead=publicPhotoHead(row.customHead,{id:row.headId,appearance:row.appearance,owner:row.username});}catch{/* Discard invalid optional art, retain the social profile. */}
    if(row?.version!==SOCIAL_VERSION||!safeName(row.username)||username&&row.username!==username||!/^\d{1,20}$/.test(String(row.userId))||typeof row.name!=='string'||row.name.length>40||!schools.includes(row.school)||!['boy','girl'].includes(row.appearance)||!Number.isInteger(row.level)||row.level<1||row.level>100)return null;
    if(!['zh','en','ja','ko'].includes(row.native)||!['zh','en','ja','ko'].includes(row.target)||row.native===row.target||row.visible!==true)return null;
    return {version:row.version,userId:String(row.userId),username:row.username,name:row.name,school:row.school,level:row.level,appearance:row.appearance,headId:row.headId,bodyId:row.bodyId,...(customHead?{customHead}:{}),isVip:row.isVip===true,registeredAt:typeof row.registeredAt==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.registeredAt)&&Number.isFinite(Date.parse(row.registeredAt))?row.registeredAt:undefined,native:row.native,target:row.target,visible:true,activity:row.activity||{},snapshot:row.snapshot,id:`user:${row.userId}`,kind:'account'};
}
export function selectSocialRoster({candidates=[],friends=[],blocked=[],interactions={},challenges={},selfId,world='camp',native='zh',target='en',level=1,now,seed=1,capacity=6,fillers=[]}) {
    const friendIds=new Set(friends.map(String)),blockedIds=new Set(blocked.map(String)),seen=new Set(),rng=createRng(hashSeed(`${seed}:${world}:${utcDay(now)}`));
    const rows=[];
    for(const p of [...candidates].sort((a,b)=>String(a.userId).localeCompare(String(b.userId)))){
        const id=String(p.userId);if(id===String(selfId)||blockedIds.has(id)||seen.has(id)||!validatePublicProfile(p))continue;seen.add(id);
        const at=interactions[id]?.at,friend=friendIds.has(id),recent=friend&&Number.isFinite(at)&&at<=now&&at>=now-30*DAY_MS;
        const active=(p.activity?.[world]||[]).includes(utcDay(now));
        if(!recent&&!active)continue;
        const reciprocal=p.native===target&&p.target===native,same=p.native===native&&p.target===target;
        if(!recent&&!reciprocal&&!same)continue;
        rows.push({p:{...p,id:`user:${id}`,kind:'account'},priority:recent?0:reciprocal?1:2,at:recent?at:0,friend:friend?0:1,shared:challenges[id]?0:1,gap:Math.abs(p.level-level),tie:rng.float()});
    }
    rows.sort((a,b)=>a.priority-b.priority||b.at-a.at||a.friend-b.friend||a.shared-b.shared||a.gap-b.gap||a.tie-b.tie);
    const selected=rows.slice(0,capacity).map(r=>r.p),pool=rng.shuffle(fillers.filter(p=>['en','zh','ja','ko'].includes(p.native)).map(p=>({...p})));
    while(selected.length<capacity&&pool.length){const counts=Object.fromEntries(schools.map(s=>[s,selected.filter(p=>p.school===s).length]));const languages=new Set(selected.map(p=>p.native));pool.sort((a,b)=>Number(languages.has(a.native))-Number(languages.has(b.native))||counts[a.school]-counts[b.school]);const next=pool.shift();if(!selected.some(p=>p.name===next.name))selected.push(next);}
    return selected;
}
export function validateSocialSnapshot(snapshot,dataset) {
    const s=snapshot?.unit;
    if(snapshot?.version!==1||!s||!schools.includes(s.school)||!Number.isFinite(s.maxHp)||s.maxHp<=0||s.maxHp>1e7||!Array.isArray(s.deck)||!s.deck.length||s.deck.length>200)throw Error('伙伴战斗快照无效');
    for(const row of [...s.deck,...(s.fixedCards||[])])if(!dataset.cards[row.key]||!isSupportedType(dataset.cards[row.key].type)||!Number.isInteger(row.count)||row.count<1||row.count>100)throw Error('伙伴卡组与当前规则不兼容');
    if(!Number.isInteger(s.level)||s.level<1||s.level>100)throw Error('伙伴等级无效');
    const values=Object.values(s.stats||{}).flatMap(v=>typeof v==='object'&&v?Object.values(v):[v]);if(values.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7))throw Error('伙伴属性无效');
    const unit=Object.fromEntries(['id','name','school','level','stats','deck','fixedCards','deckCapacity','deckEachCapacity','maxHp'].filter(k=>s[k]!==undefined).map(k=>[k,structuredClone(s[k])]));
    if(createUnit(unit,resolveParams(dataset,defaultParams('kids'))).maxHp!==s.maxHp)throw Error('伙伴生命与属性不一致');
    return unit;
}
export function socialDataHash(dataset){return hashSeed(JSON.stringify(dataset)).toString(16);}
/** Pick the next island companion for an opened empty seat. Prefers unused roster rows; stable for the same seed and slot. */
export function pickAutoJoinPartner(roster=[],allies=[],{seed=1,slotIndex=0,dungeonId=''}={}){
    const taken=new Set(allies.filter(Boolean).map(p=>p.id));
    const pool=roster.filter(p=>p&&!taken.has(p.id));
    if(!pool.length)return null;
    const rng=createRng(hashSeed(`${seed}:auto-join:${dungeonId}:${slotIndex}:${[...taken].sort().join(',')}`));
    return structuredClone(pool[Math.floor(rng.float()*pool.length)]);
}
export function autoJoinDelayMs(params=SOCIAL_DEFAULTS,rng=createRng(1)){
    const min=Math.max(0,Math.floor(params.autoJoinMinMs??SOCIAL_DEFAULTS.autoJoinMinMs));
    const max=Math.max(min,Math.floor(params.autoJoinMaxMs??SOCIAL_DEFAULTS.autoJoinMaxMs));
    return min+Math.floor(rng.float()*(max-min+1));
}
export function snapshotDataHash(dataset,unit){const keys=[...new Set([...(unit.deck||[]),...(unit.fixedCards||[])].map(r=>r.key))].sort();return hashSeed(JSON.stringify({rules:1,cards:keys.map(k=>dataset.cards[k]),charms:dataset.charms,params:defaultParams('kids')})).toString(16);}
export function makeSocialSnapshot(unit,dataset){const built=createUnit(unit,resolveParams(dataset,defaultParams('kids')));return {version:1,dataHash:snapshotDataHash(dataset,unit),unit:structuredClone({...unit,maxHp:built.maxHp,hp:built.maxHp})};}
export function snapshotUnit(profile,dataset,id,slot){
    if(!profile.snapshot?.unit||profile.snapshot.dataHash!==snapshotDataHash(dataset,profile.snapshot.unit))throw Error('伙伴快照版本已变化，请刷新');
    const unit=validateSocialSnapshot(profile.snapshot,dataset);return {...unit,id,slot,hp:unit.maxHp,name:profile.name};
}
