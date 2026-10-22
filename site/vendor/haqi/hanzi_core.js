import {validateMemoryProgress} from './hanzi_memory_core.js';
import {HANZI_BATTLE_CARDS,ownsHanziCard} from './hanzi_battle_core.js';
// Hanzi activity rules. No browser, microphone, clock or combat RNG dependencies.
export const HANZI_IDS=['ri','yue','shan','shui','huo','mu','shi','tu','ren','kou','shou','mu-eye','er','xin','men','tian-field','shang','xia','da','xiao','zhong','tian-sky','yun','yu'];
const DAY=86400000;
export const createHanziProgress=()=>({version:1,locale:'zh',pinyin:false,entries:{},equipped:{},effectMode:'glyph'});
export function validateHanziProgress(p){
 if(p===undefined)return;
 validateMemoryProgress(p?.memories);
 const fail=()=>{throw Error('汉字进度格式无效');};
 if(!p||p.version!==1||!['zh','en'].includes(p.locale)||typeof p.pinyin!=='boolean'||!['glyph','gloss','idiom'].includes(p.effectMode)||!p.entries||!p.equipped||Array.isArray(p.entries)||Array.isArray(p.equipped))fail();
 if(Object.keys(p.entries).length>24||Object.keys(p.equipped).length>100)fail();
 for(const [id,e]of Object.entries(p.entries)){
  if(!HANZI_IDS.includes(id)||!Array.isArray(e.attempts)||e.attempts.length>3||e.attempts.some((a,i)=>a.stage!==i||!['write','speak'].includes(a.method)||typeof a.hinted!=='boolean'||!Number.isSafeInteger(a.at)||a.at<0))fail();
  if(e.review!==undefined&&(!Number.isInteger(e.review.count)||e.review.count<0||e.review.count>100000||!Number.isSafeInteger(e.review.due)||e.review.due<0||!Number.isSafeInteger(e.review.last)||e.review.last<0))fail();
 }
 for(const [base,id]of Object.entries(p.equipped))if(!/^[a-zA-Z0-9_-]{1,100}$/.test(base)||!/^hz-fx-[1-6]$/.test(id))fail();
 if(p.questCards!==undefined&&(!Array.isArray(p.questCards)||new Set(p.questCards).size!==p.questCards.length||p.questCards.some(id=>!Object.hasOwn(HANZI_BATTLE_CARDS,id))))fail();
 if(p.battleCard!==undefined&&(!Object.hasOwn(HANZI_BATTLE_CARDS,p.battleCard)||!ownsHanziCard(p,p.battleCard)))fail();
 return p;
}
export function parseHanziRoute(search){const q=new URLSearchParams(search);return {active:q.get('product')==='hanzi',chapter:/^hz-0[1-3]$/.test(q.get('chapter')||'')?q.get('chapter'):null};}
export const learnedCount=p=>Object.values(p?.entries||{}).filter(e=>e.attempts.length===3).length;
export const chapterOpen=(p,index)=>index===0||HANZI_IDS.slice(0,index*8).every(id=>p?.entries?.[id]?.attempts.length===3);
export const unlockedEffect=(p,effect)=>effect.characters.every(id=>p?.entries?.[id]?.attempts.length===3);
export function completeHanziAttempt(progress,{id,stage,method,hinted=false,now,review=false}){
 validateHanziProgress(progress);if(!HANZI_IDS.includes(id)||!['speak','write'].includes(method)||!Number.isSafeInteger(now)||now<0)throw Error('汉字练习参数无效');
 const p=structuredClone(progress||createHanziProgress()),entry=p.entries[id]||{attempts:[]};
 if(!chapterOpen(p,Math.floor(HANZI_IDS.indexOf(id)/8)))return {progress:p,changed:false};
 if(review){
  if(entry.attempts.length!==3||!entry.review||entry.review.due>now||stage!==entry.review.count)return {progress:p,changed:false};
  const count=entry.review.count+1;entry.review={count,last:now,due:now+[1,3,7][Math.min(count,2)]*DAY};
 }else{
  if(stage!==entry.attempts.length||stage>=3)return {progress:p,changed:false};
  entry.attempts.push({stage,method,hinted:!!hinted,at:now});
  if(entry.attempts.length===3)entry.review={count:0,last:now,due:now+DAY};
 }
 p.entries[id]=entry;return {progress:p,changed:true,collected:!review&&entry.attempts.length===3};
}
export function speechMatches(text,character){
 const clean=s=>String(s||'').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'');
 const value=clean(text);return !!value&&[character.glyph,...character.words].some(word=>value===clean(word)||value===`这是${clean(word)}`||value===`我说${clean(word)}`);
}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function sample(points,n=24){
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+distance(points[i-1],points[i]));
 const total=lengths.at(-1);if(total<.01)return null;
 let j=1;return Array.from({length:n},(_,i)=>{const t=total*i/(n-1);while(j<lengths.length-1&&lengths[j]<t)j++;const a=points[j-1],b=points[j],r=(t-lengths[j-1])/(lengths[j]-lengths[j-1]||1);return [a[0]+(b[0]-a[0])*r,a[1]+(b[1]-a[1])*r];});
}
function normalize(strokes){
 const points=strokes.flat();const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY,scale=Math.max(w,h);
 if(scale<.045)return null;return strokes.map(s=>s.map(([x,y])=>[(x-minX-w/2)/scale+.5,(y-minY-h/2)/scale+.5]));
}
// Pointer points are normalized to the writing square; template has the same orientation.
export function compareHanziWriting(strokes,medians){
 if(!Array.isArray(strokes)||strokes.length!==medians.length)return {ok:false,reason:'count',expected:medians.length};
 if(strokes.some(s=>!Array.isArray(s)||s.length<2||s.length>4096||s.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1))))return {ok:false,reason:'shape'};
 const input=normalize(strokes),target=normalize(medians);if(!input||!target)return {ok:false,reason:'shape'};
 let sum=0;
 for(let i=0;i<input.length;i++){
  const a=sample(input[i]),b=sample(target[i]);if(!a||!b)return {ok:false,reason:'shape',stroke:i};
  const error=a.reduce((s,p,k)=>s+distance(p,b[k]),0)/a.length;
  const pathLength=s=>s.slice(1).reduce((v,p,k)=>v+distance(p,s[k]),0);
  const ratio=pathLength(input[i])/pathLength(target[i]);
  if(error>.16||distance(a[0],b[0])>.25||distance(a.at(-1),b.at(-1))>.25||ratio<.5||ratio>1.9)return {ok:false,reason:'stroke',stroke:i};sum+=error;
 }
 return {ok:sum/input.length<.12,reason:'shape',error:sum/input.length};
}
export function equipHanziEffect(progress,effect,base){
 if(!effect.bases.includes(base)||!unlockedEffect(progress,effect))throw Error('请先收集这一组字卡');
 const p=structuredClone(progress);if(p.equipped[base]===effect.id)delete p.equipped[base];else p.equipped[base]=effect.id;return p;
}
export function validateHanziContent(data,strokes,effects){
 if(data.version!==1||strokes.version!==1||data.characters.length!==24||data.chapters.length!==3||data.effects.length!==6)throw Error('汉字内容版本或数量无效');
 for(const [i,row]of data.characters.entries())if(row.id!==HANZI_IDS[i]||!strokes.characters[row.glyph]?.medians.length||strokes.characters[row.glyph].strokes.length!==strokes.characters[row.glyph].medians.length||!row.story?.every(s=>s.zh&&s.en)||row.story.length!==3||!row.meaning||!row.poem?.en||!row.words.length||!row.source)throw Error('汉字内容不完整：'+row.id);
 for(const effect of data.effects)if(!effect.bases.length||effect.bases.some(base=>!effects.bases[base])||effect.characters.length!==4||effect.characters.some(id=>!HANZI_IDS.includes(id)))throw Error('汉字外观绑定无效：'+effect.id);
 return true;
}

export function grantHanziQuestCard(save,id){
 if(!Object.hasOwn(HANZI_BATTLE_CARDS,id))throw Error('未知汉字奖励');
 const p=save.hanzi||=createHanziProgress();p.questCards||=[];if(!p.questCards.includes(id))p.questCards.push(id);p.battleCard||=id;
}
export function equipHanziBattleCard(progress,id){
 if(!Object.hasOwn(HANZI_BATTLE_CARDS,id)||!ownsHanziCard(progress,id))throw Error('请先获得这张汉字卡');
 const p=structuredClone(progress);if(p.battleCard===id)delete p.battleCard;else p.battleCard=id;return p;
}
