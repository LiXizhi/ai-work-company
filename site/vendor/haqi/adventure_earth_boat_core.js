import {earthBridgeContains} from './adventure_earth_bridge_core.js';

// Boat mode is derived from local terrain, never written to equipment or cloud saves.
export function earthBoatAt(world,x,y){
    if(!world?.isEarth||!world.earthBoating)return false;
    const type=world.terrainAt(x,y);
    return (type==='water'||type==='ocean')&&!(world.paths||[]).some(r=>earthBridgeContains(r,x,y));
}
export function earthBoatFacing(dx,dy){
    return Math.abs(dx)>Math.abs(dy)?dx<0?1:2:dy<0?3:0;
}
export function earthRoadDocks(paths){
    return [...new Map(paths.flatMap(r=>r.docks||[]).map(d=>[`${d.x}:${d.y}`,d])).values()];
}

// Snap the shared hull/rider anchor in device pixels, never gameplay coordinates.
export function earthBoatDrawPosition(position,transform){
    if(!transform)return {x:position.x,y:position.y};
    const {a,b,c,d,e,f}=transform,det=a*d-b*c;if(!det)return {x:position.x,y:position.y};
    const sx=a*position.x+c*position.y+e,sy=b*position.x+d*position.y+f;
    const dx=Math.round(sx)-sx,dy=Math.round(sy)-sy;
    return {x:position.x+(d*dx-c*dy)/det,y:position.y+(a*dy-b*dx)/det};
}

// Reuse Mountable's head pose while keeping the seated body and breath still.
export function earthBoatRiderPose(pose,facing){
    return {...pose,facing,head:pose?.head??[0,4,12,8][facing],moving:false,walkTime:0,breath:{x:0,y:0,angle:0}};
}
