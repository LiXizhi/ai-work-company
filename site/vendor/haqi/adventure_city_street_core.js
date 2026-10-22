// Versioned streetscape geometry and ambient simulation. No browser or IO dependencies.
import {validResidentCharacter} from './adventure_city_people_core.js';
export const STREET_VERSION=1;
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export function polygonContains(p,points){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
        const a=points[i],b=points[j];
        if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
}
export function segmentDistance(p,a,b){
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
}
export function polygonBounds(points){
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
}
const intersects=(a,b)=>a.x<=b.x+b.w&&a.x+a.w>=b.x&&a.y<=b.y+b.h&&a.y+a.h>=b.y;
export function createSpatialIndex(objects,boundsOf,cell=256){
    const buckets=new Map();
    for(const object of objects){const b=boundsOf(object);for(let y=Math.floor(b.y/cell);y<=Math.floor((b.y+b.h)/cell);y++)for(let x=Math.floor(b.x/cell);x<=Math.floor((b.x+b.w)/cell);x++){const key=x+','+y;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({object,b});}}
    return rect=>{const out=new Set();for(let y=Math.floor(rect.y/cell);y<=Math.floor((rect.y+rect.h)/cell);y++)for(let x=Math.floor(rect.x/cell);x<=Math.floor((rect.x+rect.w)/cell);x++)for(const {object,b}of buckets.get(x+','+y)||[])if(intersects(b,rect))out.add(object);return [...out];};
}
const collisionIndices=new WeakMap();
const streetCollisionQuery=scene=>{
    let query=collisionIndices.get(scene);
    if(!query){const shapes=[...(scene.map.obstacles||[]).map(r=>[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}]),...(scene.streetscape?.colliders||[]).map(c=>c.points)];query=createSpatialIndex(shapes,polygonBounds);collisionIndices.set(scene,query);}
    return query;
};
const withinStreet=(scene,p)=>{const margin=scene.streetscape?.edgeMargin??40;return finite(p)&&p.x>=margin&&p.y>=margin&&p.x<=scene.map.w-margin&&p.y<=scene.map.h-margin;};
export function streetWalkable(scene,x,y,radius=scene.streetscape?.walkRadius??8){
    const p={x,y};if(!withinStreet(scene,p))return false;
    return !streetCollisionQuery(scene)({x:x-radius,y:y-radius,w:radius*2,h:radius*2}).some(poly=>polygonContains(p,poly)||poly.some((a,i)=>segmentDistance(p,a,poly[(i+1)%poly.length])<=radius));
}
const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const segmentGap=(a,b,c,d)=>{
    if(intersects(polygonBounds([a,b]),polygonBounds([c,d]))&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0)return 0;
    return Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b));
};
// Continuous circular-foot sweep includes narrow poles and grazing corners
// that a sampled centerline could skip; v1/v2 callers retain their old sampler.
export function streetSegmentWalkable(scene,a,b,radius=scene.streetscape?.walkRadius??8){
    if(!withinStreet(scene,a)||!withinStreet(scene,b))return false;
    const query={x:Math.min(a.x,b.x)-radius,y:Math.min(a.y,b.y)-radius,w:Math.abs(b.x-a.x)+radius*2,h:Math.abs(b.y-a.y)+radius*2};
    return !streetCollisionQuery(scene)(query).some(poly=>polygonContains(a,poly)||polygonContains(b,poly)||poly.some((p,i)=>segmentGap(a,b,p,poly[(i+1)%poly.length])<=radius));
}
export function safeStreetPosition(scene,position){
    if(position&&streetWalkable(scene,position.x,position.y))return {...position};
    if(position&&finite(position))for(let r=16;r<=256;r+=16)for(let i=0;i<24;i++){const a=i*Math.PI/12,p={x:position.x+Math.cos(a)*r,y:position.y+Math.sin(a)*r};if(streetWalkable(scene,p.x,p.y))return p;}
    return {...scene.map.spawn};
}
export function validateStreetscape(scene){
    const s=scene.streetscape;if(!s)return;
    assert(s.version===STREET_VERSION,'街景版本不支持');
    if(s.walkRadius!=null)assert(Number.isFinite(s.walkRadius)&&s.walkRadius>0&&s.walkRadius<=40,'街景脚底净宽无效');
    if(s.edgeMargin!=null)assert(Number.isFinite(s.edgeMargin)&&s.edgeMargin>=(s.walkRadius??8)&&s.edgeMargin<=64,'街景边界留白无效');
    if(s.movementStep!=null)assert(Number.isFinite(s.movementStep)&&s.movementStep>0&&s.movementStep<=8,'街景移动步长无效');
    const at=p=>finite(p)&&p.x>=0&&p.y>=0&&p.x<=scene.map.w&&p.y<=scene.map.h;
    const ids=new Set();
    for(const list of ['surfaces','roads','colliders','objects','routes','signals'])assert(Array.isArray(s[list])&&s[list].length<=12000,'街景组件无效：'+list);
    for(const row of [...s.surfaces,...s.roads,...s.colliders,...s.objects,...s.routes,...s.signals]){assert(typeof row.id==='string'&&!ids.has(row.id),'街景对象编号重复');ids.add(row.id);}
    for(const row of [...s.surfaces,...s.colliders])assert(row.points.length>=3&&row.points.every(at),'街景多边形无效');
    for(const road of s.roads)assert(road.points.length>=2&&road.points.every(at)&&road.width>0&&road.width<=600,'街景道路无效');
    if(s.markings!=null){assert(Array.isArray(s.markings)&&s.markings.length<=512,'街景标线无效');for(const row of s.markings){assert(typeof row.id==='string'&&!ids.has(row.id),'街景标线编号重复');ids.add(row.id);assert(Array.isArray(row.points)&&row.points.length>=2&&row.points.every(at)&&Number.isFinite(row.width)&&row.width>0&&row.width<=8&&/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(row.color),'街景标线无效');}}
    if(s.wear!=null){assert(Array.isArray(s.wear)&&s.wear.length<=512,'街景磨损无效');for(const row of s.wear){assert(typeof row.id==='string'&&!ids.has(row.id),'街景磨损编号重复');ids.add(row.id);assert(Array.isArray(row.points)&&row.points.length>=3&&row.points.length<=32&&row.points.every(at)&&/^#[0-9a-f]{8}$/i.test(row.color)&&['footfall','moisture','asphalt-repair','tree-soil','wash'].includes(row.kind),'街景磨损无效');}}
    for(const name of ['doorNodes','facilityNodes','restNodes'])if(s[name]!=null){assert(Array.isArray(s[name])&&s[name].length<=128,'街景落脚点无效');for(const point of s[name])assert(typeof point.id==='string'&&at(point),'街景落脚点无效');}
    if(s.transitions?.aprons!=null){assert(Array.isArray(s.transitions.aprons)&&s.transitions.aprons.length<=32,'街景过街缓坡无效');for(const row of s.transitions.aprons)assert(row.points?.length>=3&&row.points.length<=16&&row.points.every(at)&&typeof row.material==='string'&&/^#[0-9a-f]{6}$/i.test(row.color),'街景过街缓坡无效');}
    if(s.transitions?.tactile!=null){assert(Array.isArray(s.transitions.tactile)&&s.transitions.tactile.length<=32,'街景提示铺装无效');for(const row of s.transitions.tactile)assert(at(row)&&Number.isFinite(row.w)&&row.w>0&&row.w<=120&&Number.isFinite(row.h)&&row.h>0&&row.h<=24&&at({x:row.x+row.w,y:row.y+row.h}),'街景提示铺装无效');}
    for(const o of s.objects)assert(at(o)&&o.w>0&&o.w<=1200&&o.h>0&&o.h<=1200&&['building','prop','tree'].includes(o.type),'街景精灵无效');
    for(const o of s.objects){if(o.occludes!=null)assert(typeof o.occludes==='boolean','街景遮挡标记无效');if(o.ground!=null)assert(typeof o.ground==='boolean','街景地面层无效');if(o.components!=null){assert(Array.isArray(o.components)&&o.components.length<=24,'街景附属组件无效');for(const p of o.components)assert(finite(p)&&typeof p.art==='string'&&p.w>0&&p.h>0&&p.w<=1200&&p.h<=1200,'街景附属精灵无效');}}
    const signals=new Set(s.signals.map(s=>s.id));
    for(const signal of s.signals)assert(at(signal)&&signal.period>=4&&signal.green>0&&signal.green<signal.period&&Number.isFinite(signal.offset||0),'街景信号灯无效');
    for(const r of s.routes){assert(['pedestrian','vehicle'].includes(r.kind)&&r.points.length>=2&&r.points.every(at)&&r.speed>0&&r.speed<=200&&r.count>=1&&r.count<=12,'街景路线无效');if(r.characters)assert(Array.isArray(r.characters)&&r.characters.length>0&&r.characters.length<=12&&r.characters.every(validResidentCharacter),'街景居民外观无效');for(const stop of r.stops||[])assert(signals.has(stop.signal)&&stop.distance>=0&&stop.distance<routeLength(r.points),'街景停车线无效');}
    for(const n of scene.npcs)if(n.character)assert(validResidentCharacter(n.character),'固定居民外观无效');
    assert(s.routes.reduce((n,r)=>n+r.count,0)<=48,'街景动态对象过多');
    for(const p of [scene.map.spawn,scene.map.exit,...scene.npcs,...scene.hotspots,...scene.encounters])assert(streetWalkable(scene,p.x,p.y),'街景阻挡必要点位');
}
export function routeLength(points){return points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);}
export function routePose(route,distance){
    const length=routeLength(route.points);let left=((distance%length)+length)%length;
    for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(left<=len||i===route.points.length-1){const t=len?left/len:0;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)};}left-=len;}
}
export const signalGreen=(signal,time)=>((time+(signal.offset||0))%signal.period+signal.period)%signal.period<signal.green;
export function createStreetMotion(street){return {time:0,actors:street.routes.flatMap(r=>Array.from({length:r.count},(_,i)=>({id:r.id+':'+i,route:r,distance:routeLength(r.points)*(i+.25)/r.count,walkDistance:0,walkTime:0,moving:false,dx:0,dy:0,...routePose(r,routeLength(r.points)*(i+.25)/r.count)})))};}
export function stepStreetMotion(state,street,dt,hero,{reducedMotion=false,paused=false}={}){
    if(paused||reducedMotion)return state.actors;
    dt=Math.max(0,Math.min(.1,dt));state.time+=dt;
    const signals=new Map(street.signals.map(s=>[s.id,s]));
    for(const actor of state.actors){const r=actor.route,length=routeLength(r.points),advance=r.speed*dt;let blocked=false;
        if(r.kind==='vehicle'){
            for(const stop of r.stops||[]){const gap=(stop.distance-actor.distance+length)%length;if(gap<=advance+3&&!signalGreen(signals.get(stop.signal),state.time))blocked=true;}
            const ahead=routePose(r,actor.distance+48);if(hero&&Math.hypot(ahead.x-hero.x,ahead.y-hero.y)<65)blocked=true;
            if(state.actors.some(other=>other!==actor&&other.route===r&&(other.distance-actor.distance+length)%length<100))blocked=true;
        }
        actor.moving=!blocked&&advance>0;actor.dx=actor.moving?Math.cos(actor.angle)*advance:0;actor.dy=actor.moving?Math.sin(actor.angle)*advance:0;
        if(!blocked){actor.distance=(actor.distance+advance)%length;actor.walkDistance+=advance;}
        // Ambient route speeds are slower than the player; keep the sprite's authored cadence.
        if(actor.moving)actor.walkTime+=dt;
        Object.assign(actor,routePose(r,actor.distance));actor.stopped=blocked;
    }
    return state.actors;
}
// WGS84 local tangent approximation for a bounded street scene (under 1 km).
export function geoToStreet(lon,lat,{lon:originLon,lat:originLat,meters=300,unitsPerMeter=16}){
    return {x:(meters/2+(lon-originLon)*Math.PI/180*6378137*Math.cos(originLat*Math.PI/180))*unitsPerMeter,y:(meters/2-(lat-originLat)*Math.PI/180*6378137)*unitsPerMeter};
}
