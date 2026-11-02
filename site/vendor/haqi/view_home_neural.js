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
// Roof tiles are world-aligned so adjacent cells read as one glazed roof; `mask`
// (N=1,E=2,S=4,W=8 neighbours) adds gold eaves/ridges only on the outer edges.
export function paintNeuralMaterial(c,type,x,y,w,h,mask=15){
 c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
 if(type==='roof'){paintGlazedRoof(c,x,y,w,h,mask);c.restore();return;}
 const gradient=c.createLinearGradient(x,y,x+w,y+h);
 gradient.addColorStop(0,'#fff8e5');gradient.addColorStop(.42,'#f1e4c8');gradient.addColorStop(1,'#dacaab');
 c.fillStyle=gradient;c.fillRect(x,y,w,h);
 if(type==='floor'){c.strokeStyle='#bca573';c.lineWidth=.8;c.strokeRect(x+2,y+2,w-4,h-4);}
 else{line(c,[[x,y+h-5],[x+w,y+h-5]],2,'#c4a366');line(c,[[x,y+5],[x+w,y+5]],1,'#e7cc8f');}
 c.restore();
}
const ROW=15,TILE=19;
function paintGlazedRoof(c,x,y,w,h,mask){
 c.fillStyle='#3f9893';c.fillRect(x,y,w,h);
 const top=Math.floor(y/ROW)*ROW;
 for(let ry=top;ry<y+h;ry+=ROW){
  const row=Math.round(ry/ROW),offset=row%2?TILE/2:0;
  const band=c.createLinearGradient(0,ry,0,ry+ROW);
  band.addColorStop(0,'#9fdccf');band.addColorStop(.35,'#5fb3aa');band.addColorStop(.85,'#2f8582');band.addColorStop(1,'#246b6c');
  c.fillStyle=band;
  const left=Math.floor((x-offset)/TILE)*TILE+offset;
  for(let tx=left;tx<x+w;tx+=TILE){
   // Rounded tile lip at the bottom of each course.
   c.beginPath();c.moveTo(tx,ry);c.lineTo(tx+TILE,ry);c.lineTo(tx+TILE,ry+ROW-3);
   c.quadraticCurveTo(tx+TILE/2,ry+ROW+2,tx,ry+ROW-3);c.closePath();c.fill();
   c.fillStyle='rgba(235,255,246,.5)';c.fillRect(tx+3,ry+2.5,TILE*.38,2);c.fillStyle=band;
  }
  line(c,[[x,ry+ROW-.5],[x+w,ry+ROW-.5]],1.2,'rgba(20,66,66,.45)');
 }
 // Gentle light falloff across the whole roof (world-space, so seams stay hidden).
 const shade=c.createLinearGradient(0,y,0,y+h);shade.addColorStop(0,'rgba(255,248,220,.10)');shade.addColorStop(1,'rgba(10,50,52,.10)');
 c.fillStyle=shade;c.fillRect(x,y,w,h);
 const gold='#d9b45e',goldDark='#9c7a35';
 if(!(mask&1)){c.fillStyle=goldDark;c.fillRect(x,y,w,6);c.fillStyle=gold;c.fillRect(x,y,w,4);c.fillStyle='#fff1c2';c.fillRect(x,y,w,1.4);}
 if(!(mask&4)){c.fillStyle='rgba(18,56,56,.5)';c.fillRect(x,y+h-10,w,4);c.fillStyle=goldDark;c.fillRect(x,y+h-6,w,6);c.fillStyle=gold;c.fillRect(x,y+h-6,w,3.4);c.fillStyle='#fff1c2';c.fillRect(x,y+h-6,w,1);}
 if(!(mask&8)){c.fillStyle=gold;c.fillRect(x,y,3.6,h);c.fillStyle='rgba(255,241,194,.75)';c.fillRect(x+3.6,y,1.4,h);}
 if(!(mask&2)){c.fillStyle=goldDark;c.fillRect(x+w-3.6,y,3.6,h);c.fillStyle='rgba(16,52,52,.28)';c.fillRect(x+w-9,y,5.4,h);}
}
