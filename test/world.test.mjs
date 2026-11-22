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


test('nameplates stay steadily centered below each character without jumping when nearby',async()=>{
 const {layoutNameplates}=await import('../site/world-state.mjs');
 const rows=[{id:'rear',x:180,y:160,w:100,h:28,scale:1,body:{x:150,y:65,w:60,h:100}},
  {id:'front',selected:true,x:184,y:190,w:130,h:28,scale:1,body:{x:154,y:95,w:60,h:100}}];
 const result=layoutNameplates(rows,400,500);
 assert.equal(result.get('rear').x,130,'rear nameplate stays horizontally centered on rear character');
 assert.equal(result.get('rear').y,168,'rear nameplate stays right below rear character feet');
 assert.equal(result.get('front').x,119,'front nameplate stays horizontally centered on front character');
 assert.equal(result.get('front').y,198,'front nameplate stays right below front character feet');
 const edge=layoutNameplates([{id:'edge',x:12,y:200,w:120,h:28,scale:1}],160,260);
 assert.ok(edge.get('edge').x>=6&&edge.get('edge').x+edge.get('edge').w<=154);
});

test('nameplates never occupy the bottom dock, including its portrait overhang',async()=>{
 const {layoutNameplates}=await import('../site/world-state.mjs');
 const row={id:'mine',x:200,y:350,w:120,h:28,body:{x:170,y:250,w:60,h:105}};
 const dock={x:20,y:360,w:360,h:100};
 const box=layoutNameplates([row],400,480,[dock]).get('mine');
 assert.equal(box,null,'hide a crowded nameplate instead of covering controls');
});
