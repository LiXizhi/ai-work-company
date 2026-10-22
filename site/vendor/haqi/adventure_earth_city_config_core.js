// Independently authored city packages and durable, city-scoped quest progress.
import {validateTimeScrollReference} from './adventure_time_scroll_core.js';
import {validateCityDungeons,validateCityDungeonProgress} from './adventure_city_dungeons_core.js';
import {earthCityChapterProgress,advanceEarthCityChapter} from './adventure_earth_core.js';
export {earthCityChapterProgress,advanceEarthCityChapter};
const fail=message=>{throw Error(message);};
export function earthCityStory(save,city,npc){
    const step=earthCityChapterProgress(save,city.quests).step;
    const override=(npc.dialogueOverrides||[]).filter(row=>step>=row.minStep).sort((a,b)=>b.minStep-a.minStep)[0];
    return city.dialogue.stories[override?.key||npc.dialogue];
}
function cityState(save,id){
    save.earthCityProgress??={version:1,cities:{}};
    return save.earthCityProgress.cities[id]??={chapters:{},quests:{}};
}
export function earthCityQuestState(save,city,id){
    return save.earthCityProgress?.cities?.[city.id]?.quests?.[id]||{accepted:false,stage:0,complete:false};
}
export function earthCityQuestOffers(save,city,npcId){
    const out=[];
    for(const quest of city?.sideQuests||[]){
        const state=earthCityQuestState(save,city,quest.id);
        if(state.complete)continue;
        if(!state.accepted&&quest.startNpc===npcId&&(quest.prerequisites||[]).every(id=>earthCityQuestState(save,city,id).complete))out.push({kind:'accept',quest});
        else if(state.accepted&&state.stage===quest.objectives.length&&quest.endNpc===npcId)out.push({kind:'complete',quest});
        else if(state.accepted&&quest.objectives[state.stage]?.npcId===npcId)out.push({kind:'talk',quest,objective:quest.objectives[state.stage]});
    }
    return out;
}
export function applyEarthCityQuest(save,city,npcId,questId,kind){
    const offer=earthCityQuestOffers(save,city,npcId).find(row=>row.quest.id===questId&&row.kind===kind);
    if(!offer)fail('当前不能推进这个城市任务');
    const previous=earthCityQuestState(save,city,questId),state={...previous};
    if(kind==='accept')state.accepted=true;
    if(kind==='talk')state.stage++;
    if(kind==='complete')state.complete=true;
    cityState(save,city.id).quests[questId]=state;save.revision++;
    return offer;
}
export function earthCityNpcMarker(save,city,npcId){
    const offers=earthCityQuestOffers(save,city,npcId);
    if(offers.some(row=>row.kind==='complete'))return '?';
    if(offers.some(row=>row.kind==='talk'))return '…';
    const progress=earthCityChapterProgress(save,city?.quests),step=city?.quests?.steps?.[progress.step];
    if(step?.npcId===npcId)return '!';
    return offers.some(row=>row.kind==='accept')?'!':null;
}
export function earthCityQuestTarget(save,city){
    for(const quest of city?.sideQuests||[]){
        const state=earthCityQuestState(save,city,quest.id);
        if(!state.accepted||state.complete)continue;
        const objective=quest.objectives[state.stage],npc=city.npcs.find(n=>n.id===(objective?.npcId||quest.endNpc));
        return {name:quest.title,description:objective?.label||`向${npc.name}回报`,destination:{lon:npc.lon,lat:npc.lat,name:npc.name}};
    }
    return null;
}
export function validateEarthCityProgress(value){
    if(value===undefined)return;
    if(value?.version!==1||!value.cities||typeof value.cities!=='object'||Array.isArray(value.cities))fail('城市任务记录无效');
    for(const state of Object.values(value.cities)){
        if(state.dungeons!==undefined){if(!state.dungeons||typeof state.dungeons!=='object'||Array.isArray(state.dungeons))fail('城市副本记录无效');for(const row of Object.values(state.dungeons))validateCityDungeonProgress(row);}
        if(!state?.chapters||!state.quests||typeof state.chapters!=='object'||typeof state.quests!=='object'||Array.isArray(state.chapters)||Array.isArray(state.quests))fail('城市任务记录无效');
        for(const row of Object.values(state.chapters))if(row?.version!==1||!Number.isInteger(row.step)||row.step<0||row.step>10000)fail('城市章节记录无效');
        for(const row of Object.values(state.quests))if(typeof row?.accepted!=='boolean'||typeof row.complete!=='boolean'||!Number.isInteger(row.stage)||row.stage<0||row.stage>10000||row.complete&&!row.accepted)fail('城市支线记录无效');
    }
}
export function validateEarthCity(city){
    validateTimeScrollReference(city?.timeScroll);
    validateCityDungeons(city);
    if(city?.version!==2||!/^[a-z0-9][a-z0-9-]*$/.test(city.id)||!city.name||!city.languages?.primary)fail('城市配置无效');
    const npcIds=new Set(),objectIds=new Set(),questIds=new Set();
    const art=city.art?.npcs;
    for(const entry of [art,city.art?.landmarks]){
        if(!entry||!entry.local?.endsWith('.webp')||!(entry.bytes>0&&entry.bytes<=200000)||!(entry.width>0&&entry.height>0)||!entry.frames?.length)fail('城市图集配置无效');
        for(const frame of entry.frames)if(frame.length!==4||!frame.every(Number.isFinite)||frame[0]<0||frame[1]<0||frame[2]<=0||frame[3]<=0||frame[0]+frame[2]>entry.width||frame[1]+frame[3]>entry.height)fail('城市图集裁剪无效');
    }
    for(const collection of [city.npcs,city.buildings,city.encounters,city.safeAreas]){
        if(!Array.isArray(collection))fail('城市组件缺失');
        for(const row of collection){
            if(objectIds.has(row.id)||!Number.isFinite(row.lon)||!Number.isFinite(row.lat)||Math.abs(row.lon)>180||Math.abs(row.lat)>90)fail('城市对象编号或坐标无效');objectIds.add(row.id);
        }
    }
    for(const npc of city.npcs){
        if(!Number.isSafeInteger(npc.id)||npc.id<=0||!art.frames[npc.frame]||npc.portrait?.id!==art.id||JSON.stringify(npc.portrait.crop)!==JSON.stringify(art.frames[npc.frame])||!npc.languages?.length||!city.dialogue?.stories?.[npc.dialogue])fail('城市居民引用无效');npcIds.add(npc.id);
        if((npc.services||[]).some(kind=>!['map','inventory','pet'].includes(kind)))fail('城市居民服务无效');
        for(const row of npc.dialogueOverrides||[])if(!Number.isInteger(row.minStep)||row.minStep<0||!city.dialogue.stories[row.key])fail('城市居民阶段故事无效');
    }
    const weights=city.characterGeneration?.appearanceWeights;
    if(!weights?.length||weights.some(row=>!(row.weight>=0)||!Number.isFinite(row.weight))||Math.abs(weights.reduce((n,row)=>n+row.weight,0)-1)>1e-6)fail('人物外观权重无效');
    const chapter=city.quests;
    if(!chapter?.id||chapter.cityId!==city.id||!Array.isArray(chapter.steps)||!chapter.steps.length)fail('城市章节配置无效');
    const stepIds=new Set();
    for(const step of chapter.steps){if(!step.id||stepIds.has(step.id)||!step.event||step.npcId&&!npcIds.has(step.npcId))fail('城市章节步骤无效');stepIds.add(step.id);}
    for(const story of Object.values(city.dialogue.stories))if(story.event&&!chapter.steps.some(step=>step.event===story.event))fail('城市故事事件无效');
    if(!city.learning?.prompts?.length||city.learning.prompts.some(row=>!row.id||!row.zh||!row.en||!row.question?.en||!row.question?.['zh-CN']))fail('城市学习配置无效');
    if(!Array.isArray(city.sideQuests))fail('城市支线配置无效');
    for(const quest of city.sideQuests){
        if(!quest.id?.startsWith(city.id+':')||questIds.has(quest.id)||!npcIds.has(quest.startNpc)||!npcIds.has(quest.endNpc)||!quest.objectives?.length)fail('城市支线引用无效');questIds.add(quest.id);
        const objectiveIds=new Set();
        for(const goal of quest.objectives)if(!goal.id||objectiveIds.has(goal.id)||!npcIds.has(goal.npcId))fail('城市支线目标无效');else objectiveIds.add(goal.id);
    }
    for(const quest of city.sideQuests)if((quest.prerequisites||[]).some(id=>!questIds.has(id)||id===quest.id))fail('城市支线前置无效');
    return city;
}
