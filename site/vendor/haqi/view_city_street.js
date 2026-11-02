import {createSpatialIndex,createStreetMotion,stepStreetMotion,signalGreen,polygonBounds} from './adventure_city_street_core.js';
import {streetPeopleProfiles} from './adventure_city_people_core.js';
import {createHeroActor,updateHeroActor,facingToward} from './hero_pose_core.js';
import {hashSeed} from './rng_core.js';
import {streetArtResource,streetArtResources,streetArtKeys} from './adventure_city_art_core.js';
const geometryBounds=new WeakMap();
const bounds=(o,points,pad=0)=>{let b=geometryBounds.get(o);if(!b){b=polygonBounds(points);geometryBounds.set(o,b);}return{x:b.x-pad,y:b.y-pad,w:b.w+pad*2,h:b.h+pad*2};};
const touches=(b,r)=>b.x<=r.x+r.w&&b.x+b.w>=r.x&&b.y<=r.y+r.h&&b.y+b.h>=r.y;
const path=(c,points,close=true)=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(close)c.closePath();};
export function paintStreetGround(c,street,rect,material=()=>null){
    c.fillStyle=material(street.groundArt,c)||street.ground||'#d5d1bd';c.fillRect(rect.x,rect.y,rect.w,rect.h);
    const surfaces=street.surfaces.filter(s=>touches(bounds(s,s.points,14),rect));
    const roads=street.roads.filter(r=>touches(bounds(r,r.points,r.width/2+14),rect));
    for(const s of surfaces){path(c,s.points);c.fillStyle=material(s.material,c)||s.color;c.fill();if(s.kind==='water'){c.save();c.clip();c.strokeStyle='#d7eff033';c.lineWidth=2;for(let y=Math.floor(rect.y/45)*45;y<rect.y+rect.h;y+=45)for(let x=Math.floor(rect.x/85)*85;x<rect.x+rect.w;x+=85){c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+18,y-7,x+40,y);c.stroke();}c.restore();}}
    c.lineJoin='round';c.lineCap='round';
    // Raised stone edges are painted before every road interior: intersecting paths
    // cut their own openings, so no curb is drawn across an alley or crossing.
    if(street.transitions?.curbs){
        c.lineCap='butt';
        const edges=(points,width)=>{
            for(let i=1;i<points.length;i++){
                const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;
                const nx=-dy/len,ny=dx/len;
                for(const side of width?[-1,1]:[1]){
                    const offset=side*(width/2+4),p={x:a.x+nx*offset,y:a.y+ny*offset},q={x:b.x+nx*offset,y:b.y+ny*offset};
                    path(c,[p,q],false);c.strokeStyle='#57574d';c.lineWidth=12;c.stroke();
                    path(c,[{x:p.x,y:p.y-2},{x:q.x,y:q.y-2}],false);c.strokeStyle='#c9c7b9';c.lineWidth=7;c.stroke();
                    c.strokeStyle='#79796e';c.lineWidth=1;
                    for(let d=16;d<len;d+=32){const x=p.x+dx*d/len,y=p.y+dy*d/len-2;path(c,[{x:x-nx*4,y:y-ny*4},{x:x+nx*4,y:y+ny*4}],false);c.stroke();}
                }
            }
        };
        for(const r of roads)if(r.kind==='road'||r.curbed)edges(r.points,r.width);
        for(const s of surfaces.filter(s=>s.kind==='grass'))edges([...s.points,s.points[0]],0);
    }
    for(const r of roads){
        path(c,r.points,false);if(!street.transitions?.curbs){c.strokeStyle=r.kind==='road'?'#b8b5a6':'#b9ad92';c.lineWidth=r.width+24;c.stroke();}
        c.strokeStyle=material(r.material,c)||(r.kind==='road'?'#737c7c':r.color||'#d8cbb0');c.lineWidth=r.width;c.stroke();
        if(r.kind==='road'&&street.transitions?.gutters){
            c.save();c.strokeStyle='#343b393b';c.lineWidth=3;c.lineCap='butt';
            for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;for(const side of [-1,1]){const offset=side*(r.width/2-4),nx=-dy/len*offset,ny=dx/len*offset;path(c,[{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny}],false);c.stroke();}}
            c.restore();
        }
        if(r.kind==='road'){c.save();c.setLineDash([24,24]);c.lineWidth=2;c.strokeStyle='#eee5bd';c.stroke();c.restore();}
        else if(!street.theme){c.save();path(c,r.points,false);c.setLineDash([2,26]);c.lineWidth=Math.max(1,r.width-8);c.strokeStyle='#988e7920';c.stroke();c.restore();}
    }
    // Curb cuts cover the raised curb only at the crossing; quiet tactile
    // blocks sit entirely on the footpath and are baked with its material.
    for(const apron of street.transitions?.aprons||[]){if(!touches(bounds(apron,apron.points),rect))continue;path(c,apron.points);c.fillStyle=material(apron.material,c)||apron.color;c.fill();}
    for(const strip of street.transitions?.tactile||[]){if(!touches(strip,rect))continue;c.fillStyle='#c3af7f';c.fillRect(strip.x,strip.y,strip.w,strip.h);c.fillStyle='#dfc995';for(let x=strip.x+3;x<strip.x+strip.w-2;x+=6)for(let y=strip.y+2;y<strip.y+strip.h;y+=4)c.fillRect(x,y,2,2);}
    for(const landing of street.transitions?.landings||[]){
        if(!touches({x:landing.x-landing.w/2,y:landing.y-landing.h,w:landing.w,h:landing.h+3},rect))continue;
        c.fillStyle='#635d50';c.fillRect(landing.x-landing.w/2,landing.y-landing.h,landing.w,landing.h+3);
        c.fillStyle=material('living:pavers',c)||'#bcb6a6';c.fillRect(landing.x-landing.w/2,landing.y-landing.h,landing.w,landing.h);
        c.fillStyle='#e0dbcd';c.fillRect(landing.x-landing.w/2,landing.y-landing.h,landing.w,2);
    }
    // Paving seams are subtle continuous material detail, never colored parcel squares.
    c.strokeStyle='#574f3810';c.lineWidth=1;
    if(!street.theme)for(let y=Math.floor(rect.y/32)*32;y<rect.y+rect.h;y+=32){c.beginPath();c.moveTo(rect.x,y);c.lineTo(rect.x+rect.w,y);c.stroke();}
    for(const patch of street.wear||[]){
        const b=polygonBounds(patch.points);if(b.x>rect.x+rect.w||b.y>rect.y+rect.h||b.x+b.w<rect.x||b.y+b.h<rect.y)continue;
        const cx=b.x+b.w/2,cy=b.y+b.h/2;c.save();c.fillStyle=patch.color;
        for(const [scale,alpha] of [[1,.38],[.76,.63]]){c.globalAlpha=alpha;path(c,patch.points.map(p=>({x:cx+(p.x-cx)*scale,y:cy+(p.y-cy)*scale})));c.fill();}c.restore();
    }
    for(const marking of street.markings||[]){if(!touches(bounds(marking,marking.points,marking.width/2+1),rect))continue;c.save();path(c,marking.points,false);c.strokeStyle=marking.color;c.lineWidth=marking.width;c.stroke();c.restore();}
    for(const crossing of street.crossings||[]){const radius=Math.hypot(crossing.w,crossing.h)/2;if(!touches({x:crossing.x-radius,y:crossing.y-radius,w:radius*2,h:radius*2},rect))continue;c.save();c.translate(crossing.x,crossing.y);c.rotate(crossing.angle||0);c.fillStyle='#edead7';for(let x=-crossing.w/2;x<crossing.w/2;x+=17)c.fillRect(x,-crossing.h/2,9,crossing.h);c.restore();}
}
export function streetObjectBounds(o){
    let x=o.x-o.w/2,y=o.y+(o.imageOffsetY||0)-o.h,right=o.x+o.w/2,bottom=o.y;
    for(const p of o.components||[]){x=Math.min(x,o.x+p.x-p.w/2);y=Math.min(y,o.y+p.y-p.h);right=Math.max(right,o.x+p.x+p.w/2);bottom=Math.max(bottom,o.y+p.y);}
    return{x:x-40,y:y-40,w:right-x+80,h:bottom-y+80};
}
// Project the same sprite corners used by bakeShadows, including attachments.
export function streetShadowBounds(o){
    const parts=[{...o,y:o.y+(o.imageOffsetY||0)},...(o.components||[]).map(p=>({...p,x:o.x+p.x,y:o.y+p.y}))],points=[];
    for(const p of parts)for(const x of [p.x-p.w/2,p.x+p.w/2])for(const y of [p.y-p.h,p.y])points.push({x:x-.32*(y-o.y),y:o.y-.18*(y-o.y)});
    points.push({x:o.x-o.w*.4-6,y:o.y-14},{x:o.x+o.w*.4+6,y:o.y+14});
    const b=polygonBounds(points);return{x:b.x-4,y:b.y-4,w:b.w+8,h:b.h+8};
}
export function layoutStreetSignText(text,width,height,measure){
    const paragraphs=String(text).split('\n'),maxLines=Math.min(3,Math.max(paragraphs.length,Math.floor(height/12)));
    let lines=paragraphs.slice(0,3),overflow=paragraphs.length>3;
    if(width>=64&&height>=24&&paragraphs.length===1){
        const probe=Math.min(18,height/(maxLines*1.2)),wrapped=[];
        for(const paragraph of paragraphs){let line='';for(const char of Array.from(paragraph)){if(line&&measure(line+char,probe)>width*.94){wrapped.push(line);line=char;}else line+=char;}wrapped.push(line);}
        if(wrapped.length>lines.length){lines=wrapped.slice(0,maxLines);overflow=wrapped.length>maxLines;}
    }
    if(overflow){let last=lines.at(-1);const probe=Math.min(18,height/(lines.length*1.2));while(last&&measure(last+'…',probe)>width*.94)last=Array.from(last).slice(0,-1).join('');lines[lines.length-1]=last+'…';}
    let font=Math.min(18,height/(lines.length*1.2)),measured=Math.max(...lines.map(line=>measure(line,font)));
    if(measured>width*.94)font*=width*.94/measured;
    return{lines,font};
}
export function createStreetPainter(assets,{makeCanvas=()=>document.createElement('canvas')}={}){
    let active=null,index=null,groundIndex=null,shadowIndex=null,groundResourceIds=[],motion=null,last=null,profiles=new Map(),tileSize=512,resources=[],groundStamp='',shadowScratch=null;const people=new Map(),tiles=new Map(),textures=new Map(),patterns=new Map(),signs=new Map(),maxTiles=24;
    const resolution=typeof navigator!=='undefined'&&((navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4)?384:512;
    const clearTiles=()=>{for(const tile of tiles.values())tile.width=tile.height=0;tiles.clear();};
    const release=()=>{for(const entry of resources)assets.releaseImage?.(entry.id);resources=[];clearTiles();for(const canvas of [...textures.values(),...signs.values()])canvas.width=canvas.height=0;textures.clear();patterns.clear();signs.clear();people.clear();groundIndex=shadowIndex=null;groundResourceIds=[];if(shadowScratch)shadowScratch.width=shadowScratch.height=0;shadowScratch=null;groundStamp='';};
    const select=world=>{if(active===world.dungeon.scene)return;release();active=world.dungeon.scene;profiles=streetPeopleProfiles(active.streetscape,assets.hero?.manifest,world.dungeon.id);resources=streetArtResources(assets.content.cityStreetArt,active.streetscape);for(const entry of resources)assets.registerImage?.(entry.id,entry);index=createSpatialIndex(active.streetscape.objects.filter(o=>!o.ground),streetObjectBounds);motion=createStreetMotion(active.streetscape);last=null;
        const groundKeys=streetArtKeys({...active.streetscape,routes:[]}),groundResources=new Map();
        for(const key of groundKeys){const r=streetArtResource(assets.content.cityStreetArt,key);if(r)groundResources.set(r.id,r);}
        groundResourceIds=[...groundResources.keys()];for(const r of groundResources.values())assets.ensureImage?.(r.id)?.catch(()=>null);
        const order=new Map(active.streetscape.objects.map((o,i)=>[o,i]));
        const groundQuery=createSpatialIndex(active.streetscape.objects.filter(o=>o.ground),streetObjectBounds);
        groundIndex=rect=>groundQuery(rect).sort((a,b)=>order.get(a)-order.get(b));
        const shadowQuery=createSpatialIndex(active.streetscape.objects.filter(o=>!o.ground||o.art?.endsWith(':steps')),streetShadowBounds);
        shadowIndex=rect=>shadowQuery(rect).sort((a,b)=>order.get(a)-order.get(b));

    };
    const material=(key,c)=>{
        const entry=assets.content.cityStreetArt?.entries?.[key],resource=streetArtResource(assets.content.cityStreetArt,key),image=assets.images?.get(resource?.id);if(!image||!entry?.crop)return null;
        let canvas=textures.get(key);if(!canvas){canvas=makeCanvas();canvas.width=canvas.height=256;const g=canvas.getContext('2d');
            // Mirroring joins texture samples without hard edges.
            for(let y=0;y<2;y++)for(let x=0;x<2;x++){g.save();g.translate(x?256:0,y?256:0);g.scale(x?-1:1,y?-1:1);g.drawImage(image,...entry.crop,0,0,128,128);g.restore();}textures.set(key,canvas);
        }let pattern=patterns.get(key);if(!pattern){pattern=c.createPattern(canvas,'repeat');if(pattern)patterns.set(key,pattern);}return pattern;
    };
    const paintText=(c,o,entry)=>{
        if(!o.text||!entry?.signSlots?.length)return;
        for(const slot of entry.signSlots){const width=o.w*slot.w,height=o.h*slot.h,key=JSON.stringify([o.text,width,height,slot.color]);let canvas=signs.get(key);
            if(!canvas){canvas=makeCanvas();canvas.width=Math.max(1,Math.ceil(width*2));canvas.height=Math.max(1,Math.ceil(height*2));const g=canvas.getContext('2d');g.scale(2,2);const {lines,font}=layoutStreetSignText(o.text,width,height,(text,size)=>{g.font=`${size}px Microsoft YaHei,sans-serif`;return g.measureText(text).width;});g.font=`${font}px Microsoft YaHei,sans-serif`;g.fillStyle=slot.color||'#39463a';g.textAlign='center';g.textBaseline='middle';for(let i=0;i<lines.length;i++)g.fillText(lines[i],width/2,height/2+(i-(lines.length-1)/2)*font*1.2);signs.set(key,canvas);while(signs.size>128){const first=signs.keys().next().value,old=signs.get(first);old.width=old.height=0;signs.delete(first);}}
            signs.delete(key);signs.set(key,canvas);
            c.save();c.translate(o.x-o.w/2+o.w*slot.x,o.y-o.h+o.h*slot.y);c.rotate(slot.angle||0);c.drawImage(canvas,-width/2,-height/2,width,height);c.restore();
        }
    };
    const paintFrame=(c,o)=>{const entry=assets.content.cityStreetArt?.entries?.[o.art],r=streetArtResource(assets.content.cityStreetArt,o.art);const ready=r&&assets.draw(c,{id:r.id,crop:entry.crop},o.x-o.w/2,o.y+(o.imageOffsetY||0)-o.h,o.w,o.h,!entry.crop,false);if(ready)paintText(c,o,entry);return ready;};
    // Only static scenery casts baked shadows. An alpha mask preserves lamp
    // poles and leaves; one reusable scratch canvas avoids retaining 40 masks.
    const bakeShadows=(c,street,rect)=>{
        if(street.theme!=='south-china')return;
        const touches=(x,y,w,h)=>x<rect.x+rect.w&&x+w>rect.x&&y<rect.y+rect.h&&y+h>rect.y;
        for(const o of shadowIndex(rect)){
            const parts=[{...o,y:o.y+(o.imageOffsetY||0)},...(o.components||[]).map(p=>({...p,x:o.x+p.x,y:o.y+p.y}))];
            for(const p of parts){
                const entry=assets.content.cityStreetArt?.entries?.[p.art],resource=streetArtResource(assets.content.cityStreetArt,p.art),image=assets.images?.get(resource?.id);
                if(!image)continue;
                if(!shadowScratch)shadowScratch=makeCanvas();
                const crop=entry.crop||[0,0,image.width,image.height];
                shadowScratch.width=Math.max(1,Math.min(384,Math.ceil(p.w)));shadowScratch.height=Math.max(1,Math.min(384,Math.ceil(p.h)));
                const mask=shadowScratch.getContext('2d');mask.drawImage(image,...crop,0,0,shadowScratch.width,shadowScratch.height);
                mask.globalCompositeOperation='source-in';mask.fillStyle='#30352d';mask.fillRect(0,0,shadowScratch.width,shadowScratch.height);mask.globalCompositeOperation='source-over';
                c.save();c.globalAlpha=.17;c.filter='blur(1.5px)';
                c.translate(o.x,o.y);c.transform(1,0,-.32,-.18,0,0);
                c.drawImage(shadowScratch,p.x-o.x-p.w/2,p.y-o.y-p.h,p.w,p.h);c.restore();
            }
            c.save();c.fillStyle='#30352d26';c.beginPath();c.ellipse(o.x,o.y,Math.max(5,o.w*(o.type==='building'?.40:o.type==='tree'?.29:.34)),Math.max(3,Math.min(12,o.w*.09)),0,0,Math.PI*2);c.fill();c.restore();
        }
        for(const signal of street.signals){
            if(!touches(signal.x-12,signal.y-8,45,30))continue;
            c.save();c.strokeStyle='#30352d30';c.lineWidth=4;c.beginPath();c.moveTo(signal.x,signal.y);c.lineTo(signal.x+24,signal.y+14);c.stroke();c.fillStyle='#30352d30';c.beginPath();c.ellipse(signal.x+23,signal.y+13,10,4,0,0,Math.PI*2);c.fill();c.restore();
        }
    };
    return {
        reset(){release();active=null;index=null;motion=null;last=null;profiles.clear();},
        stats:()=>({tiles:tiles.size,bytes:tiles.size*resolution*resolution*4,tileSize,resolution,theme:active?.streetscape?.theme||null,resources:resources.length,textures:textures.size,signs:signs.size,actors:motion?.actors.length||0,people:people.size,peopleReady:[...people.values()].filter(p=>p.ready).length}),
        people:()=>motion?.actors.filter(a=>a.route.kind==='pedestrian').map(a=>({id:a.id,x:a.x,y:a.y,profile:profiles.get(a.id)}))||[],
        ground(c,world,rect){select(world);const street=active.streetscape;
            const stamp=groundResourceIds.map(id=>assets.images?.has(id)?id:'').join('|');
            if(stamp!==groundStamp){clearTiles();for(const canvas of textures.values())canvas.width=canvas.height=0;textures.clear();patterns.clear();groundStamp=stamp;}
            // Zoomed-out views use larger world chunks at the same pixel cost.
            // The visible working set fits the cache, avoiding continual eviction.
            let nextSize=512;
            while((Math.ceil(rect.w/nextSize)+1)*(Math.ceil(rect.h/nextSize)+1)>maxTiles)nextSize*=2;
            if(nextSize!==tileSize){clearTiles();tileSize=nextSize;}
            for(let ty=Math.max(0,Math.floor(rect.y/tileSize));ty<=Math.min(Math.ceil(world.h/tileSize)-1,Math.floor((rect.y+rect.h)/tileSize));ty++)for(let tx=Math.max(0,Math.floor(rect.x/tileSize));tx<=Math.min(Math.ceil(world.w/tileSize)-1,Math.floor((rect.x+rect.w)/tileSize));tx++){
                const key=tx+','+ty;let tile=tiles.get(key);
                if(!tile){tile=makeCanvas();tile.width=tile.height=resolution;const g=tile.getContext('2d');g.scale(resolution/tileSize,resolution/tileSize);g.translate(-tx*tileSize,-ty*tileSize);paintStreetGround(g,street,{x:tx*tileSize,y:ty*tileSize,w:tileSize,h:tileSize},material);for(const o of groundIndex({x:tx*tileSize,y:ty*tileSize,w:tileSize,h:tileSize}))paintFrame(g,o);bakeShadows(g,street,{x:tx*tileSize,y:ty*tileSize,w:tileSize,h:tileSize});tiles.set(key,tile);while(tiles.size>maxTiles){const first=tiles.keys().next().value,old=tiles.get(first);old.width=old.height=0;tiles.delete(first);}}else{tiles.delete(key);tiles.set(key,tile);}
                c.drawImage(tile,tx*tileSize,ty*tileSize,tileSize,tileSize);
            }
        },
        objects(world,rect,time,hero,reducedMotion){select(world);const street=active.streetscape,dt=last===null?0:(time-last)/1000;last=time;
            const actors=stepStreetMotion(motion,street,dt,hero,{reducedMotion,paused:dt>.5});
            return [...index(rect).map(o=>({...o,kind:'street',sortY:o.sortY??o.y})),...street.signals.map(o=>({...o,kind:'street-signal',green:signalGreen(o,motion.time)})),...actors.filter(a=>a.x>=rect.x-100&&a.y>=rect.y-100&&a.x<=rect.x+rect.w+100&&a.y<=rect.y+rect.h+100).map(a=>({...a,kind:'street-actor',profile:profiles.get(a.id),time:time/1000,reducedMotion,moving:a.moving&&!reducedMotion&&dt<=.5}))];
        },
        draw(c,o,hero,focus=[]){
            c.save();
            if(o.art==='railing'){c.translate(o.x,o.y);c.rotate(o.angle||0);c.strokeStyle='#657b76';c.lineWidth=3;c.beginPath();c.moveTo(-22,-24);c.lineTo(22,-24);c.moveTo(-22,-13);c.lineTo(22,-13);c.moveTo(-20,0);c.lineTo(-20,-30);c.stroke();c.restore();return;}
            if(o.kind==='street-signal'){c.translate(o.x,o.y);c.fillStyle='#58615c';c.fillRect(-3,-65,6,65);c.fillStyle='#303b3a';c.fillRect(-10,-76,20,43);for(let i=0;i<2;i++){c.beginPath();c.arc(0,-65+i*20,6,0,Math.PI*2);c.fillStyle=i===0?(o.green?'#663d37':'#eb7558'):(o.green?'#9de09b':'#354f43');c.fill();}c.restore();return;}
            if(o.kind==='street-actor'){
                const vehicle=o.route.kind==='vehicle',w=vehicle?96:42,h=vehicle?65:66,key=o.route.art||(vehicle?'car':null),entry=assets.content.cityStreetArt?.entries?.[key];
                if(vehicle){c.fillStyle='#30352d26';c.beginPath();c.ellipse(o.x+8,o.y+3,43,12,0,0,Math.PI*2);c.fill();c.translate(o.x,o.y);if(Math.cos(o.angle)<0)c.scale(-1,1);if(!entry||!assets.draw(c,{id:entry.id},-w/2,-h,w,h,true,false)){c.fillStyle='#608d8e';c.beginPath();c.roundRect(-38,-30,76,30,10);c.fill();}}
                else{
                    let actor=people.get(o.id);if(!actor){actor=createHeroActor(hashSeed(o.id));people.set(o.id,actor);}
                    const pose=updateHeroActor(actor,{id:o.id,x:o.x,y:o.y,dx:o.moving?o.dx:0,dy:o.moving?o.dy:0,time:o.time,facing:facingToward(Math.cos(o.angle),Math.sin(o.angle)),npcs:hero?[{id:'hero',...hero}]:[],reducedMotion:o.reducedMotion});
                    c.fillStyle='#263b3026';c.beginPath();c.ellipse(o.x,o.y,19,7,0,0,Math.PI*2);c.fill();
                    // Same layered hero renderer, geometry and size as the player.
                    const result=assets.hero?.drawSave(c,{...o.profile,facing:pose.facing},o.x,o.y,o.time,o.moving,1,{head:pose.head,breath:pose.breath,walkTime:o.walkTime,reducedMotion:o.reducedMotion,nameBounds:false});
                    actor.ready=!!result?.ready;
                    if(!result?.ready)assets.tile?.(c,'sprites',(o.profile?.appearance==='girl'?12:8)+pose.facing,o.x-34,o.y-78,68,78);
                }
                c.restore();return;
            }
            const b=streetObjectBounds(o),covered=[hero,...focus].some(p=>p&&p.x>o.x-o.w*.46&&p.x<o.x+o.w*.46&&p.y<o.y&&p.y>o.y+(o.imageOffsetY||0)-o.h+15);
            if(covered&&(o.type==='building'||o.type==='tree'||o.occludes===true))c.globalAlpha=.30;
            if(o.footprint&&active?.streetscape.theme!=='south-china'){path(c,o.footprint);c.fillStyle='#85786733';c.fill();}
            if(!paintFrame(c,o)){
                c.fillStyle=o.type==='tree'?'#648565':'#b8a488';c.beginPath();c.roundRect(o.x-o.w*.4,o.y-o.h*.7,o.w*.8,o.h*.7,8);c.fill();
            }
            for(const component of o.components||[])paintFrame(c,{...component,x:o.x+component.x,y:o.y+component.y});
            if(o.label&&!covered){c.fillStyle='#f0dfb7';c.fillRect(o.x-Math.min(80,o.w*.38),o.y-46,Math.min(160,o.w*.76),22);c.fillStyle='#4e5145';c.font='13px Microsoft YaHei,sans-serif';c.textAlign='center';c.fillText(o.label,o.x,o.y-30,Math.min(150,o.w*.72));}
            c.restore();
        }
    };
}
