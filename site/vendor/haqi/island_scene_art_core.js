import {createRng,hashSeed} from './rng_core.js';
import {onLargeIsland,regionAt,segmentDistance} from './adventure_island_layout_core.js';

// Per-island scene art kit (layout.sceneArt, authored in config/maps/islands/<id>.json).
// Cosmetic only: positions are world-space and seed-stable, never gameplay RNG, and
// gathering keeps using groundDecorations unchanged.

const pick=(list,seed)=>Array.isArray(list)?list[Math.abs(seed)%list.length]:list;

export function sceneArtAtlases(world){
    const art=world?.layout?.sceneArt;
    if(!art)return [];
    return [art.ground?.atlas,art.props?.atlas,art.features?.atlas].filter(Boolean);
}

// Texture frame for a biome / road / water material, or null if not configured.
export function groundTexture(world,kind,key){
    const g=world?.layout?.sceneArt?.ground;
    if(!g?.atlas)return null;
    const frame=kind==='base'?g.base:kind==='road'?g.road:kind==='water'?g.water?.[key]:g.biomes?.[key];
    return frame?{atlas:g.atlas,frame,scale:g.scale||1,alpha:kind==='road'?(g.roadAlpha??.92):kind==='water'?(g.waterAlpha??.7):(g.alpha??.85)}:null;
}

// Painted mountain sprite replacing the stepped polygon hill, or null.
export function mountainSprite(world,mountain,index=0){
    const art=world?.layout?.sceneArt?.features;
    const frames=art?.mountains?.[mountain.biome];
    if(!art?.atlas||!frames)return null;
    return {atlas:art.atlas,frame:pick(frames,index+Math.round(mountain.x/97)),flip:Math.round(mountain.y/53)%2===1};
}

function blockers(world){
    const l=world.layout;
    return {
        points:[...(world.npcs||[]),...(world.encounters||[]),...(world.landmarks||[]),world.portal].filter(Boolean),
        rivers:l.rivers||[],lakes:l.lakes||[],mountains:l.mountains||[],
    };
}

function riverDistance(p,river){
    let best=Infinity;
    for(let i=1;i<river.points.length;i++){
        const [ax,ay]=river.points[i-1],[bx,by]=river.points[i];
        best=Math.min(best,segmentDistance(p,{x:ax,y:ay},{x:bx,y:by}));
    }
    return best;
}

export function sceneArtClear(world,x,y,radius,{roadGap=12,pointGap=95,treeGap=.22}={}){
    const l=world.layout,plaza=l.rules.plaza,b=blockers(world),p={x,y};
    if(!onLargeIsland(world,x,y,radius+40))return false;
    if(world.paths.some(r=>segmentDistance(p,r.a,r.b)<(r.width||60)/2+radius+roadGap))return false;
    if(b.points.some(q=>Math.hypot(x-q.x,y-q.y)<radius+pointGap))return false;
    if(((x-world.center.x)/(plaza.radiusX+radius+20))**2+((y-world.center.y)/(plaza.radiusY+radius+20))**2<1)return false;
    if((world.buildings||[]).some(o=>Math.abs(x-o.x)<o.w/2+radius&&y>o.y-o.h-radius&&y<o.y+radius))return false;
    if((l.bridges||[]).some(o=>Math.hypot(x-o.x,y-o.y)<Math.hypot(o.w,o.h)/2+radius))return false;
    if((world.trees||[]).some(t=>Math.hypot(x-t.x,y-t.y)<radius*.6+t.size*treeGap))return false;
    if(b.rivers.some(r=>riverDistance(p,r)<r.width/2+radius+16))return false;
    if(b.lakes.some(o=>((x-o.x)/(o.rx+radius+16))**2+((y-o.y)/(o.ry+radius+16))**2<1))return false;
    if((l.features||[]).some(f=>Math.hypot(x-f.x,y-f.y)<f.size*1.2+radius))return false;
    if((l.farms||[]).some(f=>x>f.x-radius&&x<f.x+f.cols*130+radius&&y>f.y-radius&&y<f.y+f.rows*90+radius))return false;
    const shape=l.rules.mountain;
    if(b.mountains.some(m=>{
        const s=m.scale||1,r=(shape.baseRadius+(shape.layers-1)*shape.stepRadius)*s*1.2+radius;
        return ((x-m.x)/r)**2+((y-m.y)/(r*shape.aspect+(shape.layers-1)*shape.stepHeight*s))**2<1;
    }))return false;
    return true;
}

