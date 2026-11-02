import {createRng,hashSeed} from './rng_core.js';
// Stable cosmetic identifiers; old saves resolve to their original body.
export function validHeroBodyId(id,appearance){
 const gender=appearance==='girl'?'female':'male';
 return typeof id==='string'&&id.length<=64&&((gender==='female'&&/^female-ai-(astra|claude|deepseek|gemini)$/.test(id))||new RegExp(`^${gender}(?:[2-9]|1[0-3]|-ref|-urban-[a-z0-9]+(?:-[a-z0-9]+)*)?$`).test(id)||new RegExp(`^era-(1950|1960|1970|1980|1990|2000|2010|2020)-${gender}$`).test(id)||new RegExp(`^child-(1950|1960|1970|1980)-(spring|summer|autumn|winter)-${gender}$`).test(id));
}
export function resolvedBodyId(save){return validHeroBodyId(save.bodyId,save.appearance)?save.bodyId:save.appearance==='girl'?'female':'male';}

// Separate cosmetic stream: refreshes keep outfits stable without consuming gameplay RNG.
export function randomHeroBodyId(manifest,appearance,seed){
 const gender=appearance==='girl'?'female':'male';
 const pool=[gender,...Object.keys(manifest?.bodyVariants||{}).filter(id=>manifest.bodyVariants[id].gender===gender&&validHeroBodyId(id,appearance)).sort()];
 return createRng(hashSeed(`${seed}:body-costume`)).pick(pool);
}

// 新建角色默认头：排除非洲肤色家族（onyx/cocoa）与都市居民（urban-*）。
// 都市短发职业头（建筑师、电工等）挂在女卡上容易被当成男生形象。
// onyx/cocoa 仍可在换装箭头里翻到；urban 从主角创建/换装列表移除（城市 NPC 不受影响）。
export const DEFAULT_HEAD_EXCLUDE=/^(?:onyx|cocoa|urban)-/;
export const PICKER_HEAD_EXCLUDE=/^urban-/;
export function randomHeroHeadId(manifest,appearance,seed){
 const gender=appearance==='girl'?'female':'male';
 const fallback=gender==='female'?'elf-girl':'elf-boy';
 const pool=Object.keys(manifest?.heads||{}).filter(id=>manifest.heads[id].gender===gender&&!DEFAULT_HEAD_EXCLUDE.test(id)).sort();
 if(!pool.length)return fallback;
 return createRng(hashSeed(`${seed}:head-look`)).pick(pool);
}

// 第一步「起名字」的初始草稿：男主角与女主角两张卡各自随机搭配头部和服装，
// 并让当前选中的性别直接带上那一套随机外观，省去玩家先翻一遍。
export function createHeroDraft(manifest,seed=Date.now()){
 const appearance=createRng(hashSeed(`${seed}:hero-appearance`)).pick(['boy','girl']);
 const headChoices={},bodyChoices={};
 for(const value of ['boy','girl']){
  headChoices[value]=randomHeroHeadId(manifest,value,`${seed}:${value}`);
  const recommended=manifest?.heads?.[headChoices[value]]?.recommendedBodyId;
  // 若头部带推荐服装（都市肤色配套），草稿仍成对采用；默认池已排除 urban 头，
  // 因此开局不会落到都市职业套。换装页仍可独立改头/改身体。
  if(recommended&&manifest?.bodyVariants?.[recommended]?.gender===(value==='girl'?'female':'male')&&validHeroBodyId(recommended,value))bodyChoices[value]=recommended;
  else{
   const classicVariants=Object.fromEntries(Object.entries(manifest?.bodyVariants||{}).filter(([,body])=>!body.recommendedHeadId));
   bodyChoices[value]=randomHeroBodyId({...manifest,bodyVariants:classicVariants},value,`${seed}:${value}`);
  }
 }
 return {name:'',school:'fire',appearance,starter:'dragon_green',step:1,
  headId:headChoices[appearance],bodyId:bodyChoices[appearance],headChoices,bodyChoices};
}
