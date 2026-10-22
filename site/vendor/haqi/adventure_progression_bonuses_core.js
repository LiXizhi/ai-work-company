import {statIdToEntry} from './combat_unit_core.js';
export const DRAGON_TOTEMS=[{id:50351,name:'巨龙之牙'},{id:50352,name:'巨龙之爪'},{id:50353,name:'巨龙之鳞'},{id:50354,name:'巨龙之心'}];
export function installDragonTotemItems(content) {
    for(const item of [...DRAGON_TOTEMS,{id:50359,name:'图腾经验'},{id:984,name:'魔豆'}]){
        content.items[item.id]??={...item,kind:0,stats:{},description:item.id===50359?'图腾信仰经验。':'图腾信仰相关物品。'};
    }
}
export function progressionStatEntry(id) {
    const value=Number(id),schools=['all','fire','ice','storm','myth','life','death','balance'];
    if(value>=151&&value<=158)return {stat:'damageAbs',school:schools[value-151]};
    if(value>=159&&value<=166)return {stat:'resistAbs',school:schools[value-159]};
    if(value===188)return {stat:'dodgePct'};
    if(value===376)return {stat:'critRatioBonus',scale:0.001};
    return statIdToEntry(value);
}
export function equipmentSetStats(equipped,config) {
    const counts={},stats={};
    for(const id of new Set(equipped)){
        const setId=config?.components?.[id];
        if(setId)counts[setId]=(counts[setId]||0)+1;
    }
    for(const [setId,count] of Object.entries(counts))for(const group of config.sets[setId]||[]){
        if(count<group.items)continue;
        for(const [id,value] of Object.entries(group.stats))stats[id]=(stats[id]||0)+value;
    }
    return {counts,stats};
}
export function dragonTotemStage(config,professionId,expId=50359,experience=0) {
    if(!Number.isSafeInteger(experience)||experience<0)throw Error('龙图腾经验无效');
    const rows=config?.professions?.[professionId]||[];
    return [...rows].sort((left,right)=>right.exp-left.exp).find(row=>row.expId===expId&&experience>=row.exp)||null;
}
export function chooseDragonTotem(save,content,professionId) {
    const professions=DRAGON_TOTEMS.map(row=>row.id);
    if(save.pendingEncounter)throw Error('请先完成当前战斗');
    if(!professions.includes(professionId)||!content.items[professionId]||!content.progressionBonuses?.professions?.[professionId]?.length)throw Error('图腾配置不可用');
    const owned=professions.filter(id=>(save.inventory[id]||0)>0);
    if(owned.length>1)throw Error('图腾信仰记录冲突');
    if(owned[0]===professionId)throw Error('已经学习该图腾');
    const experience=save.inventory[50359]??0;
    dragonTotemStage(content.progressionBonuses,professionId,50359,experience);
    const cost=owned.length?50:0;
    const balance=save.inventory[984]??0;
    if(!Number.isSafeInteger(balance)||balance<cost)throw Error('转换信仰需要50魔豆');
    if(cost)save.inventory[984]=balance-cost;
    if(owned.length)delete save.inventory[owned[0]];
    save.inventory[professionId]=1;
}
export function dragonTotemItemExperience(save,content,itemId) {
    const item=content.items[itemId],itemLevel=Number(item?.stats?.[70]),base=Number(item?.stats?.[71]);
    if(!DRAGON_TOTEMS.some(row=>(save.inventory[row.id]||0)>0)||item?.kind===1||item?.slot)return 0;
    if(!Number.isSafeInteger(itemLevel)||itemLevel<0||!Number.isSafeInteger(base)||base<=0)return 0;
    const stage=dragonTotemStage(content.progressionBonuses,50351,50359,save.inventory[50359]??0);
    if(!stage)return 0;
    const maxLevel=Math.max(...(content.progressionBonuses?.professions?.[50352]||[]).map(row=>row.level));
    if(stage.level>=maxLevel)return 0;
    const difference=Math.floor(Math.abs(itemLevel*3-stage.level)/3);
    return Math.max(0,Math.floor(base*(1-0.3*difference)));
}
export function useDragonTotemItem(save,content,itemId) {
    if(save.pendingEncounter)throw Error('请先完成当前战斗');
    const count=save.inventory[itemId]??0;
    const gain=dragonTotemItemExperience(save,content,itemId);
    if(!Number.isSafeInteger(count)||count<1||gain<=0)throw Error('图腾经验道具不可用或等级不匹配');
    const experience=(save.inventory[50359]??0)+gain;
    if(!Number.isSafeInteger(experience))throw Error('图腾经验超出范围');
    save.inventory[itemId]=count-1;
    save.inventory[50359]=experience;
}