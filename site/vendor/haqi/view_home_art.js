import {paintNeuralHomeTerrain} from './view_home_neural.js';
// Home furniture sprite renderer + baked static Haqi island terrain, river, road, plaza & bridge texture tile painter.
import {createRng,hashSeed} from './rng_core.js';
import {homeBiomeAt,homeBridgeAt,homeInteractiveKind,homeRiverCenterX,homeRiverCenterY,homeRoadAt,homeWaterAt} from './home_core.js';
import {paintBridges} from './adventure_bridge.js';
import {paintStaticShadows} from './adventure_shadows.js';

export const HOME_FURNITURE_SCALE=1.6;
export const HOME_GROUND_SCALE=1.15;

const COLOR_HEX={
 red:'#e35d52',
 blue:'#5393d9',
 green:'#58b368',
 yellow:'#ebbd3f',
 pink:'#ea8ab8',
 purple:'#9975d4',
 white:'#f5f4ef',
 orange:'#ed8b3b',
 brown:'#9a6b44'
};

const INDOOR_CATEGORIES=new Set(['bedroom','kitchen','bathroom','living']);
const OUTDOOR_EXCEPTIONS=new Set(['picnic-table','hot-spring']);

const tintCache=new Map();

function tintedSprite(image,crop,colorHex){
 if(!colorHex||!image?.complete||!image.naturalWidth)return null;
 const [sx,sy,sw,sh]=crop||[0,0,image.naturalWidth,image.naturalHeight];
 const key=`${image.src}:${sx},${sy},${sw},${sh}:${colorHex}`;
 if(tintCache.has(key))return tintCache.get(key);
 if(typeof document==='undefined')return null;
 if(tintCache.size>=32)tintCache.delete(tintCache.keys().next().value);
 const c=document.createElement('canvas');
 const scale=Math.min(1,192/Math.max(sw,sh,1));
 c.width=Math.max(1,Math.round(sw*scale));
 c.height=Math.max(1,Math.round(sh*scale));
 const g=c.getContext('2d');
 g.drawImage(image,sx,sy,sw,sh,0,0,c.width,c.height);
 g.globalCompositeOperation='source-atop';
 g.fillStyle=colorHex;
 g.globalAlpha=.34;
 g.fillRect(0,0,c.width,c.height);
 g.globalCompositeOperation='source-over';
 g.globalAlpha=1;
 tintCache.set(key,c);
 return c;
}

