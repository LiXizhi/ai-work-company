import { paintSoftShadow, paintStaticShadows } from './adventure_shadows.js';
import {paintCampFloorSteps,paintCampPlazaSteps} from './adventure_camp_terrain.js';
import { paintGroundDetailSteps, paintWaterDetailSteps, paintRoadDetailSteps, paintRiverBank, paintShoreDetailSteps } from './adventure_terrain_detail.js';
import { groundDecorationSteps } from './adventure_ground_decorations_core.js';
import { paintBridges } from './adventure_bridge.js';
import { mountainSprite } from './island_scene_art_core.js';
import { paintGroundTexturesSteps, paintRoadTexture, paintWaterTexture } from './island_ground_textures.js';

// The original procedural ground and road treatment is the approved island
// look. Keep the generated atlases available for props, features and water,
// but do not replace these two established layers with tiled materials.
const USE_SCENE_GROUND_TEXTURES=false;
const USE_SCENE_ROAD_TEXTURES=false;

function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
function line(c,points,width,color){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function oval(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
function hits(rect,x0,y0,x1,y1){return x1>=rect.x&&x0<=rect.x+rect.w&&y1>=rect.y&&y0<=rect.y+rect.h;}
function blend(a,b,t){
    const rgb=[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t));
    return '#'+rgb.map(value=>value.toString(16).padStart(2,'0')).join('');
}
// Opaque intermediate colors avoid dark overlaps at road junctions. Only the
// outside fringe is translucent, so it blends with each island's own ground.
function bands(stops,overview=false){
    const result=[stops[0]];
    for(let i=1;i<stops.length;i++){
        const [outer,from]=stops[i-1],[inner,to]=stops[i];
        const steps=overview?2:Math.max(2,Math.ceil((outer-inner)/2));
        for(let j=1;j<=steps;j++)result.push([outer+(inner-outer)*j/steps,blend(from,to,j/steps)]);
    }
    return result;
}
// A deterministic, world-space painter. It paints either one small terrain tile
// or a low-resolution overview; it never allocates a world-sized bitmap.
export function paintLargeTerrain(...args){for(const step of paintLargeTerrainSteps(...args)){/* Synchronous overview / compatibility painter. */}}
export function* paintLargeTerrainSteps(c,world,rect={x:0,y:0,w:world.w,h:world.h},overview=false,decorationArt=null){
    const {layout}=world,{rules}=layout,{terrain}=rules;
    c.fillStyle=terrain.ocean;c.fillRect(rect.x,rect.y,rect.w,rect.h);
    c.lineJoin='round';c.lineCap='round';
    for(let i=0;i<terrain.coastLayers.length;i++){
        const [width,color]=terrain.coastLayers[i],outer=i?terrain.coastLayers[i-1]:[width+65,terrain.ocean];
        const steps=overview?4:Math.max(8,Math.ceil((outer[0]-width)/2));
        for(let step=1;step<=steps;step++){
            polygon(c,layout.coast);c.strokeStyle=blend(outer[1],color,step/steps);c.lineWidth=outer[0]+(width-outer[0])*step/steps;c.stroke();yield;
        }
    }
    if(!overview){
        yield* paintWaterDetailSteps(c,world,rect,'water',true);
        // Broken crests follow the existing coast, underneath the beach fill.
        c.save();c.setLineDash([26,17,8,31,13,47]);
        // A narrow crest at the waterline, rather than a broad dashed band.
        polygon(c,layout.coast);c.lineWidth=5;c.strokeStyle='#f2ffe68c';c.stroke();
        c.restore();
    }
    polygon(c,layout.coast);c.fillStyle=terrain.sand;c.fill();
    c.save();polygon(c,layout.coast);c.clip();
    polygon(c,layout.coast);c.fillStyle=terrain.base;c.fill();
    for(const r of layout.regions){
        if(!hits(rect,r.x-r.rx*1.25,r.y-r.ry*1.25,r.x+r.rx*1.25,r.y+r.ry*1.25))continue;
        c.save();c.translate(r.x,r.y);c.scale(r.rx,r.ry);
        const g=c.createRadialGradient(0,0,.2,0,0,1.25);g.addColorStop(0,r.color);g.addColorStop(.65,r.color);g.addColorStop(1,r.color+'00');
        oval(c,0,0,1.25,1.25,g);c.restore();yield;
    }
    // Islands with a scene art kit get painted, seamlessly tiled materials.
    const textured=!overview&&USE_SCENE_GROUND_TEXTURES&&decorationArt?yield* paintGroundTexturesSteps(c,world,rect,decorationArt):false;
    // Feather the sand into the already-painted regional ground. Wide to narrow
    // passes leave a soft inland margin without moving the collision coastline.
    for(let fringe=18;fringe>0;fringe-=3){
        polygon(c,layout.coast);c.lineWidth=terrain.coastWidth+fringe;
        c.strokeStyle=terrain.sand+'24';c.stroke();
    }
    polygon(c,layout.coast);c.lineWidth=terrain.coastWidth-8;c.strokeStyle=terrain.sand;c.stroke();
    if(!overview){if(!textured)yield* paintGroundDetailSteps(c,world,rect);yield* paintShoreDetailSteps(c,world,rect);}
    // Relief contours and small stone fans suggest altitude without animated geometry.
    for(const [index,mountain] of (layout.mountains||[]).entries()){
        const {x:cx,y:cy,biome,scale=1}=mountain,shape=rules.mountain,palette=rules.biomes[biome].mountain||rules.biomes.gold.mountain;
        const reach=(shape.baseRadius+(shape.layers-1)*shape.stepRadius)*scale*1.12,lift=(shape.layers-1)*shape.stepHeight*scale;
        const sprite=!overview&&decorationArt?mountainSprite(world,mountain,index):null;
        if(sprite){
            // Painted hill replaces the stepped polygon once its atlas is ready.
            const w=reach*2.3,bottom=cy+reach*shape.aspect*1.02;
            if(!hits(rect,cx-w/2,bottom-w,cx+w/2,bottom+8))continue;
            paintSoftShadow(c,cx,bottom-reach*shape.aspect*.35,reach*.92,reach*shape.aspect*.6,.22);
            c.save();c.translate(cx,0);if(sprite.flip)c.scale(-1,1);
            const drawn=decorationArt.draw(c,sprite.atlas,sprite.frame,-w/2,bottom-w,w,w);
            c.restore();
            if(drawn)continue;
        }
        if(!hits(rect,cx-reach,cy-reach*shape.aspect-lift,cx+reach,cy+reach*shape.aspect))continue;
        let prevPoints=null;
        for(let j=shape.layers-1;j>=0;j--){
            const points=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,r=(shape.baseRadius+j*shape.stepRadius)*scale*(1+.12*Math.sin(i*4+cx));return[cx+Math.cos(a)*r,cy+Math.sin(a)*r*shape.aspect-j*shape.stepHeight*scale];});
            polygon(c,points);c.fillStyle=palette[Math.min(j,palette.length-1)];c.fill();
            c.strokeStyle=palette.at(-1)+'55';c.lineWidth=3;c.stroke();
            if(!overview){
                line(c,points.slice(6,11),2.4,'#fff8e436');
                line(c,points.slice(0,6),2.8,'#1b161233');
                if(prevPoints){
                    for(let k=0;k<12;k+=2)line(c,[points[k],prevPoints[k]],1.6,k>=6?'#fff6df26':'#221b1628');
                }
                prevPoints=points;
            }
        }
        if(!overview&&decorationArt){
            for(const [dx,dy,sz,flip] of [[-.52,.22,74,false],[.48,.26,68,true]]){
                const rx=cx+dx*reach,ry=cy+dy*reach*shape.aspect;
                if(!hits(rect,rx-sz,ry-sz,rx+sz,ry+sz))continue;
                paintSoftShadow(c,rx,ry-4,sz*.36,sz*.12,.2);
                c.save();c.translate(rx,ry);if(flip)c.scale(-1,1);
                decorationArt.draw(c,'islandPlazasProps','biomeCrystalCluster',-sz/2,-sz,sz,sz);
                c.restore();
            }
        }
    }
    yield;
    // Patchwork farmland is geometry baked into the ground, not individual sprites.
    for(const farm of layout.farms||[]){
        if(!hits(rect,farm.x,farm.y,farm.x+farm.cols*130,farm.y+farm.rows*90))continue;
        for(let row=0;row<farm.rows;row++)for(let col=0;col<farm.cols;col++){
        const x=farm.x+col*130,y=farm.y+row*90;
        if(!hits(rect,x,y,x+115,y+74))continue;
        if(!overview){
            c.fillStyle='#6e553688';c.fillRect(x-4,y-4,123,82);
        }
        c.fillStyle=(row+col)%2?'#c3bc70':'#799853';c.fillRect(x,y,115,74);
        for(let j=1;j<6;j++)line(c,[[x+6,y+j*11],[x+107,y+j*11]],3,'#e0cd8a66');
        if(!overview){
            const gold=(row+col)%2;
            for(let j=1;j<6;j++){
                line(c,[[x+8,y+j*11+2],[x+105,y+j*11+2]],1.5,gold?'#8d6d2f55':'#4e693155');
                for(let wx=14;wx<104;wx+=14)oval(c,x+wx+((j%2)*4),y+j*11-1.5,3.2,1.8,gold?'#f5df88cc':'#a8cc6ecc');
            }
        }
        }
    }
    yield;
    // Paint the entire water network one band at a time. Inner water covers all
    // banks at lake/river junctions, including across independently baked tiles.
    for(const material of new Set([...layout.rivers,...(layout.lakes||[])].map(w=>w.material||'water'))){
        const palette=rules.water[material];
        const rivers=layout.rivers.filter(r=>{if((r.material||'water')!==material)return false;const pad=r.width/2+24,xs=r.points.map(p=>p[0]),ys=r.points.map(p=>p[1]);return hits(rect,Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)+pad,Math.max(...ys)+pad);});
        const lakes=(layout.lakes||[]).filter(l=>(l.material||'water')===material);
        const waterBands=[...Array.from({length:6},(_,i)=>[24-i*2,palette.bank+'24']),
            ...bands([[12,palette.bank],[4,blend(palette.bank,palette.edge,.6)],[-3,palette.fill],[-12,blend(palette.fill,palette.center,.6)]],overview)];
        for(const [inset,color] of waterBands){
            for(const r of rivers)line(c,r.points,Math.max(4,r.width+inset*2),color);
            for(const l of lakes)if(hits(rect,l.x-l.rx-24,l.y-l.ry-24,l.x+l.rx+24,l.y+l.ry+24))
                oval(c,l.x,l.y,Math.max(2,l.rx+inset),Math.max(2,l.ry+inset),color);
        }
        if(!overview){
            // One union clip gives continuous ripples, with no doubled detail at joins.
            c.save();c.beginPath();
            for(const r of rivers){
                const radius=Math.max(2,r.width/2-3);
                for(let i=1;i<r.points.length;i++){
                    const [ax,ay]=r.points[i-1],[bx,by]=r.points[i],length=Math.hypot(bx-ax,by-ay)||1;
                    const nx=-(by-ay)/length*radius,ny=(bx-ax)/length*radius;
                    c.moveTo(ax+nx,ay+ny);c.lineTo(ax-nx,ay-ny);c.lineTo(bx-nx,by-ny);c.lineTo(bx+nx,by+ny);c.closePath();
                }
                for(const [x,y] of r.points){c.moveTo(x+radius,y);c.arc(x,y,radius,0,Math.PI*2);}
            }
            for(const l of lakes){c.moveTo(l.x+l.rx,l.y);c.ellipse(l.x,l.y,l.rx,l.ry,0,0,Math.PI*2);}
            c.clip();paintWaterTexture(c,world,rect,decorationArt,material);yield* paintWaterDetailSteps(c,world,rect,material);c.restore();
            for(const r of rivers)if(!lakes.length)paintRiverBank(c,world,rect,r,palette);
        }
    }
    if(!overview&&decorationArt)for(const d of (yield* groundDecorationSteps(world,rect))){
        // Small contact shade stays lighter than trees and buildings. Floating
        // plants and flat sand markings do not cast a ground shadow.
        if(!['lilyPads','waterLily','sandRipples'].includes(d.frame))
            paintSoftShadow(c,d.x-d.size*.03,d.y-d.size*.06,d.size*.36,d.size*.10,.17);
        c.save();c.translate(d.x,d.y);if(d.flip)c.scale(-1,1);
        decorationArt.draw(c,d.atlas,d.frame,-d.size/2,-d.size,d.size,d.size);c.restore();yield;
    }
    yield;
    // Every road pass is drawn over the full network to avoid crossing seams.
    const layers=rules.roads.layers;
    const shoulder=layers[1]?.[1]||layers[0]?.[1];
    const roadPad=Math.max(0,...layers.map(([extra])=>extra))+12;
    // Fade the verge into the biome instead of outlining paths in dark green.
    const roadBands=[];
    if(layers.length){
        for(let fringe=12;fringe>0;fringe-=3)roadBands.push([layers[0][0]+fringe,shoulder+'20']);
        roadBands.push(...bands(layers.map(([extra,color],i)=>[extra,i===0?blend(color,shoulder,.75):color]),overview));
    }
    for(const [extra,color] of roadBands){
        for(const p of world.paths){
            const half=(p.width+roadPad)/2,x0=Math.min(p.a.x,p.b.x)-half,y0=Math.min(p.a.y,p.b.y)-half,x1=Math.max(p.a.x,p.b.x)+half,y1=Math.max(p.a.y,p.b.y)+half;
            if(!hits(rect,x0,y0,x1,y1))continue;
            line(c,[[p.a.x,p.a.y],[p.b.x,p.b.y]],Math.max(4,p.width+extra),color);yield;
        }
    }
    if(!overview)yield* paintRoadDetailSteps(c,world,rect,USE_SCENE_ROAD_TEXTURES&&Boolean(decorationArt)&&paintRoadTexture(c,world,rect,decorationArt));
    const visibleBridges=layout.bridges.filter(b=>{
        const reach=Math.hypot(b.w,b.h)/2+24;
        return hits(rect,b.x-reach,b.y-reach,b.x+reach,b.y+reach);
    });
    paintBridges(c,visibleBridges,rules.bridge,overview);
    for(const d of layout.details||[]){
        if(d.x<rect.x-20||d.x>rect.x+rect.w+20||d.y<rect.y-20||d.y>rect.y+rect.h+20)continue;
        oval(c,d.x,d.y,d.size,d.size*.5,rules.biomes[d.biome].color);oval(c,d.x-1,d.y-2,d.size*.7,d.size*.25,'#fff2ce30');
    }
    for(const f of layout.features||[]){
        const s=f.size;
        if(!hits(rect,f.x-s*1.2,f.y-s*2,f.x+s*1.2,f.y+s*.4))continue;
        if(f.kind==='goldTree'){
            const drawn=!overview&&decorationArt?.draw(c,'islandLandmarks','fireGoldTree',f.x-s*1.18,f.y-s*1.92,s*2.36,s*2.12);
            if(!drawn){
                c.fillStyle='#8d7040';c.fillRect(f.x-s*.09,f.y-s*.65,s*.18,s*.65);
                for(const [dx,dy,k] of [[0,-.8,.45],[-.28,-.65,.32],[.28,-.65,.32],[0,-1,.3]])oval(c,f.x+dx*s,f.y+dy*s,s*k,s*k*.85,'#e4bd55');
                oval(c,f.x-s*.12,f.y-s*.95,s*.23,s*.17,'#f5db7e');
            }
        }else if(f.kind==='ruins'){
            const frame=world.zone==='dark'?'darkCitadelRuins':'desertPyramid';
            const drawn=!overview&&decorationArt?.draw(c,'islandLandmarks',frame,f.x-s*1.15,f.y-s*1.58,s*2.3,s*1.82);
            if(!drawn){
                c.fillStyle='#a89b79';c.fillRect(f.x-s*.6,f.y-s*.12,s*1.2,s*.18);
                for(const dx of [-.45,-.15,.15,.45]){c.fillStyle='#cdbd91';c.fillRect(f.x+dx*s-s*.06,f.y-s*.65,s*.12,s*.55);c.fillStyle='#e0cea4';c.fillRect(f.x+dx*s-s*.09,f.y-s*.7,s*.18,s*.09);}
            }
        }
    }
    const plaza=rules.plaza;
    const refinedIsland=Boolean(terrain.campRefined||['town','fire','ice','desert','dark'].includes(world.zone));
    if(!overview&&refinedIsland)yield* paintCampFloorSteps(c,world,rect,decorationArt);
    if(hits(rect,world.center.x-plaza.radiusX-12,world.center.y-plaza.radiusY-12,world.center.x+plaza.radiusX+12,world.center.y+plaza.radiusY+12)){
        oval(c,world.center.x,world.center.y,plaza.radiusX,plaza.radiusY,plaza.edge);oval(c,world.center.x,world.center.y,plaza.radiusX-11,plaza.radiusY-9,plaza.fill);
        if(!overview&&refinedIsland){
            yield* paintCampPlazaSteps(c,world,rect,decorationArt);
        }else{
            c.strokeStyle=plaza.line;c.lineWidth=2;
            for(let i=0;i<3;i++){c.beginPath();c.ellipse(world.center.x,world.center.y,(layout.route?72:145)-i*(layout.route?18:36),(layout.route?40:83)-i*(layout.route?10:20),0,0,Math.PI*2);c.stroke();}
        }
    }
    yield;
    // Bake after roads and plaza so their surfaces receive shade too.
    paintStaticShadows(c,world,rect);
    c.restore();
}

