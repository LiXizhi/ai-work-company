// Explicit, reproducible source sync. Never fetch during app startup or builds.
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(readFileSync(resolve(root,'config/haqi-subset.json')));
const args=process.argv.slice(2),check=args.includes('--check'),clone=args.includes('--clone');
let source=args.find(a=>!a.startsWith('--'))||process.env.HAQI_SOURCE;
if(!source&&clone){
 const checkout=resolve(root,'tmp/haqi-upstream');
 if(!existsSync(checkout))execFileSync('git',['clone','--depth','1','--branch',config.ref,config.repository,checkout],{stdio:'inherit'});
 source=resolve(checkout,config.subdirectory);
}
if(!source)throw Error('Pass HaqiCombatSim source directory, set HAQI_SOURCE, or use --clone. Existing clones are never reset or pulled automatically.');
source=resolve(source);const files=new Map(),outputs=new Map(),hash=b=>createHash('sha256').update(b).digest('hex');
const safe=p=>{if(!/^[a-zA-Z0-9_./-]+$/.test(p)||p.split('/').includes('..')||p.startsWith('/'))throw Error('Unsafe subset path: '+p);return p;};
function read(p){safe(p);const bytes=readFileSync(resolve(source,p));files.set(p,hash(bytes));return bytes;}
function json(p){return JSON.parse(read(p));}
function out(p,b){outputs.set(p,Buffer.isBuffer(b)?b:Buffer.from(b));}
function outJson(p,v){out(p,JSON.stringify(v,null,2)+'\n');}
const seen=new Set();
function moduleFile(name){safe(name);if(seen.has(name))return;seen.add(name);
 const bytes=read('js/'+name);out('vendor/haqi/'+name,bytes);
 // Static imports, re-exports, dynamic imports and worker URLs.
 const patterns=[/(?:from\s*|import\s*\(?\s*)['"](\.[^'"]+\.js)['"]/g,/new URL\(\s*['"](\.[^'"]+\.js)['"]/g];
 for(const pattern of patterns)for(const m of bytes.toString().matchAll(pattern))moduleFile(relative(resolve(source,'js'),resolve(source,'js',dirname(name),m[1])).replaceAll('\\','/'));
}
config.entries.forEach(moduleFile);
const full=json('data/hero-preview.json'),identities=json('data/ai-personas.json');
const personaIds=config.personas.map(id=>identities.characters[id]);
if(personaIds.some(p=>!p))throw Error('Missing upstream persona');
const selected={version:full.version,directionCount:full.directionCount,bodies:{'female-walk':full.bodies['female-walk']},heads:Object.fromEntries(personaIds.map(p=>[p.headId,full.heads[p.headId]])),bodyVariants:Object.fromEntries(personaIds.map(p=>[p.bodyId,full.bodyVariants[p.bodyId]])),personas:Object.fromEntries(config.personas.map(id=>[id,identities.characters[id]]))};
outJson('assets/personas/manifest.json',selected);
const scene={schemaVersion:1,source:'HaqiCombatSim/data/adventure',atlases:{}};
for(const [file,keys] of Object.entries(config.sceneAtlases)){const m=json('data/adventure/'+file+'.json');for(const key of keys)scene.atlases[key]=m.atlases[key];}
outJson('assets/haqi-scene.json',scene);
function assets(value){if(!value||typeof value!=='object')return;if(typeof value.local==='string'&&value.local.startsWith('assets/')){const bytes=read(value.local);if((value.webpSha256||value.sha256)&&hash(bytes)!==(value.webpSha256||value.sha256))throw Error('Asset hash mismatch: '+value.local);out(value.local,bytes);}for(const [key,child] of Object.entries(value))if(key!=='source'&&key!=='additions')assets(child);}
assets(selected);assets(scene);
for(const path of config.data){const bytes=read(path);out('vendor/haqi-data/'+safe(path),bytes);if(path.endsWith('.json'))assets(JSON.parse(bytes));}
let commit=null;try{commit=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
const previousPath=resolve(root,'site/vendor/haqi/provenance.json');
const previous=existsSync(previousPath)?JSON.parse(readFileSync(previousPath)):null;
const hashes=Object.fromEntries([...outputs].map(([p,b])=>[p,hash(b)]));
outJson('vendor/haqi/provenance.json',{source:'HaqiCombatSim',repository:config.repository,commit,entries:config.entries,policy:'Unmodified upstream modules and assets. File hashes pin working-tree changes as well as committed source.',files:Object.fromEntries([...seen].sort().map(p=>[p,files.get('js/'+p)])),sourceFiles:Object.fromEntries([...files].sort()),outputs:hashes});
const changed=[...outputs].filter(([p,b])=>!existsSync(resolve(root,'site',p))||!readFileSync(resolve(root,'site',p)).equals(b));
if(check){if(changed.length)throw Error('Haqi subset is out of sync: '+changed.map(([p])=>p).join(', '));console.log('Haqi subset matches upstream source and assets.');}
else{
 for(const p of Object.keys(previous?.outputs||{}))if(!outputs.has(p)){safe(p);const dest=resolve(root,'site',p);if(existsSync(dest)&&hash(readFileSync(dest))!==previous.outputs[p])throw Error('Refusing to remove locally changed generated file: '+p);rmSync(dest,{force:true});}
 for(const [p,b] of outputs){const dest=resolve(root,'site',p);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,b);}
 console.log(`Synced ${seen.size} exact upstream modules and ${outputs.size-seen.size-3} assets/data files; ${changed.length} changed.`);
}