function drawInteractiveEffect(ctx,kind,w,h,now=0){
 if(!kind)return;
 ctx.save();
 if(kind==='light'){
  const pulse=.78+Math.sin(now*3.4)*.22;
  const r=Math.max(w,h)*.82;
  const g=ctx.createRadialGradient(0,-h*.18,2,0,-h*.18,r);
  g.addColorStop(0,`rgba(255,244,178,${(.52*pulse).toFixed(3)})`);
  g.addColorStop(.55,`rgba(255,210,102,${(.24*pulse).toFixed(3)})`);
  g.addColorStop(1,'rgba(255,190,70,0)');
  ctx.fillStyle=g;
  ctx.beginPath();
  ctx.arc(0,-h*.18,r,0,Math.PI*2);
  ctx.fill();
 }else if(kind==='music'){
  for(let i=0;i<3;i++){
   const phase=(now*1.15+i*.33)%1;
   const nx=(i-1)*w*.24+Math.sin(now*2.6+i)*6;
   const ny=-h*.28-phase*26;
   ctx.globalAlpha=Math.sin(phase*Math.PI)*.9;
   ctx.fillStyle=i%2?'#ffd966':'#8be8ff';
   ctx.beginPath();
   ctx.ellipse(nx,ny,4.2,3.1,-.35,0,Math.PI*2);
   ctx.fill();
   ctx.strokeStyle=ctx.fillStyle;
   ctx.lineWidth=1.8;
   ctx.beginPath();
   ctx.moveTo(nx+3.5,ny);
   ctx.lineTo(nx+3.5,ny-10);
   ctx.lineTo(nx+8.5,ny-8);
   ctx.stroke();
  }
 }else if(kind==='water'){
  for(let i=0;i<3;i++){
   const p=(now*1.4+i*.33)%1;
   ctx.strokeStyle=`rgba(165,238,255,${((1-p)*.72).toFixed(3)})`;
   ctx.lineWidth=1.8;
   ctx.beginPath();
   ctx.ellipse(0,-h*.05,w*(.16+p*.32),h*(.09+p*.18),0,0,Math.PI*2);
   ctx.stroke();
  }
 }else if(kind==='cook'){
  for(let i=0;i<3;i++){
   const p=(now*.95+i*.33)%1;
   const sx=(i-1)*w*.15+Math.sin(now*2+i*2)*4;
   const sy=-h*.22-p*24;
   ctx.fillStyle=`rgba(255,250,240,${(Math.sin(p*Math.PI)*.55).toFixed(3)})`;
   ctx.beginPath();
   ctx.arc(sx,sy,4+p*5,0,Math.PI*2);
   ctx.fill();
  }
 }else if(kind==='screen'){
  const pulse=.65+Math.sin(now*5)*.2;
  const g=ctx.createRadialGradient(0,-h*.15,2,0,-h*.15,Math.max(w,h)*.6);
  g.addColorStop(0,`rgba(130,225,255,${(.38*pulse).toFixed(3)})`);
  g.addColorStop(1,'rgba(130,225,255,0)');
  ctx.fillStyle=g;
  ctx.beginPath();
  ctx.arc(0,-h*.15,Math.max(w,h)*.6,0,Math.PI*2);
  ctx.fill();
 }
 ctx.restore();
}

// Geometry-only hit bounds, also used when a sprite is already baked into a texture.
export function homeObjectVisualBounds(item,object,x,y,w,h,isThumb=false){
 if(item.layer==='ground'&&!isThumb){const grow=1.04*HOME_GROUND_SCALE;return {x:x+w*(1-grow)/2,y:y+h*(1-grow)/2,w:w*grow,h:h*grow};}
 const [,,sw,sh]=item.art?.crop||[0,0,item.art?.width||1,item.art?.height||1];
 const indoor=!isThumb&&INDOOR_CATEGORIES.has(item.category)&&!OUTDOOR_EXCEPTIONS.has(item.id);
 const scale=Math.min(w*(isThumb?1.08:indoor?.82:1.24)/sw,h*(isThumb?1.08:indoor?.86:1.34)/sh)*(isThumb?1:HOME_FURNITURE_SCALE*(item.renderScale||1));
 const dw=sw*scale,dh=sh*scale,dy=isThumb?-dh/2:h*(indoor?.36:.46)-dh;
 return {x:x+w/2-dw/2,y:y+h/2+dy,w:dw,h:dh};
}

