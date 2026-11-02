import {buildingFloorAO} from './home_building_ao_core.js';
import {isEdge,buildingWallFeet,isRoofDecoration,buildingConnections,buildingConnectionMask,buildingItem,buildingBounds,roofSections} from './home_building_core.js';
import {buildingVisualBounds,drawBuilding} from './view_home_building.js';
import {homeInteractiveKind} from './home_core.js';
import {drawHomeObject,homeObjectVisualBounds} from './view_home_art.js';
const LIMIT=32*1024*1024;
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const close=bitmap=>{if(bitmap?.close)bitmap.close();else if(bitmap)bitmap.width=bitmap.height=0;};
export function createHomeBuildingCache({imageFor,enabled=true}={}){
 let source=null,excluded='',groups=[],connections=new Map(),masks=new Map(),sections=new Map(),epoch=0,disposed=false,density=1,worker=null,active=null,timer=null,nextId=0;
 const entries=new Map(),sent=new Set();let bytes=0,bakes=0,bakeMs=0,hits=0,live=0;
 try{if(typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined')worker=new Worker(new URL('./home_building_worker.js',import.meta.url),{type:'module'});}catch{}
 const release=key=>{const row=entries.get(key);if(row){bytes-=row.bytes;close(row.bitmap);entries.delete(key);}};
 function cancel(){epoch++;if(timer!==null)clearTimeout(timer);timer=null;active=null;}
 function finish(job,bitmap){if(disposed||active!==job||job.epoch!==epoch){close(bitmap);return;}active=null;release(job.group.key);entries.set(job.group.key,{bitmap,bytes:job.bytes,signature:job.group.signature,density,last:performance.now()});bytes+=job.bytes;bakes++;bakeMs+=performance.now()-job.started;}
 if(worker){worker.onmessage=({data})=>{const job=active;if(!job||job.id!==data.id){close(data.bitmap);return;}if(data.error){worker.terminate();worker=null;active=null;return;}finish(job,data.bitmap);};worker.onerror=()=>{worker?.terminate();worker=null;active=null;};}
 function index(objects,catalog,exclude){
  if(source===objects&&excluded===exclude)return;
  source=objects;excluded=exclude;cancel();connections=buildingConnections(objects,catalog);masks=new Map(objects.map(o=>[o.id,buildingConnectionMask(o,objects,catalog)]));sections=roofSections(objects,catalog);
  const map=new Map(),ao=buildingFloorAO(objects,catalog,exclude);
  for(const o of objects){const item=buildingItem(o,catalog);if(!item)continue;
   const type=item.building?.type,decoration=isRoofDecoration(o),ground=item.layer==='ground'&&!decoration,roof=type==='roof'||decoration,b=buildingBounds(o,item);
   const visual=item.building?buildingVisualBounds(o,item):homeObjectVisualBounds(item,o,o.x*40,(o.y-(decoration?1.4:0))*40,b.w*40,b.h*40);
   const left=Math.min(o.x*40,visual.x)-8,top=Math.min(o.y*40,visual.y)-8;
   const bounds=item.building?visual:{x:left,y:top,w:Math.max(visual.x+visual.w,(o.x+b.w)*40)-left+8,h:Math.max(visual.y+visual.h,(o.y+b.h)*40)-top+8};
   const dynamic=o.id===exclude||type==='door'||item.activity||o.interactionEnabled||homeInteractiveKind(item.id);
   const depth=(isEdge(item)?Math.max(...buildingWallFeet(o,masks.get(o.id)).map(f=>f.y+f.h)):o.y+b.h)+(o.parentId?2:0),section=roof?sections.get(decoration?o.parentId:o.id)?.[0]?.id:'',key=dynamic?`live:${o.id}`:decoration?`roof-decoration:${o.id}`:!item.building&&!ground?`furniture:${o.id}`:`${roof?'roof:'+section:ground?'ground':'depth:'+depth}:${Math.floor(o.x/8)},${Math.floor(o.y/8)}`;
   let group=map.get(key);if(!group){group={key,rows:[],ground,roof,decoration,section,depth,dynamic,bounds:{...bounds}};map.set(key,group);}
   const endX=Math.max(group.bounds.x+group.bounds.w,bounds.x+bounds.w),endY=Math.max(group.bounds.y+group.bounds.h,bounds.y+bounds.h);group.bounds.x=Math.min(group.bounds.x,bounds.x);group.bounds.y=Math.min(group.bounds.y,bounds.y);group.bounds.w=endX-group.bounds.x;group.bounds.h=endY-group.bounds.y;
   group.rows.push({o,item,ao:ao.get(o.id)||[],connections:masks.get(o.id)??connections.get(o.id)??0});
  }
  groups=[...map.values()];for(const g of groups)g.signature=JSON.stringify(g.rows.map(r=>[r.o,r.connections,r.item.art,r.item.building?.theme,r.ao]));
  const byKey=new Map(groups.map(g=>[g.key,g]));for(const [key,row]of entries)if(byKey.get(key)?.signature!==row.signature)release(key);
 }
 function paintRows(c,g){for(const row of g.rows){const {o,item}=row,image=imageFor(item.art);if(item.building)drawBuilding(c,item,o,image?.complete&&image.naturalWidth?image:null,row.connections,row.ao);else{const b=buildingBounds(o,item);drawHomeObject(c,item,o,o.x*40,(o.y-(isRoofDecoration(o)?1.4:0))*40,b.w*40,b.h*40,image,0);}}}
 async function bake(job){
  if(active!==job)return;
  try{
   const images=job.group.rows.map(r=>imageFor(r.item.art));if(images.some(i=>!i?.complete||!i.naturalWidth)){active=null;return;}
   if(worker&&job.group.rows.every(r=>r.item.building)){
    for(const image of images){if(sent.has(image.src))continue;const bitmap=await createImageBitmap(image);if(active!==job){bitmap.close();return;}worker.postMessage({type:'image',key:image.src,image:bitmap},[bitmap]);sent.add(image.src);}
    worker.postMessage({id:job.id,rows:job.group.rows.map((r,i)=>({...r,url:images[i].src})),bounds:job.group.bounds,density});
   }else{
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(job.group.bounds.w*density);canvas.height=Math.ceil(job.group.bounds.h*density);const c=canvas.getContext('2d');c.scale(density,density);c.translate(-job.group.bounds.x,-job.group.bounds.y);
    // Yield between sprites, keeping main-thread fallback slices bounded.
    let start=performance.now();for(const row of job.group.rows){paintRows(c,{rows:[row]});if(performance.now()-start>2){await new Promise(r=>setTimeout(r,0));if(active!==job){close(canvas);return;}start=performance.now();}}
    const bitmap=typeof createImageBitmap==='function'?await createImageBitmap(canvas):canvas;if(bitmap!==canvas)close(canvas);finish(job,bitmap);
   }
  }catch{active=null;worker?.terminate();worker=null;}
 }
 return {
  prepare(objects,catalog,rect,pixelRatio,exclude=''){
   index(objects,catalog,exclude);const next=Math.min(2,Math.max(1,Math.ceil(pixelRatio*4)/4));if(next!==density){cancel();for(const key of entries.keys())release(key);density=next;}
   const visible=groups.filter(g=>overlap(g.bounds,rect)),protectedKeys=new Set(visible.map(g=>g.key));
   if(enabled&&!active&&!disposed){const near={x:rect.x-320,y:rect.y-320,w:rect.w+640,h:rect.h+640};const candidates=[...visible,...groups.filter(g=>!protectedKeys.has(g.key)&&overlap(g.bounds,near))];
    const g=candidates.find(g=>!g.dynamic&&!entries.has(g.key)&&g.rows.every(r=>{const i=imageFor(r.item.art);return i?.complete&&i.naturalWidth;}));
    if(g){const required=Math.ceil(g.bounds.w*density)*Math.ceil(g.bounds.h*density)*4;for(const [key]of [...entries].sort((a,b)=>a[1].last-b[1].last)){if(bytes+required<=LIMIT)break;if(!protectedKeys.has(key))release(key);}
     if(required+bytes<=LIMIT){active={id:++nextId,group:g,epoch,bytes:required,started:performance.now()};const job=active;timer=setTimeout(()=>{timer=null;void bake(job);},0);}
    }
   }
   return visible;
  },
  draw(c,g,{alpha=1,forceLive=false}={}){c.save();c.globalAlpha*=alpha;const row=enabled&&!forceLive&&entries.get(g.key);if(row){hits++;row.last=performance.now();c.drawImage(row.bitmap,g.bounds.x,g.bounds.y,g.bounds.w,g.bounds.h);}else{live++;paintRows(c,g);}c.restore();},
  sections:()=>sections,
  stats:()=>({bytes:bytes+(active?.bytes||0),limitBytes:LIMIT,bakes,bakeMs,hits,live,pending:!!active,mode:worker?'worker':'fallback'}),
  clear(){cancel();source=null;groups=[];for(const key of entries.keys())release(key);},
  dispose(){disposed=true;this.clear();worker?.terminate();},
 };
}
