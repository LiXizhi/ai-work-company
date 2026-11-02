import {earthDecorationIsTree} from './adventure_earth_nature_core.js';
import {createPathQueue} from './path_queue_core.js';
import {streetWalkable,streetSegmentWalkable} from './adventure_city_street_core.js';
import {streetFindPath} from './adventure_city_navigation_core.js';
import {monsterInteractionTargets,monsterContactDistance,inMonsterTerritory,pruneMonsterScene} from './adventure_monster_motion_core.js';
import {islandBuildings,harborAccess} from './adventure_buildings_core.js';
// Compact authored maps. The original NPC coordinates remain in AdventureContent for provenance.
import { islandFor } from './adventure_world_map_core.js';
import { onAnyBridge } from './adventure_bridge_core.js';
import { onLargeIsland, riverBlocks, sceneryCoversActor, separateBuilding } from './adventure_island_layout_core.js';
import {encounterCoolingDown} from './adventure_encounter_cooldown_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {earthWalkable,earthNearest} from './adventure_earth_core.js';
import {createCityDungeonWorld,dungeonFor,dungeonProgress} from './adventure_city_dungeons_core.js';
const interactionDefaults=defaultParams('kids').adventure;
export const WALK_SPEED = 210;
export function updateEncounterVisibility(world,save,now) {
    let changed=false;
    world.encounters.forEach((e,i)=>{
        const hidden=!!(world.layout.route&&i>0)||encounterCoolingDown(save,e.id,now);
        if(!!e.hidden!==hidden){e.hidden=hidden;changed=true;}
    });
    if(changed)objectIndices.delete(world);
}
// Only an unchanged island session can resume after combat. Dungeon progress
// removes encounters and changes portals, so its dynamic world must be rebuilt.
export function canResumeWorld(world,previousSave,nextSave,content){
    return !!world&&!world.isDungeon&&previousSave===nextSave&&world.zone===nextSave?.zone&&world.layout===content.worldMaps?.[world.zone];
}
export function createWorld(zone,content,save=null) {
    if(zone==='earth'){if(!content.earthWorld)throw Error('地球场景尚未加载');return content.earthWorld;}
    if(dungeonFor(content,zone)?.kind==='city')return createCityDungeonWorld(content,save,dungeonFor(content,zone));
    if(!islandFor(zone)&&!dungeonFor(content,zone))throw new Error('目的地不存在');
    const layout=content.worldMaps?.[zone];
    if(!layout)throw Error('缺少岛屿地图：'+zone);
    const resolvedParams=resolveParams({version:'kids'},content.balanceParams||defaultParams('kids'));
    const interactionParams=resolvedParams.adventure;
    const point=([x,y])=>({x,y});
    const originals=content.npcCatalog?.npcs.filter(n=>n.zone===zone&&n.enabled!=='0'&&n.artVisible!==false&&n.hidden!==true);
    const npcs=(originals||Object.values(content.npcs).filter(n=>n.zone===zone&&n.hidden!==true)).map(n=>({...content.npcs[n.id],...n,...point(layout.npcPositions[n.id]||[n.x,n.y])}));
    if(!originals)for(const row of layout.visitingNpcs||[]){const source=content.npcs[row.sourceId];if(!source)throw Error('缺少居民来源');if(source.hidden===true||row.hidden===true)continue;npcs.push({...source,zone,...(row.sourceId===36205?layout.portal:point(row.position))});}
    const encounters=content.encounters.filter(e=>e.zone===zone&&!e.legacyOnly&&!dungeonProgress(save)?.[zone]?.cleared.includes(e.id)).map(e=>({...e,...point(layout.encounterPositions[e.id]||[e.x,e.y])}));
    const world={zone,isDungeon:!!dungeonFor(content,zone),w:layout.w,h:layout.h,layout,npcs,encounters,portal:{id:'portal',...layout.portal,zone:zone==='camp'?'town':'camp',name:dungeonFor(content,zone)?'离开副本':'查看世界地图'},
        interactionParams,monsterSceneParams:resolvedParams.monsterScene,landmarks:layout.landmarks,buildings:layout.buildings||[],paths:layout.paths,trees:layout.trees,decorations:[],center:{...(layout.center||layout.spawn)}};
    if(layout.route){
        world.encounters.forEach((e,i)=>{e.hidden=i>0;});
        world.portal.hidden=!dungeonProgress(save)?.[zone]?.cleared.includes(layout.bossArenaId);
        world.entrancePortal={id:'dungeon-entrance',...layout.entrancePortal,name:'离开副本',zone:world.portal.zone};
        // Old free-roaming checkpoints resume safely on the new road.
        if(save&&(!walkable(world,save.position.x,save.position.y)||routeLocation(world,save.position).progress>dungeonLimit(world)))save.position={...layout.spawn};
    }
    if(originals&&npcs.some(n=>!Number.isFinite(n.x)||!Number.isFinite(n.y)||onAnyBridge(world,n.x,n.y,88))){
        // Original 3D coordinates stay in the catalogue. Residents stand beside the
        // road, and bridge decks stay empty. AI companions may still use the road.
        const candidates=[];
        for(const path of layout.paths){
            const ax=path.a.x,ay=path.a.y,bx=path.b.x,by=path.b.y,length=Math.hypot(bx-ax,by-ay);
            if(length<50)continue;
            const dx=(bx-ax)/length,dy=(by-ay)/length,nx=-dy,ny=dx,half=(path.width||60)/2;
            for(let d=40;d<length-24;d+=72)for(const side of [-1,1]){
                for(const gap of [40,68,100]){
                    const x=ax+dx*d+nx*(half+gap)*side,y=ay+dy*d+ny*(half+gap)*side;
                    if(!walkable(world,x,y)||onAnyBridge(world,x,y,88))continue;
                    candidates.push({x,y});
                    break;
                }
            }
        }
        const clear=(p,placed)=>placed.every(other=>distance(p,other)>68)&&world.encounters.every(e=>distance(p,e)>108)&&!onAnyBridge(world,p.x,p.y,88);
        const placed=npcs.filter(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&!onAnyBridge(world,n.x,n.y,88));
        for(const n of npcs.filter(n=>!placed.includes(n))){
            const index=(n.id*31)%Math.max(1,candidates.length);
            const ordered=[...candidates.slice(index),...candidates.slice(0,index)];
            const spot=ordered.find(p=>clear(p,placed));
            if(!spot)throw Error('居民道路位置不足：'+zone);
            Object.assign(n,spot);placed.push(n);
        }
    }
    // The original resident catalogue does not include the web map's visiting captain.
    // Keep authored residents in place, and supply a guide for every island travel portal.
    if(!dungeonFor(content,zone)&&!npcs.some(n=>(n.id===36205||n.name==='法斯特船长')&&distance(n,world.portal)<=160)){
        const source=content.npcs[36205];
        if(!source)throw Error('缺少法斯特船长来源');
        npcs.push({...source,zone,x:world.portal.x,y:world.portal.y,worldMapGuide:true});
    }
    const scenery=islandBuildings(world);
    world.buildings=[...world.buildings,...scenery];
    world.trees=world.trees.filter(t=>!scenery.some(b=>Math.abs(t.x-b.x)<b.w*.55&&t.y>b.y-b.h*.5&&t.y<b.y+45));
    const access=harborAccess(world);
    if(access){
        world.paths=[...world.paths,access.path];
        world.trees=world.trees.filter(t=>segmentDistance(t,access.path.a,access.path.b)>access.path.width/2+35);
        const captains=world.npcs.filter(n=>n.id===36205||n.name==='法斯特船长');
        const captain=captains[0];
        if(captain){
            Object.assign(captain,access.captain,{harborGuide:true});
            Object.assign(world.portal,access.captain);
            world.npcs=world.npcs.filter(n=>!captains.includes(n)||n===captain);
        }
    }
    // Canopies and roofs paint over anyone with a smaller foot Y. Drop trees and
    // slide buildings so resident and monster sprites, names and quest marks stay visible.
    const actors=sceneActors(world,content);
    const onLand=(x,y)=>onLargeIsland(world,x,y)&&!riverBlocks(world,x,y);
    const placed=world.buildings.map(b=>separateBuilding(b,actors,onLand));
    const moved=placed.filter((b,i)=>b.x!==world.buildings[i].x||b.y!==world.buildings[i].y);
    world.buildings=placed;
    if(moved.length)world.trees=world.trees.filter(t=>!moved.some(b=>Math.abs(t.x-b.x)<b.w*.55&&t.y>b.y-b.h*.5&&t.y<b.y+45));
    // A tree behind an actor can leave its sprite visible while its 20-unit
    // trunk collision still blocks the interaction point after map rebaking.
    world.trees=world.trees.filter(t=>actors.every(a=>distance(t,a)>=20&&!sceneryCoversActor(t,a)));
    if(!layout.route){
        const used=[...world.npcs,...world.encounters,...world.landmarks,world.portal];
        const entrances=[];
        for(const d of (content.dungeons||[]).filter(d=>d.island===zone)){
            const candidates=[];
            for(const p of world.paths){
                const length=distance(p.a,p.b),dx=(p.b.x-p.a.x)/(length||1),dy=(p.b.y-p.a.y)/(length||1);
                for(let along=40;along<length-30;along+=60)for(const side of [-1,1])for(const gap of [55,105,155,215]){
                    const x=p.a.x+dx*along-dy*side*(p.width/2+gap),y=p.a.y+dy*along+dx*side*(p.width/2+gap);
                    if(onLargeIsland(world,x,y,40)&&!riverBlocks(world,x,y)&&!world.buildings.some(b=>Math.abs(b.x-x)<b.w/2+80&&y-180<b.y+40&&y+65>b.y-b.h)&&!onAnyBridge(world,x,y,100)&&used.every(o=>distance(o,{x,y})>140))candidates.push({x,y});
                }
            }
            const target=candidates[Math.floor(candidates.length*(entrances.length+1)/4)%Math.max(1,candidates.length)];
            if(target){const mark={...target,id:d.id,dungeonId:d.id,entranceKind:d.kind,name:d.name,recommendedLevel:d.recommendedLevel};entrances.push(mark);used.push(mark);}
        }
        world.landmarks=[...world.landmarks,...entrances];
        world.trees=world.trees.filter(t=>entrances.every(e=>distance(t,e)>110&&!sceneryCoversActor(t,{...e,label:e.name})));
    }
    objectIndices.delete(world);
    // A redesigned island keeps valid local positions; stranded old coordinates return to its pier.
    if(zone==='hanzi'&&save?.zone===zone&&save?.position&&!walkable(world,save.position.x,save.position.y))save.position={...layout.spawn};
    return world;
}
export function sceneActors(world,content) {
    const actors=(world.npcs||[]).map(n=>({...n,label:n.name||''}));
    for(const e of world.encounters||[]){
        const ids=e.monsterIds?.length?e.monsterIds:(e.monsterId?[e.monsterId]:[]);
        const name=e.monster?.name||content?.monsters?.[ids[0]]?.name||e.name||'';
        let label=name;
        if(ids.length>1)label+=` · ${ids.length}只`;
        if(e.blocked?.length)label+=' · 待迁移';
        actors.push({...e,label});
    }
    return actors;
}
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function onIsland(x,y,padding=0) { return ((x-900)/(805-padding))**2+((y-800)/(715-padding))**2<1; }
function segmentDistance(p,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function routeLocation(world,p){
    let offset=0,best={distance:Infinity,progress:0,index:0,point:world.layout.route[0]};
    for(const [index,path]of world.paths.entries()){
        const {a,b}=path,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
        const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(length*length||1)));
        const point={x:a.x+t*dx,y:a.y+t*dy},d=distance(p,point);
        if(d<best.distance)best={distance:d,progress:offset+t*length,index,point};
        offset+=length;
    }
    return best;
}
// Local exploration records only the farthest point of this linear dungeon trail.
// It is independent of combat clears and never shrinks when the captain retreats.
export function updateDungeonExploration(world,save){
    if(!world.layout?.route||!save)return;
    const current=routeLocation(world,save.position).progress;
    const total=world.paths.reduce((sum,p)=>sum+distance(p.a,p.b),0);
    const stored=save.dungeonExploration?.[world.zone];
    const previous=Number.isFinite(stored)?Math.max(0,Math.min(total,stored)):0;
    save.dungeonExploration??={};
    save.dungeonExploration[world.zone]=Math.max(previous,current);
}
function dungeonLimit(world){return world.encounters.length?routeLocation(world,world.encounters[0]).progress-60:Infinity;}
export function routePoint(world,progress){
    for(const path of world.paths){const length=distance(path.a,path.b);if(progress<=length)return {x:path.a.x+(path.b.x-path.a.x)*progress/length,y:path.a.y+(path.b.y-path.a.y)*progress/length};progress-=length;}
    return {...world.layout.route.at(-1)};
}
export function dungeonAutoInteraction(world,p){
    if(!world.isDungeon||!world.layout.route)return null;
    if(world.entrancePortal&&distance(p,world.entrancePortal)<70)return {...world.entrancePortal,kind:'portal'};
    const next=world.encounters[0];
    if(next&&!next.hidden&&!next.blocked?.length&&distance(p,next)<(world.interactionParams||interactionDefaults).dungeonEncounterRadius)return {...next,kind:'encounter'};
    if(!world.portal.hidden&&distance(p,world.portal)<70)return {...world.portal,kind:'portal'};
    return null;
}
// Returning from combat must not count as walking into an existing contact.
export function autoInteraction(world,p){
    if(world.isDungeon)return dungeonAutoInteraction(world,p);
    const radius=(world.interactionParams||interactionDefaults).fieldEncounterRadius;
    const target=world.encounters.filter(e=>inMonsterTerritory(world,e,p)&&monsterContactDistance(world,e,p)<radius)
        .sort((a,b)=>monsterContactDistance(world,a,p)-monsterContactDistance(world,b,p))[0];
    return target?{...target,kind:'encounter'}:null;
}
export function resetAutoInteraction(world,p){
    world.autoContact=autoInteraction(world,p)?.id??null;
}
export function takeAutoInteraction(world,p){
    const target=autoInteraction(world,p);
    if(!target){world.autoContact=null;return null;}
    if(world.autoContact===target.id)return null;
    world.autoContact=target.id;
    return target;
}
// Field monsters enter combat through takeAutoInteraction after their warning
// and physical contact, including when a quest or click supplied the path.
export function destinationInteraction(world,p,target,radius){
    if(!target||target.kind==='encounter'&&!world.isDungeon)return null;
    return distance(p,target)<radius?target:null;
}
// Stand just outside touch and dungeon aggro, on the side the player approached from.
export function retreatBeside(world,player,target){
    const origin={x:target.x,y:target.y};
    const legal=p=>p&&walkable(world,p.x,p.y)&&distance(p,origin)>=100&&world.encounters.every(e=>distance(p,e)>=100)&&!dungeonAutoInteraction(world,p);
    if(world.layout?.route){
        const at=routeLocation(world,origin),limit=dungeonLimit(world);
        for(let back=96;back<=360;back+=8){
            const point=routePoint(world,Math.max(0,at.progress-back));
            if(routeLocation(world,point).progress<=limit+0.5&&legal(point))return point;
        }
        return {...world.layout.spawn};
    }
    const dx=player.x-origin.x,dy=player.y-origin.y,len=Math.hypot(dx,dy);
    const spawn=world.layout?.spawn||world.center||{x:origin.x+1,y:origin.y};
    const dir=len>=8?Math.atan2(dy,dx):Math.atan2(spawn.y-origin.y,spawn.x-origin.x);
    const turns=[0];
    for(let i=1;i<=8;i++)turns.push(i*Math.PI/8,-i*Math.PI/8);
    for(const radius of [120,140,160,180,200])for(const turn of turns){
        const point={x:origin.x+Math.cos(dir+turn)*radius,y:origin.y+Math.sin(dir+turn)*radius};
        if(legal(point))return point;
    }
    const near=nearestWalkable(world,origin.x+Math.cos(dir)*120,origin.y+Math.sin(dir)*120);
    if(legal(near))return near;
    if(legal(player))return {x:player.x,y:player.y};
    // Crowded placements may need a wider ring; never fall back inside a monster.
    for(let radius=240;radius<=Math.max(world.w,world.h);radius+=40)for(const turn of turns){
        const point={x:origin.x+Math.cos(dir+turn)*radius,y:origin.y+Math.sin(dir+turn)*radius};
        if(legal(point))return point;
    }
    return {...spawn};
}
export function walkable(world,x,y) {
    if(world.isEarth)return earthWalkable(world,x,y);
    if(world.isCityDungeon&&world.dungeon.scene.streetscape)return streetWalkable(world.dungeon.scene,x,y);
    if(world.isCityDungeon)return Number.isFinite(x)&&Number.isFinite(y)&&x>=40&&y>=40&&x<=world.w-40&&y<=world.h-40&&!(world.dungeon.scene.map.obstacles||[]).some(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);
    if(world.movementExclusions?.some(o=>Math.hypot(x-o.x,y-o.y)<o.radius))return false;
    if(!Number.isFinite(x)||!Number.isFinite(y))return false;
    if(world.layout?.route)return routeLocation(world,{x,y}).distance<=world.paths[0].width/2-8;
    if(world.layout?!onLargeIsland(world,x,y,26)||riverBlocks(world,x,y):!onIsland(x,y,26))return false;
    return !nearbyWorldObjects(world,{x:x-160,y:y-160,w:320,h:320}).some(o=>
        o.kind==='building'?!o.decorationOnly&&x>o.x-o.w*.3-10&&x<o.x+o.w*.3+10&&y>o.y-o.h*.42-10&&y<o.y+12:
        o.kind==='tree'&&Math.hypot(x-o.x,y-o.y)<20);
}
// Snap an arbitrary target to the closest reachable tile. Route worlds project
// onto the road; island worlds try a tight local spiral first (buildings, trees
// and near-coast clicks) and only fall back to a whole-island grid scan for
// points far out in the water.
export function nearestWalkable(world,x,y) {
    if(world.isEarth)return earthNearest(world,x,y);
    if(walkable(world,x,y))return{x,y};
    if(world.layout?.route)return {...routeLocation(world,{x,y}).point};
    const tryLocal=(radius,step)=>{
        let best=null,bestDist=Infinity;
        for(let r=step;r<=radius;r+=step){
            const count=Math.max(8,Math.ceil(r/step)*8);
            for(let i=0;i<count;i++){
                const a=i/count*Math.PI*2,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
                if(!walkable(world,px,py))continue;
                const d=(px-x)**2+(py-y)**2;
                if(d<bestDist){bestDist=d;best={x:px,y:py};}
            }
            if(best)return best;
        }
        return null;
    };
    const local=tryLocal(260,26);
    if(local)return local;
    const step=56;let best=null,bestDist=Infinity;
    for(let gy=0;gy<=world.h;gy+=step)for(let gx=0;gx<=world.w;gx+=step){
        if(!walkable(world,gx,gy))continue;
        const d=(gx-x)**2+(gy-y)**2;
        if(d<bestDist){bestDist=d;best={x:gx,y:gy};}
    }
    if(!best)return null;
    for(let dy=-step;dy<=step;dy+=step/4)for(let dx=-step;dx<=step;dx+=step/4){
        const px=best.x+dx,py=best.y+dy;
        if(!walkable(world,px,py))continue;
        const d=(px-x)**2+(py-y)**2;
        if(d<bestDist){bestDist=d;best={x:px,y:py};}
    }
    return best;
}
// Map teleports snap to walkable ground, then keep clearance from NPCs / social actors
// so sprites do not stack. Horizontal offsets are tried first for side-by-side facing.
export function clearTeleportSpot(world,x,y,extras=[],clearance=50){
    const base=nearestWalkable(world,x,y);
    if(!base)return null;
    const points=[];
    for(const o of [...(world.npcs||[]),...extras]){
        const p=o?.position&&Number.isFinite(o.position.x)?o.position:o;
        if(Number.isFinite(p?.x)&&Number.isFinite(p?.y))points.push({x:p.x,y:p.y});
    }
    if(!points.length)return base;
    const minDist=(px,py)=>{let d=Infinity;for(const p of points)d=Math.min(d,Math.hypot(px-p.x,py-p.y));return d;};
    if(minDist(base.x,base.y)>=clearance)return base;
    const maxR=Math.max(clearance*3,150),step=Math.max(10,Math.floor(clearance/4));
    const angles=[0,Math.PI,Math.PI/6,-Math.PI/6,5*Math.PI/6,-5*Math.PI/6,Math.PI/3,-Math.PI/3,2*Math.PI/3,-2*Math.PI/3,Math.PI/2,-Math.PI/2];
    for(let r=clearance;r<=maxR;r+=step){
        const candidates=[[base.x+r,base.y],[base.x-r,base.y],[base.x+r,base.y-step],[base.x-r,base.y-step],[base.x+r,base.y+step],[base.x-r,base.y+step],[base.x,base.y-r],[base.x,base.y+r]];
        for(const a of angles)candidates.push([base.x+Math.cos(a)*r,base.y+Math.sin(a)*r]);
        for(const [px,py] of candidates){
            if(walkable(world,px,py)&&minDist(px,py)>=clearance)return{x:px,y:py};
        }
    }
    let best=base,bestScore=minDist(base.x,base.y);
    for(let r=step;r<=maxR;r+=step){
        for(let i=0;i<16;i++){
            const a=i/16*Math.PI*2,px=base.x+Math.cos(a)*r,py=base.y+Math.sin(a)*r;
            if(!walkable(world,px,py))continue;
            const score=minDist(px,py)+Math.abs(Math.cos(a))*2;
            if(score>bestScore){bestScore=score;best={x:px,y:py};}
        }
        if(bestScore>=clearance)return best;
    }
    return best;
}
export function movePosition(world,position,dx,dy) {
    // Sweep small steps to prevent tunneling through trees during a delayed frame.
    const street=world.isCityDungeon?world.dungeon.scene.streetscape:null,quantum=street?.movementStep??8;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/quantum));let {x,y}=position;
    const allowed=(nx,ny)=>walkable(world,nx,ny)&&(street?.movementStep==null||streetSegmentWalkable(world.dungeon.scene,{x,y},{x:nx,y:ny}))&&(!world.layout?.route||routeLocation(world,{x:nx,y:ny}).progress<=dungeonLimit(world));
    for(let i=0;i<steps;i++) {if(allowed(x+dx/steps,y))x+=dx/steps;if(allowed(x,y+dy/steps))y+=dy/steps;}
    return {x:world.isEarth?((x%world.w)+world.w)%world.w:x,y};
}
export function clearSegment(world,a,b) {
    const steps=clearSegmentSteps(world,a,b);let result;do{result=steps.next();}while(!result.done);return result.value;
}
function* clearSegmentSteps(world,a,b) {
    const length=distance(a,b),steps=Math.max(1,Math.ceil(length/2));
    for(let i=0;i<=steps;i++){if(i%16===0)yield;const t=i/steps;if(!walkable(world,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return false;}
    return true;
}
// Drop a road or grid waypoint when a later one is already in line of sight.
// Otherwise the walker goes all the way to the next vertex, then makes a wide turn.
function shortcutPath(world,origin,points){
    const steps=shortcutPathSteps(world,origin,points);let result;do{result=steps.next();}while(!result.done);return result.value;
}
function* shortcutPathSteps(world,origin,points){
    const raw=[];
    for(const p of points){
        if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))continue;
        const prev=raw.at(-1);
        if(prev&&distance(prev,p)<.5)continue;
        raw.push(p);
    }
    if(!raw.length)return [];
    const out=[];
    let anchor=origin,index=0;
    while(index<raw.length){
        let next=index;
        for(let j=raw.length-1;j>index;j--)if(yield* clearSegmentSteps(world,anchor,raw[j])){next=j;break;}
        out.push({x:raw[next].x,y:raw[next].y});
        anchor=raw[next];
        index=next+1;
    }
    return out;
}
function pathLength(origin,points){
    let total=0,cursor=origin;
    for(const point of points){total+=distance(cursor,point);cursor=point;}
    return total;
}
function gridPath(world,start,destination,bounds=null){
    const steps=gridPathSteps(world,start,destination,bounds);let result;do{result=steps.next();}while(!result.done);return result.value;
}
function* gridPathSteps(world,start,destination,bounds=null,maxNodes=Infinity){
    const size=24,cols=Math.ceil(world.w/size),rows=Math.ceil(world.h/size);
    const cell=p=>({x:Math.floor(p.x/size),y:Math.floor(p.y/size)}),point=p=>({x:p.x*size+size/2,y:p.y*size+size/2});
    const inside=p=>!bounds||(p.x>=bounds.minX&&p.y>=bounds.minY&&p.x<=bounds.maxX&&p.y<=bounds.maxY);
    let from=cell(start);const target=cell(destination),key=p=>p.y*cols+p.x;
    const walkCache=new Map(),canWalk=p=>{
        if(p.x<0||p.y<0||p.x>=cols||p.y>=rows)return false;
        const k=key(p);if(!walkCache.has(k)){const v=point(p);walkCache.set(k,walkable(world,v.x,v.y));}
        return walkCache.get(k);
    };
    const starts=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const p={x:from.x+dx,y:from.y+dy};if(inside(point(p))&&clearSegment(world,start,point(p)))starts.push(p);}
    starts.sort((a,b)=>distance(start,point(a))-distance(start,point(b)));
    from=starts[0];if(!from)return [];
    // A blocked click resolves to the closest reachable neighboring tile.
    let goal=target;
    if(!inside(point(goal))||!canWalk(goal)) {
        const options=[];
        for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++) {
            const p={x:target.x+x,y:target.y+y},wp=point(p);
            if(inside(wp)&&canWalk(p))options.push(p);
        }
        options.sort((a,b)=>distance(point(a),destination)-distance(point(b),destination));goal=options[0];
    }
    if(!goal)return [];
    const open=createPathQueue(),cost=new Map([[key(from),0]]),parent=new Map(),closed=new Set();
    open.push(from,key(from),distance(from,goal));
    const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    while(open.length&&closed.size<maxNodes&&(!world.isEarth||closed.size<world.earthRules.maxPathNodes)) {
        yield;
        const p=open.shift(),k=key(p);if(closed.has(k))continue;closed.add(k);
        if(k===key(goal)) {
            const out=[];let n=p;
            while(key(n)!==key(from)) {out.push(point(n));n=parent.get(key(n));if(!n)return [];yield;}
            out.push(point(from));out.reverse();
            if(walkable(world,destination.x,destination.y)&&inside(destination)){
                const last=out.at(-1);
                if(last&&clearSegment(world,last,destination)&&distance(last,destination)>.5)out.push({x:destination.x,y:destination.y});
            }
            return yield* shortcutPathSteps(world,start,out);
        }
        for(const [dx,dy] of dirs) {
            const n={x:p.x+dx,y:p.y+dy},v=point(n),nk=key(n);
            const score=cost.get(k)+Math.hypot(dx,dy);
            if(!inside(v)||n.x<0||n.y<0||n.x>=cols||n.y>=rows||closed.has(nk)||score>=(cost.get(nk)??Infinity)||!canWalk(n))continue;
            if(dx&&dy&&(!canWalk({x:p.x+dx,y:p.y})||!canWalk({x:p.x,y:p.y+dy})))continue;
            if(!clearSegment(world,point(p),v))continue;
            cost.set(nk,score);parent.set(nk,p);open.push(n,nk,score+distance(n,goal));
        }
    }
    return [];
}
export function followPath(world,position,path,budget) {
    const remaining=shortcutPath(world,position,path);let p={...position};
    while(remaining.length&&budget>0){
        const target=remaining[0],length=distance(p,target);
        if(length<.01){remaining.shift();continue;}
        const step=Math.min(budget,length),next=movePosition(world,p,(target.x-p.x)*step/length,(target.y-p.y)*step/length);
        if(distance(p,next)<.001)return {position:p,path:[],blocked:true};
        p=next;budget-=step;if(distance(p,target)<.01)remaining.shift();
    }
    return {position:p,path:remaining,blocked:false};
}
export function findPath(world,start,destination) {
    const steps=islandPathSteps(world,start,destination);let result;do{result=steps.next();}while(!result.done);return result.value;
}
function* islandPathSteps(world,start,destination) {
    if(world.isCityDungeon&&world.dungeon.scene.streetscape)return streetFindPath(world.dungeon.scene,start,destination);
    if(world.isEarth){
        const radius=world.earthRules.navigationRadius;
        if(distance(start,destination)>radius)return [];
        if(clearSegment(world,start,destination))return [{...destination}];
        return gridPath(world,start,destination,{minX:start.x-radius,minY:start.y-radius,maxX:start.x+radius,maxY:start.y+radius});
    }
    if(world.layout?.route){
        const from=routeLocation(world,start),to=routeLocation(world,destination),limit=dungeonLimit(world);
        const end=routeLocation(world,routePoint(world,Math.min(to.progress,limit)));
        const points=world.layout.route.slice(from.index+1,end.index+1);
        if(end.progress<from.progress)points.splice(0,points.length,...world.layout.route.slice(end.index+1,from.index+1).reverse());
        return shortcutPath(world,start,[...points,end.point]);
    }
    // Start from the actual position, without a detour to the current grid center.
    if(yield* clearSegmentSteps(world,start,destination))return [{x:destination.x,y:destination.y}];
    if(world.layout){
        // A nearby tree should not require building/connecting the entire road
        // graph. Bound this attempt; rivers and long detours still use roads.
        const straight=distance(start,destination);
        if(straight<=480&&walkable(world,destination.x,destination.y)){
            const local=yield* gridPathSteps(world,start,destination,{minX:Math.min(start.x,destination.x)-96,minY:Math.min(start.y,destination.y)-96,maxX:Math.max(start.x,destination.x)+96,maxY:Math.max(start.y,destination.y)+96},512);
            if(local.length&&distance(local.at(-1),destination)<.5&&pathLength(start,local)<=straight*1.2+48)return local;
        }
        const road=yield* shortcutPathSteps(world,start,yield* roadPathSteps(world,start,destination));
        if(road.length){
            const straight=distance(start,destination),roadLen=pathLength(start,road);
            // A long trip stays on the road. A short hook yields to a tighter walk around the obstacle.
            if(straight>1400||roadLen<=straight*1.2+48)return road;
            const xs=[start.x,destination.x,...road.map(p=>p.x)],ys=[start.y,destination.y,...road.map(p=>p.y)];
            const around=yield* gridPathSteps(world,start,destination,{minX:Math.min(...xs)-160,minY:Math.min(...ys)-160,maxX:Math.max(...xs)+160,maxY:Math.max(...ys)+160});
            if(around.length&&pathLength(start,around)+16<roadLen)return around;
            return road;
        }
    }
    return yield* gridPathSteps(world,start,destination);
}
export function nearestInteraction(world,p) {
    return [...world.npcs.map(n=>({...n,kind:'npc'})),...world.encounters.flatMap(e=>monsterInteractionTargets(world,e)),...(world.landmarks||[]).map(e=>({...e,kind:'landmark'})),...(world.entrancePortal?[{...world.entrancePortal,kind:'portal'}]:[]),{...world.portal,kind:'portal'}]
        .filter(e=>!e.hidden&&distance(e,p)<90).sort((a,b)=>distance(a,p)-distance(b,p))[0]||null;
}

