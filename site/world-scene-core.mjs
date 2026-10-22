import {socialFacing} from './vendor/haqi/adventure_social_motion_core.js';
import {createHome,chunkKey,canPlace,validateHomePart,homeRoadAt,homeBridgeAt} from './vendor/haqi/home_core.js';
import {roofAt,buildingItem} from './vendor/haqi/home_building_core.js';
import {applyHomeAction,homeObjects} from './vendor/haqi/home_actions_core.js';
import {findHomePath,isHomePassable,stepHomeWalk,surfaceAtHome} from './vendor/haqi/home_walk_core.js';

export const CELL_PX=40;
export const HOME_SEED=7419;

export const DEFAULT_HOME_CATALOG=[
 {id:'build-wood-floor',zh:'木地板',en:'wood floor',category:'building',layer:'ground',size:[1,1],requiresReading:false,building:{style:'wood',type:'floor',snap:true,obstruction:{enabled:false,width:1,depth:1,offsetX:0,offsetY:0}}},
 {id:'build-wood-wall',zh:'木墙',en:'wood wall',category:'building',layer:'solid',size:[1,1],requiresReading:false,building:{style:'wood',type:'wall',snap:true,obstruction:{enabled:true,width:1,depth:.22,offsetX:0,offsetY:.39}}},
 {id:'build-wood-window',zh:'木窗墙',en:'wood window',category:'building',layer:'solid',size:[1,1],requiresReading:false,building:{style:'wood',type:'window',snap:true,obstruction:{enabled:true,width:1,depth:.22,offsetX:0,offsetY:.39}}},
 {id:'build-wood-door',zh:'木门',en:'wood door',category:'building',layer:'solid',size:[1,1],requiresReading:false,building:{style:'wood',type:'door',snap:true,obstruction:{enabled:true,width:1,depth:.22,offsetX:0,offsetY:.39}}},
 {id:'build-wood-roof',zh:'木屋顶',en:'wood roof',category:'building',layer:'top',size:[1,1],requiresReading:false,building:{style:'wood',type:'roof',snap:true,obstruction:{enabled:false,width:1,depth:1,offsetX:0,offsetY:0}}},
 {id:'build-stone-floor',zh:'石地板',en:'stone floor',category:'building',layer:'ground',size:[1,1],requiresReading:false,building:{style:'stone',type:'floor',snap:true,obstruction:{enabled:false,width:1,depth:1,offsetX:0,offsetY:0}}},
 {id:'build-stone-wall',zh:'石墙',en:'stone wall',category:'building',layer:'solid',size:[1,1],requiresReading:false,building:{style:'stone',type:'wall',snap:true,obstruction:{enabled:true,width:1,depth:.22,offsetX:0,offsetY:.39}}},
 {id:'build-stone-window',zh:'石窗墙',en:'stone window',category:'building',layer:'solid',size:[1,1],requiresReading:false,building:{style:'stone',type:'window',snap:true,obstruction:{enabled:true,width:1,depth:.22,offsetX:0,offsetY:.39}}},
 {id:'build-stone-door',zh:'石门',en:'stone door',category:'building',layer:'solid',size:[1,1],requiresReading:false,building:{style:'stone',type:'door',snap:true,obstruction:{enabled:true,width:1,depth:.22,offsetX:0,offsetY:.39}}},
 {id:'build-stone-roof',zh:'石屋顶',en:'stone roof',category:'building',layer:'top',size:[1,1],requiresReading:false,building:{style:'stone',type:'roof',snap:true,obstruction:{enabled:false,width:1,depth:1,offsetX:0,offsetY:0}}},
 {id:'bed',zh:'床',en:'bed',category:'bedroom',layer:'solid',size:[2,2],activity:'sleep'},
 {id:'desk',zh:'书桌',en:'desk',category:'bedroom',layer:'solid',size:[2,1],slots:2},
 {id:'chair',zh:'椅子',en:'chair',category:'living',layer:'solid',size:[1,1],activity:'sit'},
 {id:'floor-lamp',zh:'落地灯',en:'floor lamp',category:'living',layer:'solid',size:[1,1],interactionEnabled:true},
 {id:'flower',zh:'花坛',en:'flower',category:'outdoor',layer:'solid',size:[2,2]},
 {id:'garden-lantern',zh:'庭院灯',en:'garden lantern',category:'outdoor',layer:'solid',size:[2,2],interactionEnabled:true},
 {id:'fireplace',zh:'壁炉',en:'fireplace',category:'living',layer:'solid',size:[2,1],interactionEnabled:true},
 {id:'sunflower',zh:'向日葵',en:'sunflower',category:'outdoor',layer:'solid',size:[2,2]},
 {id:'mailbox',zh:'邮筒',en:'mailbox',category:'outdoor',layer:'solid',size:[2,2]},
 {id:'table',zh:'餐桌',en:'table',category:'kitchen',layer:'solid',size:[3,2],slots:2},
 {id:'oven',zh:'烤箱',en:'oven',category:'kitchen',layer:'solid',size:[1,1],interactionEnabled:true},
 {id:'fountain',zh:'喷泉',en:'fountain',category:'outdoor',layer:'solid',size:[2,2],interactionEnabled:true},
 {id:'sofa',zh:'沙发',en:'sofa',category:'living',layer:'solid',size:[2,1],activity:'sit'},
 {id:'piano',zh:'钢琴',en:'piano',category:'living',layer:'solid',size:[2,1],interactionEnabled:true},
 {id:'television',zh:'电视',en:'television',category:'living',layer:'solid',size:[1,1],interactionEnabled:true},
 {id:'swing',zh:'秋千',en:'swing',category:'outdoor',layer:'solid',size:[3,2],activity:'play'},
 {id:'brick-chimney',zh:'砖烟囱',en:'brick chimney',category:'outdoor',layer:'solid',size:[1,1]},
 {id:'roof-windmill',zh:'屋顶风车',en:'roof windmill',category:'outdoor',layer:'solid',size:[2,2]},
 {id:'stone-chimney',zh:'石烟囱',en:'stone chimney',category:'outdoor',layer:'solid',size:[1,1]},
];

