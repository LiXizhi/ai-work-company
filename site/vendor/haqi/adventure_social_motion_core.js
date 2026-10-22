import {socialGesturePose,socialHeadAnchor} from './adventure_social_actions_core.js';
import {createRng,hashSeed} from './rng_core.js';
import {findPath,followPath,nearestWalkable,walkable,routeLocation,routePoint} from './adventure_world_core.js';
import {segmentDistance} from './adventure_island_layout_core.js';
import {SOCIAL_DEFAULTS} from './adventure_social_core.js';
import {earthBoatAt} from './adventure_earth_boat_core.js';
import {socialNavigationWorld} from './adventure_earth_core.js';
export {socialNavigationWorld};
// Sprite directions: down/front=0, left=1, right=2, up/back=3.
// Keep real travel direction, but turn toward the camera or sideways while standing.
export function socialFacing(dx,dy,moving=false){
    if(Math.abs(dx)>Math.abs(dy))return dx<0?1:2;
    return dy<0?(moving?3:dx<0?1:2):0;
}
export function socialInView(position,view){
    if(!view||!(view.w>0)||!(view.h>0))return true;
    return position.x>=view.x&&position.x<=view.x+view.w&&position.y>=view.y&&position.y<=view.y+view.h;
}

function hubReach(params=SOCIAL_DEFAULTS){return params.hotspotRadius+params.hotspotSpread;}
function roadSlack(params=SOCIAL_DEFAULTS){return params.roadSlack??16;}
function spawnMinActors(params=SOCIAL_DEFAULTS){return Math.max(0,Math.floor(params.spawnMinActors??2));}

export function roadClearance(world,p){
    if(!world.paths?.length)return 0;
    return Math.min(...world.paths.map(path=>segmentDistance(p,path.a,path.b)-(path.width||60)/2));
}
export function onActivityRoad(world,p,params=SOCIAL_DEFAULTS){
    if(!world.paths?.length)return walkable(world,p.x,p.y);
    return roadClearance(world,p)<=roadSlack(params);
}

// Activity hubs are quest-adjacent places: teleporters, landmarks, roadside NPCs and nearby mobs.
export function socialActivityHubs(world){
    const hubs=[];
    const add=(point,weight,kind,id)=>{
        if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return;
        hubs.push({x:point.x,y:point.y,weight,kind,id});
    };
    const plaza=world.zone==='town'?(world.landmarks||[]).find(p=>/广场|plaza/i.test(`${p.id||''}${p.name||''}`)):null;
    add(plaza||world.layout?.spawn||world.center,4,'spawn','spawn');
    add(world.portal,1,'portal','portal');
    add(world.entrancePortal,1,'portal','entrance');
    for(const landmark of world.landmarks||[]){
        if(landmark.dungeonId)continue;
        if(landmark===plaza)continue;
        add(landmark,2.5,'landmark',landmark.id);
    }
    for(const npc of world.npcs||[]){
        const guide=/导师|任务/i.test(npc.name||'');
        add(npc,guide?3.5:2,'npc',npc.id);
    }
    for(const encounter of world.encounters||[])add(encounter,1.5,'encounter',encounter.id);
    if(!hubs.length)add(world.center||world.layout?.spawn,1,'center','center');
    return hubs;
}

function pickWeightedHub(rng,hubs){
    const total=hubs.reduce((sum,h)=>sum+h.weight,0);
    let roll=rng.float()*total;
    for(const hub of hubs){roll-=hub.weight;if(roll<=0)return hub;}
    return hubs[hubs.length-1];
}