const roadGraphs=new WeakMap();
function* roadPathSteps(world,start,destination){
    if(!walkable(world,destination.x,destination.y))return [];
    let graph=roadGraphs.get(world);
    if(!graph){
        const nodes=[],links=[],ids=new Map(),add=p=>{const key=`${p.x},${p.y}`;if(!ids.has(key)){ids.set(key,nodes.length);nodes.push(p);links.push([]);}return ids.get(key);};
        for(const r of world.paths){const a=add(r.a),b=add(r.b);if(yield* clearSegmentSteps(world,r.a,r.b)){const d=distance(r.a,r.b);links[a].push([b,d]);links[b].push([a,d]);}}
        // Spurs may join a road at its midpoint rather than at an existing end.
        for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
            yield;const d=distance(nodes[i],nodes[j]);if(d<420&&(yield* clearSegmentSteps(world,nodes[i],nodes[j]))){links[i].push([j,d]);links[j].push([i,d]);}
        }
        graph={nodes,links,paths:world.paths,buildings:world.buildings};roadGraphs.set(world,graph);
    }
    // Keep the nearest vertices, and also any vertex close enough to cut the corner.
    // A hard cap of 10 misses a visible junction when a plaza has many nearer nodes.
    const {nodes,links}=graph,near=function*(p){
        const ranked=nodes.map((n,i)=>({i,d:distance(n,p)})).sort((a,b)=>a.d-b.d);
        const result=[];for(const [index,n]of ranked.entries())if((index<10||n.d<=960)&&(yield* clearSegmentSteps(world,p,nodes[n.i])))result.push(n);return result;
    };
    const starts=yield* near(start),goals=new Map((yield* near(destination)).map(n=>[n.i,n.d]));
    const costs=new Map(starts.map(n=>[n.i,n.d])),parents=new Map(),open=createPathQueue(),closed=new Set();
    for(const n of starts)open.push(n.i,n.i,n.d);
    let goal=null,best=Infinity;
    while(open.length){
        yield;
        const i=open.shift();if(closed.has(i))continue;closed.add(i);
        const cost=costs.get(i);if(cost>=best)continue;
        if(goals.has(i)&&cost+goals.get(i)<best){goal=i;best=cost+goals.get(i);}
        for(const [j,d] of links[i])if(cost+d<(costs.get(j)??Infinity)){costs.set(j,cost+d);parents.set(j,i);open.push(j,j,cost+d);}
    }
    if(goal===null)return [];
    const result=[{...destination}];let i=goal;
    while(i!==undefined){result.unshift(nodes[i]);i=parents.get(i);}
    return result;
}

