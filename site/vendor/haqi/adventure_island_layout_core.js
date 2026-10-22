// Pure geometry shared by the offline generator, collision and rendering.
import { onBridge } from './adventure_bridge_core.js';
import {earthMapInfo} from './adventure_earth_core.js';
export function mapInfo(zone,content) {
    if(zone==='earth')return earthMapInfo(content);
    const info=content?.worldMapIndex?.islands?.[zone];
    if(!info)throw Error('缺少岛屿配置：'+zone+'，请运行 npm run generate:maps');
    return info;
}
export function worldDimensions(zone,content) {const {w,h}=mapInfo(zone,content);return {w,h};}
export function segmentDistance(p,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function insidePolygon(x,y,points) {
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
        const [ax,ay]=points[i],[bx,by]=points[j];
        if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
    }
    return inside;
}
export function onLargeIsland(world,x,y,padding=0) {
    if(!insidePolygon(x,y,world.layout.coast))return false;
    if(padding<=0)return true;
    return world.layout.coast.every(([ax,ay],i)=>{
        const [bx,by]=world.layout.coast[(i+1)%world.layout.coast.length];
        // Most edges are far away: their expanded bounds suffice to reject
        // them without allocating points or calculating a square root.
        if(x<Math.min(ax,bx)-padding||x>Math.max(ax,bx)+padding||y<Math.min(ay,by)-padding||y>Math.max(ay,by)+padding)return true;
        return segmentDistance({x,y},{x:ax,y:ay},{x:bx,y:by})>=padding;
    });
}
export function riverBlocks(world,x,y) {
    if(!world.layout)return false;
    if(world.layout.lakes?.some(l=>((x-l.x)/(l.rx+12))**2+((y-l.y)/(l.ry+12))**2<1))return true;
    if(world.layout.bridges.some(b=>onBridge(b,x,y,7)))return false;
    for(const r of world.layout.rivers){
        const radius=r.width/2+12;
        for(let i=1;i<r.points.length;i++){
            const [ax,ay]=r.points[i-1],[bx,by]=r.points[i];
            if(x<Math.min(ax,bx)-radius||x>Math.max(ax,bx)+radius||y<Math.min(ay,by)-radius||y>Math.max(ay,by)+radius)continue;
            if(segmentDistance({x,y},{x:ax,y:ay},{x:bx,y:by})<radius)return true;
        }
    }
    return false;
}
export function regionAt(world,p) {
    return world.layout?.regions?.reduce((best,r)=>{
        const d=((p.x-r.x)/r.rx)**2+((p.y-r.y)/r.ry)**2;
        return d<(best?.d??Infinity)?{...r,d}:best;
    },null)||null;
}

function rectsOverlap(a,b) {
    return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
}

// Matches adventure_renderer: trees draw from the foot upward, and a non-snow
// accent plant sits on the right. Buildings draw from the foot up by h.
export function scenerySpriteRects(object) {
    if(Number.isFinite(object.size)&&!Number.isFinite(object.w)){
        const size=object.size;
        const rects=[{x:object.x-size/2,y:object.y-size+10,w:size,h:size}];
        if(!object.snow){
            const plant=size*.36;
            rects.push({x:object.x+size*.18,y:object.y-plant+14,w:plant,h:plant});
        }
        return rects;
    }
    const w=object.w||0,h=object.h||0;
    return [{x:object.x-w/2,y:object.y-h,w,h}];
}

const TALL_NPC=new Set([36211,30112]);

// Body plus the name plate under the feet and the quest mark above the head.
// Width follows the same 12px plate the scene draws.
export function coreActorGuard(actor) {
    const grouped=Array.isArray(actor.monsterIds)&&actor.monsterIds.length>0;
    const group=grouped?actor.monsterIds.length:(actor.monsterId?1:0);
    let half=32,above=86;
    if(group){
        const scale=grouped?.7:.8;
        half=52*scale+(group>1?(group-1)/2*42:0);
        above=104*scale+(group>1?16:0);
    }else if(TALL_NPC.has(actor.id)){
        half=50;above=104;
    }
    const label=actor.label||actor.name||'';
    half=Math.max(half,[...String(label)].length*7+12);
    const top=above+22,below=32;
    return {x:actor.x-half,y:actor.y-top,w:half*2,h:top+below};
}

// Foot Y is the draw order. A larger Y paints later and can hide whoever stands behind.
export function sceneryCoversActor(scenery,actor) {
    if(!(scenery.y>actor.y))return false;
    const guard=coreActorGuard(actor);
    return scenerySpriteRects(scenery).some(rect=>rectsOverlap(rect,guard));
}

function buildingBlocksActor(building,actor) {
    return actor.x>building.x-building.w*.3-10&&actor.x<building.x+building.w*.3+10&&actor.y>building.y-building.h*.42-10&&actor.y<building.y+12;
}

function coverShift(building,actors) {
    let dy=0,dxPos=0,dxNeg=0;
    for(const actor of actors){
        if(!sceneryCoversActor(building,actor))continue;
        const guard=coreActorGuard(actor);
        for(const rect of scenerySpriteRects(building)){
            if(!rectsOverlap(rect,guard))continue;
            dy=Math.max(dy,guard.y+guard.h-rect.y+1);
            dxPos=Math.max(dxPos,guard.x+guard.w-rect.x+1);
            dxNeg=Math.min(dxNeg,guard.x-(rect.x+rect.w)-1);
        }
    }
    return {dy,dxPos,dxNeg};
}

// Slide a building just clear of core actors. Trees are dropped instead; a canopy
// is too tall to nudge without leaving the grove.
export function separateBuilding(building,actors,onLand=()=>true) {
    if(building.decorationOnly||!Number.isFinite(building.w))return building;
    let current={...building};
    for(let n=0;n<8;n++){
        if(!actors.some(a=>sceneryCoversActor(current,a)))return current;
        const {dy,dxPos,dxNeg}=coverShift(current,actors);
        const options=[];
        if(dy>0&&dy<420)options.push({x:current.x,y:current.y+dy});
        if(dxPos>0&&dxPos<420)options.push({x:current.x+dxPos,y:current.y});
        if(dxNeg<0&&dxNeg>-420)options.push({x:current.x+dxNeg,y:current.y});
        options.sort((a,b)=>Math.hypot(a.x-building.x,a.y-building.y)-Math.hypot(b.x-building.x,b.y-building.y));
        const next=options.find(p=>onLand(p.x,p.y)&&!actors.some(a=>buildingBlocksActor({...current,...p},a)));
        if(!next)break;
        current={...current,...next};
    }
    return current;
}