export function drawHomeObject(ctx,item,object,x,y,w,h,image,now=0,isThumb=false){
 const rot=(object?.rotation||0)%4;
 const colorHex=COLOR_HEX[object?.color]||null;
 const isGround=item.layer==='ground';
 const active=object?.active!==false;
 const kind=homeInteractiveKind(item.id);
 const isIndoor=!isThumb&&INDOOR_CATEGORIES.has(item.category)&&!OUTDOOR_EXCEPTIONS.has(item.id);

 ctx.save();
 ctx.translate(x+w/2,y+h/2);

 if(!isGround&&!isThumb){
  const shadowScale=isIndoor?.32:.42;
  ctx.fillStyle='rgba(24,42,26,0.22)';
  ctx.beginPath();
  ctx.ellipse(0,h*(isIndoor?.22:.28),w*shadowScale,Math.max(5,h*(isIndoor?.14:.18)),0,0,Math.PI*2);
  ctx.fill();
 }

 if(image?.complete&&image.naturalWidth){
  let bounds;
  const [sx,sy,sw,sh]=item.art?.crop||[0,0,image.naturalWidth,image.naturalHeight];
  const tinted=colorHex?tintedSprite(image,[sx,sy,sw,sh],colorHex):null;
  ctx.save();
  if(isGround&&!isThumb){
   if(rot)ctx.rotate(rot*Math.PI/2);
   const rw=rot%2?h:w,rh=rot%2?w:h;
   const grow=1.04*HOME_GROUND_SCALE;
   if(tinted)ctx.drawImage(tinted,-rw*grow/2,-rh*grow/2,rw*grow,rh*grow);
   else ctx.drawImage(image,sx,sy,sw,sh,-rw*grow/2,-rh*grow/2,rw*grow,rh*grow);
   bounds={x:x+w*(1-grow)/2,y:y+h*(1-grow)/2,w:w*grow,h:h*grow};
  }else{
   if(rot===1||rot===2)ctx.scale(-1,1);
   const multW=isThumb?1.08:isIndoor?.82:1.24;
   const multH=isThumb?1.08:isIndoor?.86:1.34;
   const furnitureScale=isThumb?1:HOME_FURNITURE_SCALE*(item.renderScale||1);
   const scale=Math.min((w*multW)/sw,(h*multH)/sh)*furnitureScale;
   const dw=sw*scale,dh=sh*scale;
   const dy=isThumb?-dh/2:(h*(isIndoor?.36:.46)-dh);
   bounds={x:x+w/2-dw/2,y:y+h/2+dy,w:dw,h:dh};
   if(tinted)ctx.drawImage(tinted,-dw/2,dy,dw,dh);
   else ctx.drawImage(image,sx,sy,sw,sh,-dw/2,dy,dw,dh);
  }
  ctx.restore();
  if(active&&kind&&!isThumb)drawInteractiveEffect(ctx,kind,w,h,now);
  ctx.restore();
  return bounds;
 }

 // Subtle loading placeholder while WebP atlas downloads
 ctx.fillStyle=colorHex||'#d9ceb8';
 ctx.strokeStyle='rgba(66,53,36,0.45)';
 ctx.lineWidth=1.5;
 ctx.beginPath();
 ctx.roundRect(-w*.38,-h*.38,w*.76,h*.76,8);
 ctx.fill();
 ctx.stroke();
 ctx.restore();
}

function oval(c,x,y,rx,ry,color){
 c.fillStyle=color;
 c.beginPath();
 c.ellipse(x,y,rx,ry,0,0,Math.PI*2);
 c.fill();
}

function line(c,points,width,color){
 if(points.length<2)return;
 c.strokeStyle=color;
 c.lineWidth=width;
 c.beginPath();
 points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));
 c.stroke();
}

function strokeCurve(c,x,y,length,bend,color,width=1){
 c.strokeStyle=color;
 c.lineWidth=width;
 c.beginPath();
 c.moveTo(x,y);
 c.quadraticCurveTo(x+length*.5,y+bend,x+length,y);
 c.stroke();
}

function wash(c,x,y,rx,ry,color){
 c.save();
 c.translate(x,y);
 c.scale(rx,ry);
 const g=c.createRadialGradient(0,0,0,0,0,1);
 g.addColorStop(0,color);
 g.addColorStop(1,color.slice(0,7)+'00');
 oval(c,0,0,1,1,g);
 c.restore();
}

function hits(rect,x0,y0,x1,y1){
 return x1>=rect.x&&x0<=rect.x+rect.w&&y1>=rect.y&&y0<=rect.y+rect.h;
}