export const AGENT_HOME_BLUEPRINTS=[
 {
  id:'astra',name:'钟楼画室',templateId:'wood',x:-9,y:2,w:7,h:6,
  door:{x:-5.5,y:7.2,label:'画室门前'},
  indoor:{x:-5.5,y:5.5,label:'钟楼画室'},
  yard:{x:-5.5,y:8.6,label:'画室花院'},
  roof:[
   {id:'astra-chimney',itemId:'brick-chimney',x:-8,y:3},
   {id:'astra-windmill',itemId:'roof-windmill',x:-4,y:3},
  ],
  items:[
   {id:'astra-bed',itemId:'bed',x:-8,y:3,color:'green'},
   {id:'astra-desk',itemId:'desk',x:-5,y:3},
   {id:'astra-chair',itemId:'chair',x:-4.5,y:4.2},
   {id:'astra-lamp',itemId:'floor-lamp',x:-8,y:5.5},
   {id:'astra-flower',itemId:'flower',x:-9,y:8.2},
   {id:'astra-lantern',itemId:'garden-lantern',x:-4,y:8.2},
  ],
 },
 {
  id:'claude',name:'白鸽书屋',templateId:'wood',x:2,y:2,w:7,h:6,
  door:{x:5.5,y:7.2,label:'书屋门前'},
  indoor:{x:5.5,y:5.5,label:'白鸽书屋'},
  yard:{x:5.5,y:8.6,label:'向日葵院'},
  roof:[
   {id:'claude-chimney',itemId:'brick-chimney',x:3,y:3},
  ],
  items:[
   {id:'claude-bed',itemId:'bed',x:3,y:3,color:'orange'},
   {id:'claude-desk',itemId:'desk',x:6,y:3},
   {id:'claude-chair',itemId:'chair',x:6.5,y:4.2},
   {id:'claude-fire',itemId:'fireplace',x:6,y:5.5},
   {id:'claude-sunflower',itemId:'sunflower',x:6.8,y:8.2},
   {id:'claude-mailbox',itemId:'mailbox',x:2,y:8.2},
  ],
 },
 {
  id:'deepseek',name:'深海食坊',templateId:'wood',x:-9,y:12,w:7,h:6,
  door:{x:-5.5,y:17.2,label:'食坊门前'},
  indoor:{x:-5.5,y:15.5,label:'深海食坊'},
  yard:{x:-5.5,y:18.6,label:'喷泉庭院'},
  roof:[
   {id:'deepseek-windmill',itemId:'roof-windmill',x:-4,y:13},
  ],
  items:[
   {id:'deepseek-bed',itemId:'bed',x:-8,y:13,color:'blue'},
   {id:'deepseek-table',itemId:'table',x:-5.8,y:13},
   {id:'deepseek-oven',itemId:'oven',x:-8,y:15.5},
   {id:'deepseek-chair',itemId:'chair',x:-4,y:15.5},
   {id:'deepseek-fountain',itemId:'fountain',x:-9,y:18.2},
  ],
 },
 {
  id:'gemini',name:'双子星居',templateId:'stone',x:2,y:12,w:8,h:8,
  door:{x:5.5,y:18.2,label:'星居门前'},
  indoor:{x:5.5,y:16,label:'双子星居'},
  yard:{x:5.5,y:19.6,label:'星灯庭院'},
  roof:[
   {id:'gemini-chimney',itemId:'stone-chimney',x:3,y:13},
  ],
  items:[
   {id:'gemini-bed',itemId:'bed',x:3,y:13,color:'purple'},
   {id:'gemini-sofa',itemId:'sofa',x:6.5,y:13,color:'purple'},
   {id:'gemini-piano',itemId:'piano',x:6.5,y:15.5},
   {id:'gemini-tv',itemId:'television',x:3,y:16},
   {id:'gemini-lantern',itemId:'garden-lantern',x:7.5,y:20.2},
   {id:'gemini-swing',itemId:'swing',x:1.5,y:20.2},
  ],
 },
];

