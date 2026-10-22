import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {installCityLandmarks,CITY_PLACEMENTS} from '../site/world-map-core.mjs';
import {createPlaza,createResidents,stepResidents} from '../site/world-scene-core.mjs';
import {isHomePassable} from '../site/vendor/haqi/home_walk_core.js';
const read=p=>JSON.parse(readFileSync(new URL('../site/'+p,import.meta.url)));
const art=read('vendor/haqi-data/data/adventure/neural-city-art.json');
test('shared map and scenery have bounded WebP bytes, verified hashes, and permanent CDN URLs',()=>{
 for(const row of [...Object.values(art.atlases),art.map]){
  const bytes=readFileSync(new URL('../site/'+row.local,import.meta.url));
  assert.ok(bytes.length<=200000);assert.equal(bytes.length,row.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  assert.match(row.cdn,/^https:\/\/cdn.keepwork.com\//);
 }
});
test('city landmarks join the existing home collision catalogue and preserve autonomous routes',()=>{
 const catalog=[...read('vendor/haqi-data/data/adventure/home/catalog.json').items,...art.homeItems];
 const world=createPlaza(catalog),oldHomes=Object.keys(world.homes);installCityLandmarks(world,art.homeItems);
 assert.deepEqual(Object.keys(world.homes),oldHomes);
 for(const p of CITY_PLACEMENTS){assert.ok(world.landmarks.some(l=>l.id===p.id));assert.equal(isHomePassable(p.x+.5,p.y+.5,world.objects,catalog,null),false);}
 const state=createResidents(world,oldHomes.map(id=>({id}))),start=state.actors.map(a=>({...a.position}));
 for(let i=0;i<500;i++){stepResidents(state,world,.05);for(const a of state.actors)assert.ok(isHomePassable(a.cell.x,a.cell.y,world.objects,catalog,world.seed),a.profile.id);}
 assert.ok(state.actors.some((a,i)=>Math.hypot(a.position.x-start[i].x,a.position.y-start[i].y)>40));
});