// Immutable world objects are indexed once; collision and drawing query local buckets.
const objectIndices=new WeakMap();
const earthObjectDescriptors=new WeakMap();
export function invalidateWorldObjects(world,change={}){if(!change.wildOnly&&!change.prepared){objectIndices.delete(world);roadGraphs.delete(world);}pruneMonsterScene(world);}
export function* prepareWorldObjectIndex(world,previous=null){
    if(previous&&['trees','buildings','npcs','landmarks',...(world.isEarth?[]:['encounters'])].every(key=>world[key]===previous[key])&&objectIndices.has(previous)){const index=objectIndices.get(previous);objectIndices.set(world,index);return index;}
    const buckets=new Map(),cell=256;
    for(const [group,kind] of [['trees','tree'],['buildings','building'],['npcs','npc'],['encounters','mob'],['landmarks','landmark']]){
        if(world.isEarth&&group==='encounters')continue;
        for(const row of world[group]||[]){let o=world.isEarth&&earthObjectDescriptors.get(row);if(!o){o={...row,kind};if(world.isEarth)earthObjectDescriptors.set(row,o);}const key=`${Math.floor(o.x/cell)},${Math.floor(o.y/cell)}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(o);yield;}
    }
    objectIndices.set(world,buckets);return buckets;
}
// Same route and tie order as the synchronous API, with resumable Earth searches.
export function* findPathSteps(world,start,destination){
    if(!world.isEarth)return yield* islandPathSteps(world,start,destination);
    const radius=world.earthRules.navigationRadius;if(distance(start,destination)>radius)return [];
    if(clearSegment(world,start,destination))return [{...destination}];
    return yield* gridPathSteps(world,start,destination,{minX:start.x-radius,minY:start.y-radius,maxX:start.x+radius,maxY:start.y+radius});
}
export function adoptWorldObjectIndex(world,prepared){const index=objectIndices.get(prepared);if(index)objectIndices.set(world,index);const graph=roadGraphs.get(world);if(graph&&(graph.paths!==world.paths||graph.buildings!==world.buildings))roadGraphs.delete(world);}
function worldObjectIndex(world){
    let buckets=objectIndices.get(world);const cell=256;
    if(!buckets){
        const steps=prepareWorldObjectIndex(world);let result;do{result=steps.next();}while(!result.done);buckets=result.value;
    }
    return buckets;
}
export function nearbyWorldObjects(world,rect) {
    const buckets=worldObjectIndex(world),cell=256;
    const out=[];
    for(let y=Math.floor(rect.y/cell);y<=Math.floor((rect.y+rect.h)/cell);y++)for(let x=Math.floor(rect.x/cell);x<=Math.floor((rect.x+rect.w)/cell);x++){
        for(const o of buckets.get(`${x},${y}`)||[])if(o.x>=rect.x&&o.x<=rect.x+rect.w&&o.y>=rect.y&&o.y<=rect.y+rect.h)out.push(o);
    }
    if(world.isEarth)for(const row of world.encounters||[])if(row.x>=rect.x&&row.x<=rect.x+rect.w&&row.y>=rect.y&&row.y<=rect.y+rect.h)out.push({...row,kind:'mob'});
    return out;
}

// Presentation query: keep a small overscan working set while the camera moves.
// Collision queries remain exact; explicit invalidation refreshes this set too.
export function createWorldViewQuery(){
    let scope=null,index=null,bounds=null,rows=[],scenery=[],encounters=null;
    return {query(world,rect){
        const next=worldObjectIndex(world);
        if(scope!==world||index!==next||!bounds||rect.x<bounds.x||rect.y<bounds.y||rect.x+rect.w>bounds.x+bounds.w||rect.y+rect.h>bounds.y+bounds.h){
            scope=world;index=next;bounds={x:rect.x-128,y:rect.y-128,w:rect.w+256,h:rect.h+256};
            rows=nearbyWorldObjects(world,bounds).filter(o=>!world.bakeNaturalGround||o.kind!=='tree'||!Number.isInteger(o.earthDecoFrame)||earthDecorationIsTree(o.earthDecoFrame)).sort((a,b)=>(a.sortY??a.y)-(b.sortY??b.y));scenery=world.isEarth?rows.filter(o=>o.kind!=='mob'):rows;encounters=world.encounters;
        }
        if(world.isEarth&&encounters!==world.encounters){encounters=world.encounters;rows=[...scenery,...(encounters||[]).filter(o=>o.x>=bounds.x&&o.x<=bounds.x+bounds.w&&o.y>=bounds.y&&o.y<=bounds.y+bounds.h).map(o=>({...o,kind:'mob'}))].sort((a,b)=>(a.sortY??a.y)-(b.sortY??b.y));}
        return rows;
    },clear(){if(scope){scope=null;index=null;bounds=null;rows=[];}}};
}
