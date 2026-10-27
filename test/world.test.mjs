import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, loadNames, saveName } from '../site/world-state.mjs';

test('world names validate visible Unicode names and reject overlong or empty input',()=>{
  assert.equal(cleanName('  星光  '),'星光');
  assert.equal(cleanName('a\u202Eb\n'),'ab');
  assert.equal(cleanName('星'.repeat(21)),'');
  assert.equal(cleanName('  \n\u200b'), '');
  assert.equal(cleanName('🌟'.repeat(20)), '🌟'.repeat(20));
  assert.equal(cleanName({}), '');
});
test('cosmetic names survive reload, ignore unrelated keys and tolerate corrupt or unavailable storage',()=>{
  let data=null;
  const storage={getItem:()=>data,setItem:(key,value)=>{assert.equal(key,'awc.world.names.v1');data=value;}};
  const names=saveName(storage,{},'astra','星旅者');
  assert.deepEqual(loadNames(storage),names);
  assert.throws(()=>saveName(storage,names,'invented','bad'),/unknown_resident/);
  assert.throws(()=>saveName(storage,names,'astra',' '),/invalid_name/);
  data='{"astra":"A","token":"not-a-world-field","claude":null}';
  assert.deepEqual(loadNames(storage),{astra:'A'});
  data='broken';assert.deepEqual(loadNames(storage),{});
  assert.deepEqual(loadNames(null),{});
  assert.throws(()=>saveName({setItem(){throw Error('quota');}},names,'astra','next'),/quota/);
  assert.equal(names.astra,'星旅者');
});


test('nameplates avoid nearby characters and each other in a vertical crowd',async()=>{
 const {layoutNameplates}=await import('../site/world-state.mjs');
 const rows=[{id:'rear',x:180,y:160,w:100,h:28,body:{x:150,y:65,w:60,h:100}},
  {id:'front',selected:true,x:180,y:210,w:130,h:28,body:{x:150,y:115,w:60,h:100}}];
 const result=layoutNameplates(rows,400,500);
 const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 for(const row of rows){const box=result.get(row.id);assert.ok(box);assert.ok(rows.every(r=>!overlaps(box,r.body)));}
 assert.ok(!overlaps(result.get('front'),result.get('rear')));
 const narrow=layoutNameplates(rows,160,260);
 for(const box of narrow.values())if(box){assert.ok(box.x>=0&&box.x+box.w<=160);assert.ok(rows.every(r=>!overlaps(box,r.body)));}
});

test('nameplates never occupy the bottom dock, including its portrait overhang',async()=>{
 const {layoutNameplates}=await import('../site/world-state.mjs');
 const row={id:'mine',x:200,y:350,w:120,h:28,body:{x:170,y:250,w:60,h:105}};
 const dock={x:20,y:360,w:360,h:100};
 const box=layoutNameplates([row],400,480,[dock]).get('mine');
 assert.equal(box,null,'hide a crowded nameplate instead of covering controls');
});
