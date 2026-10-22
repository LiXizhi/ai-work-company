import {walkingObstructions} from './home_building_core.js';
import {facingToward} from './hero_pose_core.js';
import {createPathQueue} from './path_queue_core.js';
import {footprint,homeBiomeAt,homeBridgeAt,homeRoadAt,homeWaterAt} from './home_core.js';

const BRIDGE_ITEMS=new Set(['bridge','stepping-stones','wood-floor','stone-path','brick-path','porch']);

// A click owns its collision snapshot: edits and newly loaded chunks are picked
// up by the next plan. Only inspect furniture in the sample's four-cell bucket.
function pathPassability(objects,catalog,seed,allowed){
 const buckets=new Map(),size=4;
 for(const o of objects){
  const b=footprint(o,catalog),bridge=BRIDGE_ITEMS.has(b.item.id);
  const blocks=bridge?[b]:walkingObstructions(o,b.item,objects,catalog);
  for(const block of blocks){
   const px=bridge?.15:.18,py=bridge?.15:.12;
   const row={x:block.x-px,y:block.y-py,right:block.x+block.w+px,bottom:block.y+block.h+py,bridge};
   for(let x=Math.floor(row.x/size);x<=Math.floor(row.right/size);x++){
    for(let y=Math.floor(row.y/size);y<=Math.floor(row.bottom/size);y++){
     const key=`${x},${y}`;if(!buckets.has(key))buckets.set(key,[]);
     buckets.get(key).push(row);
    }
   }
  }
 }
 return p=>{
  if(!allowed(p))return false;
  const rows=buckets.get(`${Math.floor(p.x/size)},${Math.floor(p.y/size)}`)||[];
  let onBridge=false;
  for(const b of rows){
   if(b.bridge){
    if(p.x>=b.x&&p.x<=b.right&&p.y>=b.y&&p.y<=b.bottom)onBridge=true;
   }else if(p.x>b.x&&p.x<b.right&&p.y>b.y&&p.y<b.bottom)return false;
  }
  return seed===null||seed===undefined||!homeWaterAt(seed,p.x,p.y).water||!!homeBridgeAt(seed,p.x,p.y)||onBridge;
 };
}

// Half-tile A*, bounded for the infinite home world. Use the same collision
// rules as manual walking, including placed bridges and rotated furniture.
export function findHomePath(start,target,objects=[],catalog=null,seed=null,allowed=()=>true){
 if(![start.x,start.y,target.x,target.y].every(Number.isFinite)||Math.hypot(target.x-start.x,target.y-start.y)>64||!allowed(target))return [];
 const pass=pathPassability(objects,catalog,seed,allowed);
 const clear=(a,b)=>{
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.1));
  for(let i=1;i<=steps;i++)if(!pass({x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps}))return false;
  return true;
 };
 if(clear(start,target))return [{x:target.x,y:target.y}];
 const point=n=>({x:start.x+n.x*.5,y:start.y+n.y*.5}),key=n=>`${n.x},${n.y}`;
 const passCache=new Map();
 const nodePass=n=>{const k=key(n);if(!passCache.has(k))passCache.set(k,pass(point(n)));return passCache.get(k);};
 const distance=p=>Math.hypot(p.x-target.x,p.y-target.y),exact=pass(target);
 const minX=Math.min(start.x,target.x)-26,maxX=Math.max(start.x,target.x)+26;
 const minY=Math.min(start.y,target.y)-26,maxY=Math.max(start.y,target.y)+26;
 const open=createPathQueue(),cost=new Map([['0,0',0]]),parents=new Map(),closed=new Set();
 const origin={x:0,y:0};open.push(origin,'0,0',distance(start));
 let nearest=null,best=Infinity,goal=null;
 while(open.length&&closed.size<12000){
  const n=open.shift(),k=key(n);if(closed.has(k))continue;closed.add(k);
  const p=point(n),d=distance(p);
  if(d<best&&nodePass(n)){nearest=n;best=d;}
  if(!exact&&d<=.5&&nodePass(n)){goal=n;break;}
  if(exact&&d<=.75&&clear(p,target)){goal=n;break;}
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const next={x:n.x+dx,y:n.y+dy},nk=key(next),q=point(next);
   const score=cost.get(k)+Math.hypot(dx,dy)*.5;
   if(score>=(cost.get(nk)??Infinity))continue;
   if(closed.has(nk)||q.x<minX||q.x>maxX||q.y<minY||q.y>maxY||!nodePass(next)||!clear(p,q))continue;
   if(dx&&dy&&(!nodePass({x:n.x+dx,y:n.y})||!nodePass({x:n.x,y:n.y+dy})))continue;
   cost.set(nk,score);parents.set(nk,n);open.push(next,nk,score+distance(q));
  }
 }
 if(!goal&&!exact&&best<=2)goal=nearest;
 if(!goal)return [];
 const route=[];
 for(let n=goal;key(n)!=='0,0';n=parents.get(key(n)))route.push(point(n));
 route.reverse();if(exact)route.push({x:target.x,y:target.y});
 const result=[];let from=start;
 for(let i=0;i<route.length;){let end=i;while(end+1<route.length&&clear(from,route[end+1]))end++;result.push(route[end]);from=route[end];i=end+1;}
 return result;
}

