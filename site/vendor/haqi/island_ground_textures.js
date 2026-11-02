import {groundTexture} from './island_scene_art_core.js';

// Painted, seamlessly tiling ground materials for islands with layout.sceneArt.
// Patterns are anchored in world space so baked tiles join without seams, and
// the same code runs in the terrain worker and on the main thread.

function pattern(c,art,tex){
    const p=art?.pattern?.(c,tex.atlas,tex.frame);
    if(!p)return null;
    if(tex.scale!==1&&typeof DOMMatrix!=='undefined')p.setTransform(new DOMMatrix().scaleSelf(tex.scale,tex.scale));
    return p;
}
function scratch(c){
    const w=c.canvas.width,h=c.canvas.height;
    if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(w,h);
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;
}
function hits(rect,x0,y0,x1,y1){return x1>=rect.x&&x0<=rect.x+rect.w&&y1>=rect.y&&y0<=rect.y+rect.h;}

// Returns true when any texture was painted (callers may skip procedural speckle).
export function* paintGroundTexturesSteps(c,world,rect,art){
    const base=groundTexture(world,'base');
    if(!base||!art?.pattern)return false;
    const fill=pattern(c,art,base);
    if(!fill)return false;
    c.save();c.globalAlpha=base.alpha;c.fillStyle=fill;c.fillRect(rect.x,rect.y,rect.w,rect.h);c.restore();yield;
    let layer=null,lc=null;
    const plain=world.layout.sceneArt.ground.biomes||{};
    for(const r of world.layout.regions){
        if(plain[r.biome]===null){
            // Restore the untextured regional wash (snowfields, beaches, oases).
            if(!hits(rect,r.x-r.rx*1.25,r.y-r.ry*1.25,r.x+r.rx*1.25,r.y+r.ry*1.25))continue;
            c.save();c.translate(r.x,r.y);c.scale(r.rx,r.ry);
            const g=c.createRadialGradient(0,0,.2,0,0,1.25);g.addColorStop(0,r.color);g.addColorStop(.62,r.color);g.addColorStop(1,r.color+'00');
            c.fillStyle=g;c.beginPath();c.arc(0,0,1.25,0,Math.PI*2);c.fill();c.restore();yield;
            continue;
        }
        const tex=groundTexture(world,'biome',r.biome);
        if(!tex||tex.frame===base.frame&&tex.alpha===base.alpha)continue;
        if(!hits(rect,r.x-r.rx*1.25,r.y-r.ry*1.25,r.x+r.rx*1.25,r.y+r.ry*1.25))continue;
        if(!layer){layer=scratch(c);lc=layer.getContext('2d');}
        const p=pattern(lc,art,tex);
        if(!p)continue;
        lc.setTransform(1,0,0,1,0,0);lc.globalCompositeOperation='source-over';lc.clearRect(0,0,layer.width,layer.height);
        lc.setTransform(c.getTransform());lc.fillStyle=p;lc.fillRect(rect.x,rect.y,rect.w,rect.h);
        // Same soft radial falloff as the regional colour wash beneath it.
        lc.globalCompositeOperation='destination-in';
        lc.save();lc.translate(r.x,r.y);lc.scale(r.rx,r.ry);
        const g=lc.createRadialGradient(0,0,.2,0,0,1.25);g.addColorStop(0,'#000');g.addColorStop(.62,'#000');g.addColorStop(1,'#0000');
        lc.fillStyle=g;lc.beginPath();lc.arc(0,0,1.25,0,Math.PI*2);lc.fill();lc.restore();
        c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=tex.alpha;c.drawImage(layer,0,0);c.restore();yield;
    }
    if(layer){layer.width=layer.height=0;}
    return true;
}

// Fill the road union with the island's road material; caller supplies the clip path.
export function paintRoadTexture(c,world,rect,art){
    const tex=groundTexture(world,'road');
    if(!tex)return false;
    const fill=pattern(c,art,tex);
    if(!fill)return false;
    c.save();c.beginPath();
    for(const p of world.paths){
        const dx=p.b.x-p.a.x,dy=p.b.y-p.a.y,len=Math.hypot(dx,dy)||1,r=Math.max(2,p.width/2-3);
        const nx=-dy/len*r,ny=dx/len*r;
        c.moveTo(p.a.x-nx,p.a.y-ny);c.lineTo(p.b.x-nx,p.b.y-ny);c.lineTo(p.b.x+nx,p.b.y+ny);c.lineTo(p.a.x+nx,p.a.y+ny);c.closePath();
        c.moveTo(p.a.x+r,p.a.y);c.arc(p.a.x,p.a.y,r,0,Math.PI*2);
        c.moveTo(p.b.x+r,p.b.y);c.arc(p.b.x,p.b.y,r,0,Math.PI*2);
    }
    c.clip();c.globalAlpha=tex.alpha;c.fillStyle=fill;c.fillRect(rect.x,rect.y,rect.w,rect.h);c.restore();
    return true;
}

// Water material inside an already-applied water clip.
export function paintWaterTexture(c,world,rect,art,material){
    const tex=groundTexture(world,'water',material);
    if(!tex)return false;
    const fill=pattern(c,art,tex);
    if(!fill)return false;
    c.save();c.globalAlpha=tex.alpha;c.fillStyle=fill;c.fillRect(rect.x,rect.y,rect.w,rect.h);c.restore();
    return true;
}
