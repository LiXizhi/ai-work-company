import {createRng,hashSeed} from './rng_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';

export const fishingTuning=resolveParams({version:'kids'},defaultParams('kids')).fishing;
// The six catches (including the boot) in exported ExtendedCost bundles, not arbitrary items.
export const fishingSpecies=[17106,17107,17108,17109,17110,17111];
const order=(a,b)=>b.grams-a.grams||a.serial-b.serial;
export const fishWeight=grams=>`${(grams/1000).toFixed(3)} 千克`;
export function fishingQuality(performance){
    if(performance===undefined)return null; // Older clients retain their original weight distribution.
    const {hits,rounds,mistakes}=performance||{};
    if(!Number.isInteger(rounds)||rounds<1||rounds>fishingTuning.fishingMaxPulls||!Number.isInteger(hits)||hits<0||hits>rounds||!Number.isInteger(mistakes)||mistakes<0||mistakes>rounds)throw Error('钓鱼操作记录无效');
    return Math.max(0,hits/rounds-mistakes*fishingTuning.fishingMistakePenalty);
}
export function fishSize(grams){return grams>=fishingTuning.fishingHugeGrams?'huge':grams>=fishingTuning.fishingLargeGrams?'large':'normal';}
export function validateFishingRecords(save){
    const record=save.fishingRecords;
    if(record===undefined)return;
    const valid=(ok)=>{if(!ok)throw Error('钓鱼重量纪录无效');};
    valid(record&&record.version===1&&Number.isSafeInteger(record.total)&&record.total>=0&&record.total<Number.MAX_SAFE_INTEGER);
    valid(Object.keys(record).every(key=>['version','total','byFish'].includes(key)));
    valid(record.byFish&&typeof record.byFish==='object'&&!Array.isArray(record.byFish));
    const seen=new Set();
    for(const [id,rows] of Object.entries(record.byFish)){
        valid(fishingSpecies.map(String).includes(id)&&Array.isArray(rows)&&rows.length>0&&rows.length<=10);
        rows.forEach((row,i)=>{
            valid(row&&Number.isSafeInteger(row.serial)&&row.serial>0&&row.serial<=record.total&&!seen.has(row.serial));
            valid(Object.keys(row).every(key=>['serial','grams'].includes(key)));
            valid(Number.isInteger(row.grams)&&row.grams>=fishingTuning.fishingMinGrams&&row.grams<=fishingTuning.fishingMaxGrams);
            valid(!i||order(rows[i-1],row)<=0);seen.add(row.serial);
        });
    }
    valid(record.total===0?seen.size===0:seen.size>0);
}
export function recordFishingCatch(save,items,performance){
    validateFishingRecords(save);
    const quality=fishingQuality(performance);
    const catches=[];
    for(const item of items){
        if(!fishingSpecies.includes(item.id))continue;
        const record=save.fishingRecords??={version:1,total:0,byFish:{}};
        const rows=record.byFish[item.id]??=[];
        for(let i=0;i<item.count;i++){
            const serial=++record.total;
            // Dedicated stream: never advance or fork the reward RNG.
            const rng=createRng(hashSeed(`${save.seed}:fish-weight:${serial}:${item.id}`));
            const roll=rng.float()**fishingTuning.fishingWeightPower;
            const floor=quality===null?0:fishingTuning.fishingPerfectWeightFloor*quality**3;
            const ceiling=quality===null?1:fishingTuning.fishingSmallWeightRatio+(1-fishingTuning.fishingSmallWeightRatio)*quality**2;
            const grams=Math.round(fishingTuning.fishingMinGrams+(fishingTuning.fishingMaxGrams-fishingTuning.fishingMinGrams)*(floor+(ceiling-floor)*roll));
            const best=rows[0]?.grams||0;
            rows.push({serial,grams});rows.sort(order);rows.splice(10);
            catches.push({itemId:item.id,serial,grams,newBest:grams>best});
        }
    }
    for(const row of catches)row.rank=save.fishingRecords.byFish[row.itemId].findIndex(r=>r.serial===row.serial)+1;
    return catches;
}
// Readable workspace mirror; role saves remain authoritative for conflict recovery.
export function fishingRecordsFile(catalog,owner,revision){
    return {version:1,owner,revision,roles:catalog.roles.map(row=>({roleId:row.id,records:row.save.fishingRecords||{version:1,total:0,byFish:{}}}))};
}
