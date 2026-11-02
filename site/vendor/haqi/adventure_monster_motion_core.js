import {createRng,hashSeed} from './rng_core.js';
import {defaultParams} from './combat_params_core.js';
import {earthSafe} from './adventure_earth_core.js';

// Ephemeral scene state. Dungeon gates, map markers and saves keep authored positions.
const scenes=new WeakMap(),defaults=Object.freeze(defaultParams('kids').monsterScene);
export function pruneMonsterScene(world){const scene=scenes.get(world);if(!scene)return;const live=new Set(world.encounters.map(e=>e.id));for(const id of scene.keys())if(!live.has(id))scene.delete(id);}
export const monsterSceneParams=world=>world.monsterSceneParams||defaults;
export function inMonsterTerritory(world,encounter,hero) {
    return !world.isDungeon&&!encounter.hidden&&!encounter.sceneState?.retiring&&(encounter.sceneState?.opacity??1)>.2&&!encounter.blocked?.length&&!!hero
        &&Math.hypot(hero.x-encounter.x,hero.y-encounter.y)<monsterSceneParams(world).territoryRadius;
}
// Reveal the actual activity boundary in the outer perception band; it does not aggro.
export function monsterTerritoryWarning(world,encounter,hero) {
    if(world.isDungeon||encounter.hidden||encounter.sceneState?.retiring||(encounter.sceneState?.opacity??1)<=.2||encounter.blocked?.length||!hero)return null;
    const params=monsterSceneParams(world),distance=Math.hypot(hero.x-encounter.x,hero.y-encounter.y);
    return distance<params.territoryRadius?'danger':distance<params.territoryRadius*params.perceptionMultiplier?'nearby':null;
}
export function monsterScenePositions(world,encounter) {
    const cached=scenes.get(world)?.get(encounter.id);
    if(cached)return cached;
    const ids=encounter.monsterIds?.length?encounter.monsterIds:[encounter.monsterId];
    const grouped=!!encounter.monsterIds?.length;
    return ids.map((monsterId,index)=>{
        let dx=grouped?(index-(ids.length-1)/2)*42:0,dy=grouped?-(index%2)*16:0;
        const radius=monsterSceneParams(world).territoryRadius,d=Math.hypot(dx,dy);
        if(!world.isDungeon&&d>radius*.8){dx*=radius*.8/d;dy*=radius*.8/d;}
        return {monsterId,index,x:encounter.x+dx,y:encounter.y+dy,scale:grouped?.7:.8,moving:false,facing:1,mode:'idle'};
    });
}
export function monsterInViewport(p,view) {
    const half=52*p.scale;
    return !!view&&view.w>0&&view.h>0&&p.x+half>=view.x&&p.x-half<=view.x+view.w
        &&p.y+20>=view.y&&p.y-104*p.scale-2<=view.y+view.h;
}
function clearLine(a,b,canWalk) {
    const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
    for(let i=0;i<=steps;i++)if(!canWalk(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;
    return true;
}
// Small local search only when a visible pursuing/returning monster hits an obstacle.
// Bound work independently of island size; never leave the territory to take a shortcut.
function localPath(start,goal,center,radius,canWalk) {
    const size=16,queue=[],visited=new Map(),key=(x,y)=>`${x},${y}`;
    const allowed=(x,y)=>Math.hypot(x-center.x,y-center.y)<=radius&&canWalk(x,y);
    const sx=Math.round((start.x-center.x)/size),sy=Math.round((start.y-center.y)/size);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const gx=sx+dx,gy=sy+dy,p={x:center.x+gx*size,y:center.y+gy*size,gx,gy};
        if(clearLine(start,p,allowed)){queue.push(p);visited.set(key(gx,gy),p);}
    }
    for(let i=0;i<queue.length&&i<256;i++){
        const p=queue[i];
        if(Math.hypot(p.x-goal.x,p.y-goal.y)<=size*1.5&&clearLine(p,goal,allowed)){
            const path=[{x:goal.x,y:goal.y}];let n=p;
            while(n){path.unshift({x:n.x,y:n.y});n=n.parent;}
            return path;
        }
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
            const gx=p.gx+dx,gy=p.gy+dy,k=key(gx,gy);
            if(visited.has(k))continue;
            const n={x:center.x+gx*size,y:center.y+gy*size,gx,gy,parent:p};
            if(dx&&dy&&(!clearLine(p,{x:n.x,y:p.y},allowed)||!clearLine(p,{x:p.x,y:n.y},allowed)))continue;
            if(clearLine(p,n,allowed)){visited.set(k,n);queue.push(n);}
        }
    }
    return [];
}
function moveToward(p,target,speed,dt,canWalk) {
    const dx=target.x-p.x,dy=target.y-p.y,distance=Math.hypot(dx,dy);
    if(distance<.001)return true;
    const travel=Math.min(distance,speed*dt),next={x:p.x+dx/distance*travel,y:p.y+dy/distance*travel};
    if(!clearLine(p,next,canWalk))return false;
    p.x=next.x;p.y=next.y;p.moving=travel>0;
    if(Math.abs(dx)>.01)p.facing=dx<0?-1:1;
    return true;
}
export function stepMonsterWander(world,encounter,dt,view,{enabled=true,ambient=true,hero=null,canWalk=()=>true}={}) {
    if(!enabled||encounter.hidden||!view||!(dt>0))return;
    const poses=monsterScenePositions(world,encounter);
    // No random draws, timers, collision or pathfinding outside the viewport.
    if(!poses.some(p=>monsterInViewport(p,view)))return;
    let scene=scenes.get(world);if(!scene){scene=new Map();scenes.set(world,scene);}
    scene.set(encounter.id,poses);
    const params=monsterSceneParams(world),alert=inMonsterTerritory(world,encounter,hero);
    const radius=world.isDungeon?params.dungeonWanderRadius:params.territoryRadius;
    const rest=p=>params.restMin+p.rng.float()*(params.restMax-params.restMin);
    dt=Math.min(.055,dt);
    for(const p of poses){
        if(!monsterInViewport(p,view))continue;
        if(!p.rng){p.rng=createRng(hashSeed(`${world.zone}:${encounter.id}:${p.index}:wander`));p.spawn={x:p.x,y:p.y};p.wait=rest(p);p.navWait=0;}
        p.moving=false;
        const center=world.isDungeon?p.spawn:encounter;
        const allowed=(x,y)=>Math.hypot(x-center.x,y-center.y)<=radius+.00001&&canWalk(x,y)&&(!world.isEarth||!earthSafe(world,{x,y}));
        const nextMode=alert?(['warning','chase'].includes(p.mode)?p.mode:'warning'):['warning','chase'].includes(p.mode)?'return':p.mode;
        if(nextMode!==p.mode){
            p.mode=nextMode;p.target=null;p.path=null;p.navWait=0;
            p.alertRemaining=nextMode==='warning'?params.alertDelay:0;
            p.alertDuration=params.alertDelay;
        }
        if(p.mode==='warning'){
            if(Math.abs(hero.x-p.x)>.01)p.facing=hero.x<p.x?-1:1;
            p.alertRemaining=Math.max(0,p.alertRemaining-dt);
            if(p.alertRemaining<1e-9){p.alertRemaining=0;p.mode='chase';}
            continue;
        }
        if(p.mode==='chase'||p.mode==='return'){
            const goal=p.mode==='chase'?hero:p.spawn,speed=p.mode==='chase'?params.chaseSpeed:params.returnSpeed;
            p.navWait=Math.max(0,p.navWait-dt);
            if(p.mode==='return'&&Math.hypot(p.x-goal.x,p.y-goal.y)<1){p.x=goal.x;p.y=goal.y;p.mode='idle';p.wait=rest(p);p.path=null;continue;}
            // Refresh the short detour at most once per second while the hero moves.
            if(p.navWait===0)p.path=null;
            if(p.path?.length){
                if(Math.hypot(p.x-p.path[0].x,p.y-p.path[0].y)<1)p.path.shift();
                if(p.path.length)moveToward(p,p.path[0],speed,dt,allowed);
            }else if(!moveToward(p,goal,speed,dt,allowed)&&p.navWait===0){
                p.path=localPath(p,goal,center,radius,allowed);p.navWait=1;
            }
            continue;
        }
        if(!ambient)continue;
        if(!p.target){
            p.wait-=dt;if(p.wait>0)continue;
            for(let attempt=0;attempt<4;attempt++){
                const angle=p.rng.float()*Math.PI*2,r=radius*(.2+.8*p.rng.float());
                const target={x:center.x+Math.cos(angle)*r,y:center.y+Math.sin(angle)*r};
                if(Math.hypot(target.x-p.x,target.y-p.y)>2&&clearLine(p,target,allowed)){p.target=target;break;}
            }
            if(!p.target){p.wait=rest(p);continue;}
        }
        if(!moveToward(p,p.target,params.wanderSpeed,dt,allowed)||Math.hypot(p.x-p.target.x,p.y-p.target.y)<.001){p.target=null;p.wait=rest(p);}
    }
}
// A group's individual sprites all select the same encounter.
export function monsterInteractionTargets(world,encounter) {
    if(encounter.sceneState?.retiring||(encounter.sceneState?.opacity??1)<=.2)return [];
    return monsterScenePositions(world,encounter).map(p=>({...encounter,x:p.x,y:p.y,kind:'encounter'}));
}
export function monsterContactDistance(world,encounter,point) {
    // Field auto-contact must wait for the same countdown shown above the sprite.
    // Check the touching member, not another already-alerted member of its group.
    return Math.min(...monsterScenePositions(world,encounter)
        .filter(p=>world.isDungeon||p.mode==='chase')
        .map(p=>Math.hypot(point.x-p.x,point.y-p.y)));
}
