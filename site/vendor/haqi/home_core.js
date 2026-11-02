import {compareDungeonSpeech} from './dungeon_speech_core.js';
import {isRoofDecoration,roofAt,buildingBounds,buildingGridBounds,buildingConflict,replacementFor,validBuildingProperties,buildingItem,buildingSlotKind,isEdgeLike} from './home_building_core.js';
// Home rules are independent of adventure progression and browser IO.
import {createRng,hashSeed} from './rng_core.js';
export const CHUNK_SIZE=32;
export const COLORS={red:'红色',blue:'蓝色',green:'绿色',yellow:'黄色',pink:'粉色',purple:'紫色',white:'白色',orange:'橙色',brown:'棕色'};
export const chunkKey=(x,y)=>`${Math.floor(x/CHUNK_SIZE)},${Math.floor(y/CHUNK_SIZE)}`;
export const inventoryKey=(item,color='')=>`${item}:${color}`;
export function homeScope(owner,role){if(!role)throw Error('请先选择角色');return JSON.stringify([owner?'account':'guest',owner||'',role]);}
export function createHome(id,name,seed){return {version:1,id,name:String(name||'我的家园').trim().slice(0,40)||'我的家园',seed,revision:0,baseRevision:null,remote:null,dirty:true,deleted:false,parts:{},updatedAt:0};}
export function terrainChunk(seed,key){const rng=createRng(hashSeed(`${seed}:${key}`));return Array.from({length:CHUNK_SIZE*CHUNK_SIZE},()=>rng.int(0,7));}

export const HOME_BIOMES={
 meadow:{id:'meadow',name:'翡翠草甸',en:'Emerald Meadow',base:'#8fb967',shade:'#78a353',light:'#a8cf7d',grassA:'#8ab864',grassB:'#83b05d',grassC:'#92bf6c',bankColor:'#dcc996',waterDeep:'#3c92c6',waterShallow:'#52aad9',flowerA:'#fff6b8',flowerB:'#ffd4e2',groundAtlas:'townGround',groundFrame:'lushGrass',waterFrame:'riverWater',decoAtlas:'meadow',decoFrames:['grass','clover','daisies','buttercups','wildGrass','grassStone'],treeAtlas:'campTrees',treeFrames:['tallPine','layeredPine','cypressPine','blossomTree']},
 blossom:{id:'blossom',name:'樱花花谷',en:'Blossom Valley',base:'#96bf74',shade:'#7fa85f',light:'#b7dd90',grassA:'#94bf72',grassB:'#8cb66a',grassC:'#9dc77b',bankColor:'#e2cdb0',waterDeep:'#4699cc',waterShallow:'#5eb2e0',flowerA:'#ffb7d5',flowerB:'#fff0f6',groundAtlas:'townGround',groundFrame:'lushGrass',waterFrame:'riverWater',decoAtlas:'meadow',decoFrames:['pinkFlowers','blueFlowers','daisies','clover','buttercups'],treeAtlas:'campTrees',treeFrames:['blossomTree','tallPine','blossomTree']},
 autumn:{id:'autumn',name:'金秋枫林',en:'Autumn Woods',base:'#c39d57',shade:'#a98341',light:'#dab66d',grassA:'#c49a52',grassB:'#b98f48',grassC:'#cfa55d',bankColor:'#cfb482',waterDeep:'#3884b5',waterShallow:'#4ea0cf',flowerA:'#e86a38',flowerB:'#f4b446',groundAtlas:'townGround',groundFrame:'autumnGround',waterFrame:'riverWater',decoAtlas:'meadow',decoFrames:['amberLeaves','redMushrooms','paleMushrooms','moss','fern'],treeAtlas:'islandTrees',treeFrames:['autumnGoldTree']},
 beach:{id:'beach',name:'阳光沙洲',en:'Sunny Oasis',base:'#dfc78a',shade:'#c7ae70',light:'#eee0b0',grassA:'#e2ca88',grassB:'#d9c07e',grassC:'#ead394',bankColor:'#ebdcad',waterDeep:'#2fa6c9',waterShallow:'#4ec2e0',flowerA:'#fff9dc',flowerB:'#88c990',groundAtlas:'desertGround',groundFrame:'sandDunes',waterFrame:'oasisWater',decoAtlas:'stones',decoFrames:['sandPebbles','sandRipples','sandstone','dryGrass'],treeAtlas:'islandTrees',treeFrames:['tropicalPalm','desertCactus']},
 snow:{id:'snow',name:'晶莹雪原',en:'Crystal Snowfield',base:'#dbeaf2',shade:'#bed4e2',light:'#f2f9fd',grassA:'#dcebf5',grassB:'#d2e3ef',grassC:'#e6f2fa',bankColor:'#c5d8e6',waterDeep:'#4c8db8',waterShallow:'#6fb0d8',flowerA:'#ffffff',flowerB:'#b8e2ff',groundAtlas:'iceGround',groundFrame:'snowField',waterFrame:'iceSheet',decoAtlas:'stones',decoFrames:['snowRocks','iceCrystals','pinecones','lichenStone'],treeAtlas:'trees',treeFrames:['spruce','pine','fir','oldPine']},
 mystic:{id:'mystic',name:'星光秘境',en:'Starlight Glade',base:'#719381',shade:'#5b7b6a',light:'#8db29e',grassA:'#6d9482',grassB:'#648a78',grassC:'#779e8c',bankColor:'#9eb2a4',waterDeep:'#356d96',waterShallow:'#4989b5',flowerA:'#9ef8e8',flowerB:'#d2b8ff',groundAtlas:'darkGround',groundFrame:'marshMud',waterFrame:'darkWater',decoAtlas:'meadow',decoFrames:['blueFlowers','paleMushrooms','moss','fern','grassStone'],treeAtlas:'islandTrees',treeFrames:['darkWeepingTree','darkShadowTree']},
};

