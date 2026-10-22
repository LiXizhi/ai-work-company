import {equipmentInstances,findEquipmentInstance,syncEquipmentInstances} from './adventure_equipment_instances_core.js';
import {defaultParams} from './combat_params_core.js';
import {createRng,hashSeed} from './rng_core.js';

// 30042_SueSue_equipment_extend_panel.lua L186–258: kids categories / stat 36 sockets.
export const GEM_FILTERS=[['全部',[2,5,6,7,8,10,11,15,16,17]],['帽子',[2]],['衣服',[5,6]],['鞋子',[7]],['饰品',[15,16,17]],['背部',[8]],['武器',[10,11]]];
export const isGem=item=>!!item&&item.id>=26001&&item.id<=26699&&item.stats[41]>0;
export function gemEquipment(save,c,filter=0){return equipmentInstances(save,c).rows.filter(row=>{const i=c.items[row.gsid];return i.kind===1&&i.stats[36]>0&&(GEM_FILTERS[filter]||GEM_FILTERS[0])[1].includes(i.subtype??i.slot);});}
const has=(gem,ids)=>ids.some(id=>gem.stats[id]>0);
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
// extend_panel.lua L218–240 and extend_bagpage.html L163–364: both original checks apply.
export function gemCompatibility(item,gem){
    if(!item||!isGem(gem)||!(item.stats[36]>0))return '请选择可镶嵌的装备和宝石。';
    const slot=item.subtype??item.slot,type=Number(gem.stats[42]),weapon=[10,11].includes(slot),jewel=[15,16].includes(slot);
    if(([2,8,5,17,7].includes(slot)&&(type===19||type===20||(type>=12&&type<=15)))||
       (jewel&&(type===19||type>=1&&type<=6))||(slot===11&&(type===1||type===20||type>=7&&type<=18)))return '这类宝石不能镶嵌在该装备部位。';
    if(weapon&&!has(gem,[...range(111,118),...range(212,219)]))return '武器只能镶嵌攻击或穿透宝石。';
    if(jewel&&!has(gem,[...range(103,110),...range(119,126),102,182,183]))return '手镯和戒指只能镶嵌命中、防御、超魔、治疗或被治疗宝石。';
    if(!jewel&&has(gem,range(103,110)))return '命中宝石只能镶嵌在手镯和戒指上。';
    if(!weapon&&has(gem,range(212,219)))return '穿透宝石只能镶嵌在武器上。';
    return null;
}
export function gemPreview(save,c,{guid,gemId,runes=[]}){
    const instance=guid?findEquipmentInstance(save,c,null,guid):null,item=c.items[instance?.gsid],gem=c.items[gemId];
    const ins=instance?.serverdata.gem?.ins||[],p={...defaultParams('kids').gems,...c.balanceParams?.gems};
    const level=Number(gem?.stats[41]||0),counts={};
    let error=!gemEquipment(save,c).some(row=>row.guid===guid)?'请先放入可镶嵌的装备。':gemCompatibility(item,gem);
    const replacement=ins.find(id=>c.items[id]?.stats[42]===gem?.stats[42]);
    const odds=Math.min(100,(p.odds[level-1]||0)+runes.reduce((n,id)=>n+(c.items[id]?.stats[35]||0),0));
    if(!error&&!(save.inventory[gemId]>0))error='背包中没有这颗宝石。';
    if(!error&&replacement&&c.items[replacement].stats[41]>=level)error='装备上已有同类同级或更高级的宝石。';
    if(!error&&!replacement&&ins.length>=item.stats[36])error='宝石槽已满，只能替换同类宝石。';
    if(runes.length>3)error='最多放入三张镶嵌符。';
    for(const id of runes){counts[id]=(counts[id]||0)+1;if(![26701,26702,26703].includes(id)||counts[id]>(save.inventory[id]||0))error='镶嵌符数量不足。';}
    if(!error&&level>=4&&odds<100)error='四级及以上宝石必须达到100%成功率。';
    if(save.pendingEncounter)error='请先完成当前战斗。';
    return {instance,item,gem,ins,replacement,level,odds,counts,error};
}
// extend_panel.lua GetAllOdds / DoExchange L324–437. Original PowerAPI owns random settlement;
// the offline adapter uses the displayed odds and stat 38 downgrade, with a persisted seeded serial.
export function mountGem(save,c,action){
    const p=gemPreview(save,c,action);if(p.error)throw Error(p.error);
    if(p.replacement&&!action.confirmReplace)throw Error('请确认替换：原有同类宝石会消失。');
    const serial=(save.gemSerial||0)+1,rng=createRng(hashSeed(`${save.seed}:gem:${serial}`));
    const success=rng.int(1,100)<=p.odds,lower=p.gem.stats[38];
    if(!success&&p.level>1&&!isGem(c.items[lower]))throw Error('缺少降级宝石配置，未消耗材料。');
    syncEquipmentInstances(save,c);
    const data=save.equipmentInstances.find(row=>row.guid===action.guid).serverdata;
    save.inventory[action.gemId]--;
    for(const [id,n] of Object.entries(p.counts))save.inventory[id]-=n;
    if(success){data.gem??={holecnt:0,ins:[]};data.gem.ins=p.ins.filter(id=>id!==p.replacement).concat(action.gemId);}
    else if(lower)save.inventory[lower]=(save.inventory[lower]||0)+1;
    save.gemSerial=serial;
    return {success,message:success?`${p.gem.name}镶嵌成功！`:`镶嵌失败，${lower?`宝石降为${c.items[lower].name}，已放回背包`:'宝石破碎消失'}。`};
}
// cutgem_panel.html L28–41, L89–119, L231–245: 99% + fixed 1%, one spoon per gem.
export function removeGems(save,c,{guid,gemIds}){
    const instance=guid?findEquipmentInstance(save,c,null,guid):null,ins=instance?.serverdata.gem?.ins||[];
    if(save.pendingEncounter)throw Error('请先完成当前战斗。');
    if(!Array.isArray(gemIds)||!gemIds.length||new Set(gemIds).size!==gemIds.length||gemIds.some(id=>!ins.includes(id)||!isGem(c.items[id])))throw Error('请选择装备上要剥离的宝石。');
    if((save.inventory[17179]||0)<gemIds.length)throw Error('宝石调羹不足，每颗宝石需要一个。');
    if(gemIds.some(id=>(save.inventory[id]||0)>=(c.items[id].maxCopiesInStack||1000)))throw Error('背包中同类宝石已达到堆叠上限，暂时无法剥离。');
    syncEquipmentInstances(save,c);save.inventory[17179]-=gemIds.length;
    save.equipmentInstances.find(row=>row.guid===guid).serverdata.gem.ins=ins.filter(id=>!gemIds.includes(id));
    for(const id of gemIds)save.inventory[id]=(save.inventory[id]||0)+1;
    return {success:true,message:`成功剥离${gemIds.length}颗宝石，已放回背包。`};
}
