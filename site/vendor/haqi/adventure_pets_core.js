import {applyPetTraitStats,petTraitParams,petHungerMultiplier,mergePetTraits,rollPetTraits,validatePetGrowth} from './adventure_pet_traits_core.js';
import {recordPetMeal} from './adventure_pet_quests_core.js';
import {ownedPetRecords} from './adventure_pet_files_core.js';
// Adventure adaptation; original combat formulae remain in combat_formulas_core.
import { resolveParams } from './combat_params_core.js';
import { baseMaxHp, applyHpStats } from './combat_formulas_core.js';
import { normalizeStats } from './combat_unit_core.js';
import { dungeonFor } from './adventure_dungeons_core.js';
import {createPetInstance,validatePetInstance} from './adventure_pet_interactions_core.js';
export const STARTERS=['dragon_green','dragon_purple','dragon_orange'];
export const STAGE_NAMES=['幼年','青年','成年','隐藏形态'];
export const FOOD_ID=990001, CAPTURE_ID=990002, GENERAL_CATCH_RUNE=23439;
const check=(ok,message)=>{if(!ok)throw Error(message);};
export const petParams=content=>resolveParams({cards:{}},content.balanceParams||{version:'kids'},{groups:['adventure']}).adventure;
export function foodInfo(content,id){
 const p=petParams(content);
 if(Number(id)===FOOD_ID)return {restore:p.foodRestore,xp:0,price:p.foodPrice};
 const rule=p.petFoodRules?.[id],item=content.petFoods?.[id];
 return rule&&item?{...rule,xp:Number(item.stats[60]||0)}:null;
}
// Newly received stock fills empty trays only; withdrawals are never re-deposited.
export function autoStockPetFood(save,content,before){
 if(!content.pets||save.pendingEncounter)return;
 for(const [key,count] of Object.entries(save.inventory)){
  const itemId=Number(key),gained=count-(before[key]||0);
  if(gained<=0||!foodInfo(content,itemId))continue;
  save.petFoodSlots??=[null,null];
  const slot=save.petFoodSlots.findIndex(row=>!row);if(slot<0)break;
  save.inventory[key]-=gained;save.petFoodSlots[slot]={itemId,count:gained};
 }
}
export function nutritionStock(save){return (save.inventory[FOOD_ID]||0)+(save.petFoodSlots||[]).reduce((n,row)=>n+(row?.itemId===FOOD_ID?row.count:0),0);}
export function consumeNutrition(save){
 if(save.inventory[FOOD_ID]>0){save.inventory[FOOD_ID]--;return;}
 const slot=(save.petFoodSlots||[]).findIndex(row=>row?.itemId===FOOD_ID&&row.count>0);
 check(slot>=0,'需要一份营养餐');if(--save.petFoodSlots[slot].count===0)save.petFoodSlots[slot]=null;
}
export function hungryPets(save,content){
 return Object.entries(save.pets||{}).filter(([,pet])=>(pet.hunger??100)<petParams(content).feedThreshold).sort((a,b)=>a[1].hunger-b[1].hunger);
}
export function validateFoodSlots(save,content){
 if(save.petFoodSlots===undefined)return;
 check(Array.isArray(save.petFoodSlots)&&save.petFoodSlots.length===2,'宠物食槽无效');
 for(const row of save.petFoodSlots)check(row===null||row&&Number.isSafeInteger(row.itemId)&&foodInfo(content,row.itemId)&&Number.isSafeInteger(row.count)&&row.count>0,'食槽口粮无效');
}
// Kids CombatPetFoodsPage.lua L272–293 and globalstore stats[60] supply XP.
// Satiety and automatic trays are Web adaptations, controlled by BalanceParams.
function eatFood(save,content,pet,itemId){
 const food=foodInfo(content,itemId),before=pet.hunger;
 recordPetMeal(save,content);
 pet.hunger=Math.min(100,pet.hunger+food.restore);
 if(pet.level<petParams(content).levelCap){pet.xp+=food.xp;pet.level=petXpLevel(pet.xp,content);}
 save.careLog.push(`${content.pets[pet.speciesId].name}吃了${content.items[itemId].name}，饱食 +${Math.round(pet.hunger-before)}`);
}
export function feedFromSlots(save,content){
 if(save.pendingEncounter)return false;
 let changed=false;
 for(const id of save.formation.filter(Boolean)){
  const pet=save.pets[id];if(!pet)continue;
  while(pet.hunger<petParams(content).feedThreshold){
   const index=(save.petFoodSlots||[]).findIndex(row=>row?.count>0);if(index<0)break;
   const row=save.petFoodSlots[index];eatFood(save,content,pet,row.itemId);changed=true;
   if(--row.count===0)save.petFoodSlots[index]=null;
  }
 }
 save.careLog=save.careLog.slice(-20);
 return changed;
}
export function petStage(level,content){return petParams(content).stageLevels.filter(n=>level>=n).length-1;}
// Appearance is cosmetic; growth, cards and combat always use the actual level.
export function petAppearanceStage(pet,content){
 if(content.pets[pet.speciesId]?.staticAppearance)return 0;
 const unlocked=petStage(pet.level,content);
 return Number.isInteger(pet.appearanceStage)&&pet.appearanceStage>=0&&pet.appearanceStage<=unlocked?pet.appearanceStage:unlocked;
}
export function petCapacity(pet,content){return petParams(content).petCapacities[petStage(pet.level,content)];}
export function petXpLevel(xp,content){const p=petParams(content);return Math.min(p.levelCap,Math.floor((1+Math.sqrt(1+8*xp/p.petXpStep))/2));}
export function petMaxHp(pet,content){return applyHpStats(baseMaxHp(content.pets[pet.speciesId].school,pet.level,'kids'),applyPetTraitStats({},pet.passiveTraits,petTraitParams(content)).hpPct,0,'kids');}
export function specMaxHp(spec){return applyHpStats(baseMaxHp(spec.school,spec.level,'kids'),spec.stats.hpPct||0,spec.stats.hpFlat||0,'kids');}
export function petLessons(pet,content){return content.pets[pet.speciesId].lessons;}
export function recommendedPetDeck(pet,content){
 const lessons=petLessons(pet,content).filter(x=>x.level<=pet.level),out=[];let left=petCapacity(pet,content);
 for(const row of [...lessons].reverse()){const count=Math.min(petParams(content).petCopies,left);if(count){out.push({key:row.key,count});left-=count;}}
 return out;
}
export function validatePetDeck(pet,content,deck){
 check(Array.isArray(deck)&&deck.length>0,'宠物卡包不能为空');const seen=new Set();let count=0;
 for(const row of deck){check(!seen.has(row.key)&&Number.isInteger(row.count)&&row.count>0&&row.count<=petParams(content).petCopies&&petLessons(pet,content).some(x=>x.key===row.key&&x.level<=pet.level),'宠物卡牌尚未解锁或份数无效');seen.add(row.key);count+=row.count;}
 check(count<=petCapacity(pet,content),'宠物卡包容量不足');
}
export function addPet(save,content,id,xp=0,{traits,captured=false}={}){
 check(Object.hasOwn(content.pets,id),'未知宠物');
 const existing=Object.values(ownedPetRecords(save)).find(p=>p.speciesId===id);
 if(existing)check(save.pets[save.petInstanceVersion===1?existing.id:existing.speciesId],`请先查看${content.pets[id].name}的详情，再领取重复宠物奖励`);
 const incoming=traits??rollPetTraits(`${save.seed}:${id}:obtain:${existing?.obtainedCount??(existing?1:0)}`,petTraitParams(content),existing?.passiveTraits);
 const passiveTraits=mergePetTraits(existing?.passiveTraits,incoming);
 if(existing){const pet=save.pets[save.petInstanceVersion===1?existing.id:existing.speciesId];pet.passiveTraits=passiveTraits;pet.captureCount=(pet.captureCount||0)+(captured?1:0);pet.obtainedCount=(pet.obtainedCount??1)+1;pet.xp+=petParams(content).duplicateXp;pet.level=petXpLevel(pet.xp,content);return pet;}
 const pet={id:`${save.seed}:${id}`,speciesId:id,xp,level:petXpLevel(xp,content),hunger:100,hp:0,deck:[],passiveTraits,captureCount:captured?1:0,obtainedCount:1};
 pet.hp=petMaxHp(pet,content);pet.deck=recommendedPetDeck(pet,content);
 if(save.petInstanceVersion===1)Object.assign(pet,createPetInstance(content,{...pet,ownerId:save.petOwnerId}));
 save.pets[save.petInstanceVersion===1?pet.id:id]=pet;return pet;
}
// Legacy duplicate individuals are consolidated once their files are hydrated.
// Keep original individual records inside the surviving pet file for provenance.
export function mergeOwnedPetSpecies(save,content){
 if(save.pendingEncounter||save.petInstanceVersion!==1)return false;
 const groups=new Map();for(const pet of Object.values(ownedPetRecords(save))){const rows=groups.get(pet.speciesId)||[];rows.push(pet);groups.set(pet.speciesId,rows);}
 let changed=false;
 for(const rows of groups.values())if(rows.length>1){
  if(rows.some(p=>!save.pets[p.id]))continue;
  rows.sort((a,b)=>{const ai=save.formation.indexOf(a.id),bi=save.formation.indexOf(b.id);return (ai<0?4:ai)-(bi<0?4:bi)||a.id.localeCompare(b.id);});
  const keeper=save.pets[rows[0].id];
  for(const row of rows.slice(1)){
   const pet=save.pets[row.id];keeper.legacyMergedPets??=[];const {hp,hunger,...historical}=pet;keeper.legacyMergedPets.push(JSON.parse(JSON.stringify(historical)));
   keeper.passiveTraits=mergePetTraits(keeper.passiveTraits,pet.passiveTraits);
   keeper.captureCount=(keeper.captureCount||0)+(pet.captureCount||0);keeper.obtainedCount=(keeper.obtainedCount??1)+(pet.obtainedCount??1);
   keeper.xp=Math.max(keeper.xp,pet.xp);keeper.level=petXpLevel(keeper.xp,content);keeper.cooldownUntil=Math.max(keeper.cooldownUntil,pet.cooldownUntil);
   save.petMergedIds??=[];if(!save.petMergedIds.includes(pet.id))save.petMergedIds.push(pet.id);
   delete save.pets[pet.id];if(save.petFileRefs)delete save.petFileRefs[pet.id];
   save.formation=save.formation.map(id=>id===pet.id?null:id);changed=true;
  }
 }
 if(changed)save.revision++;
 return changed;
}
export function initializePets(save,content,starter=null){
 save.petDeckRulesVersion=1;
 save.pets={};save.formation=[null,null,null,null];save.heroSlot=0;save.heroHp=null;save.careAt=0;save.careLog=[];save.transactions=[];save.starterChosen=false;
 if(starter){check(STARTERS.includes(starter),'请选择抱抱龙颜色');addPet(save,content,starter);save.formation[0]=starter;save.starterChosen=true;}
}
export function petAction(save,content,action,access={}){
 const p=petParams(content),pet=save.pets[action.petId];
 switch(action.type){
 case 'pet-food-put':{
  check(!save.pendingEncounter,'请先完成当前战斗');
  check(Number.isInteger(action.slot)&&action.slot>=0&&action.slot<2,'食槽无效');
  check(Number.isSafeInteger(action.itemId)&&foodInfo(content,action.itemId),'请选择宠物口粮');
  check(Number.isSafeInteger(action.count)&&action.count>0&&(save.inventory[action.itemId]||0)>=action.count,'口粮数量不足');
  const row=save.petFoodSlots?.[action.slot];check(!row||row.itemId===action.itemId,'请先取回食槽中的口粮');
  check(Number.isSafeInteger((row?.count||0)+action.count),'口粮数量无效');
  save.petFoodSlots??=[null,null];save.inventory[action.itemId]-=action.count;
  save.petFoodSlots[action.slot]={itemId:action.itemId,count:(row?.count||0)+action.count};
  feedFromSlots(save,content);break;
 }
 case 'pet-food-feed':{
  const row=save.petFoodSlots?.[action.slot];
  check(pet&&row&&pet.hunger<100,'需要槽内口粮，且宠物尚未吃饱');
  eatFood(save,content,pet,row.itemId);
  if(--row.count===0)save.petFoodSlots[action.slot]=null;
  break;
 }
 case 'pet-food-take':{
  check(!save.pendingEncounter,'请先完成当前战斗');check(Number.isInteger(action.slot)&&action.slot>=0&&action.slot<2,'食槽无效');
  const row=save.petFoodSlots?.[action.slot];check(row,'食槽已经空了');
  check(Number.isSafeInteger((save.inventory[row.itemId]||0)+row.count),'口粮数量无效');
  save.inventory[row.itemId]=(save.inventory[row.itemId]||0)+row.count;save.petFoodSlots[action.slot]=null;break;
 }
 case 'pet-appearance':check(pet,'尚未拥有宠物');check(!content.pets[pet.speciesId]?.staticAppearance,'这只宠物的外观不随等级变化');check(Number.isInteger(action.stage)&&action.stage>=0&&action.stage<=petStage(pet.level,content),'宠物形态尚未解锁');pet.appearanceStage=action.stage;break;
 case 'starter':{check(!save.starterChosen&&STARTERS.includes(action.petId),'已领取初始伙伴');const added=addPet(save,content,action.petId);save.formation[save.heroSlot]=save.petInstanceVersion===1?added.id:action.petId;save.starterChosen=true;break;}
 case 'formation':{
  check(Array.isArray(action.slots)&&action.slots.length===4&&action.slots.every(id=>id===null||Object.hasOwn(save.pets,id)),'阵容无效');
  const ids=action.slots.filter(Boolean);check(new Set(ids).size===ids.length,'同一宠物不能重复上阵');
  check(Number.isInteger(action.heroSlot)&&action.heroSlot>=0&&action.heroSlot<4,'主角卡位无效');save.formation=[...action.slots];save.heroSlot=action.heroSlot;break;
 }
 case 'pet-deck':check(pet,'尚未拥有宠物');validatePetDeck(pet,content,action.deck);pet.deck=action.deck.map(x=>({...x}));break;
 case 'pet-feed':check(pet&&pet.hunger<100&&nutritionStock(save)>0,'需要食物，且宠物尚未吃饱');consumeNutrition(save);pet.hunger=Math.min(100,pet.hunger+p.foodRestore);recordPetMeal(save,content);break;
 case 'buy':{
  const item=content.shop.find(x=>x.id===action.productId);check(item,'商品不存在');check(!item.retired,'捕获晶球已停售，请使用抓宠符文');check(!item.isInternalTest,'内测道具不对外出售');check(!item.vipOnly||access.keepworkVip===true,'该商品仅限会员购买。请登录会员账号后重试。');check(save.level>=item.level,'等级尚未解锁');
  check(item.kind!=='pet'||!Object.values(ownedPetRecords(save)).some(p=>p.speciesId===item.petId),'已经拥有这只宠物');const cost=productPrice(item,content);
  const currency=item.kind==='mount'?item.currency:100;
  check(!action.paidByTest,'语言课程仅发放限额奖励，请使用货币购买');
  const count=action.count??1;check(Number.isSafeInteger(count)&&count>0&&count<=999&&(count===1||!!foodInfo(content,item.itemId)),'购买数量无效');
  check(item.kind==='pet'||Number.isSafeInteger((save.inventory[item.itemId]||0)+count),'物品数量无效');
  check((save.inventory[currency]||0)>=cost*count,currency===984?'魔豆不足':'奇豆不足');save.inventory[currency]-=cost*count;
  if(item.kind==='pet')addPet(save,content,item.petId);else save.inventory[item.itemId]=(save.inventory[item.itemId]||0)+count;
  save.transactions.push({id:save.transactions.length+1,productId:item.id,cost:cost*count,count,paidByTest:false});break;
 }
 default:return false;
 }return true;
}
export function productPrice(item,content){const p=petParams(content);return item.kind==='mount'?item.price:item.kind==='pet'?p.petPriceBase+p.petPriceLevel*item.level:item.kind==='gear'?p.gearPriceBase+p.gearPriceLevel*item.level:foodInfo(content,item.itemId)?.price??p.capturePrice;}
// Unused capture crystals become the general catch rune. A battle already casting crystals keeps its stock so the old checkpoint can replay.
export function retireCaptureCrystals(save,content,{keepActiveBattle=true}={}){
 const count=save.inventory?.[CAPTURE_ID]||0;
 if(!count||keepActiveBattle&&save.pendingEncounter?.decisions?.some(row=>row?.capture))return false;
 const rune=content.items?.[GENERAL_CATCH_RUNE];
 if(rune?.kind!==18||rune.subtype!==2)return false;
 save.inventory[GENERAL_CATCH_RUNE]=(save.inventory[GENERAL_CATCH_RUNE]||0)+count;
 delete save.inventory[CAPTURE_ID];
 if(save.pendingEncounter&&Object.hasOwn(save.pendingEncounter,'captureStock'))save.pendingEncounter.captureStock=0;
 return true;
}
export function partySpecs(save,content,hero,{traits=true}={}){
 hero={...hero,slot:save.heroSlot,hp:save.heroHp??specMaxHp(hero)};
 const support=save.pets[save.formation[save.heroSlot]];
 if(support){hero.petCards=support.deck.map(x=>({...x}));if(traits&&support.passiveTraits)hero.supportPetTraits={...support.passiveTraits};}
 return [hero,...save.formation.flatMap((id,slot)=>{
  if(!id||slot===save.heroSlot)return [];const pet=save.pets[id],definition=content.pets[pet.speciesId];
  return [{id:pet.id,name:definition.name,school:definition.school,level:pet.level,slot,speciesId:pet.speciesId,hp:pet.hp,stats:traits?applyPetTraitStats({},pet.passiveTraits,petTraitParams(content)):normalizeStats(),...(traits&&pet.passiveTraits?{passiveTraits:{...pet.passiveTraits}}:{}),deck:pet.deck.map(x=>({...x})),deckCapacity:petCapacity(pet,content),deckEachCapacity:petParams(content).petCopies,isBot:true}];
 })];
}
// Wall clock is injected by browser IO; never read during combat replay.
export function tickCare(save,content,hero,now,online=false){
 check(Number.isFinite(now)&&now>=0,'时间无效');
 if(!save.careAt){save.careAt=now;return;}
 const elapsed=Math.max(0,now-save.careAt);save.careAt=Math.max(now,save.careAt);if(save.pendingEncounter)return;
 const minutes=Math.min(1440,elapsed/60000),p=petParams(content),maxHp=specMaxHp(hero);
 // Dungeon worlds keep the HP brought in (2026-09-24). Island regen stays 2% max HP per second.
 const inDungeon=!!dungeonFor(content,save.zone);
 if(!inDungeon)save.heroHp=Math.min(maxHp,(save.heroHp??maxHp)+maxHp*p.heroRegenPerSecond*minutes*60);
 for(const id of save.formation.filter(Boolean)){
  const pet=save.pets[id];if(online){pet.hunger=Math.max(0,pet.hunger-minutes*p.hungerPerMinute*petHungerMultiplier(pet,content));
  }
 }
 const coreChanged=online?feedFromSlots(save,content):false;
 // Web companion care: stored pets rest without consuming food, including
 // offline time (the same 24-hour elapsed cap and battle pause apply).
 const active=new Set(save.formation.filter(Boolean));
 for(const [id,pet] of Object.entries(save.pets))if(!active.has(id))pet.hunger=Math.min(100,pet.hunger+minutes*p.restingHungerPerMinute);
 if(!inDungeon)for(const pet of Object.values(save.pets))if(pet.hunger>0)pet.hp=Math.min(petMaxHp(pet,content),pet.hp+petMaxHp(pet,content)*p.regenPerMinute*minutes);
 save.careLog=save.careLog.slice(-20);
 return coreChanged;
}
export function migratePetDeckRules(save,content){
 check(save.petDeckRulesVersion===undefined||save.petDeckRulesVersion===1,'宠物卡包规则版本无效');
 if(save.petDeckRulesVersion===1)return content;
 const legacy={...content,balanceParams:{...content.balanceParams,adventure:{...petParams(content),petCapacities:[8,12,16,20]}}};
 validatePets(save,legacy);
 if(save.pendingEncounter?.party)return legacy;
 for(const pet of Object.values(save.pets)){
  let remaining=petCapacity(pet,content);
  pet.deck=pet.deck.flatMap(row=>{const count=Math.min(row.count,remaining);remaining-=count;return count?[{...row,count}]:[];});
 }
 save.petDeckRulesVersion=1;
 return content;
}
export function validatePets(save,content){
 validateFoodSlots(save,content);
 check(save.pets&&typeof save.pets==='object'&&!Array.isArray(save.pets),'宠物收藏无效');
 for(const [id,pet] of Object.entries(save.pets)){
  validatePetGrowth(pet);
  if(save.petInstanceVersion===1){check(pet.id===id&&pet.ownerId===save.petOwnerId,'宠物身份无效');validatePetInstance(pet,content);}
  else check(Object.hasOwn(content.pets,id)&&pet.speciesId===id&&pet.id===`${save.seed}:${id}`,'宠物身份无效');
  check(Number.isSafeInteger(pet.xp)&&pet.xp>=0&&pet.level===petXpLevel(pet.xp,content),'宠物等级无效');
  check(content.pets[pet.speciesId]?.staticAppearance?pet.appearanceStage===undefined||pet.appearanceStage===0:pet.appearanceStage===undefined||Number.isInteger(pet.appearanceStage)&&pet.appearanceStage>=0&&pet.appearanceStage<=petStage(pet.level,content),'宠物外观无效');
  check(Number.isFinite(pet.hp)&&pet.hp>=0&&pet.hp<=petMaxHp(pet,content)&&Number.isFinite(pet.hunger)&&pet.hunger>=0&&pet.hunger<=100,'宠物状态无效');validatePetDeck(pet,content,pet.deck);
 }
 check(Number.isFinite(save.careAt)&&save.careAt>=0&&typeof save.starterChosen==='boolean'&&Array.isArray(save.careLog)&&save.careLog.every(x=>typeof x==='string')&&Array.isArray(save.transactions),'养成记录无效');
 for(const [index,row] of save.transactions.entries())check(row?.id===index+1&&content.shop.some(x=>x.id===row.productId)&&Number.isSafeInteger(row.cost)&&row.cost>=0,'购买记录无效');
 check(save.heroHp===null||Number.isFinite(save.heroHp)&&save.heroHp>=0,'角色生命无效');
 petAction(save,content,{type:'formation',slots:save.formation,heroSlot:save.heroSlot});
}
export function exportPetLink(save,content){
 check(Object.keys(ownedPetRecords(save)).length===Object.keys(save.pets).length,'请先加载完整宠物收藏再导出联动数据');
 return {version:save.petInstanceVersion===1?2:1,app:'HaqiAdventure',pets:Object.values(save.pets).map(p=>({instanceId:p.id,sourceId:content.pets[p.speciesId].sourceId,appearance:{dna:content.pets[p.speciesId].dna||null,imageSheetUrl:content.pets[p.speciesId].art?.cdn||null},traits:content.pets[p.speciesId].traits,stage:['baby','teen','adult','elder'][petStage(p.level,content)],adventure:{level:p.level,xp:p.xp,deck:p.deck.map(x=>({...x}))}}))};
}
export function validatePetLink(value,content){
 check([1,2].includes(value?.version)&&value.app==='HaqiAdventure'&&Array.isArray(value.pets),'联动协议版本无效');const seen=new Set();
 const pets=value.pets.map(row=>{
  check(typeof row.instanceId==='string'&&!seen.has(value.version===2?row.instanceId:row.sourceId)&&Object.hasOwn(content.pets,row.sourceId),'联动宠物身份无效');seen.add(value.version===2?row.instanceId:row.sourceId);
  check(Number.isSafeInteger(row.adventure?.xp)&&row.adventure.xp>=0&&row.adventure.level===petXpLevel(row.adventure.xp,content),'联动成长无效');
  check(row.stage===['baby','teen','adult','elder'][petStage(row.adventure.level,content)],'联动阶段无效');
  validatePetDeck({speciesId:row.sourceId,level:row.adventure.level},content,row.adventure.deck);
  const definition=content.pets[row.sourceId];
  return {instanceId:row.instanceId,sourceId:row.sourceId,appearance:{dna:definition.dna||null,imageSheetUrl:definition.art?.cdn||null},traits:definition.traits,stage:row.stage,adventure:{level:row.adventure.level,xp:row.adventure.xp,deck:row.adventure.deck.map(x=>({key:x.key,count:x.count}))}};
 });return {version:value.version,app:'HaqiAdventure',pets};
}
// Future home adapter consumes this object without replacing MagicHaqi's battle level.
export function petLinkToAdventureRecords(value,content){return validatePetLink(value,content).pets.map(row=>({id:row.instanceId,speciesId:row.sourceId,...row.adventure}));}