function cellHash(seed,ix,iy){
 let h=(Number(seed)||1)^Math.imul(ix,374761393)^Math.imul(iy,668265263);
 h=Math.imul(h^(h>>>13),1274126177);
 return ((h^(h>>>16))>>>0)/4294967295;
}
export function tileVariant(seed,x,y){
 return Math.floor(cellHash(seed,Math.floor(x),Math.floor(y))*16);
}
export function homeNoise2D(seed,x,y){
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
 const a=cellHash(seed,ix,iy),b=cellHash(seed,ix+1,iy),c=cellHash(seed,ix,iy+1),d=cellHash(seed,ix+1,iy+1);
 return (a+(b-a)*ux+(c-a)*uy+(a-b-c+d)*ux*uy)*2-1;
}
export function homeBiomeAt(seed,x,y){
 const ry=homeRiverCenterY(seed,x),rx=homeRiverCenterX(seed,y);
 const n=homeNoise2D(seed+101,x/24,y/24);
 const westBorder=-14.5+Math.sin(y*.12)*1.5;
 if(y<ry){
  if(x<-5+n*2)return HOME_BIOMES.snow;
  if(x>5+n*2)return HOME_BIOMES.autumn;
  return HOME_BIOMES.blossom;
 }
 if(x>rx){
  return y<1+n*3?HOME_BIOMES.autumn:HOME_BIOMES.beach;
 }
 if(x<westBorder){
  return y<0+n*3?HOME_BIOMES.snow:HOME_BIOMES.mystic;
 }
 return HOME_BIOMES.meadow;
}
export function homeRiverCenterY(seed,x){
 const s=Number(seed)||1;
 return -7.6+Math.sin(x*.17+(s&15)*.35)*1.1+Math.cos(x*.07-(s&7)*.25)*.45;
}
export function homeRiverCenterX(seed,y){
 const s=Number(seed)||1;
 return 12.6+Math.sin(y*.15+(s&15)*.3)*1.1+Math.cos(y*.06+(s&7)*.2)*.4;
}
export function homeBridgeAt(seed,x,y){
 const ry=homeRiverCenterY(seed,x);
 const bridgePeriodX=((x%48)+48)%48;
 const onNorthSpan=(x>=-1&&x<=0.85)||Math.abs(bridgePeriodX-24)<=0.85;
 if(onNorthSpan&&Math.abs(y-ry)<=1.5){
  const cx=Math.abs(x)<=1.2?0:Math.round((x-24)/48)*48+24;
  return {kind:'wood',orientation:'vertical',x:cx,y:homeRiverCenterY(seed,cx),w:1.8,h:3.0};
 }
 const rx=homeRiverCenterX(seed,y);
 const bridgePeriodY=((y%48)+48)%48;
 const onEastSpan=(y>=-1&&y<=0.85)||Math.abs(bridgePeriodY-24)<=0.85;
 if(onEastSpan&&Math.abs(x-rx)<=1.5){
  const cy=Math.abs(y)<=1.2?0:Math.round((y-24)/48)*48+24;
  return {kind:'wood',orientation:'horizontal',x:homeRiverCenterX(seed,cy),y:cy,w:3.0,h:1.8};
 }
 return null;
}
export function homeWaterAt(seed,x,y){
 // Keep central homestead & pet lawn dry and buildable
 if(Math.abs(x)<=9.5&&y>=-5.4&&y<=25.5)return {water:false,bank:false,depth:0};
 const dy=Math.abs(y-homeRiverCenterY(seed,x));
 if(dy<=1.08)return {water:true,bank:false,depth:Math.max(.15,1-dy/1.08),river:'north'};
 if(dy<=1.75)return {water:false,bank:true,depth:0,river:'north'};
 const dx=Math.abs(x-homeRiverCenterX(seed,y));
 if(dx<=1.02)return {water:true,bank:false,depth:Math.max(.15,1-dx/1.02),river:'east'};
 if(dx<=1.68)return {water:false,bank:true,depth:0,river:'east'};
 if(Math.hypot(x,y)>22){
  const ridge=Math.abs(homeNoise2D(seed+307,x/14,y/14));
  if(ridge<.085)return {water:true,bank:false,depth:1-ridge/.085,river:'outer'};
  if(ridge<.14)return {water:false,bank:true,depth:0,river:'outer'};
 }
 return {water:false,bank:false,depth:0};
}
export function homeRoadAt(seed,x,y){
 const d=Math.hypot(x,y);
 if(d<=2.35)return {road:true,kind:'plaza'};
 const wanderX=Math.sin(y*.22)*0.25,wanderY=Math.sin(x*.22)*0.25;
 if(Math.abs(x-wanderX)<=.85&&y>=-11.5&&y<=6.5)return {road:true,kind:'path'};
 if(Math.abs(y-wanderY)<=.85&&x>=-6.5&&x<=16.5)return {road:true,kind:'path'};
 return {road:false,kind:null};
}
export function homeInteractiveKind(item){
 if(!item)return null;
 const s=typeof item==='object'?(item.art?.shape||''):'',id=typeof item==='string'?item:(item.id||'');
 if(['lamp','lantern','fireplace','lights','disco'].includes(s)||/lamp|lantern|fireplace|lights|disco/.test(id))return 'light';
 if(['piano','guitar','radio','speaker','microphone','drum','clock'].includes(s)||/piano|guitar|radio|speaker|microphone|drum|clock/.test(id))return 'music';
 if(['fountain','shower','bath','pool','sink','kettle'].includes(s)||/fountain|shower|bathtub|hot-spring|washbasin|pond|birdbath|watering-can/.test(id))return 'water';
 if(['oven','stove','popcorn','cake'].includes(s)||/oven|stove|toaster|popcorn|cooking-pot|frying-pan|cake|lemonade|ice-cream|teapot/.test(id))return 'cook';
 if(s==='tv'||id==='tv'||id==='television'||id==='aquarium')return 'screen';
 if(item?.activity==='sleep'||item?.activity==='sit'||['bed','sofa','chair','bench','stool','cushion'].includes(s))return 'rest';
 if(item?.activity||['swing','slide','seesaw','trampoline','climb','ball','car','train','bike','scooter','horse','stage'].includes(s))return 'play';
 return null;
}

