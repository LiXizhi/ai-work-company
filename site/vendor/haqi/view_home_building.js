import {paintNeuralMaterial} from './view_home_neural.js';
import {WALL_AO_RADIUS} from './home_building_ao_core.js';
import {buildingBounds,buildingWallFeet,isEdge} from './home_building_core.js';
// The same painter runs in the live canvas and the background raster worker.
export function buildingVisualBounds(o,item){
 const s=o.sizeScale??1,b=buildingBounds(o,item),wall=isEdge(item),height=item.art?.kind==='sprite'?(item.building.spriteHeight||1)*s:wall?1.25*s:item.building.type==='roof'?1.4:0;
 const w=wall?40*s:b.w*40,h=wall?40*s:b.h*40;
 return {x:o.x*40-4,y:(o.y-height)*40-4,w:w+8,h:h+height*40+8};
}
export function drawBuilding(c,item,o,image,connections=0,ao=[]){
 const s=o.sizeScale??1,b=buildingBounds(o,item),x=o.x*40,y=o.y*40,cellW=40*s,cellH=40*s;
 const type=item.building.type,style=item.building.style,wall=isEdge(item),height=(type==='fence'?28:50)*s,crop=item.art?.crop;
 const neural=item.building.theme==='neural-city';
 const baseColor=neural?'#f2e7cd':style==='wood'?'#b38856':'#858c95',topColor=neural?'#fff5da':style==='wood'?'#cfa36e':'#a3aab3',trimColor=neural?'#bf9b54':style==='wood'?'#755637':'#626971',skirtColor=style==='wood'?'rgba(62,41,22,0.34)':'rgba(44,50,58,0.34)';
 c.save();
 const hasImg=Boolean(image&&crop&&(image.naturalWidth||image.width)&&image.complete!==false);
 if(item.art?.kind==='sprite'){
  const h=(item.building.spriteHeight||1)*cellH,vertical=(o.rotation||0)%2;
  // Preserve alpha openings in railings and arches; don't fill an opaque rectangle behind them.
  if(hasImg){
   if(type==='stairs'){c.translate(x+cellW/2,y+cellH/2);c.rotate((o.rotation||0)*Math.PI/2);c.drawImage(image,...crop,-cellW/2,-cellH/2,cellW,cellH);}
   else if(wall){for(const foot of buildingWallFeet(o,connections))c.drawImage(image,...crop,foot.x*40,(foot.y+foot.h)*40-h,foot.w*40,h);}
   else{const w=vertical&&['beam','arch'].includes(type)?cellW*.22:cellW;c.drawImage(image,...crop,x+(cellW-w)/2,y+cellH-h,w,h);}
  }
  c.restore();return buildingVisualBounds(o,item);
 }
 const fill=(dx,dy,dw,dh)=>{
  if(dw<=0||dh<=0)return;
  c.fillStyle=baseColor;c.fillRect(dx,dy,dw,dh);
  if(neural)paintNeuralMaterial(c,type,dx,dy,dw,dh,typeof connections==='number'?connections&15:15);
  else if(hasImg)c.drawImage(image,...crop,dx,dy,dw,dh);
 };
 if(!wall){
  if(type==='roof'){
   fill(x,y-56,b.w*40,b.h*40);
  }else{
   const mask=typeof connections==='number'?connections&15:15;
   c.fillStyle=skirtColor;
   if(!(mask&1))c.fillRect(x,y-3,cellW,3);
   if(!(mask&4))c.fillRect(x,y+cellH,cellW,4);
   if(!(mask&8))c.fillRect(x-3,y,3,cellH);
   if(!(mask&2))c.fillRect(x+cellW,y,3,cellH);
   fill(x,y,b.w*40,b.h*40);
   c.fillStyle=topColor;
   if(!(mask&1))c.fillRect(x,y,cellW,2);
   if(!(mask&8))c.fillRect(x,y,2,cellH);
   c.fillStyle=trimColor;
   if(!(mask&4))c.fillRect(x,y+cellH-3,cellW,3);
   if(!(mask&2))c.fillRect(x+cellW-2,y,2,cellH);
   drawFloorAO(c,b,ao);
  }
  c.restore();
  return buildingVisualBounds(o,item);
 }
 const feet=buildingWallFeet(o,connections);
 const t=7.2*s,verticalFoot=feet.find(f=>f.vertical),horizontalFoot=feet.find(f=>!f.vertical);
 const hx=verticalFoot?verticalFoot.x*40:x+(cellW-t)/2,hy=horizontalFoot?horizontalFoot.y*40:y+(cellH-t)/2,cx=hx+t/2,cy=hy+t/2;
 const horiz=Boolean(horizontalFoot);
 const drawPlinth=(rx,ry,rw,rh)=>{
  c.fillStyle=skirtColor;c.fillRect(rx-2,ry+rh-1,rw+4,4);
  c.fillStyle=trimColor;c.fillRect(rx-1,ry+rh-3,rw+2,3);
 };
 const drawWallBox=(rx,ry,rw,rh)=>{
  drawPlinth(rx,ry,rw,rh);
  // Extrude the ground footprint: side walls have a continuous thin top,
  // not a full front-facing facade stretched along the north/south axis.
  fill(rx,ry+rh-height,rw,height);
  c.fillStyle=topColor;c.fillRect(rx,ry-height,rw,rh);
  c.fillStyle=trimColor;
  c.fillRect(rx,ry-height,rw,1.5);
  c.fillRect(rx,ry+rh-height,rw,1.5);
 };
 if(type==='door'&&o.doorOpen){
  if(horiz){
   drawWallBox(x,hy,Math.round(9*s),t);
   drawWallBox(x+cellW-Math.round(9*s),hy,Math.round(9*s),t);
   drawWallBox(x+Math.round(7*s),hy-Math.round(14*s),Math.round(6*s),Math.round(16*s));
  }else{
   drawWallBox(hx,y,t,Math.round(9*s));
   drawWallBox(hx,y+cellH-Math.round(9*s),t,Math.round(9*s));
   drawWallBox(hx>x+cellW/2?hx-Math.round(16*s):hx+t,y+Math.round(7*s),Math.round(16*s),Math.round(6*s));
  }
  c.restore();
  return buildingVisualBounds(o,item);
 }
 for(const f of feet)drawWallBox(f.x*40,f.y*40,f.w*40,f.h*40);
 if(type==='window'){
  const wx=horiz?cx-10*s:hx+2,wy=(horiz?hy:cy)-height*.68,ww=horiz?20*s:Math.max(4,t-4),wh=height*.38;
  c.fillStyle=trimColor;c.fillRect(wx-2,wy-2,ww+4,wh+4);
  c.fillStyle=neural?'#6bbcb3':'rgba(175,226,245,0.78)';c.fillRect(wx,wy,ww,wh);
  c.fillStyle=trimColor;
  if(horiz)c.fillRect(wx+ww/2-1,wy,2,wh);
  c.fillRect(wx,wy+wh/2-1,ww,2);
 }else if(type==='door'){
  const dx=horiz?cx-9*s:hx+1,dy=(horiz?hy+t:cy+8*s)-height*.76,dw=horiz?18*s:Math.max(5,t-2),dh=height*.76;
  c.fillStyle=trimColor;c.fillRect(dx-2,dy-2,dw+4,dh+2);
  c.fillStyle=neural?'#387d7c':style==='wood'?'#8c5e35':'#5c4a38';c.fillRect(dx,dy,dw,dh);
  c.fillStyle='#f0c869';c.fillRect(dx+dw-5,dy+dh*.52,3,3);
 }
 c.restore();
 return buildingVisualBounds(o,item);
}

