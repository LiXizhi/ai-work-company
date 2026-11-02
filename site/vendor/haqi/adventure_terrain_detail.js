import { createRng, hashSeed } from './rng_core.js';
import { regionAt, segmentDistance, onLargeIsland } from './adventure_island_layout_core.js';

// Presentation-only texture. Cells include their neighbours so every brush mark
// is reproduced on both sides of a cache boundary, including its soft fringe.
function* cells(world,rect,cell,tag,paint){
    for(let gy=Math.floor((rect.y-cell)/cell);gy<=Math.floor((rect.y+rect.h+cell)/cell);gy++){
        for(let gx=Math.floor((rect.x-cell)/cell);gx<=Math.floor((rect.x+rect.w+cell)/cell);gx++){
            paint(gx*cell,gy*cell,createRng(hashSeed(`${world.zone}:${tag}:${gx}:${gy}`)));yield;
        }
    }
}
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
function stroke(c,x,y,length,bend,color,width=1){
    c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);
    c.quadraticCurveTo(x+length*.5,y+bend,x+length,y);c.stroke();
}
function wash(c,x,y,rx,ry,color){
    c.save();c.translate(x,y);c.scale(rx,ry);
    const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,color);g.addColorStop(1,color.slice(0,7)+'00');
    ellipse(c,0,0,1,1,g);c.restore();
}

export function paintGroundDetail(...args){for(const step of paintGroundDetailSteps(...args)) {}}
export function* paintGroundDetailSteps(c,world,rect){
    const refined=world.layout.rules.terrain.campRefined===true;
    yield* cells(world,rect,96,'soil',(cx,cy,rng)=>{
        const x=cx+rng.float()*96,y=cy+rng.float()*96;
        const biome=regionAt(world,{x,y})?.biome||'grass';
        const snow=['snow','ice'].includes(biome),sand=['beach','desert','gold'].includes(biome)||!onLargeIsland(world,x,y,world.layout.rules.terrain.coastWidth/2+20);
        const barren=['volcanic','ash','dark'].includes(biome);
        const shade=snow?'#80acc329':sand?'#96713c26':barren?'#3d34472b':refined?'#3e662e34':'#386a3438';
        const light=snow?'#ffffff66':sand?'#ffe2a63b':barren?'#ac939325':refined?'#dce88c44':'#bcda6c3d';
        wash(c,x,y,48+rng.float()*42,22+rng.float()*20,shade);
        wash(c,x-18,y-16,42,24,light);
        for(let i=0;i<(refined?36:58);i++){
            const px=cx+rng.float()*96,py=cy+rng.float()*96;
            ellipse(c,px,py,.5+rng.float()*1.7,.4+rng.float()*.7,i%3?light:shade);
        }
        if(snow||sand){
            for(let i=0;i<4;i++)stroke(c,x-25+i*6,y+i*5,20+rng.float()*22,-3,light,1);
        }else if(!barren){
            for(let i=0;i<(refined?12:9);i++){
                const px=cx+rng.float()*96,py=cy+rng.float()*96,h=3.5+rng.float()*5.5;
                c.strokeStyle=i%2?'#315b3662':'#e4eea668';c.lineWidth=1;
                c.beginPath();c.moveTo(px-3,py-h*.7);c.lineTo(px,py);c.lineTo(px+2,py-h);c.stroke();
            }
            if(refined){
                for(let i=0;i<3;i++){
                    const fx=cx+rng.float()*96,fy=cy+rng.float()*96;
                    const petal=rng.pick(['#fff5c0cc','#a8dcffcc','#ffd1dccc']);
                    ellipse(c,fx,fy,1.8,1.3,petal);ellipse(c,fx,fy,.8,.6,'#f6b83b');
                }
            }
        }
        for(let i=0;i<2;i++){
            const px=cx+rng.float()*96,py=cy+rng.float()*96,r=1.4+rng.float()*2;
            ellipse(c,px+1,py+1,r+1,r*.65,shade);
            ellipse(c,px,py,r,r*.6,snow?'#e9f7f5aa':sand?'#ebd4a080':'#c2c6a074');
        }
    });
}

export function paintWaterDetail(...args){for(const step of paintWaterDetailSteps(...args)) {}}
export function* paintWaterDetailSteps(c,world,rect,material='water',ocean=false){
    const ice=material==='ice',lava=material==='lava',dark=material==='dark';
    const shine=ice?'#efffff75':lava?'#ffe59b83':dark?'#bed8ed32':'#d8fff14d';
    yield* cells(world,rect,128,`water-${material}`,(cx,cy,rng)=>{
        const x=cx+rng.float()*128,y=cy+rng.float()*128;
        wash(c,x,y,70,36,lava?'#d3432636':dark?'#202d4d30':ice?'#388cb421':'#096d9230');
        wash(c,x+22,y-10,48,19,lava?'#ffe99332':'#74edd32b');
        for(let i=0;i<(ocean?9:13);i++){
            const px=cx+rng.float()*128,py=cy+rng.float()*128,len=8+rng.float()*30;
            if(ice){
                c.strokeStyle=shine;c.lineWidth=.8;c.beginPath();c.moveTo(px,py);c.lineTo(px+len*.4,py-5);c.lineTo(px+len,py-2);c.stroke();
            }else{
                stroke(c,px,py,len,2+rng.float()*3,shine,.7+rng.float()*.6);
                if(i%3===0)stroke(c,px+4,py+4,len*.6,2,lava?'#b5462930':'#12617d24',1);
            }
        }
    });
}

