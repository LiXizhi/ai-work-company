import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PERSONAS,MAX_ROLES,emptyRoles,validateRoles,createRole,renameRole,deleteRole,activateRole,activeRole,roleAppearance,remoteCast,WORLD_ROOM} from '../site/world-roles-core.mjs';
import {createPlaza,createResidents,stepResidents,directResident} from '../site/world-scene-core.mjs';
import {isHomePassable} from '../site/vendor/haqi/home_walk_core.js';
import {presenceAppearance} from '../site/vendor/haqi/adventure_presence_core.js';
import {createRoleStore,ROLES_WORKSPACE} from '../site/world-roles.mjs';
import {Store} from '../backend/store.mjs';
import {createServer,worldPagePolicy} from '../backend/server.mjs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

let n=0;const uuid=()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;
const clock=()=>{let t=1000;return()=>t+=1000;};

test('roles: create up to five persona-bound Agents with clean names, then refuse more',()=>{
 let catalog=emptyRoles();const now=clock();
 for(let i=0;i<MAX_ROLES;i++){
  const {catalog:next,role}=createRole(catalog,{persona:PERSONAS[i%4],name:`  小橘${i}\u202E `},{uuid,now});
  assert.equal(role.name,`小橘${i}`);assert.equal(next.activeId,role.id);catalog=next;
 }
 assert.equal(catalog.roles.length,MAX_ROLES);
 assert.throws(()=>createRole(catalog,{persona:'astra',name:'多余'},{uuid,now}),/role_limit/);
 assert.throws(()=>createRole(emptyRoles(),{persona:'gpt-6',name:'x'},{uuid,now}),/invalid_persona/);
 assert.throws(()=>createRole(emptyRoles(),{persona:'astra',name:'星'.repeat(21)},{uuid,now}),/invalid_role_name/);
 assert.throws(()=>createRole(emptyRoles(),{persona:'astra',name:'ok'},{uuid:()=>'../../etc',now}),/invalid_role_id/);
});

test('roles: rename, activate and delete keep a valid active Agent; corrupt catalogues are rejected',()=>{
 const now=clock();
 let {catalog,role:a}=createRole(emptyRoles(),{persona:'claude',name:'A'},{uuid,now});
 const second=createRole(catalog,{persona:'gemini',name:'B'},{uuid,now});catalog=second.catalog;
 catalog=activateRole(catalog,a.id,now);assert.equal(activeRole(catalog).id,a.id);
 catalog=renameRole(catalog,a.id,'新名字');assert.equal(activeRole(catalog).name,'新名字');
 catalog=deleteRole(catalog,a.id);assert.equal(catalog.activeId,second.role.id);
 catalog=deleteRole(catalog,second.role.id);assert.equal(catalog.activeId,null);
 assert.throws(()=>renameRole(catalog,'missing','x'),/unknown_role/);
 for(const bad of [null,{schemaVersion:2,roles:[]},{schemaVersion:1,roles:'x'},
  {schemaVersion:1,activeId:'nope',roles:[]},
  {schemaVersion:1,activeId:null,roles:[{id:uuid(),persona:'astra',name:'x',createdAt:1,lastActiveAt:1,token:'secret'}].concat(Array(5).fill(null))}])
  assert.throws(()=>validateRoles(bad));
 const extra=validateRoles({schemaVersion:1,activeId:null,roles:[{id:uuid(),persona:'astra',name:'x',createdAt:1,lastActiveAt:1,token:'secret'}]});
 assert.equal('token' in extra.roles[0],false);
});

test('presence advertises only whitelisted appearance; remote rows are bounded and sanitized',()=>{
 const role={id:uuid(),persona:'deepseek',name:'鲸鲸',createdAt:1,lastActiveAt:1};
 assert.deepEqual(presenceAppearance(roleAppearance(role)),{name:'鲸鲸',appearance:'girl',headId:'deepseek',bodyId:'female-ai-deepseek',level:1});
 assert.equal(WORLD_ROOM,'awc:city');
 const rows=[
  {id:'p1',profile:{name:'Bob',headId:'claude'},position:{x:10,y:20},facing:2,moving:true},
  {id:'p2',profile:{name:'\u0000\u202E',headId:'haqi-boss'},position:{x:1,y:2},facing:9},
  {id:'p3',profile:{},position:{x:NaN,y:0}},
  null,{position:{x:1,y:1}},
 ];
 const cast=remoteCast(rows);
 assert.equal(cast.length,2);
 assert.deepEqual(cast[0],{id:'remote:p1',persona:'claude',name:'Bob',position:{x:10,y:20},facing:2,moving:true});
 assert.ok(PERSONAS.includes(cast[1].persona));assert.equal(cast[1].name,'访客 Agent');assert.equal(cast[1].facing,0);
 assert.equal(remoteCast(Array.from({length:500},(_,i)=>({id:'x'+i,position:{x:0,y:0}}))).length,60);
});

