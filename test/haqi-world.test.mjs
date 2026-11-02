import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HeroRenderer} from '../site/vendor/haqi/hero_renderer.js';
import {createHeroActor,updateHeroActor,walkFrameIndex} from '../site/vendor/haqi/hero_pose_core.js';
import {createSocialActors,stepSocialActors} from '../site/vendor/haqi/adventure_social_motion_core.js';
import {walkable} from '../site/vendor/haqi/adventure_world_core.js';
import {plazaWorld} from '../site/world-rig.mjs';
const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const manifest=json('../site/assets/personas/manifest.json');
test('all synced Haqi modules, manifests and art match pinned upstream bytes',()=>{
 const p=json('../site/vendor/haqi/provenance.json');
 for(const [file,expected] of Object.entries(p.outputs))assert.equal(createHash('sha256').update(readFileSync(new URL('../site/'+file,import.meta.url))).digest('hex'),expected,file);
});
test('each persona uses separate shared head and body WebP catalogue items',()=>{
 const sources=new Set();
 for(const {headId,bodyId} of Object.values(manifest.personas)){
  const h=manifest.heads[headId],b=manifest.bodyVariants[bodyId];
  assert.equal(h.frames.length,16);assert.equal(b.geometry.walk.frames.length,24);assert.equal(b.geometry.frames.length,4);
  for(const art of [h,b]){assert.ok(!sources.has(art.local));sources.add(art.local);const bytes=readFileSync(new URL('../site/'+art.local,import.meta.url));assert.ok(bytes.length<=200000);assert.equal(createHash('sha256').update(bytes).digest('hex'),art.sha256);assert.match(art.cdn,/^https:\/\/cdn.keepwork.com\//);}
 }
 assert.equal(sources.size,8);
});
test('exact upstream renderer independently composites shared head/body and grounds all frames',()=>{
 for(const {headId,bodyId} of Object.values(manifest.personas)){
  const renderer=new HeroRenderer(manifest,{mounts:[]}),head={id:'head'},body={id:'body'};
  renderer.images.set('head:'+headId,head);renderer.images.set('walk:'+bodyId,body);
  const calls=[],ctx={save(){},restore(){},translate(){},scale(){},rotate(){},drawImage(...a){calls.push(a);}};
  for(let facing=0;facing<4;facing++)for(let frame=-1;frame<6;frame++){
   calls.length=0;const options={facing,moving:frame>=0,walkTime:Math.max(0,frame)/10+.001};
   const result=renderer.draw(ctx,{gender:'female',headId,bodyId},options);
   assert.ok(result.ready);assert.equal(calls.length,2);assert.equal(calls[0][0],body);assert.equal(calls[1][0],head);
   const geometry=manifest.bodyVariants[bodyId].geometry,f=frame<0?geometry.frames[facing]:geometry.walk.frames[facing*6+frame];
   assert.ok(Math.abs(result.bodyRect.y+f.footY*result.bodyRect.h/f.crop[3])<1e-8);
  }
 }
});
test('original navigation stays walkable and pause stops motion',()=>{
 const world=plazaWorld(),actors=createSocialActors(world,Object.keys(manifest.personas).map(id=>({id})),7419),start=actors.map(a=>({...a.position}));
 for(let n=0;n<2400;n++){stepSocialActors(actors,world,.05);for(const a of actors)assert.ok(walkable(world,a.position.x,a.position.y));}
 assert.ok(actors.some((a,i)=>Math.hypot(a.position.x-start[i].x,a.position.y-start[i].y)>1));
 const snapshot=JSON.stringify(actors.map(a=>a.position));stepSocialActors(actors,world,1,{paused:true});assert.equal(JSON.stringify(actors.map(a=>a.position)),snapshot);
 assert.equal(updateHeroActor(createHeroActor(3),{dx:1,dy:0,time:1}).facing,2);
 assert.equal(walkFrameIndex({framesPerDirection:6,fps:10},{moving:false,time:99}),null);
});