// Paint the carved stone plaza at (0,0) matching Haqi Camp / Town plaza (adventure_camp_terrain.js)
function paintHomeCampPlaza(c,rect,envArt){
 const x=0,y=0,rx=112,ry=76;
 if(!hits(rect,x-rx-16,y-ry-16,x+rx+16,y+ry+16))return;
 const curb=['#ebe3c8','#d5ccb0'],curbLight='#fffdf099';
 const grad=['#f8f1dc','#e5dcc0','#cbc09f'];
 const tiles=['#fff8e42c','#9c8f6818','#efe4c626','#ffffff30'];
 const joint='#867c5c32',shine='#fff9e648',ring='#d6b04c99',ringLight='#fff4c8aa',node='#d8ae48';

 c.save();
 c.strokeStyle='#1f2c2234';
 c.lineWidth=10;
 c.beginPath();
 c.ellipse(x,y+4,rx+2,ry+2,0,0,Math.PI*2);
 c.stroke();
 for(let i=0;i<36;i++){
  const a0=i*Math.PI/18,a1=a0+Math.PI/18-.018;
  c.strokeStyle=curb[i%2];
  c.lineWidth=11;
  c.beginPath();
  c.ellipse(x,y,rx-5,ry-4,0,a0,a1);
  c.stroke();
  c.strokeStyle=curbLight;
  c.lineWidth=2.2;
  c.beginPath();
  c.ellipse(x,y,rx-9,ry-7,0,a0,a1);
  c.stroke();
 }
 c.beginPath();
 c.ellipse(x,y,rx-11,ry-9,0,0,Math.PI*2);
 c.clip();

 const baseGrad=c.createRadialGradient(x,y-14,16,x,y,rx);
 baseGrad.addColorStop(0,grad[0]);
 baseGrad.addColorStop(.68,grad[1]);
 baseGrad.addColorStop(1,grad[2]);
 c.fillStyle=baseGrad;
 c.fillRect(x-rx,y-ry,rx*2,ry*2);

 const cw=48,ch=24;
 for(let row=-4;row<=4;row++){
  for(let col=-3;col<=3;col++){
   const rng=createRng(hashSeed(`home:paving:${row}:${col}`));
   const px=x+col*cw+(row%2)*cw/2,py=y+row*ch;
   c.fillStyle=rng.pick(tiles);
   c.fillRect(px+2,py+2,cw-4,ch-4);
   c.strokeStyle=joint;
   c.lineWidth=1;
   c.beginPath();
   c.moveTo(px+cw,py);
   c.lineTo(px,py);
   c.lineTo(px,py+ch);
   c.stroke();
   c.strokeStyle=shine;
   c.beginPath();
   c.moveTo(px+2,py+ch-2);
   c.lineTo(px+cw-2,py+ch-2);
   c.stroke();
  }
 }
 c.strokeStyle=joint;
 c.lineWidth=1.3;
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6;
  c.beginPath();
  c.moveTo(x+Math.cos(a)*rx*.34,y+Math.sin(a)*ry*.34);
  c.lineTo(x+Math.cos(a)*(rx-14),y+Math.sin(a)*(ry-10));
  c.stroke();
 }
 c.strokeStyle=ring;
 c.lineWidth=2.2;
 c.beginPath();
 c.ellipse(x,y,rx*.68,ry*.68,0,0,Math.PI*2);
 c.stroke();
 c.strokeStyle=ringLight;
 c.lineWidth=1.1;
 c.beginPath();
 c.ellipse(x,y,rx*.68-3,ry*.68-2,0,0,Math.PI*2);
 c.stroke();
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4,nx=x+Math.cos(a)*rx*.68,ny=y+Math.sin(a)*ry*.68;
  oval(c,nx,ny,4.5,3.2,node);
  oval(c,nx-.7,ny-.5,1.8,1.2,'#ffffffcc');
 }
 if(envArt){
  envArt.draw(c,'camp','plazaMedallion',x-68,y-46,136,92);
 }
 c.restore();
}

// Deterministic, 100% static world-space terrain painter baked into texture tiles.
export function paintHomeWorldTerrain(c,seed,rect,envArt=null,decorArt=null,objects=[],theme=null){
 for(const step of paintHomeWorldTerrainSteps(c,seed,rect,envArt,decorArt,objects,theme)){}
}