export function createTerrainTileCache(paint,createCanvas,limit=24){
    const tiles=new Map();let currentWorld=null,previous=null,currentDensity=null;
    let pixels=512,capacity=limit;const bleed=2;
    function paintTile(world,size,scale,margin,x,y){
        const tile=createCanvas();tile.width=tile.height=pixels+bleed*2;const tc=tile.getContext('2d');
        tc.translate(bleed,bleed);tc.scale(scale,scale);tc.translate(-x*size,-y*size);
        paint(tc,world,{x:x*size-margin,y:y*size-margin,w:size+margin*2,h:size+margin*2});
        return tile;
    }
    return {
        draw(c,world,rect,fallback,pixelRatio=1){
            const density=Number.isFinite(pixelRatio)&&pixelRatio>1?2:1;
            if(currentWorld!==world||currentDensity!==density){tiles.clear();currentWorld=world;currentDensity=density;previous=null;}
            pixels=512*density;
            // At most 64 MiB of RGBA tiles (including bleed) on high-DPI displays.
            capacity=Math.max(1,Math.min(limit,Math.floor(64*1024*1024/((pixels+bleed*2)**2*4))));
            let generated=0;
            const touched=new Set();
            // Zoomed-out or very wide screens use coarser terrain tiles rather
            // than repeatedly evicting visible tiles or growing mobile memory.
            let size=512;
            while((Math.ceil(rect.w/size)+1)*(Math.ceil(rect.h/size)+1)>capacity)size*=2;
            const scale=pixels/size,margin=bleed/scale;
            const x0=Math.max(0,Math.floor(rect.x/size)),y0=Math.max(0,Math.floor(rect.y/size));
            const x1=Math.min(Math.ceil(world.w/size)-1,Math.floor((rect.x+rect.w)/size));
            const y1=Math.min(Math.ceil(world.h/size)-1,Math.floor((rect.y+rect.h)/size));
            const cols=Math.ceil(world.w/size),rows=Math.ceil(world.h/size);
            for(let y=y0;y<=y1;y++){
                for(let x=x0;x<=x1;x++){
                    const key=`${size}:${x},${y}`;let tile=tiles.get(key);
                    if(!tile){
                        // Keep a continuous low-resolution floor while new
                        // detail arrives; at most two cold tiles per frame.
                        if(fallback&&generated>=2){fallback(c,x*size,y*size,size);continue;}
                        generated++;
                        tile=paintTile(world,size,scale,margin,x,y);
                    }
                    tiles.delete(key);tiles.set(key,tile);touched.add(key);
                    // Include one painted bleed pixel on each side so fractional
                    // camera transforms cannot expose the floor between tiles.
                    // Keep the outer pixel as a filtering gutter; expand source
                    // and destination equally to preserve world-space alignment.
                    const overlap=1/scale;
                    c.drawImage(tile,bleed-1,bleed-1,pixels+2,pixels+2,
                        x*size-overlap,y*size-overlap,size+overlap*2,size+overlap*2);
                    while(tiles.size>capacity)tiles.delete(tiles.keys().next().value);
                }
            }
            const dx=previous?rect.x-previous.x:0,dy=previous?rect.y-previous.y:0;
            if(generated===0&&(dx||dy)){
                const px=Math.abs(dx)>=Math.abs(dy)?(dx>0?x1+1:x0-1):Math.max(x0,Math.min(x1,Math.floor((rect.x+rect.w/2)/size)));
                const py=Math.abs(dy)>Math.abs(dx)?(dy>0?y1+1:y0-1):Math.max(y0,Math.min(y1,Math.floor((rect.y+rect.h/2)/size)));
                const key=`${size}:${px},${py}`;
                const oldest=tiles.keys().next().value;
                if(px>=0&&py>=0&&px<cols&&py<rows&&!tiles.has(key)&&(tiles.size<capacity||oldest!==undefined&&!touched.has(oldest))){
                    const tile=paintTile(world,size,scale,margin,px,py);
                    tiles.set(key,tile);generated++;
                    while(tiles.size>capacity){
                        const old=tiles.keys().next().value;
                        if(touched.has(old)){tiles.delete(key);generated--;break;}
                        tiles.delete(old);
                    }
                }
            }
            previous={x:rect.x,y:rect.y};
            return generated;
        },
        clear(){tiles.clear();currentWorld=null;previous=null;currentDensity=null;},
        get size(){return tiles.size;},
    };
}
