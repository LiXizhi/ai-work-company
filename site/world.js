import {residents,loadNames,saveName,cleanName,layoutNameplates} from './world-state.mjs?v=20261027-hud-clearance';
import {loadRig,pauseBackgroundScene} from './world-rig.mjs';
import {createWorldScene} from './world-scene.mjs';
import {createWorldMap} from './world-map.mjs';
import {socialActions} from './vendor/haqi/adventure_social_actions_core.js';
import {PERSONAS,MAX_ROLES,emptyRoles,validateRoles,createRole,renameRole,deleteRole,activateRole,activeRole,remoteCast} from './world-roles-core.mjs';
import {createKeepworkSession} from './keepwork-session.mjs';
import {createRoleStore} from './world-roles.mjs';
import {createWorldPresence,gatewayFromQuery} from './world-presence.mjs';

const $=id=>document.getElementById(id);
let storage;try{storage=window.localStorage;}catch{storage=null;}
const personaInfo=Object.fromEntries(residents.map(r=>[r.id,r]));
const personaPortraits={astra:'assets/avatars/gpt.webp',claude:'assets/avatars/claude.webp',deepseek:'assets/ainiang/2d/fullbody/deepseek-chibi.webp',gemini:'assets/avatars/gemini.webp'};
const personaLabel={astra:'GPT · OPENAI',claude:'CLAUDE · ANTHROPIC',deepseek:'DEEPSEEK',gemini:'GEMINI · GOOGLE'};
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
let paused=motionQuery.matches;
let names=loadNames(storage),worldScene=null,toastTimer,selectedProfile=null;
const actorViews=new Map();
let lastRemoteCount=-1;

/* ---------- Account, roles and presence ---------- */
let gateway;
try{gateway=gatewayFromQuery(location.search);}catch(error){gateway={url:undefined,dev:false};console.warn(error.message);}
const devUser=gateway.dev?cleanName(new URLSearchParams(location.search).get('dev-user')||''):'';
const keepwork=devUser?createDevSession(devUser):createKeepworkSession();
let account={username:null,signedIn:false},catalog=emptyRoles(),roleStore=null,presence=null,presenceMessage='';

// Loopback-only development identity for protocol testing against a local gateway.
function createDevSession(username){
 let signedIn=false;const listeners=new Set();
 const snap=()=>({username:signedIn?username:null,signedIn,version:0});
 return {snapshot:snap,onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},sdk:()=>null,
  async connect(){signedIn=true;for(const fn of listeners)fn(snap());return snap();},
  async logout(){signedIn=false;for(const fn of listeners)fn(snap());},
  credentials(){if(!signedIn)throw Error('signed_out');return {username,token:`dev-${username}`};}};
}
function createDevStore(owner){
 const key=`awc.dev.roles.${owner}`;
 return {async load(){try{return validateRoles(JSON.parse(storage?.getItem(key)||'null')||emptyRoles());}catch{return emptyRoles();}},
  async save(value){const clean=validateRoles(value);storage?.setItem(key,JSON.stringify(clean));return clean;}};
}
const ownedRole=()=>account.signedIn?activeRole(catalog):null;
const ownActor=()=>worldScene?.state.actors.find(a=>a.profile.kind==='mine')||null;

