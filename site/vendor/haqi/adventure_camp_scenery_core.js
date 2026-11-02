import {createRng,hashSeed} from './rng_core.js';
import {onLargeIsland,segmentDistance} from './adventure_island_layout_core.js';

// Cosmetic floor stamps only. Gathering keeps using groundDecorations unchanged.
// Positions depend on world-space anchors, not tile boundaries or iteration order.
export function* campScenerySteps(world,rect){
    if(world.zone!=='camp'||!world.layout?.rules.terrain.campRefined)return;
    const plaza=world.layout.rules.plaza;
    const inRect=(ax,ay)=>ax>=rect.x-160&&ax<=rect.x+rect.w+160&&ay>=rect.y-160&&ay<=rect.y+rect.h+160;
    const clearSpot=(x,y,size)=>{
        if(!onLargeIsland(world,x,y,55)||world.paths.some(p=>segmentDistance({x,y},p.a,p.b)<p.width/2+size*.5+10))return false;
        if([...world.npcs,...world.encounters,...world.landmarks,world.portal].some(p=>Math.hypot(x-p.x,y-p.y)<95))return false;
        if(((x-world.center.x)/(plaza.radiusX+size*.45))**2+((y-world.center.y)/(plaza.radiusY+size*.45))**2<1)return false;
        if(world.buildings.some(b=>Math.abs(x-b.x)<b.w/2+size*.45&&y>b.y-b.h&&y<b.y+size*.45))return false;
        return true;
    };
    for(const tree of world.trees){
        if(!inRect(tree.x,tree.y))continue;
        const rng=createRng(hashSeed(`camp:floor:${tree.x}:${tree.y}`));
        for(let i=0;i<2;i++){
            const size=32+rng.float()*22,x=tree.x+(i?1:-1)*(24+rng.float()*24),y=tree.y+10+rng.float()*24;
            if(!clearSpot(x,y,size))continue;
            yield {x,y,size,atlas:'meadow',frame:rng.pick(['clover','moss','fern','daisies','blueFlowers']),flip:rng.int(0,1)===1};
        }
        if(rng.int(0,2)===0){
            const size=48+rng.float()*20,x=tree.x+(rng.int(0,1)?1:-1)*(30+rng.float()*26),y=tree.y+14+rng.float()*22;
            if(clearSpot(x,y,size))
                yield {x,y,size,atlas:'campProps',frame:rng.pick(['lushBush','mossBoulder','flowerBed']),flip:rng.int(0,1)===1};
        }
    }
    // Plaza perimeter flowerbeds, lanterns, and wooden fences.
    for(let i=0;i<12;i++){
        const a=i*Math.PI/6+.26,ax=Math.round(world.center.x+Math.cos(a)*(plaza.radiusX+42)),ay=Math.round(world.center.y+Math.sin(a)*(plaza.radiusY+34));
        if(!inRect(ax,ay))continue;
        const rng=createRng(hashSeed(`camp:plaza-ring:${i}`));
        const frame=i%3===0?'magicLantern':i%2===0?'flowerBed':'lushBush',size=frame==='magicLantern'?62:56;
        if(clearSpot(ax,ay,size*.65))yield {x:ax,y:ay,size,atlas:'campProps',frame,flip:rng.int(0,1)===1};
    }
    // Building courtyard accents (fences, flowerbeds, lanterns).
    for(const b of world.buildings){
        if(b.decorationOnly||!inRect(b.x,b.y))continue;
        for(const side of [-1,1]){
            const x=Math.round(b.x+side*(b.w*.48+28)),y=Math.round(b.y+10);
            if(!inRect(x,y))continue;
            const frame=side<0?'flowerBed':b.frame==='tent'?'woodFence':'magicLantern',size=56;
            if(!onLargeIsland(world,x,y,50)||world.paths.some(p=>segmentDistance({x,y},p.a,p.b)<p.width/2+24))continue;
            if([...world.npcs,...world.encounters,...world.landmarks,world.portal].some(p=>Math.hypot(x-p.x,y-p.y)<80))continue;
            yield {x,y,size,atlas:'campProps',frame,flip:side>0};
        }
    }
    // Coastal cliff rocks and cascading brook clusters along the island rim.
    const coast=world.layout.coast||[];
    for(let i=0;i<coast.length;i+=4){
        const [cx,cy]=coast[i],x=Math.round(cx+(world.center.x-cx)*.07),y=Math.round(cy+(world.center.y-cy)*.07);
        if(!inRect(x,y))continue;
        const rng=createRng(hashSeed(`camp:coast:${i}`)),size=68+rng.float()*22;
        if(world.paths.some(p=>segmentDistance({x,y},p.a,p.b)<p.width/2+42))continue;
        if([...world.npcs,...world.encounters,...world.landmarks,world.portal,...world.buildings].some(p=>Math.hypot(x-p.x,y-p.y)<140))continue;
        yield {x,y,size,atlas:'campProps',frame:i%8===0?'coastalRockCluster':'mossBoulder',flip:rng.int(0,1)===1};
    }
}