export function* paintHomeWorldTerrainSteps(c,seed,rect,envArt=null,decorArt=null,objects=[],theme=null){
 if(theme==='neural-city'){paintNeuralHomeTerrain(c,seed,rect);yield;return;}
 c.save();
 c.lineJoin='round';
 c.lineCap='round';

 // 1. Smooth continuous Haqi island meadow base
 c.fillStyle='#8eb768';
 c.fillRect(rect.x-4,rect.y-4,rect.w+8,rect.h+8);

 yield;
 // 2. Large radial-gradient biome regions (adventure_large_terrain.js style)
 const baseRegions=[
  {x:0,y:160,rx:560,ry:460,color:'#98c270'},
  {x:-40,y:-540,rx:560,ry:340,color:'#9ec67b'},
  {x:-40,y:-580,rx:420,ry:260,color:'#e8c8d8'},
  {x:-660,y:-520,rx:580,ry:420,color:'#dceef5'},
  {x:640,y:-480,rx:580,ry:400,color:'#cba659'},
  {x:820,y:280,rx:540,ry:520,color:'#e4cc8e'},
  {x:780,y:-240,rx:460,ry:380,color:'#cfa95c'},
  {x:-820,y:280,rx:520,ry:520,color:'#769a88'},
  {x:-780,y:-220,rx:480,ry:380,color:'#d8ebf2'},
 ];
 for(const r of baseRegions){
  if(!hits(rect,r.x-r.rx*1.25,r.y-r.ry*1.25,r.x+r.rx*1.25,r.y+r.ry*1.25))continue;
  c.save();
  c.translate(r.x,r.y);
  c.scale(r.rx,r.ry);
  const g=c.createRadialGradient(0,0,.18,0,0,1.25);
  g.addColorStop(0,r.color);
  g.addColorStop(.62,r.color);
  g.addColorStop(1,r.color+'00');
  oval(c,0,0,1.25,1.25,g);
  c.restore();
 }

 yield;
 // 3. Haqi ground detail washes, soil flecks, grass blades & tiny 3-petal wildflowers
 const soilCell=96;
 const gx0=Math.floor((rect.x-soilCell)/soilCell),gx1=Math.floor((rect.x+rect.w+soilCell)/soilCell);
 const gy0=Math.floor((rect.y-soilCell)/soilCell),gy1=Math.floor((rect.y+rect.h+soilCell)/soilCell);
 for(let gy=gy0;gy<=gy1;gy++){
  yield;
  for(let gx=gx0;gx<=gx1;gx++){
   const cx=gx*soilCell,cy=gy*soilCell;
   const rng=createRng(hashSeed(`${seed}:soil:${gx}:${gy}`));
   const x=cx+rng.float()*soilCell,y=cy+rng.float()*soilCell;
   const bId=homeBiomeAt(seed,x/40,y/40).id;
   const snow=bId==='snow',sand=bId==='beach'||bId==='autumn',mystic=bId==='mystic';
   const shade=snow?'#80acc329':sand?'#96713c26':mystic?'#3d34472b':'#3e662e32';
   const light=snow?'#ffffff66':sand?'#ffe2a63b':mystic?'#ac939325':'#dce88c42';
   wash(c,x,y,48+rng.float()*42,22+rng.float()*20,shade);
   wash(c,x-18,y-16,42,24,light);
   for(let i=0;i<30;i++){
    const px=cx+rng.float()*soilCell,py=cy+rng.float()*soilCell;
    oval(c,px,py,.5+rng.float()*1.6,.4+rng.float()*.7,i%3?light:shade);
   }
   if(snow||sand){
    for(let i=0;i<3;i++)strokeCurve(c,x-24+i*6,y+i*5,20+rng.float()*20,-3,light,1);
   }else{
    for(let i=0;i<10;i++){
     const px=cx+rng.float()*soilCell,py=cy+rng.float()*soilCell,h=3.5+rng.float()*5;
     c.strokeStyle=i%2?'#315b365e':'#e4eea664';
     c.lineWidth=1;
     c.beginPath();
     c.moveTo(px-2.8,py-h*.7);
     c.lineTo(px,py);
     c.lineTo(px+2,py-h);
     c.stroke();
    }
    for(let i=0;i<3;i++){
     const fx=cx+rng.float()*soilCell,fy=cy+rng.float()*soilCell;
     const petal=rng.pick(bId==='blossom'?['#ffb7d5cc','#fff0f6cc','#a8dcffcc']:['#fff5c0cc','#a8dcffcc','#ffd1dccc']);
     oval(c,fx,fy,1.9,1.3,petal);
     oval(c,fx,fy,.8,.6,'#f6b83b');
    }
   }
   for(let i=0;i<2;i++){
    const px=cx+rng.float()*soilCell,py=cy+rng.float()*soilCell,r=1.4+rng.float()*1.8;
    oval(c,px+1,py+1,r+1,r*.65,shade);
    oval(c,px,py,r,r*.6,snow?'#e9f7f5aa':sand?'#ebd4a080':'#c2c6a074');
   }
  }
 }

 yield;
 // 4. Static Multi-Band Meandering Rivers anchored to global world step indices
 const stepX0=Math.floor((rect.x-160)/20),stepX1=Math.ceil((rect.x+rect.w+160)/20);
 const stepY0=Math.floor((rect.y-160)/20),stepY1=Math.ceil((rect.y+rect.h+160)/20);
 const northRiver=[];
 for(let step=stepX0;step<=stepX1;step++){
  const tx=step*.5;
  northRiver.push([tx*40,homeRiverCenterY(seed,tx)*40,step]);
 }
 const eastRiver=[];
 for(let step=stepY0;step<=stepY1;step++){
  const ty=step*.5;
  eastRiver.push([homeRiverCenterX(seed,ty)*40,ty*40,step]);
 }
 const rivers=[
  {tag:'n',pts:northRiver},
  {tag:'e',pts:eastRiver}
 ];
 const waterBands=[
  [124,'#d8cb9e1a'],
  [112,'#d8cb9e2c'],
  [100,'#d8cb9e44'],
  [90,'#d8cb9e'],
  [78,'#a3c5b3'],
  [68,'#58b0c0'],
  [52,'#4298b0'],
  [30,'#328099'],
 ];
 for(const [width,color] of waterBands){
  for(const {pts} of rivers)line(c,pts,width,color);
 }

 // Static river ripples, shoreline pebbles & water lilies (indexed by global world step!)
 for(const {tag,pts} of rivers){
  for(let i=1;i<pts.length;i++){
   const [x,y,step]=pts[i];
   if(((step%2)+2)%2!==0)continue;
   const [px,py]=pts[i-1];
   const dx=x-px,dy=y-py,len=Math.hypot(dx,dy)||1;
   const nx=-dy/len,ny=dx/len;
   const rng=createRng(hashSeed(`${seed}:river:${tag}:${step}`));
   strokeCurve(c,x-14,y-4,24+rng.float()*14,2.5,'#e0fff662',1.2);
   if(((step%8)+8)%8===2){
    strokeCurve(c,x-8,y+8,18+rng.float()*12,-2,'#ffffff45',1);
   }
   for(const side of [-1,1]){
    const bx=x+nx*side*(36+rng.float()*8),by=y+ny*side*(36+rng.float()*8);
    oval(c,bx+1,by+1,3.2,2.1,'#584c3530');
    oval(c,bx,by,2.8,1.8,side>0?'#cfc5a6aa':'#b8ae8eaa');
   }
   if(decorArt&&((step%14)+14)%14===0&&!homeBridgeAt(seed,x/40,y/40)){
    const sideSign=rng.float()>.5?1:-1;
    const lx=x+nx*18*sideSign,ly=y+ny*18*sideSign;
    const frame=rng.pick(['lilyPads','waterLily']);
    decorArt.draw(c,'shore',frame,lx-15,ly-15,30,30);
   }
  }
 }

 yield;
 // 5. Continuous Multi-Band Homestead Roads
 const nsRoad=[],weRoad=[];
 for(let ty=-11.5;ty<=6.5;ty+=.5)nsRoad.push([Math.sin(ty*.22)*10,ty*40]);
 for(let tx=-6.5;tx<=16.5;tx+=.5)weRoad.push([tx*40,Math.sin(tx*.22)*10]);
 const roads=[nsRoad,weRoad];
 const roadBands=[
  [68,'#b4b38320'],
  [60,'#8ea86848'],
  [52,'#b4b383'],
  [45,'#cebd91'],
  [37,'#dfcca0'],
  [26,'#e7d7ae'],
 ];
 for(const [width,color] of roadBands){
  for(const pts of roads)line(c,pts,width,color);
 }
 for(const pts of roads){
  for(let i=1;i<pts.length-1;i++){
   const [x,y]=pts[i];
   if(!hits(rect,x-48,y-48,x+48,y+48))continue;
   const rng=createRng(hashSeed(`${seed}:road:${i}:${pts===nsRoad?'ns':'we'}`));
   for(let k=0;k<2;k++){
    const sx=x+(rng.float()-.5)*22,sy=y+(rng.float()-.5)*22;
    const srx=6+rng.float()*4.5,sry=3.8+rng.float()*2.4;
    oval(c,sx+1,sy+1,srx+.8,sry+.5,'#7d653e22');
    oval(c,sx,sy,srx,sry,k%2?'#f7ebd044':'#d7be8e38');
    oval(c,sx-1.2,sy-.8,srx*.52,sry*.45,'#fff9e638');
   }
   for(const side of [-1,1]){
    if(rng.float()>.55)continue;
    const vx=x+(pts===nsRoad?side*(21+rng.float()*5):(rng.float()-.5)*16);
    const vy=y+(pts===weRoad?side*(21+rng.float()*5):(rng.float()-.5)*16);
    oval(c,vx+1,vy+1,3.4,2.2,'#5c523832');
    oval(c,vx,vy,2.8,1.8,'#efe2bc94');
   }
  }
 }

 yield;
 // 6. Carved Stone Rim & Radial Mason Plaza at (0,0)
 paintHomeCampPlaza(c,rect,envArt);

 yield;
 // 7. Authentic Haqi Timber Bridges across river crossings
 const bridges=[];
 const seenBridge=new Set();
 for(let tx=Math.floor((rect.x-160)/40);tx<=Math.ceil((rect.x+rect.w+160)/40);tx++){
  const ry=Math.round(homeRiverCenterY(seed,tx));
  const nb=homeBridgeAt(seed,tx,ry);
  if(nb){
   const key=`v:${nb.x}`;
   if(!seenBridge.has(key)){
    seenBridge.add(key);
    bridges.push({x:nb.x*40,y:nb.y*40,w:76,h:128,angle:null});
   }
  }
 }
 for(let ty=Math.floor((rect.y-160)/40);ty<=Math.ceil((rect.y+rect.h+160)/40);ty++){
  const rx=Math.round(homeRiverCenterX(seed,ty));
  const eb=homeBridgeAt(seed,rx,ty);
  if(eb){
   const key=`h:${eb.y}`;
   if(!seenBridge.has(key)){
    seenBridge.add(key);
    bridges.push({x:eb.x*40,y:eb.y*40,w:128,h:76,angle:0});
   }
  }
 }
 if(bridges.length){
  paintBridges(c,bridges,{edge:'#6d5739'},false,rect);
 }

 yield;
 // 8. Exact-frame WebP Ground Decorations baked into the terrain tile
 if(decorArt){
  const decoCell=136;
  const dx0=Math.floor((rect.x-decoCell)/decoCell),dx1=Math.floor((rect.x+rect.w+decoCell)/decoCell);
  const dy0=Math.floor((rect.y-decoCell)/decoCell),dy1=Math.floor((rect.y+rect.h+decoCell)/decoCell);
  for(let gy=dy0;gy<=dy1;gy++){
   yield;
   for(let gx=dx0;gx<=dx1;gx++){
    const rng=createRng(hashSeed(`${seed}:floor-deco:${gx}:${gy}`));
    if(rng.float()>.68)continue;
    const wx=gx*decoCell+20+rng.float()*(decoCell-40);
    const wy=gy*decoCell+20+rng.float()*(decoCell-40);
    const tx=wx/40,ty=wy/40;
    if(Math.hypot(tx,ty)<3.6)continue;
    const wInfo=homeWaterAt(seed,tx,ty);
    if(wInfo.water||wInfo.bank||homeRoadAt(seed,tx,ty).road||homeBridgeAt(seed,tx,ty))continue;
    const biome=homeBiomeAt(seed,tx,ty);
    const frame=rng.pick(biome.decoFrames||['daisies','clover','grass']);
    const size=30+rng.float()*12;
    if(biome.decoAtlas!=='meadow'){
     oval(c,wx,wy-size*.05,size*.38,size*.14,'#1d331f24');
    }
    c.save();
    c.translate(wx,wy);
    if(rng.float()>.5)c.scale(-1,1);
    decorArt.draw(c,biome.decoAtlas,frame,-size/2,-size*.68,size,size*.76);
    c.restore();
   }
  }
 }

 yield;
 paintHomeTreeShadows(c,seed,rect,objects);
 c.restore();
}