function applyCast(){
 if(!worldScene)return;
 const role=ownedRole();
 worldScene.setCast(role?[{id:'mine',persona:role.persona,kind:'mine',name:role.name,homeId:role.persona,homeIndex:PERSONAS.indexOf(role.persona),ownerName:account.username}]:null);
 if(!role)worldScene.setRemote([]);
 const mine=ownActor();
 if(mine){worldScene.selectAgent(mine.profile.id);worldScene.focus(mine.position);}
 syncPresence();renderAccount();paintActors(clock/1000,true);
}
function syncPresence(){
 const role=ownedRole();
 if(role&&!presence){
  presence=createWorldPresence({gatewayUrl:gateway.url,
   getOwner:()=>account.signedIn?account.username:null,getRole:ownedRole,getActor:ownActor,
   getCredentials:()=>keepwork.credentials(),
   onStatus:message=>{presenceMessage=message;renderStatus();},onChange:renderStatus});
  presence.start();
 }else if(!role&&presence){presence.stop();presence=null;}
 else presence?.refresh();
 renderStatus();
}
function renderStatus(){
 // Keep connection diagnostics on the account control.
 $('account-button').title=presenceMessage||'管理我的 Agent';
}
function renderAccount(){
 const role=ownedRole(),avatar=$('account-avatar');
 $('account-name').textContent=role?role.name:account.signedIn?account.username:'登录 Keepwork';
 $('account-role').textContent=account.signedIn?(role?`${personaLabel[role.persona].split(' · ')[0]} · ${account.username}`:'尚未选择 Agent'):'创建你的 Agent';
 avatar.classList.toggle('portrait',Boolean(role));
 $('account-button').classList.toggle('has-role',Boolean(role));
 if(role){portrait(avatar,role.persona);avatar.style.backgroundSize='cover';avatar.style.backgroundPosition='center 35%';}
 else{avatar.style.backgroundImage='';avatar.style.backgroundSize='';avatar.style.backgroundPosition='';}
}

async function signIn({interactive=true}={}){
 try{
  account=await keepwork.connect({interactive});
  if(!account.signedIn)return false;
  roleStore=devUser?createDevStore(account.username):createRoleStore({sdk:keepwork.sdk(),owner:account.username});
  catalog=await roleStore.load();
  try{storage?.setItem('awc.world.keepwork','1');}catch{}
  applyCast();
  return true;
 }catch(error){
  if(interactive)toast(error.message||'登录失败，请稍后重试。');
  account={username:null,signedIn:false};renderAccount();renderStatus();
  return false;
 }
}
keepwork.onChange(next=>{
 if(next.signedIn&&next.username===account.username)return;
 if(!next.signedIn&&account.signedIn){account={username:null,signedIn:false};catalog=emptyRoles();roleStore=null;applyCast();}
});
async function saveCatalog(next,success){
 const previous=catalog;catalog=next;
 try{catalog=await roleStore.save(next);if(success)toast(success);return true;}
 catch(error){catalog=previous;toast(error.message||'保存失败，请稍后重试。');return false;}
}

/* ---------- Roles screen ---------- */
let pendingRoleId=null,pickedPersona=PERSONAS[0];
// Partner artwork is UI presentation; persona IDs and shared world rigs stay stable.
function portrait(el,persona){el.style.backgroundImage=`url("${personaPortraits[persona]||personaPortraits.astra}")`;el.style.backgroundSize='contain';el.style.backgroundPosition='center';}