function emptyChunkParts(){
 return {'chunk:-1,-1':{},'chunk:0,-1':{},'chunk:-1,0':{},'chunk:0,0':{}};
}

function applyBlueprint(parts,bp,catalog,seed){
 const tplReceipt=`tpl-${bp.id}`;
 parts[`receipt:${tplReceipt}`]={completed:false};
 applyHomeAction(parts,{type:'template',receipt:tplReceipt,templateId:bp.templateId,x:bp.x,y:bp.y,prefix:`${bp.id}-house`,seed},catalog);
 const current=homeObjects(parts);
 for(const deco of bp.roof){
  const roof=roofAt(deco,current,catalog);
  applyHomeAction(parts,{type:'place',object:{...deco,parentId:roof.id,properties:{surface:'roof'}}},catalog);
 }
 for(const item of bp.items){
  applyHomeAction(parts,{type:'place',object:item},catalog);
 }
 for(const [key,value] of Object.entries(parts)){
  if(key.startsWith('chunk:'))validateHomePart('chunk',value,catalog);
 }
}

export function createAgentHomes(catalog=DEFAULT_HOME_CATALOG,seed=HOME_SEED){
 const sharedParts=emptyChunkParts();
 const homes={};
 for(const bp of AGENT_HOME_BLUEPRINTS){
  const individualHome=createHome(`home-${bp.id}`,bp.name,seed);
  individualHome.parts=emptyChunkParts();
  applyBlueprint(individualHome.parts,bp,catalog,seed);
  applyBlueprint(sharedParts,bp,catalog,seed);
  const objects=homeObjects(individualHome.parts);
  homes[bp.id]={
   id:bp.id,
   name:bp.name,
   templateId:bp.templateId,
   home:individualHome,
   parts:individualHome.parts,
   objects,
   bounds:{x:bp.x,y:bp.y,w:bp.w,h:bp.h},
   door:{...bp.door,worldX:bp.door.x*CELL_PX,worldY:bp.door.y*CELL_PX},
   indoor:{...bp.indoor,worldX:bp.indoor.x*CELL_PX,worldY:bp.indoor.y*CELL_PX},
   yard:{...bp.yard,worldX:bp.yard.x*CELL_PX,worldY:bp.yard.y*CELL_PX},
   spots:[
    {...bp.indoor,kind:'indoor'},
    {...bp.yard,kind:'yard'},
    {...bp.door,kind:'door'},
   ],
  };
 }
 return {homes,parts:sharedParts,objects:homeObjects(sharedParts)};
}