function roadsideCandidates(world,hub,params=SOCIAL_DEFAULTS){return drainSteps(roadsideCandidateSteps(world,hub,params));}
function* roadsideCandidateSteps(world,hub,params=SOCIAL_DEFAULTS){
    const reach=hubReach(params),paths=world.paths||[],out=[];
    if(!paths.length){
        for(let n=0;n<16;n++){
            yield;
            const angle=n/16*Math.PI*2,r=params.hotspotRadius+((n%4)/4)*params.hotspotSpread;
            const p=nearestWalkable(world,hub.x+Math.cos(angle)*r,hub.y+Math.sin(angle)*r);
            if(p&&walkable(world,p.x,p.y))out.push(p);
        }
        return out;
    }
    for(const path of paths){
        yield;
        const dx=path.b.x-path.a.x,dy=path.b.y-path.a.y,length=Math.hypot(dx,dy)||1;
        const step=Math.max(28,Math.min(48,path.width||40));
        for(let d=0;d<=length;d+=step){
            const t=d/length,cx=path.a.x+dx*t,cy=path.a.y+dy*t;
            if(Math.hypot(cx-hub.x,cy-hub.y)>reach)continue;
            const nx=-dy/length,ny=dx/length,half=(path.width||60)*.28;
            for(const side of [0,-1,1]){
                yield;
                const p=nearestWalkable(world,cx+nx*half*side,cy+ny*half*side);
                if(p&&walkable(world,p.x,p.y)&&onActivityRoad(world,p,params)&&Math.hypot(p.x-hub.x,p.y-hub.y)<=reach)out.push(p);
            }
        }
    }
    if(!out.length){
        const p=nearestWalkable(world,hub.x,hub.y);
        if(p&&walkable(world,p.x,p.y))out.push(p);
    }
    return out;
}