test('an owned Agent lives in its persona home, moves autonomously and accepts bounded directions',()=>{
 const catalog=JSON.parse(read('site/vendor/haqi-data/data/adventure/home/catalog.json')).items;
 const world=createPlaza(catalog);
 const state=createResidents(world,[{id:'mine',persona:'gemini',kind:'mine',homeId:'gemini',homeIndex:3}]);
 assert.equal(state.actors[0].homeId,'gemini');
 const start={...state.actors[0].position};let moved=0;
 for(let i=0;i<400;i++){const p={...state.actors[0].position};stepResidents(state,world,.05);moved+=Math.hypot(state.actors[0].position.x-p.x,state.actors[0].position.y-p.y);
  assert.ok(isHomePassable(state.actors[0].cell.x,state.actors[0].cell.y,world.objects,world.catalog,world.seed));}
 assert.ok(moved>200,String(moved));void start;
 const res=directResident(state,world,'mine',{cellX:0,cellY:0.6,label:'中央广场'});
 assert.equal(res.ok,true);assert.equal(state.actors[0].mode,'directed');
 for(let i=0;i<1200&&state.actors[0].mode==='directed';i++)stepResidents(state,world,.05);
 assert.equal(state.actors[0].mode,'autonomous');
});

test('role store uses the separate AIWorkCompany workspace and never treats network failure as empty',async()=>{
 const pages=new Map();let workspace=null,fail=false;
 const sdk={personalPageStore:{withWorkspace(name){workspace=name;return {
   getRemotePagePath:path=>`alice/AIWorkCompany/${path}`,supportsDirectCacheWrite:true,
   async savePageData(path,_k,text){pages.set(`alice/AIWorkCompany/${path}`,text);} };}},
  async loadPage({sitePath,pagePath}){const full=`${sitePath}/${pagePath}`;if(fail)throw Error('network');
   if(!pages.has(full))throw Error(`Page not found: ${full}`);return {success:true,content:pages.get(full)};}};
 const store=createRoleStore({sdk,owner:'alice'});
 assert.equal(workspace,ROLES_WORKSPACE);
 assert.deepEqual(await store.load(),emptyRoles());
 const {catalog}=createRole(emptyRoles(),{persona:'astra',name:'Astra'},{uuid,now:clock()});
 await store.save(catalog);assert.deepEqual(await store.load(),catalog);
 fail=true;await assert.rejects(store.load(),/读取失败/);fail=false;
 pages.set('alice/AIWorkCompany/world/roles.json',JSON.stringify({owner:'mallory',catalog}));
 await assert.rejects(store.load(),/账号不一致/);
 await assert.rejects(createRoleStore({sdk:{personalPageStore:{withWorkspace:()=>({getRemotePagePath:p=>`bob/${p}`})}},owner:'alice'}).save(catalog),/账号不一致/);
});

test('world page alone gets the Keepwork/game-server CSP; other pages stay strict; loopback only in dev',async()=>{
 const strict=worldPagePolicy(false);
 assert.match(strict,/script-src 'self' https:\/\/cdn\.keepwork\.com;/);
 assert.match(strict,/wss:\/\/\*\.gameserver\.keepwork\.com/);
 assert.doesNotMatch(strict,/127\.0\.0\.1|localhost|unsafe-eval/);
 assert.match(worldPagePolicy(true),/ws:\/\/127\.0\.0\.1:\*/);
 const store=new Store(),server=createServer(store);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const home=await fetch(base+'/');assert.match(home.headers.get('content-security-policy'),/cdn\.keepwork\.com/);
  const admin=await fetch(base+'/admin/');assert.doesNotMatch(admin.headers.get('content-security-policy'),/keepwork/);
  for(const path of ['ui-tokens.css','world-ui.css','world-roles-core.mjs','world-roles.mjs','keepwork-session.mjs','world-presence.mjs','vendor/haqi/adventure_game_server.js'])
   assert.equal((await fetch(`${base}/${path}`)).status,200,path);
 }finally{await new Promise(r=>server.close(r));store.close();}
});

test('world page wires shared presence with project awc and never puts tokens in URLs or storage',()=>{
 const presence=read('site/world-presence.mjs'),page=read('site/world.js'),session=read('site/keepwork-session.mjs');
 assert.match(presence,/project:'awc'/);
 assert.match(presence,/from '\.\/vendor\/haqi\/adventure_game_server\.js'/);
 assert.doesNotMatch(page+session,/setItem\([^)]*token/i);
 assert.doesNotMatch(page+session+presence,/[?&]token=/);
});

test('city street furniture uses shared catalogue items and keeps every home reachable',async()=>{
 const {installCityLandmarks,installCityDecorations,CITY_DECORATIONS}=await import('../site/world-map-core.mjs');
 const {findHomePath}=await import('../site/vendor/haqi/home_walk_core.js');
 const catalog=JSON.parse(read('site/vendor/haqi-data/data/adventure/home/catalog.json')).items;
 const city=JSON.parse(read('site/vendor/haqi-data/data/adventure/neural-city-art.json'));
 const world=createPlaza([...catalog,...city.homeItems]);installCityLandmarks(world,city.homeItems);
 const before=world.objects.length;installCityDecorations(world);
 assert.equal(world.objects.length-before,CITY_DECORATIONS.length);
 for(const [id] of CITY_DECORATIONS)assert.ok(catalog.some(i=>i.id===id&&!i.building),id);
 for(const h of Object.values(world.homes)){
  assert.ok(findHomePath({x:0,y:0.6},h.indoor,world.objects,world.catalog,world.seed).length>0,h.id);
  for(const other of Object.values(world.homes))if(other!==h)assert.ok(findHomePath(h.yard,other.yard,world.objects,world.catalog,world.seed).length>0,`${h.id}->${other.id}`);
 }
});
