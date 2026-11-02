import {createScheduledTerrainCache} from './terrain_tile_scheduler.js';
import {createIslandTerrainRasterizer} from './island_terrain_rasterizer.js';
import {paintHomeWorldTerrainSteps} from './view_home_art.js';

// The island scheduler owns preparation, prefetch, bitmap lifetime and a 32 MiB terrain budget; building caches reserve the other 32 MiB.
export function createHomeTerrainCache({theme=null}={}){
 const art={manifest:{atlases:{}},images:{}};
 let world=null,environment=null,decoration=null;
 const rasterize=createIslandTerrainRasterizer(art,{workerUrl:new URL('./home_terrain_worker.js',import.meta.url),snapshotWorld:world=>({seed:world.seed,objects:world.objects,theme:world.theme})});
 const track=(source,prefix,atlases)=>({
  draw(c,atlas,...args){atlases.add(prefix+atlas);return source?.draw(c,atlas,...args)||false;},
  pattern(c,atlas,...args){atlases.add(prefix+atlas);return source?.pattern(c,atlas,...args)||null;}
 });
 const cache=createScheduledTerrainCache({
  budget:2,maxBytes:32*1024*1024,rasterize:rasterize?async(...args)=>{
   const result=await rasterize(...args);
   for(const atlas of result.atlases){
    const slash=atlas.indexOf('/'),source=atlas.startsWith('env/')?environment:decoration;
    if(source?.manifest.atlases[atlas.slice(slash+1)])void source.ensure(atlas.slice(slash+1)).catch(()=>{});
   }
   return result;
  }:null,createCanvas:()=>document.createElement('canvas'),
  paint:function*(c,world,rect,atlases){yield* paintHomeWorldTerrainSteps(c,world.seed,rect,track(environment,'env/',atlases),track(decoration,'decor/',atlases),world.objects,world.theme);}
 });
 function sync(source,prefix){
  for(const [key,row] of Object.entries(source?.manifest.atlases||{}))art.manifest.atlases[prefix+key]=row;
  for(const [key,image] of Object.entries(source?.images||{})){
   if(art.images[prefix+key]===image)continue;
   art.images[prefix+key]=image;cache.invalidateAtlas(prefix+key);
  }
 }
 return {
  draw(c,seed,rect,env,decor,pixelRatio,objects=[]){
   // Only positions affect natural tree suppression; inventory/selection/animation do not.
   const positions=new Map(objects.map(o=>[`${o.x},${o.y}`,{x:o.x,y:o.y}]));
   if(!world||world.seed!==seed)world={seed,theme,unbounded:true,layout:{},positions,objects:[...positions.values()]};
   else {
    const changed=[...world.positions].filter(([key])=>!positions.has(key)).concat([...positions].filter(([key])=>!world.positions.has(key)));
    if(changed.length){
     for(const [,p] of changed)cache.invalidateRect({x:(p.x+.5)*40-180,y:(p.y+.5)*40-180,w:360,h:360},{keepPrevious:true});
     world={...world,positions,objects:[...positions.values()]};
    }
   }
   environment=env;decoration=decor;
   sync(env,'env/');sync(decor,'decor/');
   return cache.draw(c,world,rect,(c,x,y,size)=>{c.fillStyle=theme==='neural-city'?'#f3ecdb':'#8eb768';c.fillRect(x,y,size,size);},pixelRatio);
  },
  clear(){cache.clear();},
  dispose(){cache.clear();rasterize?.dispose();},
  stats:()=>cache.stats()
 };
}