function renderRoles(){
 const grid=$('roles-grid');grid.replaceChildren();
 pendingRoleId=catalog.roles.some(r=>r.id===pendingRoleId)?pendingRoleId:catalog.activeId||catalog.roles[0]?.id||null;
 for(const role of catalog.roles){
  const card=node('div','role-card'+(role.id===pendingRoleId?' active':''));
  card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-pressed',String(role.id===pendingRoleId));
  card.setAttribute('aria-label',`${role.name}，${personaLabel[role.persona]}`);
  const art=node('div','avatar-art');portrait(art,role.persona);
  const chip=node('span','chip',personaLabel[role.persona]);chip.style.setProperty('--chip',personaInfo[role.persona].color);
  const tools=node('div','role-tools');
  const remove=node('button','', '删');remove.type='button';remove.setAttribute('aria-label',`删除 ${role.name}`);remove.title='删除';
  remove.addEventListener('click',async e=>{e.stopPropagation();
   if(!confirm(`删除 Agent「${role.name}」？此操作只影响你的 Keepwork 角色列表。`))return;
   if(await saveCatalog(deleteRole(catalog,role.id),`已删除「${role.name}」`)){applyCast();renderRoles();}});
  tools.append(remove);
  card.append(tools,art,node('h3','',role.name),chip);
  const pick=()=>{pendingRoleId=role.id;renderRoles();};
  card.addEventListener('click',pick);card.addEventListener('dblclick',enterCity);
  card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}});
  grid.append(card);
 }
 for(let i=catalog.roles.length;i<MAX_ROLES;i++){
  const empty=node('button','role-card empty');empty.type='button';
  const plus=node('span','plus');plus.innerHTML='<svg class="icon"><use href="#i-plus"/></svg>';
  empty.append(plus,node('span','','创建 Agent'));
  empty.addEventListener('click',openCreate);grid.append(empty);
 }
 $('roles-enter').disabled=!pendingRoleId;
 $('roles-account').textContent=account.signedIn?`Keepwork · ${account.username}`:'';
 $('roles-title').textContent=catalog.roles.length?'选择你的 Agent':'创建你的第一位 Agent';
}
function renderPersonaPicker(){
 const picker=$('persona-picker');picker.replaceChildren();
 for(const id of PERSONAS){
  const option=node('button','persona-option');option.type='button';option.setAttribute('role','radio');
  option.setAttribute('aria-checked',String(id===pickedPersona));
  const art=node('div','avatar-art');portrait(art,id,'20%');
  option.append(art,node('strong','',personaInfo[id].role.split(' · ')[0]+' · '+personaInfo[id].name),node('small','',personaLabel[id]));
  option.addEventListener('click',()=>{pickedPersona=id;renderPersonaPicker();});
  picker.append(option);
 }
}
function openCreate(){
 if(catalog.roles.length>=MAX_ROLES){toast(`最多可创建 ${MAX_ROLES} 位 Agent。`);return;}
 renderPersonaPicker();showCreate(true);$('role-create-status').textContent='';
 $('role-name').value='';$('role-name').focus();
}
function showCreate(on){
 $('role-create').hidden=!on;$('roles-grid').hidden=on;$('roles-enter').hidden=on;
 $('roles-title').textContent=on?'创建新的 Agent':catalog.roles.length?'选择你的 Agent':'创建你的第一位 Agent';
}
$('role-create-cancel').addEventListener('click',()=>{showCreate(false);if(!catalog.roles.length)$('roles-dialog').close();});
$('role-create').addEventListener('submit',async e=>{
 e.preventDefault();
 let result;
 try{result=createRole(catalog,{persona:pickedPersona,name:$('role-name').value},{uuid:()=>crypto.randomUUID(),now:Date.now});}
 catch(error){$('role-create-status').textContent=error.message==='role_limit'?`最多可创建 ${MAX_ROLES} 位 Agent。`:'请输入 1–20 个可见字符的名字。';return;}
 if(await saveCatalog(result.catalog,`欢迎「${result.role.name}」加入小城`)){
  pendingRoleId=result.role.id;showCreate(false);renderRoles();
 }
});
async function enterCity(){
 if(!pendingRoleId)return;
 if(await saveCatalog(activateRole(catalog,pendingRoleId,Date.now))){
  $('roles-dialog').close();applyCast();
  const role=ownedRole();toast(`${role.name} 已进入小城，会自主生活；点击地面可以临时带 TA 散步。`);
 }
}
$('roles-enter').addEventListener('click',enterCity);
$('roles-logout').addEventListener('click',async()=>{
 try{await keepwork.logout();}catch{toast('退出失败，请稍后重试。');return;}
 account={username:null,signedIn:false};catalog=emptyRoles();roleStore=null;
 $('roles-dialog').close();applyCast();toast('已退出登录，正在离线浏览小城。');
});
async function openRoles(){
 if(!account.signedIn&&!await signIn())return;
 showCreate(false);renderRoles();
 if(!$('roles-backdrop').src)fetch('vendor/haqi-data/data/adventure/neural-city-art.json').then(r=>r.ok?r.json():null).then(m=>{if(m?.map?.local)$('roles-backdrop').src=m.map.local;}).catch(()=>{});
 if(!$('roles-dialog').open)$('roles-dialog').showModal();
 if(!catalog.roles.length)openCreate();
}
$('account-button').addEventListener('click',openRoles);