export function describeHomeLocation(world,cellX,cellY){
 for(const h of Object.values(world.homes||{})){
  const b=h.bounds;
  if(cellX>=b.x&&cellX<=b.x+b.w&&cellY>=b.y&&cellY<=b.y+b.h)return h.name;
  if(Math.hypot(cellX-h.yard.x,cellY-h.yard.y)<=2.4)return h.yard.label;
 }
 if(Math.hypot(cellX,cellY)<=2.8)return '中央广场';
 if(homeBridgeAt(world.seed,cellX,cellY))return cellY<-3?'北岸樱花桥':'东岸溪木桥';
 if(homeRoadAt(world.seed,cellX,cellY).road)return '石板街心';
 return `家园草甸 (${cellX.toFixed(1)}, ${cellY.toFixed(1)})`;
}

export function createPlaza(catalog=DEFAULT_HOME_CATALOG){
 const seed=HOME_SEED;
 const {homes,parts,objects}=createAgentHomes(catalog,seed);
 const home=createHome('awc-homeland','脑内小城家园',seed);
 home.parts=parts;
 const landmarks=[
  {id:'plaza',name:'中央广场',cellX:0,cellY:0,x:0,y:0},
  {id:'welcome',name:'入职小站',cellX:0,cellY:-5.2,x:0,y:-5.2*CELL_PX},
  {id:'workshop',name:'灵感工坊',cellX:-0.5,cellY:9.6,x:-0.5*CELL_PX,y:9.6*CELL_PX},
  {id:'memory',name:'记忆花园',cellX:9.2,cellY:0,x:9.2*CELL_PX,y:0},
  {id:'observatory',name:'观星台 · 钟楼画室',cellX:-5.5,cellY:5.5,x:-5.5*CELL_PX,y:5.5*CELL_PX},
  {id:'library',name:'图书馆 · 白鸽书屋',cellX:5.5,cellY:5.5,x:5.5*CELL_PX,y:5.5*CELL_PX},
  {id:'home',name:'我的家园',cellX:-0.5,cellY:5.2,x:-0.5*CELL_PX,y:5.2*CELL_PX},
  ...Object.values(homes).map(h=>({
   id:`home-${h.id}`,
   residentId:h.id,
   name:h.name,
   cellX:h.indoor.x,
   cellY:h.indoor.y,
   x:h.indoor.worldX,
   y:h.indoor.worldY,
  })),
 ];
 const buildings=Object.values(homes).map(h=>({
  id:h.id,
  name:h.name,
  x:(h.bounds.x+h.bounds.w/2)*CELL_PX,
  y:(h.bounds.y+h.bounds.h)*CELL_PX,
  w:h.bounds.w*CELL_PX,
  h:h.bounds.h*CELL_PX,
 }));
 return {
  zone:'home',
  seed,
  cellSize:CELL_PX,
  w:1800,
  h:1600,
  center:{x:0,y:340},
  home,
  parts,
  objects,
  catalog,
  homes,
  landmarks,
  buildings,
  canPlace:(obj)=>canPlace(obj,objects,catalog),
 };
}

function buildSchedule(world,id,index){
 const own=world.homes[id]|| Object.values(world.homes)[index%4];
 const allHomes=Object.values(world.homes);
 const neighbor=allHomes[(index+1)%allHomes.length];
 const plazaSpots=[
  {x:-1.1,y:0.7,label:'中央广场',kind:'plaza'},
  {x:1.1,y:0.7,label:'中央广场',kind:'plaza'},
  {x:-1.1,y:-0.7,label:'中央广场',kind:'plaza'},
  {x:1.1,y:-0.7,label:'中央广场',kind:'plaza'},
 ];
 const promenadeSpots=[
  {x:-0.6,y:9.6,label:'灵感街心',kind:'street'},
  {x:0.6,y:9.6,label:'灵感街心',kind:'street'},
  {x:0,y:-5.2,label:'北岸樱花道',kind:'bridge'},
  {x:0,y:4.8,label:'家园大道',kind:'street'},
 ];
 return [
  {x:own.indoor.x,y:own.indoor.y,label:own.indoor.label,kind:'indoor'},
  {x:own.yard.x,y:own.yard.y,label:own.yard.label,kind:'yard'},
  plazaSpots[index%plazaSpots.length],
  promenadeSpots[index%promenadeSpots.length],
  {x:neighbor.yard.x,y:neighbor.yard.y,label:`拜访${neighbor.name}`,kind:'visit'},
 ];
}

