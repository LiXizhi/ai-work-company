import { createRng, hashSeed } from './rng_core.js';
import { onLargeIsland, regionAt, segmentDistance } from './adventure_island_layout_core.js';

// Deterministic baked-art placement, also read by gathering; independent of gameplay RNG.
const meadow=['meadow/grass','meadow/wildGrass','meadow/clover','meadow/daisies','meadow/buttercups','meadow/blueFlowers','meadow/pinkFlowers','meadow/mixedMeadow','meadow/grassStone'];
const woodland=['meadow/fern','meadow/moss','meadow/greenLeaves','meadow/redMushrooms','meadow/paleMushrooms','stones/branch','stones/log','stones/roots','stones/pinecones','stones/mossRocks'];
const dry=['stones/sandPebbles','stones/sandstone','stones/dryGrass','stones/sandRipples','meadow/amberLeaves','stones/leafPile'];
const beach=['shore/shells','shore/starfish','shore/driftwood','shore/beachRocks','shore/shellFragments','shore/coastalGrass','shore/coral'];
const bank=['shore/reeds','shore/cattails','shore/bankGrass','shore/wetPebbles','shore/algae','shore/bankStone','shore/rushes'];
const pools={grass:meadow,town:meadow,park:meadow,farm:meadow,lake:meadow,oasis:meadow,forest:woodland,
    beach,desert:dry,gold:dry,snow:['stones/snowRocks','stones/iceCrystals'],ice:['stones/snowRocks','stones/iceCrystals'],
    volcanic:['stones/volcanicGravel','stones/lavaSlab'],ash:['stones/volcanicGravel','stones/greyPebbles'],
    dark:['stones/greyPebbles','stones/branch','stones/lichenStone','meadow/paleMushrooms'],marsh:bank};
const cell=112,padding=80;

export function groundDecorations(world,rect){const iterator=groundDecorationSteps(world,rect);let step;do{step=iterator.next();}while(!step.done);return step.value;}
export function* groundDecorationSteps(world,rect){
    const l=world.layout;
    if(!l)return [];
    const result=[];
    for(let gy=Math.floor((rect.y-padding)/cell);gy<=Math.floor((rect.y+rect.h+padding)/cell);gy++){
        for(let gx=Math.floor((rect.x-padding)/cell);gx<=Math.floor((rect.x+rect.w+padding)/cell);gx++){
            yield;
            const rng=createRng(hashSeed(`${world.zone}:${gx}:${gy}:ground-deco-v1`));
            if(rng.float()>.72)continue;
            const p={x:gx*cell+16+rng.float()*(cell-32),y:gy*cell+16+rng.float()*(cell-32)};
            const size=32+rng.float()*34,radius=size*.65;
            if(!onLargeIsland(world,p.x,p.y,radius+5))continue;
            if(world.paths.some(road=>segmentDistance(p,road.a,road.b)<road.width/2+radius+10))continue;
            if(l.bridges.some(b=>Math.hypot(p.x-b.x,p.y-b.y)<Math.hypot(b.w,b.h)/2+radius))continue;
            if(world.buildings?.some(b=>Math.abs(p.x-b.x)<b.w/2+radius&&p.y>b.y-b.h-radius&&p.y<b.y+radius))continue;
            if(world.npcs?.some(n=>Math.hypot(p.x-n.x,p.y-n.y)<radius+34))continue;
            if(world.encounters?.some(n=>Math.hypot(p.x-n.x,p.y-n.y)<radius+55))continue;
            if(world.trees.some(t=>Math.hypot(p.x-t.x,p.y-t.y)<radius+t.size*.16))continue;
            if(l.features?.some(f=>Math.hypot(p.x-f.x,p.y-f.y)<f.size+radius))continue;
            if(l.farms?.some(f=>p.x>f.x-radius&&p.x<f.x+f.cols*130+radius&&p.y>f.y-radius&&p.y<f.y+f.rows*90+radius))continue;
            const plaza=l.rules.plaza;
            if(((p.x-world.center.x)/(plaza.radiusX+radius))**2+((p.y-world.center.y)/(plaza.radiusY+radius))**2<1)continue;
            if(l.mountains?.some(m=>{
                const shape=l.rules.mountain,s=m.scale||1,r=(shape.baseRadius+(shape.layers-1)*shape.stepRadius)*s*1.12+radius;
                return ((p.x-m.x)/r)**2+((p.y-m.y)/(r*shape.aspect+(shape.layers-1)*shape.stepHeight*s+radius))**2<1;
            }))continue;
            let pool=pools[regionAt(world,p)?.biome]||meadow,blocked=false;
            if(!onLargeIsland(world,p.x,p.y,l.rules.terrain.coastWidth*.7+radius))pool=beach;
            for(const river of l.rivers){
                const distance=Math.min(...river.points.slice(1).map(([x,y],i)=>segmentDistance(p,{x:river.points[i][0],y:river.points[i][1]},{x,y})));
                if(distance<river.width/2+radius){blocked=true;break;}
                if(distance<river.width/2+radius+45&&(!river.material||river.material==='water'))pool=bank;
            }
            if(blocked)continue;
            for(const lake of l.lakes||[]){
                const d=((p.x-lake.x)/(lake.rx+radius))**2+((p.y-lake.y)/(lake.ry+radius))**2;
                if(d<1){
                    const inner=((p.x-lake.x)/Math.max(1,lake.rx-radius))**2+((p.y-lake.y)/Math.max(1,lake.ry-radius))**2;
                    if(inner<1&&(!lake.material||lake.material==='water')&&rng.float()<.22)pool=['shore/lilyPads','shore/waterLily'];
                    else blocked=true;
                    break;
                }
                if(d<1.5&&(!lake.material||lake.material==='water'))pool=bank;
            }
            if(blocked)continue;
            const [atlas,frame]=rng.pick(pool).split('/');
            result.push({...p,id:`${world.zone}:ground:${gx}:${gy}`,size,atlas,frame,flip:rng.int(0,1)===1});
        }
    }
    return result.sort((a,b)=>a.y-b.y||a.x-b.x);
}