/* ---------- Journal ---------- */
const journal=[],observedActivity=new Map();let observedEvent=0;
function recordActivity(ids,message){journal.unshift({ids,message,time:new Date()});if(journal.length>200)journal.length=200;}
function observeActivity(){
 for(const actor of worldScene.state.actors){
  const id=actor.profile.id;
  if(observedActivity.get(id)!==actor.activityLabel){observedActivity.set(id,actor.activityLabel);recordActivity([id],actor.activityLabel);}
 }
 const event=worldScene.state.event;
 if(event?.sequence&&event.sequence!==observedEvent){
  observedEvent=event.sequence;
  if(event.type==='gesture'){
   const action=socialActions.find(a=>a.id===event.action);
   const label=id=>labelFor(worldScene.state.actors.find(a=>a.profile.id===id)?.profile||{name:id});
   recordActivity(event.ids,event.ids.map(label).join(' 与 ')+' · '+(action?.label||event.action));
  }
 }
}
function renderLogs(){
 const list=$('logs-list');list.replaceChildren();
 const entries=journal.filter(entry=>entry.ids.includes($('logs-agent').value));
 for(const entry of entries){
  const item=node('li','');const time=node('time','',entry.time.toLocaleTimeString('zh-CN',{hour12:false}));
  time.dateTime=entry.time.toISOString();item.append(time,node('span','',entry.message));list.append(item);
 }
 if(!entries.length)list.append(node('li','logs-empty','还没有活动记录。场景加载后，Agent 的行动会记录在这里。'));
}
$('logs-toggle').addEventListener('click',()=>{
 const actors=worldScene?.state.actors||[];
 $('logs-agent').replaceChildren(...actors.map(a=>{const o=node('option','',`${labelFor(a.profile)} · ${personaLabel[a.profile.persona]}`);o.value=a.profile.id;return o;}));
 if(actors.length)$('logs-agent').value=worldScene.selectedAgent()||actors[0].profile.id;
 renderLogs();$('logs-dialog').showModal();
});
$('logs-agent').addEventListener('change',renderLogs);

/* ---------- Actors and character profile ---------- */
function labelFor(profile){
 if(!profile)return '';
 if(profile.kind==='demo')return names[profile.id]||profile.name;
 return profile.name||'Agent';
}
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}

function viewFor(actor){
 const profile=actor.profile,id=profile.id;
 let view=actorViews.get(id);
 if(!view){
  const el=node('button','actor '+profile.kind);el.type='button';
  const plate=node('span','nameplate'),dot=node('i'),label=node('span'),badge=node('b','','我的'),tag=node('em');
  plate.append(dot,label);if(profile.kind==='mine')plate.append(badge);
  const work=node('span','work-indicator',profile.workIcon||'');work.hidden=true;
  work.setAttribute('role','img');work.setAttribute('aria-label',profile.workLabel||'工作中');
  el.append(work);
  el.append(plate);
  el.addEventListener('click',e=>{e.stopPropagation();const current=actorViews.get(id)?.actor;if(current)openCharacter(current.profile);});
  $('actors').append(el);
  view={el,label,plate,tag,work,actor};actorViews.set(id,view);
 }
 view.actor=actor;
 return view;
}
function paintActors(time,still=false){
 if(!worldScene)return;
 if(presence&&ownedRole()){
  worldScene.setRemote(remoteCast(presence.remoteActors()));
  const count=worldScene.remote().length;
  if(count!==lastRemoteCount){lastRemoteCount=count;renderStatus();}
 }
 const scenePaused=pauseBackgroundScene({stage:'world',hidden:document.hidden,dialog:document.querySelector('dialog[open]')});
 const viewportRect=viewport.getBoundingClientRect(),dockRect=document.querySelector('.dock').getBoundingClientRect();
 // Include the medallion and ornamental border outside the dock's box.
 const dockBounds={x:dockRect.left-viewportRect.left-28,y:dockRect.top-viewportRect.top-24,w:dockRect.width+56,h:dockRect.height+48};
 const positions=worldScene.render(time,{paused:still||paused||scenePaused,usableBottom:dockBounds.y});
 const seen=new Set(),selected=worldScene.selectedAgent(),labelRows=[];
 for(const {actor,point} of positions){
  const view=viewFor(actor),profile=actor.profile;seen.add(profile.id);
  const name=labelFor(profile);
  if(view.label.textContent!==name)view.label.textContent=name;
  view.work.hidden=!(profile.workSpot&&actor.mode==='autonomous'&&!actor.moving&&actor.route.length===0);
  view.work.title=profile.workLabel||'';
  view.el.style.setProperty('--accent',personaInfo[profile.persona]?.color||'#4fb0a7');
  view.el.style.setProperty('--s',String(Math.max(.6,Math.min(1.6,point.scale/0.8))));
  view.el.style.left=`${point.x}px`;view.el.style.top=`${point.y}px`;view.el.style.zIndex=String(Math.round(point.y));
  view.el.classList.toggle('selected',profile.id===selected);
  const scale=Math.max(.6,Math.min(1.6,point.scale/0.8));
  labelRows.push({id:profile.id,x:point.x,y:point.y,w:view.plate.offsetWidth,h:view.plate.offsetHeight,
   selected:profile.id===selected,scale,body:{x:point.x-32*scale,y:point.y-96*scale,w:64*scale,h:104*scale}});
  view.el.setAttribute('aria-label',`${name}，${personaLabel[profile.persona]}${profile.kind==='remote'?'，其他用户的 Agent':profile.kind==='mine'?'，我的 Agent':'，示例居民'}`);
 }
 const labelPositions=layoutNameplates(labelRows,viewport.clientWidth,viewport.clientHeight,[dockBounds]);
 for(const row of labelRows){
  const plate=actorViews.get(row.id).plate,box=labelPositions.get(row.id);
  plate.style.visibility=box?'visible':'hidden';
  if(box){
   plate.style.left=`calc(50% + ${box.x+box.w/2-row.x}px)`;
   plate.style.transform=`translate(-50%,${box.y-row.y-8*row.scale}px)`;
  }
 }
 for(const [id,view] of actorViews)if(!seen.has(id)){view.el.remove();actorViews.delete(id);}
 observeActivity();
}

