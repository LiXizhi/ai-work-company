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