const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/[.,!?。！？，、]/g,'').replace(/\s+/g,' ').trim();
function oneEdit(a,b){if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(a.length-i)+(b.length-j)<=1;}
export const requiresReading=item=>item?.requiresReading!==false;
export function summonSentences(item,lang='en',color=''){
 const noun=lang==='en'?[color,item.en].filter(Boolean).join(' '):`${COLORS[color]||''}${item.zh}`;
 const article=item.article==='some'?'some':/^[aeiou]/.test(noun)?'an':'a';
 const sentences=lang==='en'?[`Create ${article} ${noun}.`,`I want ${article} ${noun}.`,`Can I have ${article} ${noun}?`]:[`创造一个${noun}。`,`我想要一个${noun}。`,`可以给我一个${noun}吗？`];
 return !color&&item.sentences?.[lang]?.length?item.sentences[lang].slice(0,3):sentences;
}
export const HOME_SPELL_PASS_ACCURACY=0.8;
const SIMPLE_WORDS_EN=new Set(['a','an','the','some','one','please']);
const SIMPLE_CHARS_ZH=new Set([...'请一的个张把朵盏本块棵只套座栋片条面架台盆盏']);
function isSimpleSpellDiff(diff,locale){
 return locale==='en'?SIMPLE_WORDS_EN.has(diff.expected):SIMPLE_CHARS_ZH.has(diff.expected);
}
function isSimplePart(text,locale){
 const key=String(text||'').trim().toLowerCase();
 return locale==='en'?SIMPLE_WORDS_EN.has(key):SIMPLE_CHARS_ZH.has(key);
}
function effectiveSpellAccuracy(result,locale){
 if(!result.differences.length)return 1;
 const significant=result.differences.filter(d=>!isSimpleSpellDiff(d,locale));
 if(!significant.length&&result.accuracy>0)return 1;
 const total=result.parts.filter(p=>p.matched||p.missing).length;
 return total?Math.max(result.accuracy,1-significant.length/total):result.accuracy;
}
// Share NPC dialogue word coverage for both typed and spoken answers.
// Missing simple function words (articles/classifiers) are forgiven, and an answer
// with >= 80% accuracy passes immediately.
// The third completed, nonempty recording may unlock a selected item without
// claiming that its unmatched vocabulary was correctly practised.
export function matchHomeSpell(text,catalog,lang='en',selection=null,{input='text',speechAttempts=0}={}){
 const locale=lang==='en'?'en':'zh-CN';
 if(!String(text||'').match(/[\p{L}\p{N}]/u))return {candidates:[],feedback:null,error:'没有听清，请读出或输入一句召唤咒语。'};
 const candidates=[];let feedback=null;
 for(const item of catalog){
  if(selection?.itemId&&selection.itemId!==item.id)continue;
  const colors=selection?.itemId?[selection.color||'']:['',...Object.keys(COLORS)];
  for(const color of colors){
   const rows=summonSentences(item,lang,color).map((s,lineIndex)=>{
    const res=compareDungeonSpeech(text,s,locale);
    const parts=res.accuracy>0?res.parts.map(p=>p.missing&&isSimplePart(p.text,locale)?{...p,missing:false}:p):res.parts;
    return {...res,parts,effectiveAccuracy:effectiveSpellAccuracy(res,locale),lineIndex};
   }).sort((a,b)=>b.effectiveAccuracy-a.effectiveAccuracy||b.accuracy-a.accuracy||a.lineIndex-b.lineIndex);
   const best=rows[0];
   if(!feedback||best.effectiveAccuracy>feedback.effectiveAccuracy||(best.effectiveAccuracy===feedback.effectiveAccuracy&&best.accuracy>feedback.accuracy))feedback=best;
   const passAccuracy=selection?.itemId?HOME_SPELL_PASS_ACCURACY:1;
   if(best.effectiveAccuracy>=passAccuracy||(input==='speech'&&speechAttempts>=3&&selection?.itemId))candidates.push({itemId:item.id,color});
  }
 }
 return {candidates,feedback,error:candidates.length?'':'请看看标出的词，再完整说一次或输入句子。'};
}
export function parseSummon(text,catalog,lang='en'){
 let value=normalize(text),noun;
 if(lang==='en')noun=value.match(/^(?:i (?:want|would like|need)|(?:please )?(?:create|make|summon)|can i have|give me)(?: please)? (.+?)(?: please)?$/)?.[1];
 else noun=value.match(/^(?:我(?:想要|需要|要)|请?创造|请?生成|请?给我|可以给我)(.+?)(?:吗)?$/)?.[1];
 if(!noun)return {error:'请说出完整句子，或点击物品查看示范。',candidates:[]};
 noun=noun.replace(lang==='en'?/^(?:a|an|the|one|some) /:/^(?:一[个张把朵盏本块棵只套]|[个张把朵盏本块棵只套])/,'');
 let color='';for(const [en,zh]of Object.entries(COLORS)){const prefix=lang==='en'?`${en} `:zh;if(noun.startsWith(prefix)){color=en;noun=noun.slice(prefix.length);break;}if(lang!=='en'&&noun.startsWith(zh[0])&&!catalog.some(i=>i.zh===noun)){color=en;noun=noun.slice(1);break;}}
 const names=item=>[item[lang==='en'?'en':'zh'],...(item.aliases?.[lang]||[])].map(normalize);
 let candidates=catalog.filter(item=>names(item).some(name=>name===noun||(lang==='en'&&`${name}s`===noun)));
 if(!candidates.length&&lang==='en'&&noun.length>=4)candidates=catalog.filter(item=>names(item).some(name=>name.length>=4&&oneEdit(name,noun)));
 return {candidates:candidates.map(item=>({itemId:item.id,color})),error:candidates.length?'':'还没有这种物品，请从目录选择并查看示范。'};
}
export function homeObjectInteractive(obj,catalog){return typeof obj?.interactionEnabled==='boolean'?obj.interactionEnabled:catalog.find(i=>i.id===obj?.itemId)?.interactionEnabled===true;}
export const validHomeSize=value=>value===undefined||(Number.isFinite(value)&&value>=.5&&value<=2);
export function footprint(obj,catalog){const item=catalog.find(i=>i.id===obj.itemId);if(!item)throw Error('物品不存在');if(item.building)return {...buildingBounds(obj,item),item};let [w,h]=item.size; if((obj.rotation||0)%2)[w,h]=[h,w];const size=obj.sizeScale??1;return {x:obj.x,y:obj.y,w:w*size,h:h*size,item};}
export const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export function canPlace(obj,objects,catalog){
 if(obj.interactionEnabled!==undefined&&typeof obj.interactionEnabled!=='boolean')return {ok:false,reason:'互动设置无效'};
 if(!validHomeSize(obj.sizeScale))return {ok:false,reason:'物品大小须在50%至200%之间'};
 if(!Number.isFinite(obj.x)||!Number.isFinite(obj.y)||Math.abs(obj.x)>1e9||Math.abs(obj.y)>1e9)return {ok:false,reason:'位置超出支持范围'};
 if(!validBuildingProperties(obj))return {ok:false,reason:'建筑属性无效'};
 const mounted=isRoofDecoration(obj);
 if(mounted){
  if(catalog.find(i=>i.id===obj.itemId)?.building)return {ok:false,reason:'结构积木不能作为屋顶装饰'};
  const roof=roofAt(obj,objects,catalog);if(!roof||obj.parentId!==roof.id)return {ok:false,reason:'请放在屋顶上'};
  const box=footprint(obj,catalog);
  if(objects.some(o=>o.id!==obj.id&&isRoofDecoration(o)&&overlaps(box,footprint(o,catalog))))return {ok:false,reason:'屋顶这里已有装饰'};
  return {ok:true};
 }
 objects=objects.filter(o=>!isRoofDecoration(o));
 const replacement=replacementFor(obj,objects,catalog);
 const box=footprint(obj,catalog),others=objects.filter(o=>o.id!==obj.id&&o.id!==replacement?.id);
 const structural=buildingItem(obj,catalog),structuralType=structural?.building?.type;
 if(structuralType==='roof'){
  const floor=others.find(o=>buildingItem(o,catalog)?.building?.type==='floor'&&buildingSlotKind(buildingItem(o,catalog))==='floor'&&buildingGridBounds(o,buildingItem(o,catalog)).x===Math.floor(obj.x)&&buildingGridBounds(o,buildingItem(o,catalog)).y===Math.floor(obj.y));
  if(!floor)return {ok:false,reason:'屋顶必须放在地板上'};
 }
 if(box.item.layer==='top'){
  if(obj.parentId){
   const parent=others.find(o=>o.id===obj.parentId);if(!parent)return {ok:false,reason:'请放在桌面槽位上'};
   const target=footprint(parent,catalog);if(!target.item.slots||!overlaps(box,target))return {ok:false,reason:'这里没有桌面槽位'};
   if(others.filter(o=>o.parentId===parent.id).length>=target.item.slots)return {ok:false,reason:'桌面已经放满'};
   return {ok:true};
  }
  for(const other of others){
   const b=footprint(other,catalog);
   if(b.item.layer==='solid'&&!b.item.building&&overlaps(box,b))return {ok:false,reason:'请放在桌面槽位上'};
   if(b.item.layer==='top'&&!other.parentId&&overlaps(box,b))return {ok:false,reason:'这里已有物品'};
  }
  return {ok:true};
 }
 for(const other of others){const conflict=buildingConflict(obj,other,catalog);if(conflict!==null){if(conflict)return {ok:false,reason:'这里已有建筑构件'};continue;}const otherItem=buildingItem(other,catalog);const supportLayer=otherItem?.building?.type==='floor'||isEdgeLike(otherItem);if(supportLayer&&structuralType===undefined)continue;const b=footprint(other,catalog);if(box.item.layer!==b.item.layer||box.item.layer==='top')continue;if(overlaps(box,b))return {ok:false,reason:'这里已有物品'};}
 return {ok:true};
}
export function visibleChunkKeys(camera,width,height,scale=40){const left=Math.floor((camera.x-width/scale/2)/32)-1,right=Math.floor((camera.x+width/scale/2)/32)+1,top=Math.floor((camera.y-height/scale/2)/32)-1,bottom=Math.floor((camera.y+height/scale/2)/32)+1,keys=[];for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)keys.push(`${x},${y}`);return keys;}
export function petHomePosition(seed,id,index){const rng=createRng(hashSeed(`${seed}:${id}`)),offset=n=>n%2?(n+1)/2:-n/2;return {x:offset(index%7)*3+rng.float(),y:offset(Math.floor(index/7))*3+3+rng.float()};}
// The marker distinguishes an intentionally empty scene from an uninitialized legacy home.
export function initializeHomeResidents(saved,records,seed){
 if(saved.$selection?.version===1)return saved;
 const residents={...saved,$selection:{version:1}};
 Object.values(records).slice(0,6).forEach((pet,i)=>{residents[pet.id]??=petHomePosition(seed,pet.id,i);});
 return residents;
}
export function homeResidentPets(records,residents){return Object.values(records).filter(p=>Object.hasOwn(residents,p.id));}
export function petWish(petId,round,catalog,lang='en'){const rng=createRng(hashSeed(`${petId}:${round}`)),item=rng.pick(catalog.filter(i=>i.activity));return {itemId:item.id,text:lang==='en'?`I want ${/^[aeiou]/.test(item.en)?'an':'a'} ${item.en}.`:`我想要一个${item.zh}。`,translation:lang==='en'?`我想要一个${item.zh}。`:`I want ${/^[aeiou]/.test(item.en)?'an':'a'} ${item.en}.`};}
export function validateHomePart(kind,value,catalog){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('家园文件无效');
 if(kind==='chunk')for(const obj of Object.values(value)){if(!obj||!validBuildingProperties(obj)||(obj.interactionEnabled!==undefined&&typeof obj.interactionEnabled!=='boolean')||!validHomeSize(obj.sizeScale)||typeof obj.id!=='string'||!catalog.some(i=>i.id===obj.itemId)||!Number.isFinite(obj.x)||!Number.isFinite(obj.y)||Math.abs(obj.x)>1e9||Math.abs(obj.y)>1e9)throw Error('家园物品无效');}
 if(kind==='inventory')for(const [key,n]of Object.entries(value)){if(!catalog.some(i=>key.startsWith(`${i.id}:`))||!Number.isSafeInteger(n)||n<0)throw Error('家园库存无效');}
 if(kind==='residents')for(const [id,p] of Object.entries(value)){if(id==='$selection'){if(p?.version!==1)throw Error('宠物名单版本无效');continue;}if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e9||Math.abs(p.y)>1e9)throw Error('宠物位置无效');}
 return value;
}
