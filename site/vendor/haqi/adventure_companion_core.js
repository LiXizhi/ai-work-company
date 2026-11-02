// Presentation-only companion motion; never consumes combat RNG or changes saves.
import { createRng, hashSeed } from './rng_core.js';
import { clearSegment, distance, findPath, followPath, walkable, WALK_SPEED } from './adventure_world_core.js';
import { SOCIAL_DEFAULTS } from './adventure_social_core.js';
import { STARTERS } from './adventure_pets_core.js';

// Map companionship is independent of combat participation. The four formation
// slots are ordered left to right; equal distances prefer the lower slot.
export function selectCompanionId(save, content) {
    const owned=id=>!!save.pets?.[id]&&!!content.pets?.[save.pets[id].speciesId||id];
    const heroSlot=save.heroSlot??0;
    const slots=save.formation||[];
    let closest=null,best=Infinity;
    for(let slot=0;slot<slots.length;slot++){
        const id=slots[slot],gap=Math.abs(slot-heroSlot);
        if(owned(id)&&gap<best){closest=id;best=gap;}
    }
    if(closest)return closest;
    return STARTERS.find(owned)||Object.keys(save.pets||{}).find(owned)||STARTERS[0];
}

// Presentation-only species for AI island residents; never writes saves or combat state.
const socialPetPools=new WeakMap();
export function selectSocialPetId(profile, content) {
    const school=profile?.school||'fire';
    const catalog=content?.pets;let pools=catalog&&socialPetPools.get(catalog);
    if(catalog&&!pools){pools=new Map();for(const [id,row] of Object.entries(catalog)){if(!row?.art||row.staticAppearance)continue;if(!pools.has(row.school))pools.set(row.school,[]);pools.get(row.school).push(id);}socialPetPools.set(catalog,pools);}
    const pets=pools?.get(school)||[];
    if(!pets.length)return STARTERS.find(id=>content?.pets?.[id]?.art)||STARTERS[0];
    return pets[Math.abs(hashSeed(String(profile.id||profile.name||school)))%pets.length];
}

export function createCompanion(world, hero, seed) {
    const nearby={x:hero.x-38,y:hero.y+28};
    return {position:walkable(world,nearby.x,nearby.y)?nearby:{...hero},lastHero:{...hero},
        rng:createRng(hashSeed(seed)),path:[],following:false,wait:1,repath:0,facing:1,moving:false,phase:0};
}

// Shorten the side offset at the first boundary, rather than switching the
// entire offset on/off. Sample like clearSegment, then refine to subpixel
// precision. At concave bends the available offset can still change abruptly;
// this is a destination, not the pet's next-frame position.
function partyCompanionPosition(world,hero,target){
    const steps=Math.max(1,Math.ceil(distance(hero,target)/2));
    const point=t=>({x:hero.x+(target.x-hero.x)*t,y:hero.y+(target.y-hero.y)*t});
    let low=0;
    for(let i=1;i<=steps;i++){
        let high=i/steps;const p=point(high);
        if(walkable(world,p.x,p.y)){low=high;continue;}
        for(let j=0;j<12;j++){
            const mid=(low+high)/2,q=point(mid);
            if(walkable(world,q.x,q.y))low=mid;else high=mid;
        }
        return point(low);
    }
    return target;
}

