import {drawHanziGlyph} from './hanzi_animation.js';
export function createHanziWriting(canvas,glyph,{hint=true,onChange=()=>{},keyboard=false,preserveOnDemo=false,demoStrokeMs=0,onDemo=()=>{}}={}){
 const c=canvas.getContext('2d');canvas.width=600;canvas.height=600;canvas.style.touchAction='none';
 let strokes=[],active=null,pointer=null,showHint=hint,disabled=false,demo=0,demoGlyph=null,timer=0,demoTick=null,demoStroke=0,demoTotal=0,cursor=[.5,.5];
 const abort=new AbortController(),standard=new Set();
 function paint(){
  c.clearRect(0,0,600,600);c.fillStyle='#fffbef';c.fillRect(0,0,600,600);c.strokeStyle='#d4c8ac';c.lineWidth=1.5;c.setLineDash([8,8]);
  for(const path of [[[300,0],[300,600]],[[0,300],[600,300]],[[0,0],[600,600]],[[600,0],[0,600]]]){c.beginPath();c.moveTo(...path[0]);c.lineTo(...path[1]);c.stroke();}c.setLineDash([]);
  if(showHint||demo){c.save();c.globalAlpha=demo?.7:.15;drawHanziGlyph(c,demoGlyph||glyph,0,0,600,demo||1);c.restore();}
  c.lineWidth=13;c.strokeStyle='#345b50';c.lineCap='round';c.lineJoin='round';
  if(!(demo&&preserveOnDemo&&!demoGlyph)){
   strokes.forEach((stroke,index)=>{
    if(standard.has(index))drawHanziGlyph(c,{strokes:[glyph.strokes[index]],medians:[glyph.medians[index]]},0,0,600,1,'#345b50');
    else{c.beginPath();stroke.forEach(([x,y],i)=>i?c.lineTo(x*600,y*600):c.moveTo(x*600,y*600));c.stroke();}
   });
   if(active){c.beginPath();active.forEach(([x,y],i)=>i?c.lineTo(x*600,y*600):c.moveTo(x*600,y*600));c.stroke();}
  }
  if(keyboard&&document.activeElement===canvas){c.strokeStyle='#b58329';c.lineWidth=2;c.beginPath();c.arc(cursor[0]*600,cursor[1]*600,6,0,Math.PI*2);c.stroke();}
 }
 const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
 function stopDemo(){clearInterval(timer);timer=0;demoTick=null;if(demo){demo=0;demoGlyph=null;onDemo(false);paint();}}
 canvas.addEventListener('pointerdown',e=>{if(disabled||pointer!==null||e.button>0)return;e.preventDefault();stopDemo();pointer=e.pointerId;active=[point(e)];canvas.setPointerCapture(pointer);paint();},{signal:abort.signal});
 canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointer||!active)return;if(active.length<4096)active.push(point(e));paint();},{signal:abort.signal});
 canvas.addEventListener('pointerup',e=>{if(e.pointerId!==pointer||!active)return;active.push(point(e));strokes.push(active);active=null;pointer=null;paint();onChange(strokes.length);},{signal:abort.signal});
 canvas.addEventListener('pointercancel',()=>{active=null;pointer=null;paint();},{signal:abort.signal});
 canvas.addEventListener('lostpointercapture',()=>{if(active){active=null;pointer=null;paint();}},{signal:abort.signal});
 if(keyboard){
  canvas.tabIndex=0;canvas.addEventListener('focus',paint,{signal:abort.signal});canvas.addEventListener('blur',()=>{if(pointer==='keyboard'){active=null;pointer=null;}paint();},{signal:abort.signal});
  canvas.addEventListener('keydown',e=>{
   if(disabled||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();stopDemo();
   if(e.key===' '){if(pointer==='keyboard'){active.push([...cursor]);strokes.push(active);active=null;pointer=null;onChange(strokes.length);}else if(pointer===null){pointer='keyboard';active=[[...cursor]];}}
   else{const step=e.shiftKey?1/600:10/600;cursor=[Math.max(0,Math.min(1,cursor[0]+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0))),Math.max(0,Math.min(1,cursor[1]+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)))];if(pointer==='keyboard'&&active.length<4096)active.push([...cursor]);}paint();
  },{signal:abort.signal});
 }
 paint();
 return {get strokes(){return structuredClone(strokes);},confirmStroke(index){if(!Number.isInteger(index)||index<0||index>=strokes.length||index>=glyph.strokes.length)return;standard.add(index);paint();},restore(value){stopDemo();standard.clear();strokes=structuredClone(value);active=null;pointer=null;paint();onChange(strokes.length);},hint(value){showHint=value;paint();},clear(){stopDemo();standard.clear();strokes=[];active=null;pointer=null;paint();onChange(0);},undo(){stopDemo();standard.delete(strokes.length-1);strokes.pop();paint();onChange(strokes.length);},disable(value){disabled=value;if(value)stopDemo();},stopDemonstration:stopDemo,pauseDemonstration(){if(!demo||!timer)return;clearInterval(timer);timer=0;onDemo(true,demoStroke,demoTotal,true);},resumeDemonstration(){if(disabled||!demo||timer||!demoTick)return;onDemo(true,demoStroke,demoTotal,false);timer=setInterval(demoTick,40);},demonstrate({strokeIndex}={}){
  if(disabled)return;const single=strokeIndex!==undefined;if(single&&(!Number.isInteger(strokeIndex)||strokeIndex<0||strokeIndex>=glyph.strokes.length))return;clearInterval(timer);demoGlyph=single?{strokes:[glyph.strokes[strokeIndex]],medians:[glyph.medians[strokeIndex]]}:null;if(!preserveOnDemo){strokes=[];standard.clear();}active=null;pointer=null;demo=.001;
  const total=Math.max(1,glyph.strokes.length),step=demoStrokeMs>0?40/(demoStrokeMs*(single?1:total)):.012;let stroke=single?strokeIndex+1:1;
  demoStroke=stroke;demoTotal=total;onDemo(true,stroke,total);paint();const tick=()=>{if(demoTick!==tick||!timer)return;demo+=step;paint();if(demo>=1){stopDemo();return;}const next=single?stroke:Math.min(total,Math.floor(demo*total)+1);if(next!==stroke){stroke=next;demoStroke=stroke;onDemo(true,stroke,total);}};demoTick=tick;timer=setInterval(tick,40);
 },dispose(){abort.abort();clearInterval(timer);timer=0;demo=0;demoTick=null;disabled=true;}};
}
