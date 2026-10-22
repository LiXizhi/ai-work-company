import {homeRiverCenterX,homeRiverCenterY,homeBridgeAt} from './home_core.js';
// Optional presentation skin: all coordinates use the original home-world rivers
// and bridge queries. This module never changes walkability, objects or schedules.
const TAU=Math.PI*2;
function oval(c,x,y,rx,ry,fill){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);if(fill){c.fillStyle=fill;c.fill();}}
function line(c,points,width,color){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.lineWidth=width;c.strokeStyle=color;c.stroke();}
export function paintNeuralHomeTerrain(c,seed,rect){
 c.save();c.lineJoin='round';c.lineCap='round';c.fillStyle='#eee7cf';c.fillRect(rect.x-4,rect.y-4,rect.w+8,rect.h+8);
 // Large ivory marble slabs with fine, world-aligned veins and chamfered seams.
 for(let y=Math.floor(rect.y/80)*80;y<rect.y+rect.h+80;y+=80){
  for(let x=Math.floor(rect.x/120)*120;x<rect.x+rect.w+120;x+=120){
   const parity=Math.abs(x/120+y/80)%3;
   c.fillStyle=['#f3ecdb','#f7f0df','#efe6d1'][parity];c.fillRect(x+1,y+1,118,78);
   line(c,[[x+1,y+78],[x+118,y+78],[x+118,y+1]],.7,'#c9b99788');
   line(c,[[x+14,y+29],[x+38,y+34],[x+63,y+31],[x+89,y+44]],.6,'#d0c9b52b');
  }
 }
 // Recessed gardens soften the marble terraces without introducing obstacles.
 for(const [x,y,rx,ry]of [[-480,180,78,112],[460,180,64,110],[-480,600,76,114],[460,620,64,100],[-330,-90,64,32],[325,-85,64,32]]){
  oval(c,x,y,rx+7,ry+7,'#c7b17a');oval(c,x,y-2,rx+4,ry+4,'#fff4d9');oval(c,x,y-3,rx,ry,'#b6c7a1');
  oval(c,x,y-6,rx-7,ry-6,'#cad7b3');
  for(let i=0;i<14;i++){const a=i/14*TAU,fx=x+Math.cos(a)*(rx-11),fy=y-6+Math.sin(a)*(ry-12);oval(c,fx,fy,3,2,i%3?'#fff0c9':'#e9b3a1');}
 }
 // Paved promenades link the plaza, residential rows and cultural landmarks.
 const roads=[[[0,-480],[0,960]],[[-650,0],[760,0]],[[-600,390],[760,390]],[[-600,810],[460,810]],[[-330,-65],[350,-65]]];
 for(const [w,color]of [[92,'#c0aa72'],[87,'#fff9e6'],[77,'#d9cba9'],[72,'#fcf4df']])for(const p of roads)line(c,p,w,color);
 for(const p of roads){line(c,p,2,'#72bfb488');}
 // Teal canals retain the exact collision-water centerlines and bridge locations.
 const north=[],east=[];
 for(let x=Math.floor((rect.x-140)/20)*20;x<=rect.x+rect.w+140;x+=20)north.push([x,homeRiverCenterY(seed,x/40)*40]);
 for(let y=Math.floor((rect.y-140)/20)*20;y<=rect.y+rect.h+140;y+=20)east.push([homeRiverCenterX(seed,y/40)*40,y]);
 for(const [w,color]of [[105,'#c9b17d'],[99,'#fff7dc'],[88,'#e5d8b6'],[77,'#a5d7c9'],[66,'#62b9b2'],[48,'#459d9d'],[22,'#368b90']])for(const pts of [north,east])line(c,pts,w,color);
 for(const pts of [north,east])for(let i=0;i<pts.length;i+=4){const [x,y]=pts[i];line(c,[[x-12,y-3],[x+8,y-3]],1,'#e3fff68a');}
 // Marble footbridges use the same placement queries as the base terrain.
 const bridges=new Map();
 for(let x=Math.floor((rect.x-160)/40);x<=Math.ceil((rect.x+rect.w+160)/40);x++){const b=homeBridgeAt(seed,x,Math.round(homeRiverCenterY(seed,x)));if(b)bridges.set('v:'+b.x,{x:b.x*40,y:b.y*40,w:76,h:128});}
 for(let y=Math.floor((rect.y-160)/40);y<=Math.ceil((rect.y+rect.h+160)/40);y++){const b=homeBridgeAt(seed,Math.round(homeRiverCenterX(seed,y)),y);if(b)bridges.set('h:'+b.y,{x:b.x*40,y:b.y*40,w:128,h:76});}
 for(const b of bridges.values()){
  const x=b.x-b.w/2,y=b.y-b.h/2;c.fillStyle='#9b946f55';c.fillRect(x+4,y+7,b.w,b.h);c.fillStyle='#c3a66a';c.fillRect(x,y,b.w,b.h);c.fillStyle='#fff2d3';c.fillRect(x+4,y+4,b.w-8,b.h-8);
  c.strokeStyle='#d6c49c';c.lineWidth=1;for(let yy=y+14;yy<y+b.h;yy+=16)line(c,[[x+5,yy],[x+b.w-5,yy]],1,'#d6c49c');
  for(const xx of [x+3,x+b.w-9])for(const yy of [y+3,y+b.h-9]){c.fillStyle='#c9a34f';c.fillRect(xx,yy,6,6);c.fillStyle='#69bcb3';c.fillRect(xx+1,yy+1,4,4);}
 }
 // Concentric gold inlay and a teal compass beneath the real central fountain.
 for(const [r,color]of [[151,'#c5ab71'],[146,'#fff7e2'],[137,'#d8c9a6'],[133,'#f9efd6']])oval(c,0,0,r,r*.69,color);
 for(const r of [48,64,111,128]){oval(c,0,0,r,r*.69);c.strokeStyle=r===64?'#7abfb3':'#c7ac72';c.lineWidth=r===64?3:1.5;c.stroke();}
 for(let i=0;i<16;i++){const a=i/16*TAU;line(c,[[Math.cos(a)*65,Math.sin(a)*45],[Math.cos(a)*132,Math.sin(a)*91]],1,'#c8b789');}
 oval(c,0,0,45,31,'#93d3c5');oval(c,0,0,38,25,'#d4efe0');
 c.restore();
}