function listFor(group,biome){
    if(!group)return null;
    if(Array.isArray(group))return group;
    return group[biome]||group.default||null;
}

// Stamps are {x,y,size,atlas,frame,flip,bottom:true}; y is the ground contact point.
export function* islandSceneArtSteps(world,rect){
    const art=world?.layout?.sceneArt;
    if(!art||!world.layout.rules?.plaza)return;
    const pad=260,inRect=(x,y)=>x>=rect.x-pad&&x<=rect.x+rect.w+pad&&y>=rect.y-pad&&y<=rect.y+rect.h+pad;
    const zone=world.zone;
    // Roadside props on alternating verges at fixed world-space spacing.
    const roadside=art.props?.roadside;
    if(art.props?.atlas&&roadside?.length){
        const spacing=art.props.roadSpacing||300;
        for(const road of world.paths){
            const dx=road.b.x-road.a.x,dy=road.b.y-road.a.y,len=Math.hypot(dx,dy);
            if(len<spacing*.8)continue;
            const nx=-dy/len,ny=dx/len;
            for(let d=spacing*.5;d<len;d+=spacing){
                const key=`${zone}:scene-road:${Math.round(road.a.x)}:${Math.round(road.a.y)}:${Math.round(d)}`;
                const rng=createRng(hashSeed(key));
                if(rng.float()>(art.props.roadChance??.55))continue;
                const side=rng.int(0,1)?1:-1,off=(road.width||60)/2+30+rng.float()*16;
                const x=Math.round(road.a.x+dx*d/len+nx*off*side),y=Math.round(road.a.y+dy*d/len+ny*off*side);
                if(!inRect(x,y))continue;
                const size=58+rng.float()*14;
                if(!sceneArtClear(world,x,y,size*.35,{roadGap:-size*.35-6,pointGap:70}))continue;
                yield {x,y,size,atlas:art.props.atlas,frame:rng.pick(roadside),flip:side>0,bottom:true};
            }
        }
    }
    // Scattered small props and larger features, one candidate per world cell.
    for(const [group,cell,chance,minSize,spread] of [
        [art.props,art.props?.cell||230,art.props?.chance??.32,54,22],
        [art.features,art.features?.cell||520,art.features?.chance??.3,art.features?.size||170,60],
    ]){
        if(!group?.atlas||!group.scatter)continue;
        for(let gy=Math.floor((rect.y-pad)/cell);gy<=Math.floor((rect.y+rect.h+pad)/cell);gy++){
            for(let gx=Math.floor((rect.x-pad)/cell);gx<=Math.floor((rect.x+rect.w+pad)/cell);gx++){
                yield;
                const rng=createRng(hashSeed(`${zone}:scene-${cell}:${gx}:${gy}`));
                if(rng.float()>chance)continue;
                const x=Math.round(gx*cell+cell*.15+rng.float()*cell*.7),y=Math.round(gy*cell+cell*.15+rng.float()*cell*.7);
                if(!inRect(x,y))continue;
                const biome=regionAt(world,{x,y})?.biome||world.layout.baseBiome;
                const list=listFor(group.scatter,biome);
                if(!list?.length)continue;
                const frame=rng.pick(list),size=Math.round((group.sizes?.[frame]||minSize)+rng.float()*spread);
                if(!sceneArtClear(world,x,y,size*.42,{roadGap:18,pointGap:110}))continue;
                yield {x,y,size,atlas:group.atlas,frame,flip:rng.int(0,1)===1,bottom:true};
            }
        }
    }
}
