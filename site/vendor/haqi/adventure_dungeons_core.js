import {locationSnapshot,mapCoordinateVersion,migrateLocationCoordinates} from './adventure_coordinates_core.js';
import {journeyDungeons,towerRecord,validateTowerRecords} from './adventure_dungeon_journeys_core.js';
import {createRng,hashSeed} from './rng_core.js';
import {dressDungeon,dungeonBiome} from './adventure_dungeon_scenery_core.js';
// Original identities, formations and positions are exported by export_dungeons.py.
// Ordered roads and persistent solo clear progress are explicit Web adaptations.
import {isSupportedType} from './combat_cards_core.js';
import {parseArenaStaminaCost} from './adventure_stamina_core.js';
import {earthMapInfo} from './adventure_earth_core.js';
import {cityDungeonState,dungeonFor,dungeonProgress,validateGeneratedCityRoute,generatedCityDungeonId} from './adventure_city_dungeons_core.js';
export {dungeonFor};
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const targets=new Set(['self','max_max_hp','lowest_hp','random_friendly','random_hostile','threat_highest','threat_lowest']);
export function monsterBlockReasons(m,cards){
    if(!m)return ['缺少原版怪物模板'];
    const reasons=[];
    if(!['fire','ice','storm','life','death','balance'].includes(m.school)||!Number.isFinite(m.hp)||m.hp<=0)reasons.push('怪物基础数据无效');
    if(m.attributes.ai_module&&!['Genes_Attacker'].includes(m.attributes.ai_module))reasons.push('怪物脚本尚未迁移');
    const keys=[...m.pool.map(r=>r.key),...m.sequences.flat().map(r=>r.card),...m.genes.map(r=>r.card),...Object.values(m.cardsets).flat().map(r=>r.key)].filter(Boolean);
    for(const key of new Set(keys))if(!cards[key]||!isSupportedType(cards[key].type))reasons.push(`未支持卡牌：${key}`);
    for(const r of [...m.sequences.flat(),...m.genes])for(const k of ['target_hostile','target_friendly'])if(r[k]&&!targets.has(r[k]))reasons.push(`未支持目标规则：${r[k]}`);
    return [...new Set(reasons)];
}
export function installDungeons(content,dataset,catalog,kidsCards,cardNames={}){
    assert(catalog.version===1,'副本数据版本无效');
    const installed=catalog.worlds.map(source=>{
        const d=structuredClone(source);
        d.arenas=d.arenas.map(a=>{
            const monsters=a.slots.filter(Boolean).map(id=>catalog.monsters[id]);
            const blocked=[...new Set(monsters.flatMap(m=>monsterBlockReasons(m,kidsCards)))];
            if(monsters.length>4)blocked.push('超过四个怪物卡位');
            if(a.attributes.is_always_mob_first==='true'||a.attributes.is_always_mob_first==='1')blocked.push('怪物先手尚未迁移');
            if(a.attributes.is_postlog_usecard==='true')blocked.push('场景施法脚本尚未迁移');
            for(const m of monsters.filter(Boolean)){
                const {originalXml,...runtimeMonster}=m;
                content.monsters[m.id]=runtimeMonster;
                for(const key of [...m.pool.map(r=>r.key),...m.sequences.flat().map(r=>r.card),...m.genes.map(r=>r.card),...Object.values(m.cardsets).flat().map(r=>r.key)].filter(Boolean)){
                    if(kidsCards[key]&&isSupportedType(kidsCards[key].type))dataset.cards[key]??={...kidsCards[key],name:cardNames[key]||key};
                }
            }
            const staminaCost=parseArenaStaminaCost(a);
            return {...a,blocked,monsterIds:a.slots.filter(Boolean),staminaCost};
        });
        d.loaded=true;
        const leader=d.arenas.flatMap(a=>a.monsterIds).map(id=>catalog.monsters[id]).filter(Boolean).sort((a,b)=>b.hp-a.hp)[0];
        d.boss=leader?{name:leader.name,source:leader.source,level:leader.level,attributes:{asset:leader.attributes.asset}}:null;
        const bossIndex=d.arenas.findLastIndex(a=>a.monsterIds.includes(leader?.id));
        if(bossIndex>=0)d.arenas.push(...d.arenas.splice(bossIndex,1));
        d.bossArenaId=d.arenas.at(-1)?.id;
        d.playable=d.arenas.length>0&&!d.warnings.length;
        if(d.playable){
            const layout=projectDungeon(d,content.worldMaps.camp.rules);
            content.worldMaps[d.id]=layout;
            content.worldMapIndex.islands[d.id]={w:layout.w,h:layout.h,spawn:layout.spawn,initialSpawn:layout.spawn,retainPreviousPosition:true};
            for(const a of d.arenas)content.encounters.push({id:a.id,zone:d.id,monsterId:a.monsterIds[0],monsterIds:a.monsterIds,monsterSlots:a.slots.flatMap((id,i)=>id?[i]:[]),blocked:a.blocked,sourceArenaId:a.sourceId,staminaCost:a.staminaCost,x:layout.encounterPositions[a.id][0],y:layout.encounterPositions[a.id][1]});
        }
        return d;
    });
    for(const d of journeyDungeons(installed,content.dungeonJourneys,content.monsters,content.balanceParams)){
        const layout=projectDungeon(d,content.worldMaps.camp.rules);
        content.worldMaps[d.id]=layout;
        content.worldMapIndex.islands[d.id]={w:layout.w,h:layout.h,spawn:layout.spawn,initialSpawn:layout.spawn,retainPreviousPosition:true};
        for(const a of d.arenas)content.encounters.push({id:a.id,zone:d.id,monsterId:a.monsterIds[0],monsterIds:a.monsterIds,monsterSlots:a.monsterIds.map((_,i)=>i),blocked:[],staminaCost:a.staminaCost||0,x:layout.encounterPositions[a.id][0],y:layout.encounterPositions[a.id][1]});
        installed.push(d);
    }
    content.dungeons=installed;
}
export function installDungeonIndex(content,index){
    assert(index.version===1&&Array.isArray(index.worlds),'副本目录无效');
    content.dungeons=[...structuredClone(index.worlds),...journeyDungeons(index.worlds,content.dungeonJourneys)];
    for(const d of content.dungeons)if(d.mapInfo)content.worldMapIndex.islands[d.id]=structuredClone(d.mapInfo);
}
export function projectDungeon(d,baseRules){
    const original=d.arenas.map(a=>({x:a.position[0],y:a.position[2]}));
    const born=d.attributes.born_pos||'';
    const bx=Number(/x\s*=\s*([-\d.]+)/.exec(born)?.[1]),by=Number(/z\s*=\s*([-\d.]+)/.exec(born)?.[1]);
    const origin=Number.isFinite(bx)&&Number.isFinite(by)?{x:bx,y:by}:original[0];
    const all=[origin,...original],minX=Math.min(...all.map(p=>p.x)),minY=Math.min(...all.map(p=>p.y));
    const extentX=Math.max(...all.map(p=>p.x))-minX,extentY=Math.max(...all.map(p=>p.y))-minY;
    const scale=Math.min(5,4800/Math.max(extentX,extentY,1));
    const w=d.kind==='tower'?1400:Math.max(1400,extentX*scale+700),h=Math.max(1200,d.kind==='tower'?0:extentY*scale+700,(d.arenas.length+2)*240+350);
    // Keep legacy map bounds for saved positions, but build a non-crossing road.
    // Original arena coordinates remain on d.arenas for export/source tracing.
    const rng=createRng(hashSeed(`dungeon-route-v1:${d.id}`));
    const spawn={x:350,y:350},placed=[spawn],positions={};
    for(const [i,arena]of d.arenas.entries()){
        const point={x:(i%2?350:950)+rng.int(-100,100),y:350+(i+1)*240+rng.int(-28,28)};
        positions[arena.id]=point;placed.push(point);
    }
    const biome=dungeonBiome(d);
    const rules=structuredClone(baseRules),color=rules.biomes[biome]?.color||'#527d55';
    rules.terrain.base=color;rules.terrain.ocean='#293f42';rules.terrain.sand='#a39b80';
    const portal={x:placed.at(-1).x,y:placed.at(-1).y+240};
    const entrancePortal={x:spawn.x,y:spawn.y-150};
    const anchors=[entrancePortal,...placed,portal],route=[entrancePortal];
    // Bend each stretch independently while keeping Y monotonic: no crossing or shortcut.
    for(let i=1;i<anchors.length;i++){
        const a=anchors[i-1],b=anchors[i];
        if(i>1&&i<anchors.length-1){
            for(const t of [.33,.67])route.push({x:a.x+(b.x-a.x)*t+rng.int(-52,52),y:a.y+(b.y-a.y)*t});
        }
        route.push(b);
    }
    const paths=route.slice(1).map((p,i)=>({a:route[i],b:p,width:96}));
    const regions=d.arenas.map((a,i)=>({id:a.id,name:`第${i+1}处营地`,...positions[a.id],rx:260,ry:230,biome,color,weather:rules.biomes[biome]?.weather}));
    const trees=[];
    return dressDungeon({id:d.id,name:d.name,w,h,spawn,initialSpawn:spawn,center:spawn,portal,entrancePortal,route,bossArenaId:d.bossArenaId,
        coast:[[30,30],[w-30,30],[w-30,h-30],[30,h-30]],rules,baseBiome:biome,regions,paths,trees,
        npcPositions:{},encounterPositions:Object.fromEntries(Object.entries(positions).map(([id,p])=>[id,[p.x,p.y]])),
        buildings:[],landmarks:[],rivers:[],lakes:[],bridges:[],mountains:[],farms:[],projection:{minX,minY,scale}});
}
export function enterDungeon(save,content,id,{restart=false}={}){
    const d=dungeonFor(content,id);assert(d?.playable,'这个副本尚未开放');assert(d.loaded!==false&&content.worldMaps[id],'副本数据尚未加载');assert(!save.pendingEncounter,'请先完成当前战斗');
    save.dungeonRuns??={};const runs=dungeonProgress(save);
    if(!dungeonFor(content,save.zone))save.dungeonReturn=locationSnapshot(save,content);
    else if(runs[save.zone])runs[save.zone].position={...save.position};
    if(restart||!runs[id])runs[id]={cleared:[]};
    const layout=content.worldMaps[id];
    if(d.kind==='tower'){
        const floor=towerRecord(save,id).floor;
        runs[id]={cleared:d.arenas.slice(0,floor).map(a=>a.id)};
        const next=d.arenas[floor],at=next&&layout.encounterPositions[next.id];
        // Resume on the approach to the next guardian, never beyond the route gate.
        if(at){const idx=layout.route.findIndex(p=>p.x===at[0]&&p.y===at[1]);runs[id].position={...layout.route[Math.max(1,idx-1)]};}
    }
    delete save.dungeonLanguageBuff;
    save.zone=id;save.position={...(runs[id].position||layout.spawn)};
    // Re-entry must not immediately trigger the portal used to leave last time.
    if([layout.entrancePortal,layout.portal].some(p=>p&&Math.hypot(p.x-save.position.x,p.y-save.position.y)<90))save.position={...layout.spawn};
    if(d.kind==='elite')save.dungeonMode=d.partySize;
    save.revision++;
}
export function leaveDungeon(save,content){
    assert(dungeonFor(content,save.zone),'当前不在副本中');assert(!save.pendingEncounter,'请先完成当前战斗');
    dungeonProgress(save)[save.zone].position={...save.position};
    const target=save.dungeonReturn||{zone:'camp',position:content.worldMaps.camp.spawn,coordinateVersion:mapCoordinateVersion('camp',content)};
    migrateLocationCoordinates(target,content);
    delete save.dungeonLanguageBuff;
    save.zone=target.zone;save.position={...target.position};save.positionCoordinateVersion=mapCoordinateVersion(target.zone,content);save.dungeonReturn=null;delete save.coopRun;save.revision++;
}
export function validateDungeons(save,content){
    if(save.cityFallback!==undefined){validateGeneratedCityRoute(save.cityFallback);assert(save.zone===generatedCityDungeonId(save.cityFallback),'自动城市返回记录无效');}
    validateTowerRecords(save,content);
    save.dungeonRuns??={};save.dungeonReturn??=null;
    assert(save.dungeonRuns&&typeof save.dungeonRuns==='object'&&!Array.isArray(save.dungeonRuns),'副本进度无效');
    const position=(p,id)=>{const info=id==='earth'?earthMapInfo(content):content.worldMapIndex.islands[id];return info&&Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=0&&p.y>=0&&p.x<=info.w&&p.y<=info.h;};
    for(const [id,run]of [...Object.entries(save.dungeonRuns),...Object.entries(save.coopRun?.runs||{})]){
        const d=dungeonFor(content,id);
        assert(d?.playable&&run&&Array.isArray(run.cleared)&&new Set(run.cleared).size===run.cleared.length&&run.cleared.every(e=>d.arenas.some(a=>a.id===e&&!a.blocked.length)),'副本清怪记录无效');
        assert(run.position===undefined||position(run.position,id),'副本返回位置无效');
    }
    if(save.dungeonReturn)assert(!dungeonFor(content,save.dungeonReturn.zone)&&position(save.dungeonReturn.position,save.dungeonReturn.zone),'副本出口无效');
    if(dungeonFor(content,save.zone))assert(dungeonProgress(save)[save.zone]&&save.dungeonReturn,'副本记录不完整');
    if(save.cityReturnStack!==undefined){
        const active=dungeonFor(content,save.zone);
        assert(active?.kind==='city'&&Array.isArray(save.cityReturnStack)&&save.cityReturnStack.length<=1,'城市返回记录无效');
        for(const row of save.cityReturnStack){const parent=dungeonFor(content,row.zone);assert(active.nodeId&&parent?.kind==='city'&&!parent.nodeId&&parent.cityId===active.cityId&&position(row.position,row.zone),'城市返回地点无效');}
    }
    for(const [id,run]of Object.entries(save.dungeonRuns))if(dungeonFor(content,id)?.kind==='city'){const d=dungeonFor(content,id);assert(JSON.stringify(run.cleared)===JSON.stringify(cityDungeonState(save,d.cityId,id).cleared),'城市战斗进度不一致');}
}
