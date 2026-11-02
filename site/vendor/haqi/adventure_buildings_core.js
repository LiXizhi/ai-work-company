import {onLargeIsland, riverBlocks, sceneryCoversActor, segmentDistance} from './adventure_island_layout_core.js';

// Cosmetic island architecture. Fixed geometry, independent of saves and gameplay RNG.
export function islandBuildings(world) {
    if(!['camp','town','fire','ice','desert','dark'].includes(world.zone)||!world.layout)return [];
    const scattered=world.zone!=='camp',atlas=world.zone;
    const result=[],layout=world.layout;
    const occupied=[...world.npcs,...world.encounters,...world.landmarks,...world.buildings,world.portal,layout.spawn];
    const actors=[...world.npcs,...world.encounters];
    const clear=(x,y)=>onLargeIsland(world,x,y,45)&&!riverBlocks(world,x,y);
    if(world.zone==='camp'){
        const campStructures=[
            {x:1430,y:1370,w:185,h:175,frame:'academy',tile:6},
            {x:1975,y:1355,w:165,h:155,frame:'tent',tile:4},
            {x:1410,y:1950,w:165,h:155,frame:'tent',tile:4},
            {x:960,y:1340,w:165,h:155,frame:'tent',tile:4},
            {x:2510,y:2010,w:165,h:155,frame:'tent',tile:4},
        ];
        for(const item of campStructures){
            const b={...item,atlas:'camp'};
            const road=Math.min(...world.paths.map(p=>segmentDistance(b,p.a,p.b)-(p.width||60)/2));
            if(road<135||occupied.some(p=>Math.hypot(b.x-p.x,b.y-p.y)<205)||actors.some(a=>sceneryCoversActor(b,a)))continue;
            if([-80,0,80].every(dx=>[-75,0,20].every(dy=>clear(b.x+dx,b.y+dy)))){result.push(b);occupied.push(b);}
        }
    }
    // Prefer space beside a road; reserve its full width, residents and encounter areas.
    const candidates=[];
    if(scattered)for(let y=300;y<world.h-200;y+=140)for(let x=300;x<world.w-200;x+=140){
        const road=Math.min(...world.paths.map(p=>segmentDistance({x,y},p.a,p.b)-(p.width||60)/2));
        if(road<190||road>440||occupied.some(p=>Math.hypot(x-p.x,y-p.y)<300))continue;
        if(actors.some(a=>sceneryCoversActor({x,y,w:230,h:220},a)))continue;
        if(![-110,0,110].every(dx=>[-100,0,25].every(dy=>clear(x+dx,y+dy))))continue;
        candidates.push({x,y,road});
    }
    candidates.sort((a,b)=>a.road-b.road||a.y-b.y||a.x-b.x);
    for(const p of candidates){
        if(result.some(o=>Math.hypot(o.x-p.x,o.y-p.y)<650))continue;
        result.push({x:p.x,y:p.y,w:230,h:220,atlas,frame:result.length%3===2?'tower':'village',tile:4});
        if(result.length===10)break;
    }
    // A southern-facing shoreline lets the pier project into water below the building.
    const coast=[];
    for(let i=0;i<layout.coast.length;i++){
        const a=layout.coast[i],b=layout.coast[(i+1)%layout.coast.length];
        for(let t=.2;t<1;t+=.2){
            const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
            if(clear(x,y-70)&&!onLargeIsland(world,x,y+70)&&occupied.every(p=>Math.hypot(x-p.x,y-p.y)>260))coast.push({x,y});
        }
    }
    coast.sort((a,b)=>Math.hypot(a.x-world.portal.x,a.y-world.portal.y)-Math.hypot(b.x-world.portal.x,b.y-world.portal.y));
    const harbor=coast.find(p=>actors.every(a=>!sceneryCoversActor({x:p.x,y:p.y+35,w:240,h:225},a)))||coast[0];
    if(harbor){
        result.push({...harbor,y:harbor.y+35,w:240,h:225,atlas,frame:'harbor',decorationOnly:true});
        // The camp island stops just below its beach; clamp the moored boats into
        // the remaining water instead of pushing them past the map edge.
        const boatAtlas=world.zone==='camp'?'town':atlas;
        const boatDy=Math.min(210,world.h-40-harbor.y-10);
        for(const dx of [-200,200]){
            const x=harbor.x+dx,y=harbor.y+boatDy;
            if(x>130&&x<world.w-130&&y<world.h-40&&y>harbor.y+60&&[-95,0,95].every(ox=>[-55,0,30].every(oy=>!onLargeIsland(world,x+ox,y+oy))))
                result.push({x,y,w:180,h:200,atlas:boatAtlas,frame:'boat',decorationOnly:true});
        }
    }
    return result;
}

// Keep the captain's entire 64px-wide sprite outside the harbor's image bounds.
// A short road ends beside the pier, on dry land; its shoulder must stay walkable.
export function harborAccess(world) {
    const harbor=world.buildings.find(b=>b.frame==='harbor');
    if(!harbor)return null;
    for(const inset of [100,140,180,220])for(const side of [-1,1]){
        const captain={x:harbor.x+side*(harbor.w/2+60),y:harbor.y-inset};
        if(world.npcs.some(n=>n.id!==36205&&n.name!=='法斯特船长'&&Math.hypot(n.x-captain.x,n.y-captain.y)<90))continue;
        const a={x:world.portal.x,y:world.portal.y},b=captain;
        const steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/8);
        let clear=true;
        for(let i=0;i<=steps&&clear;i++){
            const x=a.x+(b.x-a.x)*i/steps,y=a.y+(b.y-a.y)*i/steps;
            clear=onLargeIsland(world,x,y,55)&&[-30,0,30].every(dx=>[-30,0,30].every(dy=>!riverBlocks(world,x+dx,y+dy)))
                &&!world.buildings.some(o=>!o.decorationOnly&&Math.abs(x-o.x)<o.w*.3+45&&y>o.y-o.h*.42-45&&y<o.y+45);
        }
        if(clear)return {captain,path:{a,b:{...b},width:60,harborAccess:true}};
    }
    return null;
}