export function isHomePassable(x,y,objects=[],catalog=null,seed=null){
 const blockedBySolid=objects.some(o=>{
  const b=footprint(o,catalog);
  const blocks=BRIDGE_ITEMS.has(b.item.id)?[]:walkingObstructions(o,b.item,objects,catalog,{x,y});
  return blocks.some(block=>x+.18>block.x&&x-.18<block.x+block.w&&y+.12>block.y&&y-.12<block.y+block.h);
 });
 if(blockedBySolid)return false;
 if(seed!==null&&seed!==undefined){
  const waterInfo=homeWaterAt(seed,x,y);
  if(waterInfo.water&&!homeBridgeAt(seed,x,y)){
   const onPlacedBridge=objects.some(o=>{
    const b=footprint(o,catalog);
    return BRIDGE_ITEMS.has(b.item.id)&&x>=b.x-.15&&x<=b.x+b.w+.15&&y>=b.y-.15&&y<=b.y+b.h+.15;
   });
   if(!onPlacedBridge)return false;
  }
 }
 return true;
}

export function surfaceAtHome(seed,x,y,objects=[],catalog=null){
 for(const o of objects){
  const b=footprint(o,catalog);
  if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){
   if(b.item.id==='bridge'||b.item.id==='wood-floor'||b.item.id==='porch')return 'bridge';
   if(b.item.id==='stone-path'||b.item.id==='brick-path'||b.item.id==='stepping-stones'||b.item.id==='gravel-path')return 'road';
   if(b.item.id==='sand-patch'||b.item.id==='sandbox')return 'beach';
  }
 }
 if(seed!==null&&seed!==undefined){
  if(homeBridgeAt(seed,x,y))return 'bridge';
  if(homeRoadAt(seed,x,y).road)return 'road';
  const water=homeWaterAt(seed,x,y);
  if(water.bank)return 'beach';
  return homeBiomeAt(seed,x,y).id;
 }
 return 'meadow';
}

// Home walking uses separate coordinates; never mutates the adventure save.
export function homeHeldPointerTarget(hero,pointer,viewport,scale){
 const dx=(pointer.sx-viewport.width/2)/scale,dy=(pointer.sy-viewport.height/2)/scale,distance=Math.hypot(dx,dy);
 const travel=Math.max(0,distance-6/40);
 return {x:hero.x+(distance?dx/distance*travel:0),y:hero.y+(distance?dy/distance*travel:0)};
}

export function stepHomeWalk(hero,target,dt,objects,catalog,seed=null){
 const dx=target.x-hero.x,dy=target.y-hero.y,distance=Math.hypot(dx,dy),step=Math.min(distance,Math.max(0,Math.min(dt,.05))*4);
 if(distance<.08)return {...hero,moving:false};
 const nx=hero.x+dx/distance*step,ny=hero.y+dy/distance*step;
 const facing=facingToward(dx,dy);
 if(isHomePassable(nx,ny,objects,catalog,seed)){
  return {...hero,x:nx,y:ny,facing,moving:distance>step,surface:surfaceAtHome(seed,nx,ny,objects,catalog)};
 }
 // Try sliding along X or Y axis if diagonal is blocked by river bank or furniture corner
 if(Math.abs(dx)>.02&&isHomePassable(nx,hero.y,objects,catalog,seed)){
  return {...hero,x:nx,y:hero.y,facing,moving:true,surface:surfaceAtHome(seed,nx,hero.y,objects,catalog)};
 }
 if(Math.abs(dy)>.02&&isHomePassable(hero.x,ny,objects,catalog,seed)){
  return {...hero,x:hero.x,y:ny,facing,moving:true,surface:surfaceAtHome(seed,hero.x,ny,objects,catalog)};
 }
 return {...hero,x:hero.x,y:hero.y,facing,moving:false,surface:surfaceAtHome(seed,hero.x,hero.y,objects,catalog)};
}

