import {createRenderer} from './vendor/haqi/adventure_renderer.js';
import {loadEnvironmentArt} from './vendor/haqi/adventure_environment_art.js';
import {socialActions,socialGesturePose} from './vendor/haqi/adventure_social_actions_core.js';
import {createHomeTerrainCache} from './vendor/haqi/home_terrain_cache.js';
import {createHomeBuildingCache} from './vendor/haqi/home_building_cache.js';
import {buildingItem,buildingBounds,buildingConnectionMask,homeDoorIsOpen,isRoofDecoration} from './vendor/haqi/home_building_core.js';
import {drawBuilding} from './vendor/haqi/view_home_building.js';
import {collectHomeWorldTrees,drawHomeWorldTree,drawHomeObject} from './vendor/haqi/view_home_art.js';
import {sceneResolution} from './vendor/haqi/scene_resolution_core.js';
import {installCityLandmarks,installCityDecorations} from './world-map-core.mjs';
import {createPlaza,createResidents,stepResidents,directResident,CELL_PX} from './world-scene-core.mjs';

const ACTOR_SCALE=1.08;

// `labelFor(profile)` supplies display names; profiles carry `persona` (renderer)
// and `kind` ('demo' | 'mine' | 'remote'). Remote Agents are display-only.
export async function createWorldScene(canvas,rig,labelFor){
 const art=await loadEnvironmentArt('local',async()=>{
  const response=await fetch(new URL('./assets/haqi-scene.json',import.meta.url));
  if(!response.ok)throw Error('Scene manifest unavailable');
  return response.json();
 });
 const catalogResponse=await fetch(new URL('./vendor/haqi-data/data/adventure/home/catalog.json',import.meta.url));
 if(!catalogResponse.ok)throw Error('Home catalog unavailable');
 const catalogData=await catalogResponse.json();
 await Promise.all(Object.keys(art.manifest.atlases).map(art.ensure));

 const spriteImages=new Map();
 function imageFor(artSpec){
  const rel=artSpec?.local;
  if(!rel)return null;
  if(spriteImages.has(rel))return spriteImages.get(rel);
  const img=new Image();
  img.decoding='async';
  img.src=new URL('./'+rel,import.meta.url).href;
  spriteImages.set(rel,img);
  return img;
 }

 const cityResponse=await fetch(new URL('./vendor/haqi-data/data/adventure/neural-city-art.json',import.meta.url));
 if(!cityResponse.ok)throw Error('City art catalogue unavailable');
 const city=await cityResponse.json();
 const world=createPlaza([...catalogData.items.map(item=>item.building?{...item,building:{...item.building,theme:'neural-city'}}:item),...city.homeItems]);
 installCityLandmarks(world,city.homeItems);
 installCityDecorations(world);
 for(const obj of world.objects){
  const item=buildingItem(obj,world.catalog);
  if(item?.art)imageFor(item.art);
 }

 const entries=new Map(rig.entries.map(e=>[e.resident.id,e]));
 function profileFor({id,persona,kind,name,homeId,homeIndex,ownerName}){
  const entry=entries.get(persona)||rig.entries[0];
  return {id,persona:entry.resident.id,kind,name,homeId,homeIndex,ownerName,
   appearance:'girl',headId:entry.resident.id,bodyId:entry.appearance.bodyId,color:entry.resident.color,
   native:'zh',level:1,school:'life',equipmentGuids:{},equipmentInstances:[]};
 }
 const demoCast=()=>rig.entries.map(({resident:r})=>({id:r.id,persona:r.id,kind:'demo',name:r.name}));
 const state=createResidents(world,demoCast().map(profileFor));
 let remote=[];
 const terrainCache=createHomeTerrainCache({theme:'neural-city'});
 const buildingCache=createHomeBuildingCache({imageFor});
 void createRenderer;

 const camera={x:world.center.x,y:60,zoom:0.80};
 let viewport={width:canvas.clientWidth||1280,height:canvas.clientHeight||800,scale:1,pixelRatio:1};
 let last=null;
 let selectedAgentId=state.actors[0]?.profile.id||null;

 function updateViewport(){
  const dpr=typeof window!=='undefined'?window.devicePixelRatio||1:1;
  const width=canvas.clientWidth||1280,height=canvas.clientHeight||800,pixelRatio=sceneResolution(dpr).display;
  const metrics={width,height,pixelRatio,canvasWidth:Math.round(width*pixelRatio),canvasHeight:Math.round(height*pixelRatio)};
  if(canvas.width!==metrics.canvasWidth||canvas.height!==metrics.canvasHeight){
   canvas.width=metrics.canvasWidth;
   canvas.height=metrics.canvasHeight;
  }
  const scale=(metrics.width<650?.82:1)*camera.zoom;
  viewport={width:metrics.width,height:metrics.height,scale,pixelRatio:metrics.pixelRatio};
  return viewport;
 }

 function worldToScreen(point){
  const {width,height,scale}=viewport;
  return {
   x:width/2+(point.x-camera.x)*scale,
   y:height/2+(point.y-camera.y)*scale,
   scale,
  };
 }

 function screenToWorld(sx,sy){
  const {width,height,scale}=viewport;
  return {
   x:camera.x+(sx-width/2)/scale,
   y:camera.y+(sy-height/2)/scale,
  };
 }

 function drawDirectedRoute(ctx,actor,nowSec){
  if(actor.mode!=='directed'||!actor.overrideTarget)return;
  const color=actor.profile.color||'#2c7160';
  const pts=[actor.position,...actor.route.map(p=>({x:p.x*CELL_PX,y:p.y*CELL_PX}))];
  ctx.save();
  ctx.strokeStyle=color;
  ctx.lineWidth=3;
  ctx.setLineDash([7,6]);
  ctx.lineDashOffset=-nowSec*28;
  ctx.globalAlpha=0.82;
  ctx.beginPath();
  pts.forEach((p,idx)=>{if(idx===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});
  ctx.stroke();
  ctx.setLineDash([]);
  const tx=actor.overrideTarget.worldX,ty=actor.overrideTarget.worldY;
  const pulse=1+Math.sin(nowSec*5)*0.16;
  ctx.strokeStyle=color;
  ctx.lineWidth=2.4;
  ctx.beginPath();
  ctx.ellipse(tx,ty,16*pulse,10*pulse,0,0,Math.PI*2);
  ctx.stroke();
  ctx.fillStyle='#fffef8e8';
  ctx.beginPath();
  ctx.arc(tx,ty,4.2,0,Math.PI*2);
  ctx.fill();
  ctx.restore();
 }

 function render(time,{paused=false}={}){
  const dt=last===null?0:Math.min(.055,Math.max(0,time-last));
  last=time;
  stepResidents(state,world,dt,{paused});
  const vp=updateViewport();
  const c=canvas.getContext('2d');
  c.save();
  c.setTransform(vp.pixelRatio,0,0,vp.pixelRatio,0,0);
  c.clearRect(0,0,vp.width,vp.height);

  const rect={
   x:camera.x-vp.width/vp.scale/2-180,
   y:camera.y-vp.height/vp.scale/2-180,
   w:vp.width/vp.scale+360,
   h:vp.height/vp.scale+360,
  };

  c.translate(vp.width/2,vp.height/2);
  c.scale(vp.scale,vp.scale);
  c.translate(-camera.x,-camera.y);

  terrainCache.draw(c,world.seed,rect,art,art,vp.pixelRatio,world.objects);

  const visibleGroups=buildingCache.prepare(world.objects,world.catalog,rect,vp.pixelRatio);
  for(const g of visibleGroups){
   if(g.ground)buildingCache.draw(c,g);
  }

  for(const actor of state.actors){
   drawDirectedRoute(c,actor,state.elapsed);
  }

  const occupants=[...state.actors.map(a=>a.cell),...remote.map(r=>({x:r.position.x/CELL_PX,y:r.position.y/CELL_PX}))];
  const actorCells=occupants;
  const drawables=[];
  for(const g of visibleGroups){
   if(g.ground||g.roof)continue;
   drawables.push({
    depth:g.depth*CELL_PX,
    draw(){
     if(g.rows.length===1&&g.rows[0].item.building?.type==='door'){
      const row=g.rows[0];
      const open=homeDoorIsOpen(row.o,actorCells,row.connections);
      const img=imageFor(row.item.art);
      drawBuilding(c,row.item,{...row.o,doorOpen:open},img?.complete&&img.naturalWidth?img:null,row.connections,row.ao);
      return;
     }
     if(g.dynamic){
      for(const row of g.rows){
       const {o,item}=row,img=imageFor(item.art);
       if(item.building){
        drawBuilding(c,item,o,img?.complete&&img.naturalWidth?img:null,row.connections,row.ao);
       }else{
        const b=buildingBounds(o,item);
        drawHomeObject(c,item,o,o.x*CELL_PX,(o.y-(isRoofDecoration(o)?1.4:0))*CELL_PX,b.w*CELL_PX,b.h*CELL_PX,img,state.elapsed);
       }
      }
      return;
     }
     buildingCache.draw(c,g);
    },
   });
  }

  const trees=collectHomeWorldTrees(world.seed,rect,world.objects);
  for(const tree of trees){
   drawables.push({
    depth:tree.wy,
    draw(){drawHomeWorldTree(c,tree,tree.wx,tree.wy,1,art,'neural-city');},
   });
  }

  const nowMs=state.elapsed*1000;
  for(const r of remote){
   const entry=entries.get(r.persona)||rig.entries[0];
   const profile=r.profile;
   drawables.push({depth:r.position.y,draw(){
    entry.renderer.drawSave(c,profile,r.position.x,r.position.y,state.elapsed,r.moving&&!paused,ACTOR_SCALE,{facing:r.facing,hideLabel:true});
   }});
  }
  for(const a of state.actors){
   const entry=entries.get(a.profile.persona)||rig.entries[0];
   a.profile.name=labelFor(a.profile);
   drawables.push({
    depth:a.position.y,
    draw(){
     if(a.profile.id===selectedAgentId||a.mode==='directed'||a.profile.kind==='mine'){
      c.save();
      c.strokeStyle=a.profile.kind==='mine'?'#c9a24f':a.profile.color||'#356f59';
      c.lineWidth=a.mode==='directed'?2.6:1.8;
      c.fillStyle='rgba(255,253,240,0.28)';
      c.beginPath();
      c.ellipse(a.position.x,a.position.y+2,20,9,0,0,Math.PI*2);
      c.fill();
      c.stroke();
      c.restore();
     }
     const gesturePose=state.gesture?.ids?.includes(a.profile.id)?socialGesturePose(state.gesture,a.profile.id,nowMs):null;
     entry.renderer.drawSave(c,a.profile,a.position.x,a.position.y,state.elapsed,a.moving&&!paused,ACTOR_SCALE,{
      facing:a.facing,
      gesturePose,
      hideLabel:true,
     });
    },
   });
  }

  drawables.sort((a,b)=>a.depth-b.depth);
  for(const item of drawables)item.draw();

  const occupiedSections=new Set();
  const sections=buildingCache.sections();
  for(const g of visibleGroups){
   if(!g.roof)continue;
   for(const row of g.rows){
    if(row.item.building?.type!=='roof')continue;
    for(const cell of occupants){
     if(Math.floor(cell.x)===Math.floor(row.o.x)&&Math.floor(cell.y)===Math.floor(row.o.y)){
      const sec=sections.get(row.o.id)?.[0]?.id;
      if(sec)occupiedSections.add(sec);
     }
    }
   }
  }
  const roofGroups=visibleGroups.filter(g=>g.roof).sort((a,b)=>(a.decoration?1:0)-(b.decoration?1:0)||a.depth-b.depth);
  for(const g of roofGroups){
   const inside=g.section&&occupiedSections.has(g.section);
   buildingCache.draw(c,g,{alpha:inside?0.22:0.9});
  }

  c.restore();

  return [...state.actors.map(actor=>({actor,point:worldToScreen(actor.position)})),
   ...remote.map(actor=>({actor,point:worldToScreen(actor.position)}))];
 }

 return {
  world,
  state,
  render,
  project:worldToScreen,
  unproject:screenToWorld,
  selectAgent(id){if(state.actors.some(a=>a.profile.id===id))selectedAgentId=id;return selectedAgentId;},
  /** Replace local cast: demo residents (guest) or the owner's active Agent. */
  setCast(cast){
   const next=createResidents(world,(cast||demoCast()).map(profileFor));
   for(const key of Object.keys(state))delete state[key];
   Object.assign(state,next);
   selectedAgentId=state.actors[0]?.profile.id||null;
  },
  demoCast,
  /** Remote rows are already sanitized by remoteCast(). */
  setRemote(rows){
   remote=rows.map(r=>({...r,profile:profileFor({id:r.id,persona:r.persona,kind:'remote',name:r.name})}));
  },
  remote:()=>remote,
  selectedAgent:()=>selectedAgentId,
  direct(agentId,targetPoint,options){
   const id=agentId||selectedAgentId;
   if(state.actors.some(a=>a.profile.id===id))selectedAgentId=id;
   return directResident(state,world,id,targetPoint,options);
  },
  focusHome(homeId){
   const h=world.homes[homeId];
   if(!h)return false;
   camera.x=h.indoor.worldX;
   camera.y=h.indoor.worldY+40;
   camera.zoom=Math.max(camera.zoom,0.98);
   updateViewport();
   return true;
  },
  focus(point){
   if(!point)return false;
   camera.x=Number(point.x)||0;
   camera.y=Number(point.y)||0;
   updateViewport();
   return true;
  },
  focusScene(sceneId){
   const lm=world.landmarks.find(l=>l.id===sceneId);
   if(!lm)return false;
   camera.x=lm.x;
   camera.y=lm.y;
   updateViewport();
   return true;
  },
  pan(dx,dy){
   const a=screenToWorld(0,0),b=screenToWorld(dx,dy);
   camera.x=Math.max(-1100,Math.min(1100,camera.x+a.x-b.x));
   camera.y=Math.max(-800,Math.min(1200,camera.y+a.y-b.y));
   updateViewport();
  },
  zoom(factor){
   camera.zoom=Math.max(0.55,Math.min(1.65,camera.zoom*factor));
   updateViewport();
  },
  reset(){
   camera.x=world.center.x;
   camera.y=0;
   camera.zoom=0.80;
   updateViewport();
  },
  eventText(){
   const directedActor=state.actors.find(a=>a.mode==='directed');
   if(directedActor)return `${labelFor(directedActor.profile)} · ${directedActor.activityLabel}（随后恢复自主活动）`;
   const e=state.event;
   if(e?.type==='gesture'){
    const act=socialActions.find(a=>a.id===e.action);
    const label=id=>labelFor(state.actors.find(a=>a.profile.id===id)?.profile||{name:id});
    return `${e.ids.map(label).join(' 与 ')} · ${act?act.label:e.action}`;
   }
   const activeActor=state.actors[Math.floor(state.elapsed/4)%state.actors.length];
   if(activeActor)return `${labelFor(activeActor.profile)} · ${activeActor.activityLabel}`;
   return '居民正在各自家园与广场间自主漫步';
  },
 };
}