// Repeating materials for the existing connected building mesh. No new footprint.
export function paintNeuralMaterial(c,type,x,y,w,h){
 c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
 const roof=type==='roof';
 const gradient=c.createLinearGradient(x,y,x+w,y+h);
 gradient.addColorStop(0,roof?'#9dd5c8':'#fff8e5');gradient.addColorStop(.42,roof?'#5aa9a4':'#f1e4c8');gradient.addColorStop(1,roof?'#2e777d':'#dacaab');
 c.fillStyle=gradient;c.fillRect(x,y,w,h);
 if(roof){
  for(let yy=y;yy<y+h;yy+=10){line(c,[[x,yy],[x+w,yy]],1,'#d6bd7c');line(c,[[x,yy+2],[x+w,yy+2]],.7,'#daf6df55');}
  line(c,[[x+1,y],[x+1,y+h]],1.4,'#e5c77e');line(c,[[x+w-1,y],[x+w-1,y+h]],1.4,'#b09350');
  line(c,[[x+6,y+2],[x+w*.6,y+h-2]],2,'#d2f5e738');
 }else{
  if(type==='floor'){c.strokeStyle='#bca573';c.lineWidth=.8;c.strokeRect(x+2,y+2,w-4,h-4);}
  else{line(c,[[x,y+h-5],[x+w,y+h-5]],2,'#c4a366');line(c,[[x,y+5],[x+w,y+5]],1,'#e7cc8f');}
 }
 c.restore();
}