export function socialMonsterGap(encounter,params=SOCIAL_DEFAULTS){
    const count=encounter.monsterIds?.length||1;
    const spread=count>1?(count-1)/2*42:0;
    return (params.monsterClearance??96)+spread;
}
function clearsMonsters(world,p,params=SOCIAL_DEFAULTS){
    if(!p)return false;
    return (world.encounters||[]).every(e=>Math.hypot(e.x-p.x,e.y-p.y)>socialMonsterGap(e,params));
}
function actorGap(params=SOCIAL_DEFAULTS){return params.actorSeparation??120;}
// Party members deliberately overlap sprite bounds: feet follow a compact train.
export function socialTrailGap(params=SOCIAL_DEFAULTS){return params.followSpacing;}
export function actorsApart(a,b,gap=actorGap()){return Math.abs(a.x-b.x)>=gap||Math.abs(a.y-b.y)>=gap;}
function clearsPeople(world,p,used,params=SOCIAL_DEFAULTS){
    if(!clearsMonsters(world,p,params))return false;
    if(used.some(v=>!actorsApart(v,p,actorGap(params))))return false;
    return (world.npcs||[]).every(n=>Math.hypot(n.x-p.x,n.y-p.y)>params.npcClearance);
}
// Nearest road point whose sprite box misses every occupied companion, monster and NPC.
function nearestActorStand(world,origin,occupied,params=SOCIAL_DEFAULTS,maxDist=Infinity){return drainSteps(nearestActorStandSteps(world,origin,occupied,params,maxDist));}
function* nearestActorStandSteps(world,origin,occupied,params=SOCIAL_DEFAULTS,maxDist=Infinity){
    const ok=(p,onRoad)=>p&&Number.isFinite(p.x)&&Math.hypot(p.x-origin.x,p.y-origin.y)<=maxDist+1e-6&&walkable(world,p.x,p.y)&&(onRoad||onActivityRoad(world,p,params))&&clearsPeople(world,p,occupied,params);
    if(ok(origin,false))return {x:origin.x,y:origin.y};
    let best=null,bestD=Infinity;
    const consider=(p,onRoad)=>{if(!ok(p,onRoad))return;const d=Math.hypot(p.x-origin.x,p.y-origin.y);if(d<bestD){bestD=d;best={x:p.x,y:p.y};}};
    for(const path of world.paths||[]){
        const dx=path.b.x-path.a.x,dy=path.b.y-path.a.y,length=Math.hypot(dx,dy)||1,steps=Math.ceil(length/20);
        for(let i=0;i<=steps;i++){yield;const t=i/steps;consider({x:path.a.x+dx*t,y:path.a.y+dy*t},true);}
    }
    if(best||world.paths?.length)return best;
    for(let r=actorGap(params);r<=Math.min(maxDist,actorGap(params)*8);r+=16){
        for(let i=0;i<16;i++){yield;const a=i/16*Math.PI*2;consider(nearestWalkable(world,origin.x+Math.cos(a)*r,origin.y+Math.sin(a)*r),false);}
        if(best)return best;
    }
    return best;
}
function separateVisibleActors(actors,world,{locked=null,view=null}={}){
    const gap=actorGap();
    for(let pass=0;pass<actors.length;pass++){
        let moved=false;
        for(let j=1;j<actors.length;j++)for(let i=0;i<j;i++){
            const a=actors[i],b=actors[j];
            if(actorsApart(a.position,b.position,gap))continue;
            const aFree=a.profile.id!==locked&&socialInView(a.position,view);
            const bFree=b.profile.id!==locked&&socialInView(b.position,view);
            const mover=bFree?b:aFree?a:null;
            if(!mover)continue;
            const next=nearestActorStand(world,mover.position,actors.filter(o=>o!==mover).map(o=>o.position));
            if(!next||(next.x===mover.position.x&&next.y===mover.position.y))continue;
            const before=mover.position;
            mover.position=next;mover.path=[];mover.moving=false;mover.wait=Math.max(mover.wait,SOCIAL_DEFAULTS.followWait);
            mover.facing=socialFacing(next.x-before.x,next.y-before.y);
            moved=true;
        }
        if(!moved)break;
    }
}
// Keep the companion on the road, but far enough along it that sprites do not stack.
function standClearOfMonsters(world,origin,params=SOCIAL_DEFAULTS){return drainSteps(standClearOfMonsterSteps(world,origin,params));}
function* standClearOfMonsterSteps(world,origin,params=SOCIAL_DEFAULTS){
    origin ||= world.center;
    if(clearsMonsters(world,origin,params)&&walkable(world,origin.x,origin.y))return origin;
    const paths=world.paths||[];
    let best=null,bestDist=Infinity;
    for(const path of paths){
        const length=Math.hypot(path.b.x-path.a.x,path.b.y-path.a.y)||1;
        const steps=Math.ceil(length/28);
        for(let i=0;i<=steps;i++){
            yield;
            const t=i/steps,p={x:path.a.x+(path.b.x-path.a.x)*t,y:path.a.y+(path.b.y-path.a.y)*t};
            if(!walkable(world,p.x,p.y)||!onActivityRoad(world,p,params)||!clearsMonsters(world,p,params))continue;
            const d=Math.hypot(p.x-origin.x,p.y-origin.y);
            if(d<bestDist){bestDist=d;best=p;}
        }
    }
    return best||origin;
}

export function sampleActivitySpot(world,hub,rng,used=[],params=SOCIAL_DEFAULTS){
    return drainSteps(sampleActivitySpotSteps(world,hub,rng,used,params));
}
function* sampleActivitySpotSteps(world,hub,rng,used=[],params=SOCIAL_DEFAULTS){
    world=socialNavigationWorld(world);
    const shuffled=rng.shuffle((yield* roadsideCandidateSteps(world,hub,params)).slice());
    for(const p of shuffled)if(clearsPeople(world,p,used,params))return p;
    const near=yield* nearestActorStandSteps(world,hub,used,params,hubReach(params));
    if(near)return near;
    const anywhere=yield* nearestActorStandSteps(world,hub,used,params);
    if(anywhere)return anywhere;
    const aside=yield* standClearOfMonsterSteps(world,nearestWalkable(world,hub.x+rng.float()*20-10,hub.y+rng.float()*20-10),params);
    return clearsMonsters(world,aside,params)?aside:shuffled.find(p=>clearsMonsters(world,p,params))||aside;
}

