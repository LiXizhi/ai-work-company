import {createRng,hashSeed} from './rng_core.js';
import {segmentDistance} from './adventure_island_layout_core.js';

// Web exploration art, derived only from dungeon identity; never from a visit or battle seed.
export function dungeonBiome(d){
    if(['forest','lake','park'].includes(d.sceneBiome))return d.sceneBiome;
    if(d.island)return {camp:'forest',town:'forest',fire:'volcanic',ice:'snow',desert:'desert',dark:'dark'}[d.island]||'forest';
    const name=`${d.name} ${d.id}`;
    if(/神木|万象|GreatTree/.test(name))return 'forest';
    if(/冰|雪|圣诞|Ice|Frost|Snow/.test(name))return 'snow';
    if(/梦魇|幽灵|死寂|Dark|Nightmare/.test(name))return 'dark';
    if(/烈焰|火|Fire|Flaming/.test(name))return 'volcanic';
    if(/神殿|沙漠|风蚀|Egypt|Temple/.test(name))return 'desert';
    return 'forest';
}
export function dressDungeon(layout){
    const rng=createRng(hashSeed(`dungeon-scenery-v1:${layout.id}`));
    const {baseBiome:biome,rules,paths,route}=layout;
    const material={snow:'ice',volcanic:'lava',dark:'dark'}[biome]||'water';
    const roadGap=p=>Math.min(...paths.map(s=>segmentDistance(p,s.a,s.b)));
    const inside=p=>p.x>70&&p.x<layout.w-70&&p.y>70&&p.y<layout.h-70;
    layout.seed=hashSeed(layout.id);
    layout.features=[];
    // An intimate entrance clearing instead of the island's enormous town plaza.
    rules.plaza={...rules.plaza,radiusX:95,radiusY:60};
    for(let i=2;i<paths.length-1;i+=3){
        const {a,b}=paths[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
        const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        const side=rng.pick([-1,1]),offset=rng.int(150,205);
        const pond={x:mid.x+nx*offset*side,y:mid.y+ny*offset*side,rx:rng.int(66,105),ry:rng.int(40,62),material};
        if(inside(pond)&&roadGap(pond)>pond.rx+48)layout.lakes.push(pond);
        // A stream crossing with a real bridge, aligned with this road segment.
        if((i-2)%6===0){
            const points=[-260,-125,0,135,265].map((n,j)=>[mid.x+nx*n+(j%2?dx/len*22:0),mid.y+ny*n+(j%2?dy/len*22:0)]);
            layout.rivers.push({points,width:rng.int(36,52),material});
            layout.bridges.push({x:mid.x,y:mid.y,w:126,h:paths[i].width+14,angle:Math.atan2(dy,dx)});
        }
        const rock={x:mid.x-nx*230*side,y:mid.y-ny*230*side,biome,scale:.65+rng.float()*.4};
        if(inside(rock)&&roadGap(rock)>180)layout.mountains.push(rock);
        const relic={x:b.x+(b.x>650?-155:155),y:b.y-105,size:rng.int(65,95),kind:biome==='forest'?'goldTree':'ruins'};
        if(roadGap(relic)>95)layout.features.push(relic);
    }
    // Scatter clusters beside the playable trail, not around an unseen map border.
    for(const path of paths){
        const dx=path.b.x-path.a.x,dy=path.b.y-path.a.y,len=Math.hypot(dx,dy);
        for(let distance=0;distance<len;distance+=52)for(const side of [-1,1]){
            if(rng.float()<(biome==='volcanic'?.60:biome==='desert'?.48:.12))continue;
            const gap=rng.int(95,270),t=distance/len;
            const p={x:path.a.x+dx*t-dy/len*gap*side+rng.int(-22,22),y:path.a.y+dy*t+dx/len*gap*side+rng.int(-20,20)};
            const size=rng.int(88,155);
            if(!inside(p)||roadGap(p)<85||route.some(a=>Math.hypot(a.x-p.x,a.y-p.y)<115))continue;
            if(layout.lakes.some(l=>((p.x-l.x)/(l.rx+30))**2+((p.y-l.y)/(l.ry+30))**2<1))continue;
            if(layout.rivers.some(r=>r.points.slice(1).some((v,i)=>segmentDistance(p,{x:r.points[i][0],y:r.points[i][1]},{x:v[0],y:v[1]})<r.width/2+32)))continue;
            if(layout.trees.some(t=>Math.hypot(t.x-p.x,t.y-p.y)<48))continue;
            layout.trees.push({...p,size,tile:rng.pick(rules.biomes[biome].forest.tiles),snow:biome==='snow'});
        }
    }
    return layout;
}