function openCharacter(profile){
 selectedProfile=profile;
 const info=personaInfo[profile.persona],editable=profile.kind!=='remote';
 if(editable)worldScene.selectAgent(profile.id);
 $('character-vendor').textContent=personaLabel[profile.persona];
 $('character-title').textContent=labelFor(profile);
 $('character-owner').textContent=profile.kind==='mine'?`我的 Agent · Keepwork ${account.username}`:profile.kind==='remote'?'其他在线用户的 Agent · 只读':'示例居民 · 本地模拟';
 $('character-description').textContent=profile.workLabel?`${profile.workLabel}中。这位本地居民展示工作情景，不代表真实任务执行或积分收入。`:info.description;
 $('character-role').textContent=profile.kind==='demo'?`${info.role} · 常去：${info.homeName}`:`${info.role} · 常去：${info.homeName}`;
 $('portrait-caption').textContent=profile.kind==='mine'?'MY AGENT':profile.kind==='remote'?'ONLINE AGENT':'WORLD RESIDENT / DEMO';
 portrait($('portrait'),profile.persona,'center');
 $('direct-actions').hidden=!editable;$('name-form').hidden=!editable||(profile.kind==='demo'&&!personaInfo[profile.id]);
 $('character-name').value=labelFor(profile);$('name-status').textContent='';
 $('name-hint').textContent=profile.kind==='mine'?'最多 20 个字符；保存到你的 Keepwork 角色列表。':'最多 20 个字符；只修改此浏览器的演示居民。';
 $('character-dialog').showModal();
}
function commandAgentTo(profile,target,prefix){
 if(!worldScene||!profile||profile.kind==='remote')return;
 const res=worldScene.direct(profile.id,target);
 if(res?.ok){toast(`${prefix||`已带 ${labelFor(profile)} 前往「${res.target.label}」`}；抵达后会恢复自主活动。`);paintActors(clock/1000,true);}
 else toast('该位置暂时无法通行，请点击道路、广场、桥面或房屋室内空地。');
}
$('dialog-go-home').addEventListener('click',()=>{
 if(!selectedProfile||!worldScene)return;$('character-dialog').close();
 const actor=worldScene.state.actors.find(a=>a.profile.id===selectedProfile.id),h=actor&&worldScene.world.homes[actor.homeId];
 if(!h)return;worldScene.focusHome(h.id);
 commandAgentTo(selectedProfile,{cellX:h.indoor.x,cellY:h.indoor.y,label:h.name},`已让 ${labelFor(selectedProfile)} 回到「${h.name}」`);
});
$('dialog-go-plaza').addEventListener('click',()=>{
 if(!selectedProfile||!worldScene)return;$('character-dialog').close();worldScene.focusScene('plaza');
 commandAgentTo(selectedProfile,{cellX:0,cellY:0.6,label:'中央广场'},`已让 ${labelFor(selectedProfile)} 前往「中央广场」`);
});
$('name-form').addEventListener('submit',async e=>{
 e.preventDefault();const name=cleanName($('character-name').value),profile=selectedProfile;
 if(!name){$('name-status').textContent='请输入 1–20 个可见字符。';$('character-name').focus();return;}
 if(profile.kind==='mine'){
  const role=ownedRole();if(!role)return;
  if(await saveCatalog(renameRole(catalog,role.id,name))){profile.name=name;applyCast();$('name-status').textContent='已保存到 Keepwork。';$('character-title').textContent=name;}
  return;
 }
 try{names=saveName(storage,names,profile.id,name);$('name-status').textContent='已保存，刷新页面后名字仍会保留。';}
 catch{names={...names,[profile.id]:name};$('name-status').textContent='浏览器存储不可用；名字仅在本次访问生效。';}
 $('character-title').textContent=name;toast(`你好，${name}。欢迎来到小城。`);
});
for(const dialog of document.querySelectorAll('dialog')){
 dialog.querySelector('[data-close]')?.addEventListener('click',()=>dialog.close());
 if(dialog.id==='roles-dialog')continue;
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
}