export function paintRoadDetail(...args){for(const step of paintRoadDetailSteps(...args)) {}}
export function* paintRoadDetailSteps(c,world,rect,textured=false){
    const refined=world.layout.rules.terrain.campRefined===true;
    // Sparse irregular shoulders break up ruler-straight edges. World-space
    // sampling and nearest-network distance also keep crossroads free of seams.
    yield* cells(world,rect,64,'road-verge',(cx,cy,rng)=>{
        const nearby=world.paths.filter(p=>segmentDistance({x:cx+32,y:cy+32},p.a,p.b)<p.width/2+64);
        if(!nearby.length)return;
        for(let i=0;i<22;i++){
            const x=cx+rng.float()*64,y=cy+rng.float()*64;
            const edge=Math.min(...nearby.map(p=>segmentDistance({x,y},p.a,p.b)-p.width/2));
            if(edge<-8||edge>11)continue;
            const color=world.layout.rules.roads.layers[edge>1?1:2][1];
            ellipse(c,x,y,1.2+rng.float()*3.2,.7+rng.float()*1.5,color+'70');
            if(edge>-2&&edge<7&&i%3===0){
                const rx=2.6+rng.float()*2.6,ry=1.6+rng.float()*1.4;
                ellipse(c,x+1,y+1.2,rx+.8,ry+.6,'#5c523836');
                ellipse(c,x,y,rx,ry,refined?'#efe2bc96':'#e5d6ae80');
                ellipse(c,x-.6,y-.5,rx*.55,ry*.5,'#fff9e670');
            }
        }
    });
    // A single union clip keeps intersections clean, including parallel spurs.
    c.save();c.beginPath();
    for(const p of world.paths){
        const dx=p.b.x-p.a.x,dy=p.b.y-p.a.y,len=Math.hypot(dx,dy)||1,r=Math.max(2,p.width/2-5);
        const nx=-dy/len*r,ny=dx/len*r;
        c.moveTo(p.a.x-nx,p.a.y-ny);c.lineTo(p.b.x-nx,p.b.y-ny);
        c.lineTo(p.b.x+nx,p.b.y+ny);c.lineTo(p.a.x+nx,p.a.y+ny);c.closePath();
        c.moveTo(p.a.x+r,p.a.y);c.arc(p.a.x,p.a.y,r,0,Math.PI*2);
        c.moveTo(p.b.x+r,p.b.y);c.arc(p.b.x,p.b.y,r,0,Math.PI*2);
    }
    c.clip();
    // A painted road material already carries its own slabs and grit.
    if(textured){c.restore();return;}
    yield* cells(world,rect,96,'path',(cx,cy,rng)=>{
        if(!world.paths.some(p=>segmentDistance({x:cx+48,y:cy+48},p.a,p.b)<p.width/2+100))return;
        wash(c,cx+48,cy+48,65,35,'#b2925b24');
        // Subtle hand-laid flagstone / cobblestone slabs along the road surface.
        for(let i=0;i<10;i++){
            const sx=cx+8+rng.float()*80,sy=cy+8+rng.float()*80,srx=6+rng.float()*5,sry=3.6+rng.float()*2.8;
            ellipse(c,sx+1,sy+1,srx+.8,sry+.5,'#7d653e24');
            ellipse(c,sx,sy,srx,sry,i%2?'#f7ebd038':'#d7be8e30');
            ellipse(c,sx-1.5,sy-1,srx*.55,sry*.45,'#fff9e636');
        }
        for(let i=0;i<35;i++){
            const x=cx+rng.float()*96,y=cy+rng.float()*96,r=.6+rng.float()*2;
            ellipse(c,x,y,r,r*.55,i%3?'#94794e29':'#fff4ce78');
        }
    });
    c.restore();
}

export function paintShoreDetail(...args){for(const step of paintShoreDetailSteps(...args)) {}}
export function* paintShoreDetailSteps(c,world,rect){
    const {coast,rules}=world.layout,half=rules.terrain.coastWidth/2;
    yield* cells(world,rect,64,'shore-verge',(cx,cy,rng)=>{
        const nearby=[];
        coast.forEach(([x,y],i)=>{
            const next=coast[(i+1)%coast.length],a={x,y},b={x:next[0],y:next[1]};
            if(segmentDistance({x:cx+32,y:cy+32},a,b)<half+70)nearby.push([a,b]);
        });
        if(!nearby.length)return;
        for(let i=0;i<24;i++){
            const x=cx+rng.float()*64,y=cy+rng.float()*64;
            const distance=Math.min(...nearby.map(([a,b])=>segmentDistance({x,y},a,b)));
            if(Math.abs(distance-half)>12)continue;
            ellipse(c,x,y,1+rng.float()*4,.7+rng.float()*1.6,rules.terrain.sand+'60');
        }
    });
}

export function paintRiverBank(c,world,rect,river,palette){
    const r=river.width/2;
    river.points.slice(1).forEach(([bx,by],i)=>{
        const [ax,ay]=river.points[i],length=Math.hypot(bx-ax,by-ay);
        if(!length)return;
        const dx=(bx-ax)/length,dy=(by-ay)/length;
        const rng=createRng(hashSeed(`${world.zone}:bank:${ax}:${ay}:${bx}:${by}`));
        for(let d=12;d<length;d+=18){
            const side=rng.int(0,1)?1:-1,offset=r+3+rng.float()*16;
            const x=ax+dx*d-dy*offset*side,y=ay+dy*d+dx*offset*side,size=1+rng.float()*2.5;
            if(x<rect.x-6||x>rect.x+rect.w+6||y<rect.y-6||y>rect.y+rect.h+6)continue;
            ellipse(c,x+1,y+1,size+1,size*.65,palette.edge+'70');
            ellipse(c,x,y,size,size*.6,palette.bank);
            stroke(c,x-2,y-1,size,0,'#fff4d568',.7);
        }
    });
}