function syncActorWorldPosition(actor,world){
 actor.position={x:actor.cell.x*CELL_PX,y:actor.cell.y*CELL_PX};
 actor.surface=surfaceAtHome(world.seed,actor.cell.x,actor.cell.y,world.objects,world.catalog);
 actor.insideHomeId=null;
 for(const h of Object.values(world.homes||{})){
  const b=h.bounds;
  if(actor.cell.x>=b.x&&actor.cell.x<=b.x+b.w&&actor.cell.y>=b.y&&actor.cell.y<=b.y+b.h){
   actor.insideHomeId=h.id;
   break;
  }
 }
}

function planAutonomousNext(actor,world){
 const schedule=actor.schedule||[];
 for(let tries=0;tries<schedule.length;tries++){
  actor.routineIndex=(actor.routineIndex+1)%schedule.length;
  const spot=schedule[actor.routineIndex];
  const route=findHomePath(actor.cell,spot,world.objects,world.catalog,world.seed);
  if(route.length){
   actor.route=route;
   actor.target={...spot};
   actor.activityLabel=`自主前往 · ${spot.label}`;
   return true;
  }
 }
 return false;
}

export function createResidents(world,profiles){
 const actors=profiles.map((profile,i)=>{
  const own=world.homes[profile.id]||Object.values(world.homes)[i%4];
  const schedule=buildSchedule(world,profile.id,i);
  const startSpot=i%2===0?own.indoor:own.yard;
  const actor={
   profile:{...profile},
   homeId:own.id,
   homeName:own.name,
   cell:{x:startSpot.x,y:startSpot.y},
   position:{x:startSpot.x*CELL_PX,y:startSpot.y*CELL_PX},
   facing:0,
   moving:false,
   wait:i*0.35,
   travel:0,
   mode:'autonomous',
   schedule,
   routineIndex:i%2===0?0:1,
   route:[],
   target:{...startSpot},
   overrideTarget:null,
   overrideHold:0,
   arrivedOverride:false,
   activityLabel:`在${startSpot.label}`,
   surface:'meadow',
   insideHomeId:null,
  };
  syncActorWorldPosition(actor,world);
  planAutonomousNext(actor,world);
  return actor;
 });
 return {actors,elapsed:0,nextMeet:3.2,gesture:null,meetings:0,event:null};
}

export function directResident(state,world,agentId,targetPoint,options={}){
 const actor=state.actors.find(a=>a.profile.id===agentId);
 if(!actor||!targetPoint)return {ok:false,reason:'unknown_resident'};
 const rawX=Number.isFinite(targetPoint.cellX)?targetPoint.cellX:Number(targetPoint.x)/CELL_PX;
 const rawY=Number.isFinite(targetPoint.cellY)?targetPoint.cellY:Number(targetPoint.y)/CELL_PX;
 if(!Number.isFinite(rawX)||!Number.isFinite(rawY))return {ok:false,reason:'invalid_target'};
 const desired={x:Math.max(-24,Math.min(24,rawX)),y:Math.max(-18,Math.min(24,rawY))};
 const route=findHomePath(actor.cell,desired,world.objects,world.catalog,world.seed);
 const finalCell=route.length?route[route.length-1]:(isHomePassable(desired.x,desired.y,world.objects,world.catalog,world.seed)?desired:null);
 if(!finalCell)return {ok:false,reason:'unreachable_target'};
 if(state.gesture?.ids?.includes(agentId))state.gesture=null;
 const label=targetPoint.label||describeHomeLocation(world,finalCell.x,finalCell.y);
 actor.mode='directed';
 actor.arrivedOverride=false;
 actor.overrideHold=Number.isFinite(options.hold)?Math.max(0.4,options.hold):2.2;
 actor.wait=0;
 actor.route=route;
 actor.target={x:finalCell.x,y:finalCell.y,label,kind:'directed'};
 actor.overrideTarget={
  x:finalCell.x,
  y:finalCell.y,
  worldX:finalCell.x*CELL_PX,
  worldY:finalCell.y*CELL_PX,
  label,
 };
 actor.activityLabel=`收到指令 · 前往${label}`;
 state.event={
  type:'directed',
  ids:[agentId],
  action:'direct',
  label,
  target:actor.overrideTarget,
  sequence:++state.meetings,
 };
 return {ok:true,actor,target:actor.overrideTarget,route};
}

