// Project-native procedural artwork. No raster downloads, generated lettering or random state.
const TAU=Math.PI*2,clamp=x=>Math.max(0,Math.min(1,x));
function line(c,points,color,width=2){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
function ellipse(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,TAU);c.fillStyle=color;c.fill();}
export function drawHanziGlyph(c,glyph,x,y,size,progress=1,color='#293e39'){
 c.save();c.translate(x,y);c.scale(size/1024,size/1024);c.translate(0,900);c.scale(1,-1);
 for(let i=0;i<glyph.strokes.length;i++){
  const q=clamp(progress*glyph.strokes.length-i),path=new Path2D(glyph.strokes[i]);
  c.save();c.globalAlpha*=.065;c.fillStyle=color;c.fill(path);c.restore();
  if(!q)continue;if(q===1){c.fillStyle=color;c.fill(path);continue;}c.save();c.clip(path);c.strokeStyle=color;c.lineWidth=170;c.lineCap='round';c.lineJoin='round';
  const points=glyph.medians[i],count=(points.length-1)*q;c.beginPath();c.moveTo(...points[0]);
  for(let j=1;j<=Math.floor(count);j++)c.lineTo(...points[j]);
  const k=Math.floor(count);if(k<points.length-1)c.lineTo(points[k][0]+(points[k+1][0]-points[k][0])*(count-k),points[k][1]+(points[k+1][1]-points[k][1])*(count-k));
  c.stroke();c.restore();
 }c.restore();
}
function tree(c,x,y,s,t,color){
 line(c,[[x,y],[x-3*s,y-45*s],[x+2*s,y-95*s]],'#57634d',7*s);
 for(let i=0;i<8;i++){const dir=i%2?-1:1,py=y-30*s-i*7*s,px=x+dir*(20+i%3*9)*s;line(c,[[x,py+8*s],[px,py-15*s]],'#57634d',2*s);ellipse(c,px+Math.sin(t+i)*2,py-16*s,16*s,7*s,color);}
}
export function drawHanziMotif(c,theme,t=0,strength=1,color='#627f76'){
 c.save();c.globalAlpha*=strength;
 const moon=theme==='yue',water=['shui','yu','yun'].includes(theme),sky=['ri','yue','tian-sky','yun','yu'].includes(theme);
 if(sky){
  const g=c.createLinearGradient(0,0,0,420);g.addColorStop(0,moon?'#314d66':'#d9e6e1');g.addColorStop(1,moon?'#a7bac0':'#f5edda');c.fillStyle=g;c.fillRect(0,0,700,440);
  if(theme==='ri'||theme==='yue'){const glow=c.createRadialGradient(480,105,1,480,105,110);glow.addColorStop(0,moon?'#fff3d999':'#efc47099');glow.addColorStop(1,'#fff0');c.fillStyle=glow;c.fillRect(360,0,240,230);ellipse(c,480,105,39,39,moon?'#fff6d6':'#e4b660');if(moon)ellipse(c,499,93,32,33,'#405b71');}
 }
 // The distant hills and fine water lines unify the miniature worlds.
 for(let k=0;k<3;k++){c.beginPath();c.moveTo(0,350);for(let x=0;x<=700;x+=8)c.lineTo(x,260+k*32-Math.sin(x/110+k*1.7)*27-Math.sin(x/53)*9);c.lineTo(700,440);c.lineTo(0,440);c.fillStyle=['#74938b22','#698d8130','#567f7040'][k];c.fill();}
 if(['shan','shi'].includes(theme)){
  for(let i=0;i<3;i++){const x=330+i*115,y=theme==='shan'?140+(i%2)*50:282+(i%2)*15;c.beginPath();c.moveTo(x-90,355);c.lineTo(x-28,y+35);c.lineTo(x,y);c.lineTo(x+20,y+50);c.lineTo(x+100,355);c.fillStyle=['#57766a','#779183','#a4ad97'][i];c.fill();line(c,[[x,y+12],[x-5,y+75],[x+20,340]],'#f5f0dc88',2);}
 }
 if(water||moon||theme==='shui'){
  for(let i=0;i<12;i++){const y=280+i*10;const points=Array.from({length:51},(_,j)=>[j*14,y+Math.sin(j*.27+t*.7+i)*3]);line(c,points,i%3?'#6794a044':'#f9f1dbaa',i%3?1:2);}
 }
 if(['yun','yu','tian-sky'].includes(theme))for(let k=0;k<3;k++){const x=330+k*90+Math.sin(t*.3+k)*12,y=80+k%2*35;for(let j=0;j<4;j++)ellipse(c,x+j*21,y-Math.sin(j)*12,36,14,'#fffff5b0');}
 if(theme==='yu')for(let i=0;i<30;i++){const x=330+(i*47)%320,y=150+(i*29+t*65)%210;line(c,[[x,y],[x-4,y+14]],'#5e899b77',1.5);}
 if(theme==='huo'){
  c.fillStyle='#5f6251';c.fillRect(477,274,8,95);c.fillRect(453,268,58,6);c.strokeStyle='#967446';c.lineWidth=3;c.strokeRect(454,202,55,66);
  const glow=c.createRadialGradient(480,243,2,480,243,90);glow.addColorStop(0,'#f7c35cb0');glow.addColorStop(1,'#ec964400');c.fillStyle=glow;c.fillRect(380,143,200,200);
  for(let j=0;j<3;j++){c.beginPath();c.moveTo(480,265);c.bezierCurveTo(440+j*7,252,490,222,476+Math.sin(t*3)*5,209+j*9);c.bezierCurveTo(500,232,514-j*6,251,480,265);c.fillStyle=['#cd714b','#e6a54e','#ffe4a0'][j];c.fill();}
 }
 if(['mu','tu'].includes(theme)){tree(c,470,350,theme==='tu'?.45:1.65,t,color);if(theme==='tu')for(let i=0;i<4;i++)line(c,[[390+i*35,351],[410+i*35,362],[397+i*35,378]],'#af916f',2);}
 if(theme==='ren'){for(let i=0;i<2;i++){const x=430+i*92;ellipse(c,x,244,15,16,color);line(c,[[x,263],[x,305],[x-20,346]],color,7);line(c,[[x,305],[x+22,346]],color,7);line(c,[[x-24,290],[x,275],[x+26,287]],color,6);}line(c,[[456,284],[495,282]],'#c3a167',2);}
 if(theme==='kou'){ellipse(c,476,260,70,45,'#f8edcf');c.strokeStyle=color;c.lineWidth=3;c.strokeRect(420,233,110,55);for(let i=0;i<3;i++){c.beginPath();c.arc(554,260,12+i*10,-.7,.7);c.stroke();}}
 if(theme==='shou'){line(c,[[430,341],[445,295],[428,270],[433,256],[456,275],[456,226],[465,218],[472,276],[479,218],[487,218],[488,278],[496,235],[504,238],[505,286],[517,259],[525,264],[516,309],[493,341]],color,5);}
 if(theme==='mu-eye'){c.beginPath();c.ellipse(475,272,85,39,0,0,TAU);c.strokeStyle=color;c.lineWidth=3;c.stroke();ellipse(c,475+Math.sin(t)*9,272,25,31,color);ellipse(c,484+Math.sin(t)*9,262,6,7,'#fff8e3');}
 if(theme==='er'){c.beginPath();c.moveTo(476,342);c.bezierCurveTo(420,328,452,297,433,270);c.bezierCurveTo(385,185,546,168,519,261);c.bezierCurveTo(511,296,489,282,476,342);c.strokeStyle=color;c.lineWidth=5;c.stroke();line(c,[[479,298],[469,272],[492,254],[489,220],[465,218]],color,3);}
 if(theme==='xin'){c.save();c.translate(474,280);const q=1+Math.sin(t*2.5)*.035;c.scale(q,q);c.beginPath();c.moveTo(0,65);c.bezierCurveTo(-120,-20,-35,-105,0,-38);c.bezierCurveTo(35,-105,120,-20,0,65);c.fillStyle=color;c.fill();c.restore();}
 if(theme==='men'){c.strokeStyle='#856f52';c.lineWidth=8;c.strokeRect(410,170,130,178);c.fillStyle='#d2bc84';c.fillRect(420,180,53,163);c.fillStyle='#a89572';c.fillRect(484,180,46,163);ellipse(c,462,267,3,3,'#5e624d');}
 if(theme==='tian-field'){c.fillStyle='#a1ae78';c.fillRect(364,222,255,131);for(let i=1;i<4;i++)line(c,[[364+i*64,222],[364+i*64,353]],'#f0dd9f',5);line(c,[[364,288],[619,288]],'#f0dd9f',5);for(let i=0;i<18;i++)line(c,[[380+(i%9)*27,245+Math.floor(i/9)*68],[384+(i%9)*27,237+Math.floor(i/9)*68]],'#637b55',2);}
 if(['shang','xia'].includes(theme)){const y=theme==='shang'?250-Math.sin(t*.45)*65:240+Math.sin(t*.45)*65;c.beginPath();c.moveTo(480,y-43);c.lineTo(517,y);c.lineTo(480,y+43);c.lineTo(443,y);c.closePath();c.fillStyle=color;c.fill();line(c,[[480,y+43],[490,y+70],[476,y+100],[488,365]],'#9c8969',1.5);}
 if(theme==='da'){const r=60+Math.sin(t*.6)*12;c.beginPath();c.arc(475,255,r,Math.PI,0);c.lineTo(475-r,255);c.fillStyle=color;c.fill();line(c,[[475,255],[475,327],[488,335],[499,325]],'#8a7755',4);}
 if(theme==='xiao'){const x=455+Math.sin(t*.5)*40;line(c,[[x-60,290],[x-40,315],[x+40,315],[x+60,290],[x-60,290]],color,4);line(c,[[x,290],[x,209],[x+40,280],[x,280]],'#b69d6e',3);}
 if(theme==='zhong'){c.strokeStyle=color;c.lineWidth=13;c.beginPath();c.arc(480,382,101,Math.PI,TAU);c.stroke();line(c,[[369,279],[590,279]],'#7e886c',6);ellipse(c,480,262,8,8,'#c28c58');}
 // Floating ink motes remain deterministic and never use combat randomness.
 for(let i=0;i<14;i++){const x=345+(i*53)%300,y=110+(i*73)%240-Math.sin(t*.4+i)*9;ellipse(c,x,y,1+i%2,1+i%2,'#bca76b66');}
 c.restore();
}
export function createHanziAnimation(canvas,character,glyph,{reduced=false,concealed=false,pinyin=true,onTime=()=>{}}={}){
 const c=canvas.getContext('2d');canvas.width=1050;canvas.height=660;let time=0,last=0,playing=!reduced,disposed=false,raf=0;
 function render(){
  c.setTransform(1.5,0,0,1.5,0,0);c.fillStyle='#f4eddb';c.fillRect(0,0,700,440);
  const t=time/1000,phase=reduced||concealed?1:clamp((t-2)/2);drawHanziMotif(c,character.animation.theme,t,phase,character.color);
  // Paper grain is algorithmic and fixed, so pause and replay are stable.
  for(let i=0;i<420;i++){const x=(i*137)%700,y=(i*83)%440;c.fillStyle='#78634208';c.fillRect(x,y,1+i%3,1);}
  const card=clamp((t-8)/2),size=230-card*55,x=65+card*175,y=94-card*15;
  if(card&&!concealed){c.save();c.globalAlpha=card;c.fillStyle='#fff9eae8';c.strokeStyle='#bb9b59';c.lineWidth=1.5;c.beginPath();c.roundRect(x-15,y-22,size+30,size+75,12);c.fill();c.stroke();c.restore();}
  if(!concealed)drawHanziGlyph(c,glyph,x,y,size,reduced?1:clamp(t/2.4),'#314b43');
  c.fillStyle='#496459';c.font='13px Georgia, serif';c.textAlign='left';if(!concealed&&pinyin)c.fillText(character.pinyin,x+20,y+size+25);
  onTime(time,playing);
 }
 function frame(now){if(disposed)return;if(playing&&!document.hidden){if(last)time=Math.min(10000,time+Math.min(60,now-last));if(time===10000)playing=false;render();}last=now;raf=requestAnimationFrame(frame);}
 render();raf=requestAnimationFrame(frame);
 return {collect(){concealed=false;time=reduced?10000:8000;playing=!reduced;render();},reveal(){concealed=false;render();},toggle(){playing=!playing;if(time>=10000)time=0;render();},seek(ms){time=Math.max(0,Math.min(10000,ms));playing=false;render();},replay(){time=0;playing=true;render();},get time(){return time;},dispose(){disposed=true;cancelAnimationFrame(raf);}};
}
