// Walkable time segments, inspired by LifeStory scroll_core; no calendar claim
// is inferred from an illustration. Coordinates are deliberately NOT linear years.
import {generatedCityId} from './adventure_city_generated_core.js';
import {resolveParams} from './combat_params_core.js';

const assert=(ok,message)=>{if(!ok)throw Error(message);};
const id=value=>typeof value==='string'&&/^[-a-zA-Z0-9_:]{1,150}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
export const timeScrollParams=content=>resolveParams({version:'kids'},content?.balanceParams||{}).timeScroll;
export const TIME_SCROLL_DEFAULT='data/adventure/earth/time-scroll/common.json';
export function validateTimeScrollReference(value){
    assert(value===undefined||typeof value==='string'&&/^data\/adventure\/earth\/time-scroll\/[a-z0-9-]+\.json$/.test(value),'时光内容引用无效');
}
export function timeScrollCity(world,save){
    if(!world||(!world.isEarth&&!world.isCityDungeon))return null;
    const authored=world.city;
    if(authored){const at=authored.entrance||authored;return {id:authored.id,name:authored.name,lon:at.lon,lat:at.lat,timeScroll:authored.timeScroll};}
    const radius=world.earthRules?.cityInfluenceRadius||resolveParams({version:'kids'},{}).earth.cityInfluenceRadius;
    const nearest=(world.mapCities||[]).map(row=>({row,d:Math.hypot(row.x-save.position.x,row.y-save.position.y)})).filter(row=>row.d<=radius).sort((a,b)=>a.d-b.d||String(a.row.id).localeCompare(String(b.row.id)))[0]?.row;
    return nearest?{...nearest,id:generatedCityId(nearest)}:null;
}
export function validateTimeScrollContent(data){
    assert(data?.version===1&&id(data.id)&&Array.isArray(data.stations)&&data.stations.length>=2&&data.stations.length<=12,'时光长卷内容无效');
    assert(Number.isFinite(data.spacing)&&data.spacing>=400&&data.spacing<=1600,'时光长卷间距无效');
    const ids=new Set(),stories=new Set();let previous=Infinity;
    const bilingual=row=>object(row)&&['zh-CN','en'].every(k=>typeof row[k]==='string'&&row[k].length>0&&row[k].length<1000);
    for(const [index,station]of data.stations.entries()){
        assert(id(station.id)&&!ids.has(station.id)&&typeof station.label==='string'&&Number.isInteger(station.yearsAgo)&&station.yearsAgo>=0&&station.yearsAgo<previous,'时光站点顺序或身份无效');ids.add(station.id);previous=station.yearsAgo;
        if(index===data.stations.length-1){assert(station.yearsAgo===0,'时光长卷终点必须是现在');continue;}
        const {traveler,clue,story}=station;
        assert(traveler?.name&&['boy','girl'].includes(traveler.appearance)&&bilingual(station.reading),'时光旅人内容缺失');
        assert(id(clue?.id)&&clue.name&&bilingual(clue.text),'探索线索无效');
        assert(id(story?.id)&&story.id.startsWith('time-scroll:')&&!stories.has(story.id)&&story.title&&story.context&&story.turns?.length===3,'旅人故事无效');stories.add(story.id);
        const turns=new Set();for(const turn of story.turns){assert(id(turn.id)&&turn.id.length<100&&!turns.has(turn.id)&&bilingual(turn.question)&&bilingual(turn.answer)&&bilingual(turn.response)&&typeof turn.pattern==='string'&&typeof turn.hint==='string','旅人对话无效');turns.add(turn.id);}
    }
    return data;
}
export const timeScrollEnd=data=>(data.stations.length-1)*data.spacing;
export const clampTimePosition=(data,x)=>Math.max(0,Math.min(timeScrollEnd(data),Number.isFinite(x)?x:timeScrollEnd(data)));
export function timeStationIndex(data,x){return Math.round(clampTimePosition(data,x)/data.spacing);}
export function visibleTimeStations(data,x){const index=timeStationIndex(data,x);return data.stations.map((station,i)=>({...station,index:i,x:i*data.spacing})).filter(row=>Math.abs(row.index-index)<=1);}
export function moveTimePosition(data,x,target,dt,speed=timeScrollParams().walkSpeed){const from=clampTimePosition(data,x),to=clampTimePosition(data,target);return clampTimePosition(data,from+Math.sign(to-from)*Math.min(Math.abs(to-from),Math.max(0,Math.min(dt,.05))*speed));}
export const timeDiscoveryKey=(data,station)=>`${data.id}:${station.id}:${station.clue.id}`;
export function timeDiscoveries(save,cityId){return save.timeScrollProgress?.cities?.[cityId]||[];}
export function discoverTimeClue(save,cityId,data,stationId,x,content){
    assert(id(cityId)&&!save.pendingEncounter,'当前不能探索时光线索');
    const index=data.stations.findIndex(row=>row.id===stationId),station=data.stations[index];
    assert(station?.clue&&Math.abs(x-(index*data.spacing+160))<=timeScrollParams(content).interactionRange,'请先走到线索旁边');
    const key=timeDiscoveryKey(data,station),previous=timeDiscoveries(save,cityId);
    if(previous.includes(key))return false;
    save.timeScrollProgress??={version:1,cities:{}};
    save.timeScrollProgress.cities[cityId]=[...previous,key];save.revision++;return true;
}
export function validateTimeScrollProgress(value){
    if(value===undefined)return;
    assert(value?.version===1&&object(value.cities)&&Object.keys(value.cities).length<=10000,'时光探索记录无效');
    for(const [city,rows]of Object.entries(value.cities))assert(id(city)&&Array.isArray(rows)&&rows.length<=200&&new Set(rows).size===rows.length&&rows.every(id),'时光发现记录无效');
}
export function validateTimeScrollRuntime(value){
    if(value===undefined)return;
    assert(object(value)&&value.version===1&&id(value.cityId)&&id(value.contentId)&&typeof value.zone==='string'&&value.zone.length<160&&Number.isFinite(value.x)&&value.x>=0&&value.x<=17600&&typeof value.active==='boolean','本机时光位置无效');
    assert(object(value.returnPosition)&&Number.isFinite(value.returnPosition.x)&&Number.isFinite(value.returnPosition.y),'时光返回位置无效');
}
export function resumeTimePosition(save,city,data){
    const row=save.timeScrollRuntime;
    return row?.cityId===city.id&&row.contentId===data.id&&row.zone===save.zone?clampTimePosition(data,row.x):timeScrollEnd(data);
}
// The existing story schema is shared across cities and contains no transcripts.
export function completeTimeStory(save,data,completion){
    const story=data.stations.find(s=>s.story?.id===completion.story?.id)?.story;
    assert(story&&['en','zh-CN'].includes(completion.locale)&&save.languageLearning?.enabled&&save.languageLearning.target===completion.locale,'时光学习场景已变化');
    assert(completion.score===100&&completion.answered&&Number.isSafeInteger(completion.now)&&completion.now>=0,'时光对话尚未完成');
    assert(JSON.stringify(completion.story.turnIds)===JSON.stringify(story.turns.map(t=>t.id))&&completion.story.proof?.length===3&&completion.story.proof.every((p,i)=>p.turnId===story.turns[i].id&&['text','speech'].includes(p.input)&&typeof p.quote==='string'&&p.quote.trim()),'时光对话凭据无效');
    save.languageAdventure??={version:1,progress:{}};save.languageAdventure.stories??={};
    const rows=save.languageAdventure.stories[completion.locale]??={};
    if(!rows[story.id]?.completed){rows[story.id]={completed:1,firstAt:completion.now,lastAt:completion.now,hintsUsed:completion.story.hintsUsed===true,passedTurns:story.turns.map(t=>t.id)};save.revision++;}
    return {amount:0,currency:100};
}