function stepSingleActor(actor,world,dt,held){
 if(held.has(actor.profile.id)){
  actor.moving=false;
  return;
 }
 if(actor.route.length>0){
  let remaining=dt;
  while(remaining>1e-5&&actor.route.length>0){
   const slice=Math.min(0.05,remaining);
   remaining-=slice;
   const wp=actor.route[0];
   const dist=Math.hypot(wp.x-actor.cell.x,wp.y-actor.cell.y);
   if(dist<=0.12){
    actor.cell={x:wp.x,y:wp.y};
    actor.route.shift();
    syncActorWorldPosition(actor,world);
    continue;
   }
   const prevX=actor.cell.x,prevY=actor.cell.y;
   const stepped=stepHomeWalk({x:actor.cell.x,y:actor.cell.y,facing:actor.facing,moving:actor.moving},wp,slice,world.objects,world.catalog,world.seed);
   actor.cell={x:stepped.x,y:stepped.y};
   actor.facing=stepped.facing;
   actor.moving=stepped.moving;
   const moved=Math.hypot(actor.cell.x-prevX,actor.cell.y-prevY);
   actor.travel+=moved*CELL_PX;
   syncActorWorldPosition(actor,world);
   if(Math.hypot(wp.x-actor.cell.x,wp.y-actor.cell.y)<=0.12){
    actor.cell={x:wp.x,y:wp.y};
    actor.route.shift();
    syncActorWorldPosition(actor,world);
   }else if(moved<1e-4){
    // Replan around corner or advance if blocked at intermediate waypoint
    const finalWp=actor.route[actor.route.length-1];
    const replanned=findHomePath(actor.cell,finalWp,world.objects,world.catalog,world.seed);
    actor.route=replanned.length?replanned:[];
    break;
   }
  }
  if(actor.route.length===0)actor.moving=false;
  return;
 }
 actor.moving=false;
 if(actor.mode==='directed'){
  if(!actor.arrivedOverride){
   actor.arrivedOverride=true;
   actor.wait=actor.overrideHold||2.2;
   actor.activityLabel=`已抵达 · ${actor.overrideTarget?.label||'目的地'}`;
  }else{
   actor.wait-=dt;
   if(actor.wait<=0){
    actor.mode='autonomous';
    actor.overrideTarget=null;
    actor.arrivedOverride=false;
    planAutonomousNext(actor,world);
   }
  }
  return;
 }
 actor.wait-=dt;
 if(actor.wait<=0){
  if(planAutonomousNext(actor,world)){
   actor.wait=1.1+(actor.routineIndex%3)*0.45;
  }else{
   actor.wait=1.5;
  }
 }else if(actor.target?.label){
  actor.activityLabel=`在${actor.target.label}`;
 }
}

export function stepResidents(state,world,dt,{paused=false}={}){
 if(paused)return;
 dt=Math.max(0,Math.min(.1,dt));
 state.elapsed+=dt;
 const active=Boolean(state.gesture&&state.elapsed<state.gesture.until/1000);
 if(!active)state.gesture=null;
 const held=active?new Set(state.gesture.ids):new Set();
 for(const actor of state.actors){
  stepSingleActor(actor,world,dt,held);
 }
 if(active){
  const pair=state.actors.filter(a=>held.has(a.profile.id));
  if(pair.length===2){
   const [a,b]=pair;
   a.facing=socialFacing(b.position.x-a.position.x,b.position.y-a.position.y);
   b.facing=socialFacing(a.position.x-b.position.x,a.position.y-b.position.y);
  }
  return;
 }
 if(state.elapsed<state.nextMeet)return;
 const pairs=[];
 for(let i=0;i<state.actors.length;i++){
  for(let j=i+1;j<state.actors.length;j++){
   const a=state.actors[i],b=state.actors[j];
   if(a.mode==='directed'||b.mode==='directed')continue;
   const distCells=Math.hypot(a.cell.x-b.cell.x,a.cell.y-b.cell.y);
   if(distCells>=1.1&&distCells<=6.5){
    pairs.push({a,b,distCells});
   }
  }
 }
 if(!pairs.length)return;
 const {a,b}=pairs[state.meetings%pairs.length];
 const action=['greet','smile','clap','jump'][state.meetings%4];
 state.gesture={ids:[a.profile.id,b.profile.id],action,at:state.elapsed*1000,until:(state.elapsed+3.2)*1000};
 state.event={type:'gesture',ids:state.gesture.ids,action,sequence:++state.meetings};
 state.nextMeet=state.elapsed+9.5;
}
