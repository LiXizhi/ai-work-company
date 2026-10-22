import { residents, loadNames, saveName, cleanName } from './world-state.mjs';
import { loadRig, pauseBackgroundScene } from './world-rig.mjs';
import {createWorldScene} from './world-scene.mjs';
import {socialActions} from './vendor/haqi/adventure_social_actions_core.js';
const $=id=>document.getElementById(id);
let storage;try{storage=window.localStorage;}catch{storage=null;}
let names=loadNames(storage), selected=residents[0], activeAgent=residents[0], toastTimer;
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
let paused=motionQuery.matches;
let worldScene=null;
const actorViews=new Map();
// Session observations only; never a financial ledger.
const journal=[], observedActivity=new Map();
let observedEvent=0;
function recordActivity(ids,message){
  journal.unshift({ids,message,time:new Date()});
  if(journal.length>200)journal.length=200;
}
function observeActivity(){
  for(const actor of worldScene.state.actors){
    const id=actor.profile.id;
    if(observedActivity.get(id)!==actor.activityLabel){
      observedActivity.set(id,actor.activityLabel);
      recordActivity([id],actor.activityLabel);
    }
  }
  const event=worldScene.state.event;
  if(event?.sequence && event.sequence!==observedEvent){
    observedEvent=event.sequence;
    if(event.type==='gesture'){
      const action=socialActions.find(a=>a.id===event.action);
      recordActivity(event.ids,event.ids.map(id=>displayName(residents.find(r=>r.id===id))).join(' 与 ')+' · '+(action?.label||event.action));
    }
  }
}
function renderLogs(){
  const list=$('logs-list');list.replaceChildren();
  const entries=journal.filter(entry=>entry.ids.includes($('logs-agent').value));
  for(const entry of entries){
    const item=node('li','');
    const time=node('time','',entry.time.toLocaleTimeString('zh-CN',{hour12:false}));
    time.dateTime=entry.time.toISOString();
    item.append(time,node('span','',entry.message));list.append(item);
  }
  if(!entries.length)list.append(node('li','logs-empty','还没有活动记录。场景加载后，居民的行动会记录在这里。'));
}
$('logs-toggle').addEventListener('click',()=>{
  $('logs-agent').replaceChildren(...residents.map(r=>{
    const option=node('option','',displayName(r)+'.'+(r.id==='astra'?'gpt':r.id));option.value=r.id;return option;
  }));
  $('logs-agent').value=activeAgent.id;renderLogs();$('logs-dialog').showModal();
});
$('logs-agent').addEventListener('change',renderLogs);
const displayName=r=>names[r.id]||r.name;
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function art(el,r){el.style.backgroundPosition=`${r.index*100/3}% 50%`;}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2800);}

function setActiveAgent(r){
  activeAgent=r;
  worldScene?.selectAgent(r.id);
  document.querySelectorAll('[data-command-agent]').forEach(btn=>{
    const on=btn.dataset.commandAgent===r.id;
    btn.classList.toggle('active',on);
    btn.setAttribute('aria-pressed',String(on));
  });
  paintActors(clock/1000,true);
}

function commandAgentTo(r,target,toastPrefix){
  if(!worldScene)return;
  setActiveAgent(r);
  const res=worldScene.direct(r.id,target);
  if(res?.ok){
    toast(`${toastPrefix||`已指派 ${displayName(r)} 前往「${res.target.label}」`}；抵达稍作停留后将恢复自主活动。`);
    paintActors(clock/1000,true);
  }else{
    toast('该位置暂时无法通行，请点击草地、道路、桥面或房屋室内空地。');
  }
}

function renderResidents(){
  $('actors').replaceChildren();actorViews.clear();
  for(const r of residents){
    const actor=node('button','actor');actor.type='button';actor.style.left=`${r.x}px`;actor.style.top=`${r.y}px`;actor.style.zIndex=String(Math.round(r.y));actor.style.setProperty('--accent',r.color);actor.dataset.resident=r.id;actor.setAttribute('aria-label',`${displayName(r)}，${r.homeName}，${r.family}，编辑名字或指派行动`);
    const tag=node('span','nametag',`${displayName(r)}.${r.id==='astra'?'gpt':r.id}`);
    actor.append(tag);
    actorViews.set(r.id,{actor,resident:r,tag});
    actor.addEventListener('click',()=>{setActiveAgent(r);openCharacter(r);});$('actors').append(actor);
  }
  paintActors(0,true);
}
function paintActors(time,still=false){
  if(!worldScene)return;
  const scenePaused=pauseBackgroundScene({stage:'world',hidden:document.hidden,dialog:document.querySelector('dialog[open]')});
  const positions=worldScene.render(time,{paused:still||paused||scenePaused});
  for(const {actor,point} of positions){const view=actorViews.get(actor.profile.id);view.actor.style.left=`${point.x}px`;view.actor.style.top=`${point.y}px`;view.actor.style.zIndex=String(Math.round(point.y));}
  observeActivity();
}