function assignHub(rng,hubs,index,spawnHub,spawnQuota){
    if(index<spawnQuota&&spawnHub)return spawnHub;
    return pickWeightedHub(rng,hubs);
}

function drainSteps(steps){let result;do{result=steps.next();}while(!result.done);return result.value;}
export function createSocialActors(world,profiles,seed=1) {return drainSteps(createSocialActorsSteps(world,profiles,seed));}
export function* createSocialActorsSteps(world,profiles,seed=1) {
    world=socialNavigationWorld(world);
    const hubs=socialActivityHubs(world);
    const spawnHub=hubs.find(h=>h.kind==='spawn');
    const spawnQuota=Math.min(spawnMinActors(),profiles.length);
    const used=[];
    const actors=[];for(const [i,profile] of profiles.entries()){
        const rng=createRng(hashSeed(`${seed}:${world.zone}:${profile.id}`));
        const hotspot=assignHub(rng,hubs,i,spawnHub,spawnQuota);
        const position=yield* sampleActivitySpotSteps(world,hotspot,rng,used);
        used.push(position);
        actors.push({profile,position,rng,path:[],facing:hashSeed(profile.id)%3,moving:false,wait:rng.int(SOCIAL_DEFAULTS.idleMin,SOCIAL_DEFAULTS.idleMax),travel:rng.int(SOCIAL_DEFAULTS.travelMin,SOCIAL_DEFAULTS.travelMax),hotspot});
    }
    separateVisibleActors(actors,world);
    return actors;
}
// Arc-length samples preserve the captain's actual turns, including loops and reversals.
// Never run shortest-path navigation or resident separation on this ordered train.
const partyTrails=new WeakMap();
export function stepDungeonParty(actors,world,leader,dt,{key=actors,params=SOCIAL_DEFAULTS}={}){
    if(!leader||!actors.length)return;
    let trail=partyTrails.get(key);
    const boating=earthBoatAt(world,leader.x,leader.y);
    const gap=boating?params.boatFollowSpacing:socialTrailGap(params),signature=actors.map(a=>a.profile.id).join('|');
    if(!trail||trail.world!==world||trail.signature!==signature||Math.hypot(leader.x-trail.points[0].x,leader.y-trail.points[0].y)>SOCIAL_DEFAULTS.dungeonRegroupDistance){
        trail={world,signature,points:[{...leader}],idle:0};
        if(world.layout?.route){
            const progress=routeLocation(world,leader).progress;
            for(let back=8;back<=gap*(actors.length+2);back+=8)trail.points.push(routePoint(world,Math.max(0,progress-back)));
        }else if(world.isEarth||actors.some(a=>a.profile.id==='local-hero-1')){
            const [dx,dy]=[[0,1],[-1,0],[1,0],[0,-1]][leader.facing||0];
            for(let back=8;back<=socialTrailGap(params)*(actors.length+2);back+=8){
                const p={x:leader.x-dx*back,y:leader.y-dy*back};
                if(!walkable(world,p.x,p.y))break;
                trail.points.push(p);
            }
        }
        partyTrails.set(key,trail);
    }
    const moved=Math.hypot(leader.x-trail.points[0].x,leader.y-trail.points[0].y)>.001;
    if(moved){trail.points.unshift({...leader});trail.idle=0;}
    else trail.idle+=Math.max(0,Math.min(.1,dt));
    function behind(distance){
        for(let i=1;i<trail.points.length;i++){
            const a=trail.points[i-1],b=trail.points[i],length=Math.hypot(b.x-a.x,b.y-a.y);
            if(length>=distance&&length>0)return {x:a.x+(b.x-a.x)*distance/length,y:a.y+(b.y-a.y)*distance/length};
            distance-=length;
        }
        return {...trail.points.at(-1)};
    }
    let length=0;
    for(let i=1;i<trail.points.length;i++){length+=Math.hypot(trail.points[i].x-trail.points[i-1].x,trail.points[i].y-trail.points[i-1].y);if(length>socialTrailGap(params)*(actors.length+3)){trail.points.length=i+1;break;}}
    actors.forEach((a,i)=>{
        const before=a.position,target=behind(gap*(i+1));
        // Small, deterministic movement around each slot only after the captain stops.
        const idle=Math.max(0,trail.idle-SOCIAL_DEFAULTS.partyIdleDelay);
        if(boating){
            const ahead=behind(Math.max(0,gap*(i+1)-1)),dx=ahead.x-target.x,dy=ahead.y-target.y,n=Math.hypot(dx,dy)||1;
            const offset=params.boatFollowOffset*(i%2===0?1:-1);
            const p={x:target.x-dy/n*offset,y:target.y+dx/n*offset};
            if(earthBoatAt(world,p.x,p.y))Object.assign(target,p);
        }else if(idle){
            const radius=SOCIAL_DEFAULTS.partyIdleRadius*Math.min(1,idle);
            const p={x:target.x+Math.sin(idle+i)*radius,y:target.y+Math.sin(idle*.7+i)*radius};
            if(walkable(world,p.x,p.y))Object.assign(target,p);
        }
        a.position=target;a.path=[];a.inParty=true;a.moving=Math.hypot(target.x-before.x,target.y-before.y)>.1;
        if(a.moving)a.facing=socialFacing(target.x-before.x,target.y-before.y,true);
    });
}
export function stepSocialActors(actors,world,dt,{paused=false,locked=null,team=[],leader=null,speed=SOCIAL_DEFAULTS.speed,view=null,localSecond=null,partyKey=actors,params=SOCIAL_DEFAULTS}={}) {
    if(paused)return;
    const members=team.map(id=>actors.find(a=>a.profile.id===id)).filter(Boolean);
    if(world.layout?.route)for(const actor of actors)if(!members.includes(actor))members.push(actor);
    for(const a of actors)a.inParty=members.includes(a);
    const peer=localSecond&&team.length?{profile:{id:'local-hero-1'},position:localSecond.position,facing:localSecond.facing}:null;
    if(peer)members.unshift(peer);
    if(members.length)stepDungeonParty(members,world,leader,dt,{key:partyKey,params});
    else partyTrails.delete(partyKey);
    if(peer){localSecond.position=peer.position;localSecond.facing=peer.facing;}
    if(world.layout?.route)return;
    world=socialNavigationWorld(world);
    dt=Math.max(0,Math.min(dt,.1));let moving=actors.filter(a=>a.path.length).length;const limit=Math.ceil(actors.length/4);
    const hubs=socialActivityHubs(world);
    for(const a of actors){
        if(a.inParty)continue;
        if(!walkable(world,a.position.x,a.position.y)){
            const occupied=actors.filter(o=>o!==a).map(o=>o.position);
            a.position=nearestActorStand(world,nearestWalkable(world,a.position.x,a.position.y)||a.position,occupied)||standClearOfMonsters(world,nearestWalkable(world,a.position.x,a.position.y));a.path=[];
        }
        if(a.profile.id===locked){a.path=[];a.moving=false;if(leader){const dx=leader.x-a.position.x,dy=leader.y-a.position.y;a.facing=socialFacing(dx,dy);}continue;}
        if(!a.path.length&&!clearsMonsters(world,a.position)){const occupied=actors.filter(o=>o!==a).map(o=>o.position);const aside=nearestActorStand(world,a.position,occupied)||standClearOfMonsters(world,a.position);if(aside)a.position=aside;}
        // Off-camera residents idle in place; only on-screen actors walk like the hero.
        if(!socialInView(a.position,view)){a.path=[];a.moving=false;continue;}
        const distance=leader?Math.hypot(a.position.x-leader.x,a.position.y-leader.y):Infinity;
        // Hysteresis once idle near the player; walking residents finish the current path first.
        a.approached=distance<=(a.approached?SOCIAL_DEFAULTS.approachReleaseRadius:SOCIAL_DEFAULTS.approachRadius);
        // Brush-by mid-walk does not cancel travel; only an already-idle actor stays put while close.
        if(a.approached&&!a.path.length){a.moving=false;a.wait=Math.max(a.wait,SOCIAL_DEFAULTS.followWait);a.facing=socialFacing(leader.x-a.position.x,leader.y-a.position.y);continue;}
        a.wait-=dt;a.travel-=dt;
        if(!a.path.length&&a.wait<=0&&moving<limit){
            if(a.travel<=0){a.hotspot=pickWeightedHub(a.rng,hubs);a.travel=a.rng.int(SOCIAL_DEFAULTS.travelMin,SOCIAL_DEFAULTS.travelMax);}
            const occupied=actors.filter(o=>o!==a).map(o=>o.position);
            const p=sampleActivitySpot(world,a.hotspot,a.rng,occupied);
            if(clearsPeople(world,p,occupied))a.path=findPath(world,a.position,p);
            a.wait=a.rng.int(SOCIAL_DEFAULTS.idleMin,SOCIAL_DEFAULTS.idleMax);if(a.path.length)moving++;
        }
        const before={...a.position},next=followPath(world,a.position,a.path,speed*dt);a.position=next.position;a.path=next.path;a.moving=Math.hypot(a.position.x-before.x,a.position.y-before.y)>.01;
        if(a.moving)a.facing=socialFacing(a.position.x-before.x,a.position.y-before.y,true);
        else if(a.facing===3)a.facing=hashSeed(a.profile.id)%2+1;
    }
    separateVisibleActors(actors.filter(a=>!a.inParty),world,{locked,view});
}