export function* islandSceneryFloorSteps(world,rect){
    if(!['town','fire','ice','desert','dark'].includes(world.zone)||!world.layout?.rules?.plaza)return;
    const plaza=world.layout.rules.plaza;
    const inRect=(ax,ay)=>ax>=rect.x-220&&ax<=rect.x+rect.w+220&&ay>=rect.y-220&&ay<=rect.y+rect.h+220;
    const clearSpot=(x,y,size)=>{
        if(!onLargeIsland(world,x,y,55)||world.paths.some(p=>segmentDistance({x,y},p.a,p.b)<(p.width||60)/2+size*.5+12))return false;
        if([...(world.npcs||[]),...(world.encounters||[]),...(world.landmarks||[]),world.portal].filter(Boolean).some(p=>Math.hypot(x-p.x,y-p.y)<95))return false;
        if(((x-world.center.x)/(plaza.radiusX+size*.45))**2+((y-world.center.y)/(plaza.radiusY+size*.45))**2<1)return false;
        if((world.buildings||[]).some(b=>Math.abs(x-b.x)<b.w/2+size*.45&&y>b.y-b.h&&y<b.y+size*.45))return false;
        return true;
    };
    // Plaza perimeter accents tailored to each island theme.
    for(let i=0;i<10;i++){
        const a=i*Math.PI/5+.3,ax=Math.round(world.center.x+Math.cos(a)*(plaza.radiusX+38)),ay=Math.round(world.center.y+Math.sin(a)*(plaza.radiusY+30));
        if(!inRect(ax,ay))continue;
        const rng=createRng(hashSeed(`${world.zone}:plaza-ring:${i}`));
        if(world.zone==='town'){
            const frame=i%3===0?'magicLantern':i%2===0?'flowerBed':'lushBush',size=frame==='magicLantern'?60:54;
            if(clearSpot(ax,ay,size*.6))yield {x:ax,y:ay,size,atlas:'campProps',frame,flip:rng.int(0,1)===1};
        }else{
            const size=62+rng.float()*14;
            if(clearSpot(ax,ay,size*.55))yield {x:ax,y:ay,size,atlas:'islandPlazasProps',frame:'biomeCrystalCluster',flip:rng.int(0,1)===1};
        }
    }
    if(world.zone==='town'){
        for(const f of world.layout.farms||[]){
            for(let c=0;c<f.cols;c+=2){
                const x=f.x+c*130+56,y=f.y-22;
                if(inRect(x,y)&&clearSpot(x,y,42))yield {x,y,size:54,atlas:'campProps',frame:c%4===0?'magicLantern':'woodFence',flip:false};
            }
        }
    }
    if(world.zone==='ice'){
        // Glacial crystal sanctum overlooking the northern frozen lake and peak.
        for(const [sx,sy,size] of [[3040,2210,185],[2220,1180,175]]){
            if(inRect(sx,sy)&&clearSpot(sx,sy,size*.45))yield {x:sx,y:sy,size,atlas:'islandLandmarks',frame:'iceCrystalSanctum',flip:false};
        }
    }
}