/* ---------- Camera, input and frame loop ---------- */
const viewport=$('viewport');
function renderView(){paintActors(clock/1000,true);}
let drag=null;
viewport.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0)return;drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
viewport.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6)drag.moved=true;worldScene?.pan(dx,dy);drag.x=e.clientX;drag.y=e.clientY;renderView();});
function endDrag(e){
 if(drag&&!drag.moved&&e?.type==='pointerup'&&worldScene){
  const rect=viewport.getBoundingClientRect(),point=worldScene.unproject(e.clientX-rect.left,e.clientY-rect.top);
  const mine=ownActor();
  const target=mine||worldScene.state.actors.find(a=>a.profile.id===worldScene.selectedAgent());
  if(target)commandAgentTo(target.profile,point);
  else if(account.signedIn)toast('先在「我的 Agent」里选择一位角色进入小城。');
 }
 drag=null;viewport.classList.remove('dragging');
}
viewport.addEventListener('pointerup',endDrag);viewport.addEventListener('pointercancel',endDrag);viewport.addEventListener('lostpointercapture',endDrag);
viewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)return;e.preventDefault();worldScene?.zoom(Math.exp(-e.deltaY*.001));renderView();},{passive:false});
let frame=null,clock=0,last=0;
new ResizeObserver(renderView).observe(viewport);
function draw(time){frame=null;if(paused||document.hidden)return;clock+=Math.min(40,time-last||16);last=time;paintActors(clock/1000);frame=requestAnimationFrame(draw);}
function syncMotion(){document.body.classList.toggle('paused',paused);if(frame)cancelAnimationFrame(frame);frame=null;last=0;if(!paused&&!document.hidden)frame=requestAnimationFrame(draw);else paintActors(clock/1000,true);}
motionQuery.addEventListener('change',e=>{paused=e.matches;syncMotion();});document.addEventListener('visibilitychange',syncMotion);
window.addEventListener('storage',e=>{if(e.key==='awc.world.names.v1')names=loadNames(storage);});
window.addEventListener('pagehide',()=>presence?.stop());

createWorldMap($('map-toggle'),()=>worldScene);
renderAccount();renderStatus();syncMotion();
loadRig().then(rig=>createWorldScene($('world-canvas'),rig,labelFor)).then(async scene=>{
 worldScene=scene;document.body.classList.add('scene-ready');applyCast();
 const remembered=(()=>{try{return storage?.getItem('awc.world.keepwork')==='1';}catch{return false;}})();
 if(devUser)await signIn();else if(remembered)await signIn({interactive:false});
}).catch(error=>{console.error(error);toast('场景资源加载失败，请刷新重试。');});

// Static Pages keeps the task guide; a self-hosted server exposes the live market.
fetch('v1/market').then(res=>res.ok?res.json():null).then(market=>{if(market?.stats)$('tasks-link').href='company/';}).catch(()=>{});
