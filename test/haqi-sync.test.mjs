import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'awc-haqi-sync-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const app=join(root,'app'),repo=join(root,'source'),source=join(repo,'HaqiCombatSim');
 function write(p,v){mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,typeof v==='string'?v:JSON.stringify(v));}
 write(join(app,'config/haqi-subset.json'),{repository:repo,ref:'main',subdirectory:'HaqiCombatSim',entries:['scene.js'],personas:['a'],sceneAtlases:{},data:[]});
 mkdirSync(join(app,'scripts'));cpSync(new URL('../scripts/sync-haqi.mjs',import.meta.url),join(app,'scripts/sync-haqi.mjs'));
 write(join(source,'js/scene.js'),"export {n} from './pose.js'; export const worker=new URL('./worker.js',import.meta.url);\n");write(join(source,'js/pose.js'),'export const n=1;\n');write(join(source,'js/worker.js'),'export const worker=true;\n');
 write(join(source,'data/hero-preview.json'),{version:1,directionCount:16,bodies:{'female-walk':{}},heads:{a:{}},bodyVariants:{a:{}}});write(join(source,'data/ai-personas.json'),{characters:{a:{headId:'a',bodyId:'a'}}});
 const run=(...args)=>spawnSync(process.execPath,[join(app,'scripts/sync-haqi.mjs'),...args],{encoding:'utf8'});
 return {app,repo,source,run,write};
}
test('subset sync traverses workers, checks drift and refuses to discard modified stale outputs',t=>{
 const f=fixture(t);assert.equal(f.run(f.source).status,0);assert.equal(f.run('--check',f.source).status,0);
 const worker=join(f.app,'site/vendor/haqi/worker.js');assert.match(readFileSync(worker,'utf8'),/worker=true/);
 f.write(worker,'locally modified');assert.notEqual(f.run('--check',f.source).status,0);
 f.write(join(f.source,'js/scene.js'),"export {n} from './pose.js';\n");const result=f.run(f.source);assert.notEqual(result.status,0);assert.match(result.stderr,/Refusing to remove locally changed/);
});
test('clone bootstraps the configured repository without touching an existing source checkout',t=>{
 const f=fixture(t);const git=(...a)=>execFileSync('git',['-C',f.repo,...a],{stdio:'pipe'});
 git('init','--initial-branch=main');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Synthetic sync fixture');
 const result=f.run('--clone');assert.equal(result.status,0,result.stderr);assert.equal(f.run('--clone','--check').status,0);
});

test('runtime assets exclude historical source and addition provenance files',t=>{
 const f=fixture(t),cfgPath=join(f.app,'config/haqi-subset.json');
 const cfg=JSON.parse(readFileSync(cfgPath));cfg.data=['data/ui.json'];f.write(cfgPath,cfg);
 f.write(join(f.source,'data/ui.json'),{local:'assets/current.webp',source:{local:'assets/missing-source.png'},additions:{old:{local:'assets/missing-old.webp'}}});
 f.write(join(f.source,'assets/current.webp'),'synthetic-runtime-asset');
 const result=f.run(f.source);assert.equal(result.status,0,result.stderr);
 assert.equal(readFileSync(join(f.app,'site/assets/current.webp'),'utf8'),'synthetic-runtime-asset');
});
