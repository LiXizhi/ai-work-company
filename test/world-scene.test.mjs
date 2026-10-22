import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPlaza,createResidents,stepResidents,directResident,CELL_PX} from '../site/world-scene-core.mjs';
import {isHomePassable,findHomePath} from '../site/vendor/haqi/home_walk_core.js';
import {validateHomePart} from '../site/vendor/haqi/home_core.js';
import {homeDoorIsOpen,roofSections} from '../site/vendor/haqi/home_building_core.js';
import {socialGesturePose} from '../site/vendor/haqi/adventure_social_actions_core.js';
import {Store} from '../backend/store.mjs';
import {createServer} from '../backend/server.mjs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('scene uses upstream Haqi home-land and renderer modules directly without source patches',()=>{
 const sceneCode=read('site/world-scene.mjs');
 assert.ok(sceneCode.includes("from './vendor/haqi/adventure_renderer.js'"));
 assert.ok(sceneCode.includes("from './vendor/haqi/home_terrain_cache.js'"));
 assert.ok(sceneCode.includes("from './vendor/haqi/home_building_cache.js'"));
 assert.ok(!sceneCode.includes('groundedPose'));
 assert.ok(!read('site/index.html').includes('world-city.png'));
});

test('each Agent has its own valid Haqi home with doors, roof sections, and furniture from catalog.json',()=>{
 const catalog=JSON.parse(read('site/vendor/haqi-data/data/adventure/home/catalog.json')).items;
 const world=createPlaza(catalog);
 const ids=['astra','claude','deepseek','gemini'];
 assert.deepEqual(Object.keys(world.homes),ids);
 for(const id of ids){
  const h=world.homes[id];
  assert.ok(h.home.id.includes(id));
  assert.ok(h.objects.length>=30,`expected building & furniture objects for ${id}`);
  for(const [k,v] of Object.entries(h.parts)){
   if(k.startsWith('chunk:'))validateHomePart('chunk',v,catalog);
  }
  assert.ok(isHomePassable(h.indoor.x,h.indoor.y,world.objects,catalog,world.seed));
  assert.ok(isHomePassable(h.yard.x,h.yard.y,world.objects,catalog,world.seed));
  const pathFromPlaza=findHomePath({x:0,y:0},h.indoor,world.objects,catalog,world.seed);
  assert.ok(pathFromPlaza.length>=2,`expected passable route from plaza into ${id}'s home`);
  const doorObj=h.objects.find(o=>o.itemId.endsWith('-door'));
  assert.ok(doorObj);
  assert.equal(homeDoorIsOpen(doorObj,[{x:h.door.x,y:h.door.y}],0),true);
 }
 const sections=roofSections(world.objects,catalog);
 assert.ok(sections.size>0);
});

test('residents move autonomously across homes and plaza, meet with paired gestures, and freeze on pause',()=>{
 const catalog=JSON.parse(read('site/vendor/haqi-data/data/adventure/home/catalog.json')).items;
 const world=createPlaza(catalog),state=createResidents(world,['astra','claude','deepseek','gemini'].map(id=>({id})));
 const start=state.actors.map(a=>({...a.position})),distance=[0,0,0,0];let gestures=0;
 for(let i=0;i<600;i++){
  const previous=state.actors.map(a=>({...a.position}));stepResidents(state,world,.05);
  state.actors.forEach((a,idx)=>{
   assert.ok(isHomePassable(a.cell.x,a.cell.y,world.objects,world.catalog,world.seed));
   distance[idx]+=Math.hypot(a.position.x-previous[idx].x,a.position.y-previous[idx].y);
  });
  if(state.gesture){gestures++;for(const id of state.gesture.ids)assert.ok(socialGesturePose(state.gesture,id,state.elapsed*1000));}
 }
 assert.ok(distance.every(d=>d>400),JSON.stringify(distance));
 assert.ok(state.meetings>=2);
 assert.ok(gestures>0);
 const snapshot=JSON.stringify(state);stepResidents(state,world,1,{paused:true});assert.equal(JSON.stringify(state),snapshot);
 assert.notDeepEqual(state.actors.map(a=>a.position),start);
 // Solid furniture (bed at -8.. -6, 3..5) blocks passability
 assert.equal(isHomePassable(-7,4,world.objects,world.catalog,world.seed),false);
});

test('user-directed movement overrides autonomy, follows collision-aware path, and resumes autonomous activity afterward',()=>{
 const catalog=JSON.parse(read('site/vendor/haqi-data/data/adventure/home/catalog.json')).items;
 const world=createPlaza(catalog),state=createResidents(world,['astra','claude','deepseek','gemini'].map(id=>({id})));
 const targetHome=world.homes.gemini;
 const directed=directResident(state,world,'astra',{x:targetHome.indoor.x*CELL_PX,y:targetHome.indoor.y*CELL_PX,label:'双子星居室内'},{hold:0.8});
 assert.equal(directed.ok,true);
 assert.equal(state.actors[0].mode,'directed');
 assert.ok(directed.route.length>=2);

 let arrived=false,resumed=false;
 for(let i=0;i<500;i++){
  stepResidents(state,world,.05);
  const astra=state.actors[0];
  assert.ok(isHomePassable(astra.cell.x,astra.cell.y,world.objects,world.catalog,world.seed));
  if(astra.mode==='directed'&&astra.arrivedOverride){
   arrived=true;
   assert.ok(Math.hypot(astra.cell.x-targetHome.indoor.x,astra.cell.y-targetHome.indoor.y)<0.35);
  }
  if(arrived&&astra.mode==='autonomous'&&astra.route.length>0){
   resumed=true;
   break;
  }
 }
 assert.equal(arrived,true,'expected Agent to arrive at user-specified destination');
 assert.equal(resumed,true,'expected Agent to automatically resume autonomous activity after reaching destination');
});

test('scene atlas files match upstream provenance hashes',()=>{
 const manifest=JSON.parse(read('site/assets/haqi-scene.json'));
 for(const row of Object.values(manifest.atlases)){
  const bytes=readFileSync(new URL('../site/'+row.local,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 }
});

test('self-hosted scene modules, home catalog, and WebP atlases are served from the fixed allowlist',async()=>{
 const store=new Store(),server=createServer(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const manifest=JSON.parse(read('site/assets/haqi-scene.json'));
  const vendor=JSON.parse(read('site/vendor/haqi/provenance.json'));
  const paths=[
   'world-scene.mjs',
   'world-scene-core.mjs',
   'vendor/haqi-data/data/adventure/home/catalog.json',
   ...Object.keys(vendor.files).map(p=>'vendor/haqi/'+p),
   ...Object.values(manifest.atlases).map(r=>r.local),
  ];
  for(const path of paths){const response=await fetch(base+'/'+path);assert.equal(response.status,200,path);await response.arrayBuffer();}
  assert.equal((await fetch(base+'/assets/adventure/environment/private.webp')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