function openCharacter(r){selected=r;$('character-vendor').textContent=r.family;$('character-title').textContent=displayName(r);$('character-description').textContent=r.description;$('character-role').textContent=`✧ ${r.role} · 专属家园：${r.homeName}`;$('character-name').value=displayName(r);$('name-status').textContent='';art($('portrait'),r);$('character-dialog').showModal();}
$('dialog-go-home')?.addEventListener('click',()=>{
  if(!selected||!worldScene)return;
  $('character-dialog').close();
  const h=worldScene.world.homes[selected.id];
  worldScene.focusHome(selected.id);
  if(h)commandAgentTo(selected,{cellX:h.indoor.x,cellY:h.indoor.y,label:h.name},`已让 ${displayName(selected)} 回到「${h.name}」`);
});
$('dialog-go-plaza')?.addEventListener('click',()=>{
  if(!selected||!worldScene)return;
  $('character-dialog').close();
  worldScene.focusScene('plaza');
  commandAgentTo(selected,{cellX:0,cellY:0.6,label:'中央广场'},`已让 ${displayName(selected)} 前往「中央广场」`);
});
$('name-form').addEventListener('submit',event=>{
  event.preventDefault();const name=cleanName($('character-name').value);
  if(!name){$('name-status').textContent='请输入 1–20 个可见字符。';$('character-name').focus();return;}
  try{names=saveName(storage,names,selected.id,name);$('name-status').textContent='已保存，刷新页面后名字仍会保留。';}
  catch{names={...names,[selected.id]:name};$('name-status').textContent='浏览器存储不可用；名字仅在本次访问生效。';}
  renderResidents();$('character-title').textContent=name;toast(`你好，${name}。欢迎来到小城。`);
});
for(const dialog of document.querySelectorAll('dialog')){
  dialog.querySelector('.dialog-close')?.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});
}
const viewport=$('viewport');
function renderView(){paintActors(clock/1000,true);}
let drag=null;
viewport.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0)return;drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
viewport.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6)drag.moved=true;worldScene?.pan(dx,dy);drag.x=e.clientX;drag.y=e.clientY;renderView();});
function endDrag(e){
  if(drag&&!drag.moved&&e?.type==='pointerup'&&worldScene){
    const rect=viewport.getBoundingClientRect();
    const worldPoint=worldScene.unproject(e.clientX-rect.left,e.clientY-rect.top);
    commandAgentTo(activeAgent||residents[0],worldPoint);
  }
  drag=null;
  viewport.classList.remove('dragging');
}
viewport.addEventListener('pointerup',endDrag);viewport.addEventListener('pointercancel',endDrag);viewport.addEventListener('lostpointercapture',endDrag);
viewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)return;e.preventDefault();worldScene?.zoom(Math.exp(-e.deltaY*.001));renderView();},{passive:false});
let frame=null,clock=0,last=0;
new ResizeObserver(renderView).observe(viewport);
function draw(time){frame=null;if(paused||document.hidden)return;clock+=Math.min(40,time-last||16);last=time;paintActors(clock/1000);frame=requestAnimationFrame(draw);}
function syncMotion(){document.body.classList.toggle('paused',paused);if(frame)cancelAnimationFrame(frame);frame=null;last=0;if(!paused&&!document.hidden)frame=requestAnimationFrame(draw);else paintActors(clock/1000,true);}
motionQuery.addEventListener('change',e=>{paused=e.matches;syncMotion();});document.addEventListener('visibilitychange',syncMotion);
window.addEventListener('storage',e=>{if(e.key==='awc.world.names.v1'){names=loadNames(storage);renderResidents();}});

renderResidents();renderView();syncMotion();
loadRig().then(rig=>createWorldScene($('world-canvas'),rig,displayName)).then(scene=>{worldScene=scene;worldScene.selectAgent(activeAgent.id);document.body.classList.add('scene-ready');paintActors(clock/1000,true);}).catch(error=>{console.error(error);toast('场景资源加载失败，请刷新重试。');});

// Static Pages keeps the task guide; a self-hosted server exposes the live market.
fetch('v1/market').then(res=>res.ok?res.json():null).then(market=>{
  if(market?.stats) $('tasks-link').href='company/';
}).catch(()=>{});
