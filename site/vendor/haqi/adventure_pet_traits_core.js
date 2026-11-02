import {createRng,hashSeed} from './rng_core.js';
import {resolveParams} from './combat_params_core.js';
import {normalizeStats} from './combat_unit_core.js';

// Web growth rules, independent of the original Lua damage formula and battle RNG.
export const PET_TRAITS={
    attack:{name:'小小战斗狂',stat:'damagePct',effect:'攻击伤害'},
    defense:{name:'铁皮小卫士',stat:'resistPct',effect:'防御减伤'},
    vitality:{name:'元气永动机',stat:'hpPct',effect:'最大生命'},
    critical:{name:'暴击惊喜家',stat:'critPct',effect:'暴击'},
    accuracy:{name:'百发百中手',stat:'accuracyPct',effect:'命中'},
    mana:{name:'魔力充电宝',stat:'powerPipPct',effect:'超级魔力'},
    healing:{name:'暖心小医师',stat:'outputHealPct',effect:'治疗'},
    gathering:{name:'采集小能手',effect:'采集效率'},
    frugal:{name:'节食主义者',effect:'食量'},
};
export function petTraitParams(content={}){return resolveParams({cards:{}},content.balanceParams||{version:'kids',petTraits:content.petTraits},{groups:['petTraits']}).petTraits;}
export function validatePetTraits(traits={}){
    if(!traits||typeof traits!=='object'||Array.isArray(traits)||Object.entries(traits).some(([key,rank])=>!Object.hasOwn(PET_TRAITS,key)||!Number.isInteger(rank)||rank<1||rank>9))throw Error('宠物标签无效');
    return traits;
}
export function validatePetGrowth(pet){
    validatePetTraits(pet.passiveTraits);
    for(const key of ['captureCount','obtainedCount'])if(pet[key]!==undefined&&(!Number.isSafeInteger(pet[key])||pet[key]<0))throw Error('宠物获得次数无效');
}
export function mergePetTraits(current={},incoming={}){
    validatePetTraits(current);validatePetTraits(incoming);
    return Object.fromEntries(Object.keys(PET_TRAITS).filter(key=>current[key]||incoming[key]).map(key=>[key,Math.max(current[key]||0,incoming[key]||0)]));
}
function weighted(rng,weights){let value=rng.float()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++){value-=weights[i];if(value<0)return i;}return weights.length-1;}
export function rollPetTraits(seed,params=petTraitParams(),owned={}){
    validatePetTraits(owned);
    const rng=createRng(hashSeed('pet-traits:v1:'+seed)),keys=rng.shuffle(Object.keys(PET_TRAITS).filter(key=>key!=='gathering'));
    const count=weighted(rng,params.countWeights)+1,out={};
    for(const key of keys.slice(0,count))out[key]=weighted(rng,params.rankWeights)+1;
    const rare=rng.float()<params.rareChance;
    const candidates=keys.filter(key=>(owned[key]||0)<(rare?9:6));
    const key=rng.pick(candidates.length?candidates:keys);
    const rank=rare?Math.max(7+weighted(rng,params.rareRankWeights),Math.min(9,(owned[key]||0)+1))
        :candidates.length?Math.max(out[key]||1,(owned[key]||0)+1):Math.max(1,Math.min(6,(owned[key]||6)-1));
    if(!out[key]&&Object.keys(out).length>=count)delete out[Object.keys(out).at(-1)];
    out[key]=rank;
    // Preserve the original eight-trait RNG stream and combat stats for saved replays.
    if(Object.keys(out).length<3&&createRng(hashSeed('pet-gathering:v1:'+seed)).float()<params.gatheringChance)out.gathering=Math.max(...Object.values(out));
    return mergePetTraits({},out);
}
export function petTraitRows(traits={},params=petTraitParams()){
    validatePetTraits(traits);
    return Object.entries(traits).map(([key,rank])=>({key,rank,...PET_TRAITS[key],value:params.values[key][rank-1],legendary:rank>6}));
}
export function applyPetTraitStats(stats,traits={},params=petTraitParams()){
    const result=normalizeStats(stats);
    for(const row of petTraitRows(traits,params))if(row.stat){
        if(typeof result[row.stat]==='object')result[row.stat].all=(result[row.stat].all||0)+row.value;
        else result[row.stat]=(result[row.stat]||0)+row.value;
    }
    return result;
}
export function petHungerMultiplier(pet,content){return 1-(petTraitParams(content).values.frugal[(pet.passiveTraits?.frugal||0)-1]||0)/100;}
export function petTraitImprovements(current={},incoming={}){return Object.entries(incoming).filter(([key,rank])=>rank>(current[key]||0)).map(([key,rank])=>({key,from:current[key]||0,to:rank}));}

// A bounded local cache prevents retreat/reload from rerolling a living encounter.
// Victory drops that encounter's seed. Next respawn derives a fresh seed.
export function encounterPetTraitSeed(save,id,params=petTraitParams()){
    const cache=save.petTraitEncounters??={};
    if(!Object.hasOwn(cache,id)){
        cache[id]=hashSeed(`${save.seed}:pet-spawn:${id}:${save.encounterSerial}`);
        while(Object.keys(cache).length>params.encounterCacheSize)delete cache[Object.keys(cache)[0]];
    }
    return cache[id]?.seed??cache[id];
}
export function monsterPetTraits(seed,monster,index,params,owned={}){return rollPetTraits(`${seed}:${monster.id}:${index}`,params,owned);}
