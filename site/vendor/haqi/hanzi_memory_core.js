import {createRng,hashSeed} from './rng_core.js';
import {resolveParams} from './combat_params_core.js';

// Web-authored collection rules, independent of dictionary mastery and combat RNG.
export function memoryParams(content){const params=resolveParams({version:'kids'},content?.balanceParams||{},{groups:['hanziMemory','monsterScene']});return {...params.hanziMemory,chantSeconds:Math.max(params.hanziMemory.chantSeconds,params.monsterScene.alertDelay+params.hanziMemory.guardianLeadSeconds)};}
export function memoryCount(progress,id,required=3){
    return Math.min(required,Math.max(progress?.memories?.fragments?.[id]||0,progress?.questCards?.includes(id)?required:0,progress?.entries?.[id]?.attempts?.length||0));
}
export function validateMemoryProgress(value){
    if(value===undefined)return;
    if(value?.version!==1||!value.fragments||!value.receipts||Object.keys(value.fragments).length>10000||Object.keys(value.receipts).length>10000)throw Error('文字记忆格式无效');
    for(const [id,n] of Object.entries(value.fragments))if(!/^[a-z0-9-]+$/.test(id)||!Number.isSafeInteger(n)||n<0||n>100)throw Error('文字碎片无效');
    for(const [id,n] of Object.entries(value.receipts))if(!/^[a-z0-9-]+:\d+$/.test(id)||!Number.isSafeInteger(n)||n<0)throw Error('文字领取记录无效');
}
export function memoryQuest(save,config){
    const active=config.stories.filter(s=>save.quests?.[s.questId]?.accepted&&!save.quests[s.questId].claimed);
    const tracked=save.trackedQuestIds||[];
    return active.find(s=>tracked.includes(s.questId)||save.trackedQuestId===s.questId)||active[0]||null;
}
// Fixed pairs: finish both cards before introducing the next pair. Old progress is reused.
export function memoryBatch(progress,words,required=3){
    for(let i=0;i<words.length;i+=2){const batch=words.slice(i,i+2);if(batch.some(id=>memoryCount(progress,id,required)<required))return batch;}
    return [];
}
export function chooseMemoryWord(save,config,review={},now=0,required=3){
    const quest=memoryQuest(save,config),target=(quest?memoryBatch(save.hanzi,quest.words,required):[]).filter(id=>memoryCount(save.hanzi,id,required)<required).sort((a,b)=>memoryCount(save.hanzi,a,required)-memoryCount(save.hanzi,b,required))[0];
    if(target)return target;
    const due=config.words.filter(id=>Number.isFinite(review[id]?.nextReviewAt)&&review[id].nextReviewAt<=now).sort((a,b)=>review[a].nextReviewAt-review[b].nextReviewAt||a.localeCompare(b));
    if(due.length)return due[0];
    return config.words.find(id=>memoryCount(save.hanzi,id,required)<required)||[...config.words].sort((a,b)=>(review[a]?.nextReviewAt??Infinity)-(review[b]?.nextReviewAt??Infinity)||a.localeCompare(b))[0];
}
export function createMemoryNodes(save,config,candidates,params){
    if(!candidates.length)return [];
    const used=new Set();return Array.from({length:Math.min(params.nodeCount,candidates.length)},(_,slot)=>{
        const key=`${config.island}:${slot}`,cycle=save.hanziMemoryRuntime?.cycles?.[key]||0,rng=createRng(hashSeed(`${save.seed}:${key}:${cycle}`));
        let index=rng.int(0,candidates.length-1);while(used.has(index))index=(index+1)%candidates.length;used.add(index);
        return {...candidates[index],key,cycle,id:`${key}:${cycle}`};
    });
}
export function advanceMemoryChant(previous,node,position,dt,enabled,params){
    if(!enabled||!node||!Number.isFinite(dt)||dt<=0||dt>.25)return null;
    const same=previous?.id===node.id&&Math.hypot(previous.x-position.x,previous.y-position.y)<.5;
    const elapsed=same?previous.elapsed+dt:0;
    return {id:node.id,x:position.x,y:position.y,elapsed,progress:Math.min(1,elapsed/params.chantSeconds),ready:elapsed>=params.chantSeconds};
}
export function releaseMemoryNodes(nodes,guardian,guardians,candidates,radius){
    const safe=candidates.filter(p=>guardians.every(g=>Math.hypot(p.x-g.x,p.y-g.y)>radius+24));
    return nodes.map(node=>{
        if(Math.hypot(node.x-guardian.x,node.y-guardian.y)>radius)return node;
        const target=[...safe].sort((a,b)=>Math.hypot(a.x-node.x,a.y-node.y)-Math.hypot(b.x-node.x,b.y-node.y))[0];
        return target?{...node,...target,released:true}:node;
    });
}
export function completeMemory(progress,pending,config,params,method){
    if(!['write','animation'].includes(method)||!config.words.includes(pending?.word)||!new RegExp(`^${config.island}:\\d+$`).test(pending?.key)||Number(pending.key.split(':')[1])>=params.nodeCount||!Number.isSafeInteger(pending.cycle)||pending.cycle<0)throw Error('文字记忆领取无效');
    const next=structuredClone(progress),m=next.memories||={version:1,fragments:{},receipts:{}};
    validateMemoryProgress(m);
    if((m.receipts[pending.key]||0)!==pending.cycle)return {progress:next,changed:false};
    const before=memoryCount(next,pending.word,params.fragmentsRequired);
    m.fragments[pending.word]=Math.min(params.fragmentsRequired,before+1);m.receipts[pending.key]=pending.cycle+1;
    return {progress:next,changed:true,collected:before<params.fragmentsRequired&&m.fragments[pending.word]===params.fragmentsRequired,count:m.fragments[pending.word]};
}
