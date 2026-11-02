// Integration only: rendering, pose, walking, social motion, ordering and DPR are
// the unchanged HaqiCombatSim modules pinned under vendor/haqi/.
import {HeroRenderer} from './vendor/haqi/hero_renderer.js';
import {createSocialActors,stepSocialActors} from './vendor/haqi/adventure_social_motion_core.js';
import {mergeSceneObjects} from './vendor/haqi/scene_order_core.js';
import {sceneResolution} from './vendor/haqi/scene_resolution_core.js';
import {pauseBackgroundScene} from './vendor/haqi/adventure_scene_pause_core.js';
import {residents} from './world-state.mjs';
export {pauseBackgroundScene};
export function plazaWorld(){return {
  zone:'ai-plaza',w:1536,h:1024,center:{x:800,y:550},
  layout:{spawn:{x:800,y:550},coast:[[580,400],[1110,400],[1110,710],[580,710]],bridges:[],rivers:[],lakes:[]},
  paths:[{a:{x:630,y:520},b:{x:1060,y:520},width:130},{a:{x:630,y:630},b:{x:1060,y:630},width:100}],
  landmarks:[{id:'plaza',name:'中央广场',x:800,y:550}],npcs:[],encounters:[],buildings:[],trees:[],decorations:[],
};}
let pending;
export function loadRig(){return pending??=(async()=>{
  const response=await fetch(new URL('assets/personas/manifest.json',import.meta.url));
  if(!response.ok)throw Error('Character manifest unavailable');
  const manifest=await response.json(),world=plazaWorld();
  const actors=createSocialActors(world,residents.map(r=>({id:r.id,name:r.name})),7419);
  const entries=await Promise.all(residents.map(async r=>{
    const renderer=new HeroRenderer(manifest,{mounts:[]},{local:true,baseURL:new URL('./',import.meta.url)});
    const appearance={gender:'female',...manifest.personas[r.id]};
    const result=await renderer.ensure(appearance);if(result.fallback)throw Error(result.errors?.join(',')||'Character texture unavailable');
    const social=actors.find(a=>a.profile.id===r.id);
    return {resident:r,renderer,appearance,social,actor:renderer.createActor(7419+r.index),previewActor:renderer.createActor(880+r.index),previous:{...social.position},pose:null};
  }));
  return {world,actors,entries,lastTime:null};
})().catch(e=>{pending=null;throw e;});}
export function stepRigScene(assets,time,{paused=false,reducedMotion=false}={}){
  const dt=assets.lastTime===null?0:Math.max(0,Math.min(.055,time-assets.lastTime));assets.lastTime=time;
  stepSocialActors(assets.actors,assets.world,dt,{paused:paused||reducedMotion});
  const peers=assets.actors.map(a=>({id:a.profile.id,...a.position,canTurn:true}));
  for(const entry of assets.entries){const {social,previous,actor,renderer}=entry;
    if(!paused||!entry.pose)entry.pose=renderer.updateActor(actor,{id:social.profile.id,dx:social.position.x-previous.x,dy:social.position.y-previous.y,...social.position,time,facing:social.facing,lookPeers:peers,npcs:[],reducedMotion});
    entry.previous={...social.position};
  }
  return mergeSceneObjects([],assets.entries.map(entry=>({entry,y:entry.social.position.y})));
}
export function previewPose(assets,index,{time=0,moving=false,facing=0,head=null,reducedMotion=false}={}){
  const entry=assets.entries[index],dx=moving&&facing===1?-2:moving&&facing===2?2:0,dy=moving&&facing===0?2:moving&&facing===3?-2:0;
  const pose=entry.renderer.updateActor(entry.previewActor,{time,facing,dx,dy,reducedMotion});
  if(head!==null)pose.head=head;
  return pose;
}
export function drawRig(canvas,assets,index,pose,{bodyOnly=false,debug=false,time=0,reducedMotion=false}={}){
  const entry=assets.entries[index],ratio=sceneResolution(window.devicePixelRatio||1,{coarse:matchMedia('(pointer:coarse)').matches}).display,w=110,h=140;
  if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
  const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#38584b29';ctx.beginPath();ctx.ellipse(55,130,17,4,0,0,Math.PI*2);ctx.fill();
  return entry.renderer.draw(ctx,entry.appearance,{x:55,y:130,size:78,time,reducedMotion,...(pose||entry.pose||{}),bodyOnly,debug});
}
