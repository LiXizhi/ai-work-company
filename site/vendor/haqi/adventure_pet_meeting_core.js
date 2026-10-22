import {walkable,findPath,distance,clearSegment} from './adventure_world_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const encounterBaseRadius=defaultParams('kids').islandSocial.converseRadius;
export function petInteractionParams(content){
    const params=resolveParams({cards:{}},content.balanceParams||{version:'kids'},{groups:['petInteractions']}).petInteractions;
    params.encounterDistance=encounterBaseRadius*params.encounterDistanceMultiplier;
    check(['memoryCapacity','memoryProtectionMs','marksRequired','cooldownMs','indexPageSize'].every(key=>Number.isSafeInteger(params[key])&&params[key]>0),'宠物互动参数无效');
    check(['babyScale','interactionDistance','feedingDistance','effectMs','playIntervalMs','encounterDistance','meetingSpacing','meetingArrivalDistance'].every(key=>Number.isFinite(params[key])&&params[key]>0),'宠物互动参数无效');
    return params;
}
export function petMeetingClear(point,owners,content){
    const p=petInteractionParams(content);
    return owners.filter(o=>Number.isFinite(o.x)&&Number.isFinite(o.y)).every(o=>Math.abs(point.x-o.x)>=p.meetingOwnerClearanceX||Math.abs(point.y-o.y)>=p.meetingOwnerClearanceY);
}
export function petMeetingTargets(anchor,content){const gap=petInteractionParams(content).meetingSpacing/2;return [{x:anchor.x-gap,y:anchor.y},{x:anchor.x+gap,y:anchor.y}];}
export function petMeetingPath(world,from,to){
    const path=findPath(world,from,to),last=path.at(-1)||from;
    if(!clearSegment(world,last,to))return [];
    return [...path,{...to}];
}
export function findPetMeeting(world,participants,owners,content){
    const p=petInteractionParams(content),center={x:participants.reduce((s,a)=>s+a.x,0)/participants.length,y:participants.reduce((s,a)=>s+a.y,0)/participants.length};
    // Prefer open space beside/below the owners, away from their bodies and labels.
    for(const factor of [1,1.3])for(const [dx,dy]of [[1,.4],[-1,.4],[0,1],[1,1],[-1,1],[0,-1],[1,-1],[-1,-1]]){
        const anchor={x:center.x+dx*p.meetingOffset*factor,y:center.y+dy*p.meetingOffset*factor},targets=petMeetingTargets(anchor,content);
        if(!walkable(world,anchor.x,anchor.y)||!targets.every(t=>walkable(world,t.x,t.y)&&petMeetingClear(t,owners,content)))continue;
        if(participants.every((from,i)=>{const to=targets[i?1:0],path=petMeetingPath(world,from,to);return distance(from,to)<=p.meetingTargetTolerance||path.length&&distance(path.at(-1),to)<=p.meetingTargetTolerance;}))return anchor;
    }
    return null;
}