// Collect natural Haqi island trees around the perimeter for Y-sorted depth rendering
export function collectHomeWorldTrees(seed,rect,objects=[]){
 const treeCell=220;
 const gx0=Math.floor((rect.x-treeCell)/treeCell),gx1=Math.floor((rect.x+rect.w+treeCell)/treeCell);
 const gy0=Math.floor((rect.y-treeCell)/treeCell),gy1=Math.floor((rect.y+rect.h+treeCell)/treeCell);
 const list=[];
 for(let gy=gy0;gy<=gy1;gy++){
  for(let gx=gx0;gx<=gx1;gx++){
   const rng=createRng(hashSeed(`${seed}:island-tree:${gx}:${gy}`));
   if(rng.float()>.56)continue;
   const wx=gx*treeCell+32+rng.float()*(treeCell-64);
   const wy=gy*treeCell+32+rng.float()*(treeCell-64);
   const tx=wx/40,ty=wy/40;
   // Keep central homestead plaza & pet lawn open and unblocked
   if(Math.hypot(tx,ty)<6.8||(Math.abs(tx)<6.5&&ty>-2&&ty<14))continue;
   const wInfo=homeWaterAt(seed,tx,ty);
   if(wInfo.water||wInfo.bank||homeRoadAt(seed,tx,ty).road||homeBridgeAt(seed,tx,ty))continue;
   if(objects.some(o=>Math.hypot(o.x+.5-tx,o.y+.5-ty)<2.4))continue;
   const biome=homeBiomeAt(seed,tx,ty);
   const frame=rng.pick(biome.treeFrames||['tallPine','layeredPine','blossomTree']);
   const size=118+rng.float()*26;
   list.push({wx,wy,tx,ty,atlas:biome.treeAtlas||'campTrees',frame,size,flip:rng.float()>.5});
  }
 }
 return list;
}