// Baked into the existing ground bitmap; no extra compositing layer or bitmap allocation.
function drawFloorAO(c,floor,walls){
 if(!walls.length)return;
 c.save();c.beginPath();c.rect(floor.x*40,floor.y*40,floor.w*40,floor.h*40);c.clip();
 const radius=WALL_AO_RADIUS*40;
 for(const wall of walls){const x=wall.x*40,y=wall.y*40,w=wall.w*40,h=wall.h*40;
  const band=(ax,ay,bx,by,rx,ry,rw,rh)=>{const gradient=c.createLinearGradient(ax,ay,bx,by);gradient.addColorStop(0,'rgba(38,27,19,0.30)');gradient.addColorStop(.35,'rgba(38,27,19,0.13)');gradient.addColorStop(1,'rgba(38,27,19,0)');c.fillStyle=gradient;c.fillRect(rx,ry,rw,rh);};
  if(wall.vertical){band(x,y,x-radius,y,x-radius,y,radius,h);band(x+w,y,x+w+radius,y,x+w,y,radius,h);}
  else{band(x,y,x,y-radius,x,y-radius,w,radius);band(x,y+h,x,y+h+radius,x,y+h,w,radius);}
  c.fillStyle='rgba(38,27,19,0.30)';c.fillRect(x,y,w,h);
 }
 c.restore();
}