export function stepCompanion(pet,world,hero,dt,options={}) {
    dt=Math.max(0,Math.min(.055,dt));
    if(options.inParty){
        // The same world-space offset for every owner makes a parallel pet train.
        // Keep as much of the side lane as the walkable ground allows.
        const previous=pet.position,moved=distance(hero,pet.lastHero)>.001;
        pet.partyIdle=moved?0:(pet.partyIdle||0)+dt;
        const idle=Math.max(0,pet.partyIdle-SOCIAL_DEFAULTS.partyIdleDelay);
        const radius=SOCIAL_DEFAULTS.partyIdleRadius*Math.min(1,idle);
        const target={x:hero.x+SOCIAL_DEFAULTS.partyPetOffsetX+Math.sin(idle)*radius,y:hero.y+SOCIAL_DEFAULTS.partyPetOffsetY+Math.sin(idle*.7)*radius};
        const destination=partyCompanionPosition(world,hero,target);
        // Only initial placement / real teleports may snap. Even a legal side
        // slot can switch by its full length at a road bend, so ordinary frames
        // must move from the previous position with a bounded travel distance.
        const regroup=pet.partyWorld!==world||distance(hero,pet.lastHero)>360||distance(hero,previous)>360;
        if(regroup)pet.position=destination;
        else{
            const gap=distance(previous,destination),budget=SOCIAL_DEFAULTS.dungeonFollowSpeed*dt;
            const next=gap<=budget?destination:{x:previous.x+(destination.x-previous.x)*budget/gap,y:previous.y+(destination.y-previous.y)*budget/gap};
            pet.position=partyCompanionPosition(world,previous,next);
            // Slide along the edge instead of getting stuck at a concave bend.
            // Axis candidates cannot exceed the same frame's travel budget.
            if(distance(pet.position,next)>.001){
                for(const candidate of [{x:next.x,y:previous.y},{x:previous.x,y:next.y}]){
                    const slide=partyCompanionPosition(world,previous,candidate);
                    if(distance(slide,destination)<distance(pet.position,destination))pet.position=slide;
                }
            }
        }
        pet.partyWorld=world;
        pet.lastHero={...hero};pet.path=[];pet.following=true;
        pet.moving=distance(previous,pet.position)>.01;
        if(pet.moving){pet.phase+=distance(previous,pet.position)*.1;if(Math.abs(pet.position.x-previous.x)>.01)pet.facing=pet.position.x>previous.x?1:-1;}
        return pet;
    }
    pet.partyIdle=0;pet.partyWorld=null;
    const deferSearch=!!options.deferSearch;
    function route(from,to){
        if(options.requestPath)return options.requestPath(from,to);
        if(deferSearch&&!clearSegment(world,from,to))return null;
        return findPath(world,from,to);
    }
    // Recover after teleports and after blocked/deferred routes leave the pet behind.
    // This is visual placement only; it never changes the selected pet or mount.
    if(distance(hero,pet.lastHero)>360||distance(hero,pet.position)>360){
        const fresh=createCompanion(world,hero,pet.rng.seed);
        Object.assign(pet,fresh);
    }
    pet.lastHero={...hero};
    const gap=distance(pet.position,hero);
    pet.repath-=dt;
    if(gap>100&&!pet.following){pet.following=true;pet.repath=0;pet.path=[];}
    if(pet.following&&gap<46){pet.following=false;pet.path=[];pet.wait=.8+pet.rng.float()*2;}
    if(pet.following&&pet.repath<=0){
        const next=route(pet.position,hero);
        if(next){pet.path=next;pet.repath=.45;}
        else pet.repath=.05;
    }else if(!pet.following&&!pet.path.length){
        pet.wait-=dt;
        if(pet.wait<=0){
            pet.wait=1.4+pet.rng.float()*2.8;
            let searched=false;
            for(let i=0;i<8&&!searched;i++){
                const angle=pet.rng.float()*Math.PI*2,radius=34+pet.rng.float()*42;
                const target={x:hero.x+Math.cos(angle)*radius,y:hero.y+Math.sin(angle)*radius};
                if(!walkable(world,target.x,target.y)||distance(target,pet.position)<18)continue;
                if(deferSearch&&!clearSegment(world,pet.position,target))continue;
                const next=route(pet.position,target);
                searched=true;
                if(next?.length){pet.path=next;break;}
            }
        }
    }
    const speed=pet.following?WALK_SPEED*(gap>180?1.55:1.18):48;
    const previous=pet.position;
    const next=followPath(world,previous,pet.path,speed*dt);
    pet.position=next.position;pet.path=next.path;
    const dx=pet.position.x-previous.x,travel=distance(previous,pet.position);
    pet.moving=travel>.01;
    if(Math.abs(dx)>.05)pet.facing=dx<0?-1:1;
    pet.phase+=travel*.10;
    return pet;
}