export function drawHomeWorldTree(c,tree,px,py,scaleRatio,envArt,theme=null){
 if(!envArt)return;
 const size=tree.size*scaleRatio;
 c.save();
 c.translate(px,py);
 if(tree.flip)c.scale(-1,1);
 if(theme==='neural-city'){
  oval(c,0,3*scaleRatio,size*.25,size*.09,'#b49a61');
  oval(c,0,0,size*.26,size*.08,'#fff0cf');
  oval(c,0,-2*scaleRatio,size*.22,size*.06,'#7eaa8a');
  const frame=Math.abs(Math.round(tree.wx+tree.wy))%3?'cypressPine':'blossomTree';
  envArt.draw(c,'campTrees',frame,-size*.45,-size*.94,size*.9,size*.95);
 }else envArt.draw(c,tree.atlas,tree.frame,-size*.56,-size*1.04+8*scaleRatio,size*1.12,size*1.06);
 c.restore();
}


// Same two soft world-space shadows as outdoor trees, baked beneath all actors.
export function paintHomeTreeShadows(c,seed,rect,objects=[]){
 const trees=collectHomeWorldTrees(seed,rect,objects).map(t=>({x:t.wx,y:t.wy,size:t.size}));
 paintStaticShadows(c,{trees},rect);
}
