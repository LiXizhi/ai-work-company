// Authored city nodes, scene interactions and durable progress. No browser IO.
import {mapCoordinateVersion,migrateLocationCoordinates} from './adventure_coordinates_core.js';
import {resolveParams} from './combat_params_core.js';
import {validateStreetscape,safeStreetPosition} from './adventure_city_street_core.js';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export const isCityDungeonId=id=>typeof id==='string'&&id.startsWith('city:');
export const generatedCityId=row=>`generated-${String(row.id)}`;
export const generatedCityDungeonId=row=>`city:${generatedCityId(row)}:default`;
export function validateGeneratedCityRoute(row){
    if(row?.generationVersion!=null&&![1,2,3].includes(row.generationVersion))throw Error('自动城市版本无效');
    if(!row||!/^[-a-zA-Z0-9_]{1,60}$/.test(String(row.id))||typeof row.name!=='string'||!row.name||row.name.length>100||!Number.isFinite(row.lon)||Math.abs(row.lon)>180||!Number.isFinite(row.lat)||Math.abs(row.lat)>90||!Number.isInteger(row.challengeLevel)||row.challengeLevel<1||row.challengeLevel>60||!Number.isInteger(row.partySize)||row.partySize<1||row.partySize>4)throw Error('自动城市入口记录无效');
    return row;
}
export function dungeonFor(content,id){return content.dungeons?.find(d=>d.id===id);}
export function dungeonProgress(save){return save?.coopRun?.runs||save?.dungeonRuns||{};}
export function cityEntranceAppearance(level,node=false){
    const known=Number.isInteger(level)&&level>=1&&level<=5,tier=known?level:5;
    const colors=['#efc45a','#bb8aeb','#62bde9','#70bc81','#94b4b0'];
    const w=node?46:64-(tier-1)*4;
    return {tier,color:colors[tier-1],w,h:w*138/240,rings:known?6-tier:1};
}
export const cityDungeonState=(save,cityId,id)=>save.earthCityProgress?.cities?.[cityId]?.dungeons?.[id]||{version:1,done:[],items:{},cleared:[]};
function storeState(save,cityId,id,state){
    save.earthCityProgress??={version:1,cities:{}};
    const city=save.earthCityProgress.cities[cityId]??={chapters:{},quests:{}};
    city.dungeons??={};city.dungeons[id]=state;
}
export function cityActionStatus(state,action){
    if(state.done.includes(action.id))return 'complete';
    if((action.requires||[]).some(id=>!state.done.includes(id))||(action.requiresBattles||[]).some(id=>!state.cleared.includes(id)))return 'locked';
    if(Object.entries(action.consume||{}).some(([id,n])=>(state.items[id]||0)<n))return 'locked';
    return 'ready';
}
export function applyCityInteraction(save,dungeon,actionId){
    assert(save.zone===dungeon.id&&!save.pendingEncounter,'请先结束战斗并进入对应地点');
    const action=dungeon.scene.actions.find(row=>row.id===actionId);assert(action,'这里没有这个操作');
    const previous=cityDungeonState(save,dungeon.cityId,dungeon.id),status=cityActionStatus(previous,action);
    if(status==='complete')return {changed:false,message:action.reply};
    assert(status==='ready','请先完成提示中的准备');
    const next=structuredClone(previous);
    for(const [id,n]of Object.entries(action.consume||{}))next.items[id]-=n;
    for(const [id,n]of Object.entries(action.give||{}))next.items[id]=(next.items[id]||0)+n;
    next.done.push(action.id);storeState(save,dungeon.cityId,dungeon.id,next);save.revision++;
    return {changed:true,message:action.reply};
}
export function cityBattleReady(save,dungeon,encounterId){
    const encounter=dungeon.scene.encounters.find(row=>row.id===encounterId),state=cityDungeonState(save,dungeon.cityId,dungeon.id);
    return !!encounter&&!state.cleared.includes(encounterId)&&(encounter.requires||[]).every(id=>state.done.includes(id));
}
export function recordCityBattleWin(save,dungeon,encounterId){
    assert(cityBattleReady(save,dungeon,encounterId),'城市战斗条件无效');
    const next=structuredClone(cityDungeonState(save,dungeon.cityId,dungeon.id));next.cleared.push(encounterId);
    storeState(save,dungeon.cityId,dungeon.id,next);
}
export function validateCityDungeonProgress(state){
    assert(state?.version===1&&Array.isArray(state.done)&&Array.isArray(state.cleared)&&state.items&&typeof state.items==='object'&&!Array.isArray(state.items),'城市副本记录无效');
    for(const rows of [state.done,state.cleared])assert(rows.length<=1000&&new Set(rows).size===rows.length&&rows.every(id=>typeof id==='string'&&id.length<=160),'城市副本事件记录无效');
    assert(Object.keys(state.items).length<=1000&&Object.values(state.items).every(n=>Number.isSafeInteger(n)&&n>=0&&n<=10000),'城市场景道具记录无效');
}
export function validateCityDungeons(city){
    if(!city.nodes&&!city.entrance)return;
    assert(city.entrance&&Array.isArray(city.nodes)&&city.nodes.length<=100&&city.nodes.length>0,'城市节点配置无效');
    const validGeo=p=>p&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90;
    assert(validGeo(city.entrance)&&city.entrance.dungeonId===`city:${city.id}:overview`&&(city.entrance.level==null||Number.isInteger(city.entrance.level)&&city.entrance.level>=1&&city.entrance.level<=5),'城市入口配置无效');
    const nodes=new Set(),sources=new Set(),dungeons=new Set(),npcIds=new Set(city.npcs.map(n=>n.id));
    for(const node of city.nodes){
        const d=node.dungeon;
        assert(/^[a-z0-9][a-z0-9-]*$/.test(node.id)&&node.id!=='overview'&&node.cityId===city.id&&node.name&&validGeo(node)&&!nodes.has(node.id),'城市节点身份无效');nodes.add(node.id);
        assert(['authored','csv'].includes(node.source?.kind)&&typeof node.source.id==='string'&&node.source.id.length>0,'城市节点来源无效');
        const identity=`${node.source.kind}:${node.source.id}`;assert(!sources.has(identity),'城市节点来源重复');sources.add(identity);
        if(node.source.kind==='authored')assert(city.buildings.some(b=>b.id===node.source.id),'城市地标引用无效');
        assert(d?.id===`city:${city.id}:${node.id}`&&!dungeons.has(d.id),'城市副本身份无效');dungeons.add(d.id);
        const map=d.map;
        const at=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=40&&p.y>=40&&p.x<=map.w-40&&p.y<=map.h-40;
        const maxSize=d.streetscape?8192:3000;
        assert(map&&map.w>=600&&map.w<=maxSize&&map.h>=600&&map.h<=maxSize&&at(map.spawn)&&at(map.exit),'城市副本地图无效');
        for(const rect of map.obstacles||[])assert(Number.isFinite(rect.x)&&Number.isFinite(rect.y)&&rect.x>=0&&rect.y>=0&&rect.w>0&&rect.h>0&&rect.x+rect.w<=map.w&&rect.y+rect.h<=map.h,'城市场景障碍无效');
        assert(Array.isArray(d.hotspots)&&Array.isArray(d.actions)&&Array.isArray(d.encounters)&&Array.isArray(d.npcs)&&d.items&&typeof d.items==='object','城市副本组件缺失');
        for(const p of [map.spawn,map.exit,...d.npcs,...d.hotspots,...d.encounters])assert(!(map.obstacles||[]).some(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h),'城市场景障碍阻挡必要点位');
        const spots=new Set(),actions=new Set(),battles=new Set();
        for(const n of d.npcs)assert(npcIds.has(n.id)&&at(n),'城市副本居民引用无效');
        for(const h of d.hotspots){assert(h.id&&!spots.has(h.id)&&at(h)&&h.name&&['npc','counter','materials','workbench','sign','binoculars','station','garden'].includes(h.kind),'城市互动点无效');spots.add(h.id);if(h.npcId)assert(d.npcs.some(n=>n.id===h.npcId),'互动居民缺失');}
        for(const e of d.encounters){assert(e.id.startsWith(d.id+':')&&!battles.has(e.id)&&e.monsterId&&at(e),'城市遭遇身份无效');battles.add(e.id);}
        for(const a of d.actions){assert(a.id?.startsWith(d.id+':')&&!actions.has(a.id)&&spots.has(a.hotspot)&&a.label&&a.reply,'城市互动引用无效');actions.add(a.id);}
        for(const a of d.actions){
            assert((a.requires||[]).every(id=>actions.has(id)&&id!==a.id)&&(a.requiresBattles||[]).every(id=>battles.has(id)),'城市互动前置无效');
            for(const items of [a.consume,a.give])assert(!items||Object.entries(items).every(([id,n])=>Object.hasOwn(d.items,id)&&Number.isSafeInteger(n)&&n>0&&n<=100),'场景道具引用无效');
        }
        for(const e of d.encounters)assert((e.requires||[]).every(id=>actions.has(id)),'城市战斗前置无效');
        // Detect dependency cycles, including action → battle → action cycles.
        const graph=new Map([...d.actions.map(a=>[a.id,[...(a.requires||[]),...(a.requiresBattles||[])]]),...d.encounters.map(e=>[e.id,e.requires||[]])]),visiting=new Set(),visited=new Set();
        const visit=id=>{assert(!visiting.has(id),'城市事件前置成环');if(visited.has(id))return;visiting.add(id);for(const dep of graph.get(id)||[])visit(dep);visiting.delete(id);visited.add(id);};
        for(const id of graph.keys())visit(id);
        assert(d.completion?.length&&d.completion.every(id=>actions.has(id)),'城市完成条件无效');
        const reachable={done:[],cleared:[],items:{}};let changed=true;
        while(changed){changed=false;for(const a of d.actions)if(cityActionStatus(reachable,a)==='ready'){reachable.done.push(a.id);for(const [id,n]of Object.entries(a.consume||{}))reachable.items[id]-=n;for(const [id,n]of Object.entries(a.give||{}))reachable.items[id]=(reachable.items[id]||0)+n;changed=true;}for(const e of d.encounters)if(!reachable.cleared.includes(e.id)&&(e.requires||[]).every(id=>reachable.done.includes(id))){reachable.cleared.push(e.id);changed=true;}}
        assert(d.completion.every(id=>reachable.done.includes(id)),'城市故事缺少可达的完成路径');
        for(const a of d.actions)if(a.learning)assert(a.learning.id?.startsWith(d.id+':')&&a.learning.prompts?.length&&a.learning.prompts.every(p=>p.zh&&p.en&&p.question?.en&&p.question?.['zh-CN']),'城市语言课程无效');
        validateStreetscape(d);
    }
}
export function validateCityNodeBindings(cities){
    const bindings=new Map();
    for(const city of cities)for(const node of city.nodes||[]){const key=node.source.kind==='csv'?`csv:${node.source.id}`:`authored:${node.cityId}:${node.source.id}`;assert(!bindings.has(key),`城市节点重复归属：${key}`);bindings.set(key,city.id);}
    return bindings;
}
export function cityNodeForSource(city,source){return city.nodes?.find(n=>n.source.kind==='csv'&&n.source.id===String(source.id));}
export function installCityDungeons(content,city){
    validateCityDungeons(city);validateCityNodeBindings([...Object.values(content.earthCities||{}).filter(c=>c.id!==city.id),city]);
    const overviewHeight=Math.max(1000,940+Math.floor((city.nodes.length-1)/3)*160);
    const entries=[{id:`city:${city.id}:overview`,name:`${city.name}城市总览`,nodeId:null,scene:{map:{w:1200,h:overviewHeight,spawn:{x:600,y:overviewHeight-240},exit:{x:600,y:overviewHeight-120}},npcs:[],encounters:[],hotspots:[],actions:[],items:{}}},...city.nodes.map(n=>({...n.dungeon,name:n.name,nodeId:n.id,scene:n.dungeon}))];
    const base=content.worldMaps.camp;
    for(const entry of entries){
        const scene=entry.scene,{w,h,spawn,exit}=scene.map;
        const rules=structuredClone(base.rules);rules.terrain.base='#d6e8bf';rules.terrain.ocean='#609cb4';
        const landmarks=entry.nodeId?scene.hotspots.filter(h=>!h.npcId).map(h=>({...h,visualKind:h.kind,cityHotspot:h.id,description:h.description||''})):city.nodes.map((n,i)=>({id:n.id,name:n.name,x:300+i%3*300,y:540+Math.floor(i/3)*160,dungeonId:n.dungeon.id,cityDungeon:true,cityLevel:city.entrance.level,cityNodeEntrance:true}));
        const layout={id:entry.id,name:entry.name,w,h,spawn,initialSpawn:spawn,center:spawn,portal:exit,rules,baseBiome:'grass',coast:[[20,20],[w-20,20],[w-20,h-20],[20,h-20]],regions:[],paths:[],trees:[],buildings:[],landmarks,rivers:[],lakes:[],bridges:[],mountains:[],farms:[],npcPositions:{},encounterPositions:Object.fromEntries(scene.encounters.map(e=>[e.id,[e.x,e.y]])),cityScene:scene};
        const dungeon={...entry,cityId:city.id,kind:'city',loaded:true,playable:true,arenas:scene.encounters.map(e=>({...e,blocked:[],monsterIds:e.monsterIds||[e.monsterId]})),mapInfo:{w,h,spawn,initialSpawn:spawn,retainPreviousPosition:true}};
        content.dungeons=[...(content.dungeons||[]).filter(d=>d.id!==entry.id),dungeon];content.worldMaps[entry.id]=layout;content.worldMapIndex.islands[entry.id]=dungeon.mapInfo;
        content.encounters=[...content.encounters.filter(e=>e.zone!==entry.id),...scene.encounters.map(e=>({...e,zone:entry.id,monsterIds:e.monsterIds||[e.monsterId],monsterSlots:e.monsterSlots||[0],blocked:[],staminaCost:0}))];
    }
    content.earthCities={...content.earthCities,[city.id]:city};return entries;
}
export function createCityDungeonWorld(content,save,dungeon){
    const layout=content.worldMaps[dungeon.id],city=content.earthCities[dungeon.cityId],scene=dungeon.scene;
    const params=resolveParams({version:'kids'},content.balanceParams||{});
    const npcs=scene.npcs.map(row=>({...city.npcs.find(n=>n.id===row.id),...row,zone:dungeon.id,cityId:city.id,cityDungeonNpc:true,cityHotspot:scene.hotspots.find(h=>h.npcId===row.id)?.id,hidden:false}));
    const state=cityDungeonState(save,city.id,dungeon.id);
    if(scene.streetscape&&save.zone===dungeon.id)save.position=safeStreetPosition(scene,save.position);
    save.dungeonRuns??={};save.dungeonRuns[dungeon.id]={cleared:[...state.cleared]};
    return {zone:dungeon.id,isDungeon:true,isCityDungeon:true,city,dungeon,w:layout.w,h:layout.h,layout,center:layout.spawn,interactionParams:params.adventure,monsterSceneParams:params.monsterScene,npcs,encounters:content.encounters.filter(e=>e.zone===dungeon.id&&cityBattleReady(save,dungeon,e.id)).map(e=>({...e})),landmarks:layout.landmarks.map(mark=>({...mark,cityDone:scene.actions.some(a=>a.hotspot===mark.cityHotspot)&&scene.actions.filter(a=>a.hotspot===mark.cityHotspot).every(a=>state.done.includes(a.id))})),buildings:scene.buildings||[],paths:[],trees:[],decorations:[],portal:{id:'portal',...layout.portal,name:dungeon.nodeId?'返回来时地点':'返回现实世界',hidden:false}};
}
export function enterCityDungeon(save,content,id){
    const d=content.dungeons.find(d=>d.id===id);assert(d?.kind==='city','城市副本尚未加载');
    assert(!save.pendingEncounter&&!save.coopRun,'请先结束战斗或组队副本');
    const current=content.dungeons.find(d=>d.id===save.zone);
    assert(!current||current.kind==='city'&&current.cityId===d.cityId&&!current.nodeId&&d.nodeId,'请先退出当前副本');
    if(current){save.cityReturnStack??=[];save.cityReturnStack.push({zone:save.zone,position:{...save.position}});}else{assert(save.zone==='earth','请从现实世界城市入口进入');save.dungeonReturn={zone:'earth',position:{...save.position}};save.cityReturnStack=[];}
    save.dungeonRuns??={};save.dungeonRuns[id]={cleared:[...cityDungeonState(save,d.cityId,id).cleared]};
    save.zone=id;save.position={...d.scene.map.spawn};save.revision++;
}
export function leaveCityDungeon(save,content){
    assert(content.dungeons.find(d=>d.id===save.zone)?.kind==='city','当前不在城市副本中');assert(!save.pendingEncounter,'请先结束战斗');
    const target=save.cityReturnStack?.pop()||save.dungeonReturn||{zone:'camp',position:content.worldMaps.camp.spawn,coordinateVersion:mapCoordinateVersion('camp',content)};
    migrateLocationCoordinates(target,content);
    delete save.coopRun;save.zone=target.zone;save.position={...target.position};save.positionCoordinateVersion=mapCoordinateVersion(target.zone,content);if(!isCityDungeonId(target.zone)){save.dungeonReturn=null;delete save.cityReturnStack;delete save.cityFallback;}save.revision++;
}