// One nearby invitation keeps crowded scenes quiet; body/name clicks never select.
export function socialBubble(actors,leader,{gesture=null,at=0}={}){
    if(!leader||socialGesturePose(gesture,'hero',at))return null;
    const near=actors.filter(actor=>!actor.inParty).map(actor=>({actor,d:Math.hypot(actor.position.x-leader.x,actor.position.y-leader.y)})).filter(v=>v.d<=SOCIAL_DEFAULTS.converseRadius).sort((a,b)=>a.d-b.d||a.actor.profile.id.localeCompare(b.actor.profile.id))[0]?.actor;
    if(!near)return null;const head=socialHeadAnchor(near.position);
    return {profile:near.profile,x:head.x-20,y:head.y-15,w:40,h:30};
}
export function pickSocialBubble(actors,leader,point,options){const b=socialBubble(actors,leader,options);return b&&point.x>=b.x&&point.x<=b.x+b.w&&point.y>=b.y&&point.y<=b.y+b.h?b.profile:null;}

export function localSocialBubbles(actors,leaders,{gesture=null,at=0}={}){
    const selected=new Map();
    leaders.forEach((leader,owner)=>{
        if(!leader||socialGesturePose(gesture,owner?'local-hero-1':'hero',at))return;
        const bubble=socialBubble(actors.filter(a=>!socialGesturePose(gesture,a.profile.id,at)),leader);
        if(!bubble)return;
        const actor=actors.find(a=>a.profile.id===bubble.profile.id);
        const distance=Math.hypot(actor.position.x-leader.x,actor.position.y-leader.y),previous=selected.get(bubble.profile.id);
        if(!previous||distance<previous.distance)selected.set(bubble.profile.id,{...bubble,owner,distance});
    });
    return [...selected.values()];
}

// The captain keeps the travel facing instead of looking back at following peers.
export function heroSocialLookPeers(actors,{inParty=false}={}){
    if(inParty||actors.some(actor=>actor.inParty))return [];
    return actors.filter(actor=>!actor.moving).map(actor=>({id:actor.profile.id,x:actor.position.x,y:actor.position.y}));
}
