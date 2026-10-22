import {validateTreeClaims} from './language_tree_rewards_core.js';
import {mapCoordinateVersion,migrateSaveCoordinates} from './adventure_coordinates_core.js';
import {hanziBattleSpec,validateHanziBattleSpec} from './hanzi_battle_core.js';
import {grantHanziQuestCard} from './hanzi_core.js';
import {validateTimeScrollProgress,validateTimeScrollRuntime} from './adventure_time_scroll_core.js';
import {validateHanziProgress} from './hanzi_core.js';
import {encounterPetTraitSeed,petTraitParams,monsterPetTraits} from './adventure_pet_traits_core.js';
import {monsterCaptureSpecies} from './adventure_monster_pets_core.js';
import {earthEncounter,earthNearest,earthChapterEvent} from './adventure_earth_core.js';
import {cityBattleReady,recordCityBattleWin} from './adventure_city_dungeons_core.js';
import {validateEarthCityProgress} from './adventure_earth_city_config_core.js';
import {dailyBuffs,validateDailyBuff} from './language_daily_buff_core.js';
import {claimSpeechReward,validateSpeechClaims} from './language_speech_rewards_core.js';
import {dungeonLanguageBuff,dungeonLanguageBaseHp} from './adventure_dungeon_language_core.js';
import {encounterCoolingDown,markEncounterDefeated} from './adventure_encounter_cooldown_core.js';
import {validateRelationshipEvents} from './character_relationship_core.js';
import {ownedPetRecords,ownedPetSpecies} from './adventure_pet_files_core.js';
import {validatePetWorld} from './adventure_pet_world_core.js';
import {validatePetMeetings} from './adventure_pet_interactions_core.js';
import {validHeroBodyId} from './hero_body_core.js';
import {journeyParty,journeyEnemyFormation,recordTowerWin,journeyRewardPets} from './adventure_dungeon_journeys_core.js';
import {dungeonProgress,coopParty,settleCoopHealth,validateCoopRun} from './adventure_coop_core.js';
import {dungeonFor,validateDungeons} from './adventure_dungeons_core.js';
import {purchaseNpcOffer} from './adventure_npc_core.js';
import {claimMagicStar,validateMagicStarClaims,magicStarCombatLevel,applyMagicStarCombat} from './adventure_magic_star_core.js';
import {equipmentSetStats,dragonTotemStage,progressionStatEntry,chooseDragonTotem,useDragonTotemItem} from './adventure_progression_bonuses_core.js';
import {customizeHero} from './adventure_hero_customize_core.js';
import {publicPhotoHead} from './photo_head_core.js';
// AdventureContent / AdventureSave v1. Pure chapter rules; no browser or storage APIs.
import { islandFor, islandSpawn, travelStatus } from './adventure_world_map_core.js';
import { worldDimensions, mapInfo } from './adventure_island_layout_core.js';
import { createWorld, retreatBeside } from './adventure_world_core.js';
import { SCHOOLS } from './combat_params_core.js';
import { normalizeLocaleSave } from './locale_core.js';
import {recordLearningCompletion, validateLearningSave} from './language_adventure_core.js';
import { normalizeStats, statIdToEntry, clampDeck } from './combat_unit_core.js';
import * as Pets from './adventure_pets_core.js';
import { createRng, hashSeed } from './rng_core.js';
import { castFishing, useStaminaPotion } from './adventure_fishing_core.js';
import { applyCombatStamina, encounterStaminaCost } from './adventure_stamina_core.js';
import { validateFishingRecords } from './adventure_fishing_records_core.js';
import {mountGem,removeGems} from './adventure_gems_core.js';
import { equipmentRequirements } from './adventure_item_rules_core.js';
import { upgradeAt, upgradeLevels, applyUpgradeStats } from './adventure_upgrade_core.js';
import { createEquipmentInstanceLookup, findEquipmentInstance, syncEquipmentInstances, validateEquipmentInstances } from './adventure_equipment_instances_core.js';
import { claimCheckin, validateCheckin } from './adventure_checkin_core.js';
import { resolvePetReward, migrateQuestPetRewards } from './adventure_rewards_core.js';
import { applyMountStats } from './adventure_mounts_core.js';
import {syncTrainingPoints,validateTrainingPoints,skillLearningStatus} from './adventure_learning_core.js';
import {acceptCatalogQuest,claimCatalogQuest,noteCatalogKills,noteCatalogSignal,validateCatalogQuests,pinTrackedQuest,unpinTrackedQuest,showCurrentChapter,trackedQuestIds,supplementIslandTrack,noteQuestAccepted} from './adventure_catalog_quests_core.js';
export { rewardLabel } from './adventure_rewards_core.js';
export { readStamina, ensureDailyStamina, dungeonStaminaHint, parseArenaStaminaCost } from './adventure_stamina_core.js';

export const SAVE_VERSION = 2;
export const SCHOOL_NAMES = { fire: '烈火', ice: '寒冰', storm: '风暴', life: '生命', death: '死亡' };
const clone = value => JSON.parse(JSON.stringify(value));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const owns = (s, id) => (s.inventory[id] || 0) > 0;
export function currentQuest(save, content) {
    return content.quests.find(q => !save.quests[q.id]?.claimed) || null;
}
// 低于10级时所有区域开启新手UI指引；10级起保留原魔法营地教学规则。
export function beginnerTeaching(save) {
    return Number.isFinite(save?.level) && save.level >= 1 && save.level < 10;
}
// 新手岛教学模式（2026-09-26 用户约定）：身处魔法营地且营地任务链
// （章节任务按发布 NPC 所在区域、目录任务按 region）尚有未交付的即开启；
// 低等级直接返回 true；其余等级返回未交付营地任务或 null，供面板与追踪统一判定。
export function teachingMode(save, content) {
    if (save && content && beginnerTeaching(save)) return true;
    if (!save || save.zone !== 'camp' || !content) return null;
    const chapter = content.quests?.find(q => !save.quests[q.id]?.claimed && content.npcs[q.startNpc]?.zone === 'camp');
    if (chapter) return chapter;
    return content.catalogQuests?.quests.find(q => q.region === 'camp' && !save.quests[q.id]?.claimed) || null;
}
export function questState(save, id) { return save.quests[id] || { accepted: false, claimed: false, progress: {} }; }
export function questProgress(save, quest) {
    const state = questState(save, quest.id);
    return quest.goals.map(g => ({ ...g, value: Math.min(g.count, state.progress[`${g.kind}:${g.id}`] || 0) }));
}
export function pendingQuestTalk(save, quest, npcId) {
    if (!quest || !questState(save, quest.id).accepted || questState(save, quest.id).claimed) return null;
    const pending = questProgress(save, quest).some(g => g.kind === 'talk' && g.id === npcId && g.value < g.count);
    return pending ? quest.talks.find(t => t.npcId === npcId) || null : null;
}
export function questReady(save, quest) {
    return !!quest && questState(save, quest.id).accepted && questProgress(save, quest).every(g => g.value >= g.count);
}
export function createAdventure(content, { name = '小哈奇', school = 'fire', appearance = 'boy', headId, bodyId, customHead, seed = 530, starter = 'dragon_green' } = {}) {
    assert(SCHOOLS.includes(school), '请选择魔法学系');
    const birthZone='camp';
    const save = { schemaVersion: SAVE_VERSION, contentVersion: content.contentVersion, seed: hashSeed(String(seed)),
        name: String(name).trim().slice(0, 16) || '小哈奇', school, appearance: appearance === 'girl' ? 'girl' : 'boy',
        xp: 0, level: 1, inventory: {}, equipment: {}, mountId: null, upgrades: {}, equipmentInstances: [], equipmentGuids: {}, nextEquipmentGuid: 1, cards: {}, deck: [], quests: {},
        pet: null, zone: birthZone, position: {...mapInfo(birthZone,content).initialSpawn}, positionCoordinateVersion:mapCoordinateVersion(birthZone,content), facing: 3,
        dungeonRuns: {}, dungeonReturn: null, encounterSerial: 0, pendingEncounter: null, rewardedEncounters: [], graduated: false,
        visitedTown: false, tips: {}, revision: 0, bagRulesVersion: 1, defaultPocketVersion: 1, worldLayoutVersion: content.worldMapIndex.layoutVersion,
        locale: 'zh-CN', languageLearning: { enabled: true, native: 'zh-CN', target: 'en', autoSpeak:false,autoReadDialogue:true,selectionConfirmed:false,showChinese:true,model:'',voiceType:'' }, learnerMemory: '', languageAdventure:{version:1,progress:{}} };
    if(typeof headId==='string'&&/^[a-z0-9-]{1,64}$/.test(headId))save.headId=headId;
    if(customHead)save.customHead=publicPhotoHead(customHead,{id:headId,appearance});
    if(validHeroBodyId(bodyId,appearance))save.bodyId=bodyId;
    syncProgression(save, content);
    save.deck = recommendedDeck(save, content);
    syncDeckLayouts(save,content);
    if(content.pets)Pets.initializePets(save,content,starter);
    return save;
}
export function deckLimits(save, content) {
    const bag = content.items[save.equipment[24]];
    const legacy = save.defaultPocketVersion === undefined;
    return { capacity: Number(bag?.stats[167] || (legacy ? 14 : 10)), eachCapacity: Number(bag?.stats[170] || (legacy ? 3 : 2)), handSize: 8 };
}
function migrateDefaultPocket(save,content) {
    if(save.defaultPocketVersion===1||save.pendingEncounter)return;
    save.defaultPocketVersion=1;
    syncDeckLayouts(save,content);
}
// arena_server.lua L8080-8086: learned spells are qualifications, not consumed copies.
// Preserve the original chapter-only inventory mode for its standalone fixtures.
export function deckCardCopies(save, content, key) {
    if (!save.cards[key]) return 0;
    return content.cardLibrary ? deckLimits(save,content).eachCapacity : save.cards[key];
}
export function syncProgression(save, content) {
    save.level = Math.min(content.progression.levelCap, content.progression.xpThresholds.filter(x => save.xp >= x).length);
    syncTrainingPoints(save);
    for (const lesson of content.learn[save.school]) {
        if (lesson.level <= save.level && !save.cards[lesson.key]) save.cards[lesson.key] = lesson.copies;
    }
}
export function availableCardLessons(save,content) {
    return content.cardLibrary || content.learn[save.school].map(row=>({...row,school:save.school,supported:true}));
}
export function learnDeckCards(save,content,keys=[]) {
    assert(Array.isArray(keys)&&keys.length<=Object.keys(content.cardLibrary||{}).length,'学习卡牌列表无效');
    const lessons=new Map(availableCardLessons(save,content).map(row=>[row.key,row]));
    const draft={...save,cards:{...save.cards}};
    for(const key of keys){
        const lesson=lessons.get(key);
        const status=skillLearningStatus(draft,content,lesson);
        assert(status.allowed,status.reason);
        draft.trainingPointsSpent=(draft.trainingPointsSpent||0)+status.cost;
        draft.cards[key]=Math.max(draft.cards[key]||0,lesson.copies);
    }
    save.cards=draft.cards;save.trainingPointsSpent=draft.trainingPointsSpent??save.trainingPointsSpent??0;
}
export function recommendedDeck(save, content) {
    // The chapter unlock order introduces wand, attacks, blade, trap, healing and shield.
    const lessons = content.learn[save.school].filter(x => save.cards[x.key]);
    const priority = lessons.length>7?[...lessons].reverse():[3,5,1,0,2,4,6].map(i => lessons[i]).filter(Boolean);
    const limits = deckLimits(save, content), result = [];
    let n = 0;
    for (const lesson of priority) {
        const count = Math.min(deckCardCopies(save,content,lesson.key), limits.eachCapacity, limits.capacity - n);
        if (count) result.push({ key: lesson.key, count });
        n += count;
    }
    return result;
}
export function validDeck(save, content, deck) {
    const limits = deckLimits(save, content);
    assert(Array.isArray(deck) && deck.length > 0, '卡包至少需要一张卡牌');
    const seen = new Set(); let total = 0;
    for (const entry of deck) {
        assert(!seen.has(entry.key) && Number.isInteger(entry.count) && entry.count > 0, '卡牌份数无效'); seen.add(entry.key);
        assert(!content.cardLibrary||content.cardLibrary.some(row=>row.key===entry.key&&row.supported!==false),'此卡牌效果暂未开放');
        assert(entry.count <= deckCardCopies(save,content,entry.key) && entry.count <= limits.eachCapacity, '超过拥有数量或单卡上限');
        total += entry.count;
    }
    assert(total <= limits.capacity, '卡包已满'); return true;
}
export function syncDeckLayouts(save, content) {
    const equipped=Number(save.equipment[24])||0;
    const bags=Object.values(content.items).filter(item=>item.slot===24&&canEquip(save,item,content));
    const ids=[...new Set([equipped,...bags.map(item=>Number(item.id))])].filter(id=>id||!equipped);
    const previous=save.deckLayouts||[],current=previous[save.activeDeckLayout||0];
    const legacy=previous.filter(row=>row.bagItemId===undefined&&row!==current);
    save.deckLayouts=ids.map(bagItemId=>{
        const existing=previous.find(row=>row.bagItemId===bagItemId);
        const source=existing?(existing===current&&existing.bagItemId===equipped?save.deck:existing.deck)
            :bagItemId===equipped?save.deck:legacy.shift()?.deck||save.deck;
        const draft={...save,equipment:{...save.equipment,24:bagItemId}};
        const limits={...deckLimits(draft,content),version:'kids'};
        let deck=clampDeck(source.map(row=>({...row,count:Math.min(row.count,deckCardCopies(draft,content,row.key))})).filter(row=>row.count>0),limits).deck;
        if(!deck.length)deck=recommendedDeck(draft,content);
        return {bagItemId,name:content.items[bagItemId]?.name||'基础卡包',deck};
    });
    save.activeDeckLayout=save.deckLayouts.findIndex(row=>row.bagItemId===equipped);
    save.deck=clone(save.deckLayouts[save.activeDeckLayout].deck);
}
export function deckLayoutCapacity(save,content) {
    return Math.max(1,Object.values(content.items).filter(item=>item.slot===24&&canEquip(save,item,content)).length);
}
function validateDeckLayouts(save,content,layouts,active) {
    assert(Array.isArray(layouts)&&layouts.length>=1&&layouts.length<=Object.keys(content.items).length,'请保留有效卡包');
    assert(Number.isInteger(active)&&active>=0&&active<layouts.length,'请选择有效卡包');
    const seen=new Set();
    for(const row of layouts){
        assert(row&&typeof row.name==='string'&&row.name.trim().length>0&&row.name.length<=16,'卡包名称需为一至十六字');
        if(row.bagItemId!==undefined){
            assert(Number.isInteger(row.bagItemId)&&!seen.has(row.bagItemId),'每个卡包只能有一个实例');
            seen.add(row.bagItemId);
            assert(row.bagItemId===0||content.items[row.bagItemId]?.slot===24&&canEquip(save,content.items[row.bagItemId],content),'卡包尚未拥有或不符合使用条件');
        }
        validDeck(row.bagItemId===undefined?save:{...save,equipment:{...save.equipment,24:row.bagItemId}},content,row.deck);
    }
}
export function canEquip(save, item, content) {
    return !equipmentBlockReason(save, item, content);
}
export function equipmentBlockReason(save, item, content) {
    if (!item || !(item.kind === 1 || item.slot === 24) || !Number.isInteger(item.slot) || item.slot <= 0) return '这不是可穿戴的装备';
    if (!owns(save,item.id)) return '尚未获得这件装备';
    // Old in-flight checkpoints must replay with the rules used to snapshot them.
    const requirements=item.slot===24&&save.pendingEncounter&&save.bagRulesVersion===undefined
        ? {level:Number(item.stats[138]||1),school:Number(item.stats[137]||0)} : equipmentRequirements(item);
    if (requirements.level > save.level) return `需要等级 ${requirements.level}`;
    if (requirements.school && requirements.school !== content.schools[save.school]) return '不符合学系要求';
    return '';
}
function migrateBagRules(save,content) {
    if(save.bagRulesVersion===1||save.pendingEncounter)return;
    const bag=content.items[save.equipment[24]];
    if(bag&&!canEquip(save,bag,content)){
        delete save.equipment[24];
        save.tips.bagRulesAdjusted=true;
        syncDeckLayouts(save,content);
    }
    save.bagRulesVersion=1;
}
export function playerSpec(save, content, starLevel=save.pendingEncounter?.magicStarLevel||0) {
    const stats = normalizeStats(), fixed = [];
    let equipmentLookup;
    for (const iid of Object.values(save.equipment)) {
        const item = content.items[iid];
        if (!canEquip(save,item,content)) continue;
        // player_server.lua L3476–3488: socketed gem stats add to equipped item stats.
        const instance=(equipmentLookup??=createEquipmentInstanceLookup(save,content))(iid);
        const sources=[item,...(instance?.serverdata.gem?.ins||[]).map(id=>content.items[id]).filter(Boolean)];
        for (const [id,value] of sources.flatMap(source=>Object.entries(source.stats))) {
            if(save.pendingEncounter&&![1,2].includes(save.pendingEncounter.equipmentStatsVersion)&&[182,183].includes(Number(id)))continue;
            if(save.pendingEncounter&&save.pendingEncounter.equipmentStatsVersion!==2&&Number(id)>=151&&Number(id)<=166)continue;
            const entry = statIdToEntry(id); if (!entry) continue;
            if (typeof stats[entry.stat] === 'object') stats[entry.stat][entry.school] = (stats[entry.stat][entry.school] || 0) + Number(value);
            else stats[entry.stat] += Number(value);
        }
        applyUpgradeStats(stats,upgradeAt(content,iid,instance?.serverdata.addlel||0));
        for (const id of [139,140,141]) {
            const key = content.cardItems[item.stats[id]];
            if (key) fixed.push({ key, count: 1 });
        }
    }
    applyMountStats(stats, save, content);
    const limits = deckLimits(save,content);
    if(!save.pendingEncounter||[1,2,3].includes(save.pendingEncounter.progressionRulesVersion)){
        const config=content.progressionBonuses;
        const equipped=Object.values(save.equipment).filter(id=>canEquip(save,content.items[id],content));
        const bonuses=[!save.pendingEncounter||save.pendingEncounter.progressionRulesVersion>=2?equipmentSetStats(equipped,config).stats:{}];
        for(const professionId of Object.keys(config?.professions||{}))if(save.inventory[professionId]>0){
            const expId=config.professions[professionId][0]?.expId;
            const stage=dragonTotemStage(config,professionId,expId,save.inventory[expId]||0);
            if(stage)bonuses.push(stage.stats);
            break;
        }
        for(const source of bonuses)for(const [id,value] of Object.entries(source)){
            const entry=(!save.pendingEncounter||save.pendingEncounter.progressionRulesVersion>=3?progressionStatEntry:statIdToEntry)(id);if(!entry)continue;
            const amount=value*(entry.scale??1);
            if(typeof stats[entry.stat]==='object')stats[entry.stat][entry.school]=(stats[entry.stat][entry.school]||0)+amount;
            else stats[entry.stat]=(stats[entry.stat]||0)+amount;
        }
    }
    applyMagicStarCombat(stats,content,starLevel);
    return { ...(save.pendingEncounter?.player?.hanziBattle?{hanziBattle:structuredClone(save.pendingEncounter.player.hanziBattle)}:{}), id: 'hero', name: save.name, school: save.school, level: save.level, isBot: false, stats,
        deck: clone(save.deck), fixedCards: fixed, deckCapacity: limits.capacity, deckEachCapacity: limits.eachCapacity };
}
function signal(save, content, kind, id, count = 1) {
    const q = currentQuest(save, content);
    if (q && questState(save,q.id).accepted) {
        const state = save.quests[q.id];
        for (const goal of q.goals) if (goal.kind === kind && String(goal.id) === String(id)) {
            const key = `${kind}:${id}`; state.progress[key] = Math.min(goal.count, (state.progress[key] || 0) + count);
        }
    }
    if (kind === 'talk') noteCatalogSignal(save, content, 'talk', id, count);
    if (kind === 'action' && Number.isInteger(Number(id))) noteCatalogSignal(save, content, 'custom', Number(id), count);
}
export function catalogStatSnapshot(save, content) {
    const spec = playerSpec(save, content);
    const schools = ['fire', 'ice', 'storm', 'life', 'death', 'balance'];
    return {
        214: save.level, 79031: save.level, 79030: 0,
        79032: Math.floor(spec.stats.powerPipPct || 0),
        79033: Math.floor(spec.stats.damage?.[save.school] || 0),
        79034: Math.floor(Math.max(0, ...schools.map(school => spec.stats.resist?.[school] || 0)))
    };
}
function syncGoals(save,content) {
    if (save.equipment[11] === 1912) signal(save,content,'action','equip-staff');
    if (content.pets ? ownedPetSpecies(save).includes('legacy_gululu') : save.pet) signal(save,content,'action','hatch-pet');
    if (save.tips.petFed || (!content.pets && save.pet?.xp > 0)) {
        const q=currentQuest(save,content);
        if(q&&save.quests[q.id]?.accepted)for(const goal of q.goals)if(goal.kind==='action'&&Number(goal.id)===79019)save.quests[q.id].progress['action:79019']=goal.count;
    }
    if (save.equipment[24] === 24003 && save.tips.deckEditedWithBag) signal(save,content,'action',79037);
}
// CombatPetProvider.lua GetLevelInfo L749–780: XML max_level is zero-based.
export function petLevel(xp,content) {
    const levels=content.pet.levels;
    if(xp>=levels.max_exp)return levels.max_level+1;
    let total=0,level=0;
    for(let i=1;i<=levels.max_level;i++){total+=levels[`exp_level_${i}`];if(xp<total)break;level=i;}
    return level;
}
export function rewardsFor(save, content, quest) {
    const rewards = [];
    for (const group of quest.rewards) {
        const rows = group.items.filter(e => {
            const school = Number(content.items[e.id]?.stats?.[137] || 0);
            return !group.schoolFilter || !school || school === content.schools[save.school];
        });
        // Original choice count after school filtering; all included chapter choices are unambiguous.
        rewards.push(...(group.choice > 0 ? rows.slice(0, group.choice) : rows));
    }
    return rewards.map(reward => resolvePetReward(content, reward));
}
function grantQuestRewards(save, content, quest) {
    const rewards = rewardsFor(save, content, quest);
    for (const r of rewards) {
        if (r.kind === 'pet') { for (let i = 0; i < r.count; i++) Pets.addPet(save, content, r.petId); }
        else if (r.id === 113) save.xp += r.count;
        else save.inventory[r.id] = (save.inventory[r.id] || 0) + r.count;
    }
    if (content.pets) for (const r of rewards) if (r.kind === 'pet') {
        save.questPetConversions ??= {};
        save.questPetConversions[r.id] = (save.questPetConversions[r.id] || 0) + r.count;
    }
}
function retreatLanding(save,content){
    const pending=save.pendingEncounter;
    if(save.zone==='earth'){const w=content.earthWorld;const position=w?earthNearest(w,save.position.x,save.position.y,{safe:true}):save.position;return {position:position||save.position,message:'你回到了附近的安全地点。'};}
    const safe={position:{...mapInfo(save.zone,content).initialSpawn},message:'你回到了安全地点。已保留物品与任务进度。'};
    if(!pending)return safe;
    const encounter=content.encounters.find(e=>e.id===pending.encounterId);
    const laid=content.worldMaps?.[save.zone]?.encounterPositions?.[encounter?.id];
    const target=laid?{x:laid[0],y:laid[1]}:(Number.isFinite(encounter?.x)&&Number.isFinite(encounter?.y)?{x:encounter.x,y:encounter.y}:null);
    if(!target)return {position:{...save.position},message:'你离开了战斗。已保留物品与任务进度。'};
    const info=mapInfo(save.zone,content);
    const spot=content.worldMaps?.[save.zone]
        ?retreatBeside(createWorld(save.zone,content,{...save,position:{...save.position}}),save.position,target)
        :offsetBeside(save.position,target,info.spawn);
    return {position:{x:Math.min(info.w,Math.max(0,spot.x)),y:Math.min(info.h,Math.max(0,spot.y))},message:'你撤到了怪物附近。已保留物品与任务进度。'};
}
function offsetBeside(player,target,spawn){
    let dx=player.x-target.x,dy=player.y-target.y,len=Math.hypot(dx,dy);
    if(len<8){dx=spawn.x-target.x;dy=spawn.y-target.y;len=Math.hypot(dx,dy)||1;}
    return {x:target.x+dx/len*120,y:target.y+dy/len*120};
}
function grantEggCompanion(save,content){
    if(!content.pets||save.pendingEncounter||save.pet||!owns(save,17307))return;
    save.inventory[17307]--;save.inventory[content.pet.itemId]=1;
    save.pet={itemId:content.pet.itemId,name:content.pet.name,xp:0,level:0};
    Pets.addPet(save,content,'legacy_gululu');
}
export function applyAction(save, content, action, access={}) {
    const before={...save.inventory};
    const result=applyAdventureAction(save,content,action,access);
    if(result.changed){
        grantEggCompanion(save,content);
        if(action.type!=='pet-food-take')Pets.autoStockPetFood(save,content,before);
        syncGoals(save,content);
    }
    return result;
}
function applyAdventureAction(save, content, action, access={}) {
    assert(!action.paidByTest, '语言课程仅发放限额奖励，请使用货币购买');
    assert(!save.pendingEncounter || ['settle-encounter','retreat','language-complete'].includes(action.type), '请先完成当前战斗');
    if(content.pets&&Pets.petAction(save,content,action,access)){syncEquipmentInstances(save,content);save.revision++;return {changed:true};}
    const q = currentQuest(save,content);
    let notice, trackFull = false;
    switch (action.type) {
    case 'language-complete': {const result=recordLearningCompletion(save,content,action.completion,access);save.revision++;return result;}
    case 'npc-purchase': purchaseNpcOffer(save,content,action,access);break;
    case 'fish': {const result=castFishing(save,content,action,createRng(hashSeed(`${save.revision}:fish:${action.netId}`)));save.revision++;return {...result,changed:true};}
    case 'stamina-potion': {const result=useStaminaPotion(save,content,action.itemId);save.revision++;return {...result,changed:true};}
    case 'magic-star-claim': claimMagicStar(save,content,action,access);syncEquipmentInstances(save,content);break;
    case 'choose-totem': chooseDragonTotem(save,content,action.professionId);break;
    case 'customize-hero': {
        const quote=customizeHero(save,action);
        notice=quote.nameChanged&&quote.lookChanged?'名字和形象已更新。':quote.nameChanged?'名字已更新。':'形象已更新。';
        break;
    }
    case 'use-totem-item': useDragonTotemItem(save,content,action.itemId);break;
    case 'checkin': claimCheckin(save, content, action.now, action.index, access, action.bonus===true); break;
    case 'speech-reward': claimSpeechReward(save,content,action.index,action.now);notice='领取成功，奖励已放入背包！';break;
    case 'accept': {
        assert(q && q.id === Number(action.questId) && q.startNpc === Number(action.npcId), '当前没有可接取的任务');
        if (!save.quests[q.id]) {
            save.quests[q.id] = { accepted: true, claimed: false, progress: {} };
            noteQuestAccepted(save, q.id);
        }
        save.trackedQuestIds = trackedQuestIds(save, content);
        delete save.trackedQuestId;
        syncGoals(save,content); break;
    }
    case 'talk':
        assert(content.npcs[action.npcId], '找不到这位居民');
        signal(save,content,'talk',action.npcId); break;
    case 'accept-catalog': trackFull = acceptCatalogQuest(save,content,action.questId,action.npcId,catalogStatSnapshot(save,content))?.full === true; break;
    case 'claim-catalog': {
        const target = claimCatalogQuest(save,content,action.questId,action.npcId,catalogStatSnapshot(save,content));
        if (!target) return { changed: false };
        grantQuestRewards(save,content,target);
        // Legacy card rewards retired; old quest claims remain readable.
        save.quests[target.id].claimed = true;
        unpinTrackedQuest(save, target.id);
        if(target.region==='hanzi')supplementIslandTrack(save,content,save.zone);
        syncProgression(save,content);
        break;
    }
    case 'abandon-quest': {
        const id = Number(action.questId);
        const chapter = content.quests.find(quest => quest.id === id);
        const catalog = content.catalogQuests?.byId[id];
        const state = save.quests[id];
        assert(chapter || catalog, '找不到这个任务');
        assert(state?.accepted === true && !state.claimed, '只能放弃进行中的任务');
        if (chapter) assert(q?.id === id, '只能放弃当前教学任务');
        delete save.quests[id];
        unpinTrackedQuest(save, id);
        if (chapter) showCurrentChapter(save, content);
        notice = `已放弃：${(chapter || catalog).title}`;
        break;
    }
    case 'track-catalog': {
        if (action.remove) { unpinTrackedQuest(save, action.questId); notice = '已取消追踪'; break; }
        if (action.questId == null) { unpinTrackedQuest(save, null); break; }
        const pinned = pinTrackedQuest(save, content, action.questId);
        if (pinned.already || pinned.full) return { changed: false, ...pinned };
        break;
    }
    case 'claim': {
        const target = content.quests.find(x => x.id === Number(action.questId));
        if (save.quests[target?.id]?.claimed) return { changed: false };
        assert(target === q && questReady(save,q) && q.endNpc === Number(action.npcId), '任务尚未完成');
        grantQuestRewards(save,content,q);
        save.quests[q.id].claimed = true;
        unpinTrackedQuest(save, q.id);
        showCurrentChapter(save, content);
        syncProgression(save,content);
        if (q.id === 63013) save.graduated = true;
        break;
    }
    case 'equip': {
        const item = content.items[action.itemId];
        assert(canEquip(save,item,content), equipmentBlockReason(save,item,content));
        const instance=findEquipmentInstance(save,content,item.id,action.guid);
        assert(instance,'找不到这件装备');
        syncEquipmentInstances(save,content);
        save.equipment[item.slot] = item.id;
        save.equipmentGuids[item.slot]=instance.guid;
        save.deck = clampDeck(save.deck, { ...deckLimits(save,content), version:'kids' }).deck;
        syncGoals(save,content); break;
    }
    case 'unequip': {
        const slot = Number(action.slot);
        assert(Number.isInteger(slot) && save.equipment[slot], '这个部位没有装备');
        delete save.equipment[slot];
        if(save.equipmentGuids)delete save.equipmentGuids[slot];
        save.deck = clampDeck(save.deck, { ...deckLimits(save,content), version:'kids' }).deck;
        break;
    }
    case 'ride': {
        const itemId = Number(action.itemId);
        const mount = content.mountByItem?.[itemId];
        assert(mount?.art?.cdn && owns(save, itemId), '尚未获得这只坐骑');
        save.mountId = itemId;
        break;
    }
    case 'dismount': {
        assert(save.mountId, '当前没有骑乘坐骑');
        save.mountId = null;
        break;
    }
    case 'mount-gem': {
        const result=mountGem(save,content,action);
        if(result.success){signal(save,content,'action',79017);signal(save,content,'action',79026);}
        syncGoals(save,content);syncEquipmentInstances(save,content);save.revision++;return {...result,changed:true};
    }
    case 'remove-gems': {const result=removeGems(save,content,action);save.revision++;return {...result,changed:true};}
    case 'upgrade': {
        const instance=findEquipmentInstance(save,content,action.itemId,action.guid);
        const iid = instance?.gsid, level = instance?.serverdata.addlel || 0;
        assert(content.items[iid] && owns(save,iid) && upgradeLevels(content,iid).length, '请选择已拥有且支持强化的装备');
        const upgrade = upgradeAt(content,iid,level+1);
        assert(upgrade, '装备已达到强化上限');
        const [currency,cost] = upgrade.cost;
        assert((save.inventory[currency] || 0) >= cost, `${content.items[currency]?.name||'强化材料'}不足`);
        syncEquipmentInstances(save,content);
        save.inventory[currency] -= cost;
        save.equipmentInstances.find(row=>row.guid===instance.guid).serverdata.addlel=level+1;
        // PowerAPI_client.lua L191–199: goal 79016 only follows a successful upgrade.
        signal(save,content,'action',79016); signal(save,content,'action',79025); syncGoals(save,content); break;
    }
    case 'hatch':
        assert(owns(save,17307) && !save.pet, '需要一枚出奇蛋');
        save.inventory[17307]--; save.inventory[content.pet.itemId] = 1;
        save.pet = { itemId: content.pet.itemId, name: content.pet.name, xp: 0, level: 0 }; if(content.pets?.legacy_gululu)Pets.addPet(save,content,'legacy_gululu'); syncGoals(save,content); break;
    case 'feed': {
        assert(save.pet && owns(save,content.pet.foodId), '需要宠物和战宠口粮');
        assert(save.pet.xp < content.pet.levels.max_exp, '宠物已经长大了！');
        save.inventory[content.pet.foodId]--; save.pet.xp = Math.min(content.pet.levels.max_exp, save.pet.xp + content.pet.foodXp);
        save.pet.level = petLevel(save.pet.xp,content); {const legacy=Object.values(save.pets||{}).find(p=>p.speciesId==='legacy_gululu');if(legacy){legacy.xp+=content.pet.foodXp;legacy.level=Pets.petXpLevel(legacy.xp,content);}} syncGoals(save,content); break;
    }
    case 'deck-layouts': {
        const next={...save,cards:{...save.cards},equipment:{...save.equipment}};
        if(action.bagItemId!==undefined){
            const bag=content.items[action.bagItemId];
            assert(bag?.slot===24&&canEquip(save,bag,content),'卡包尚未拥有或不符合使用条件');
            next.equipment[24]=bag.id;
        }
        if(action.learnedKeys?.length)learnDeckCards(next,content,action.learnedKeys);
        validateDeckLayouts(next,content,action.layouts,action.active);
        const selected=action.layouts[action.active].bagItemId;
        if(selected!==undefined){
            assert(action.bagItemId===undefined||action.bagItemId===selected,'请选择一致的卡包');
            if(selected)next.equipment[24]=selected;else delete next.equipment[24];
        }else{
            assert(action.layouts.length<=deckLayoutCapacity(next,content), '没有多余的可用卡包，请先到商店购买');
        }
        save.cards=next.cards;
        save.trainingPointsSpent=next.trainingPointsSpent;
        save.equipment=next.equipment;
        save.deckLayouts=clone(action.layouts);save.activeDeckLayout=action.active;
        save.deck=clone(save.deckLayouts[action.active].deck);
        save.tips.deckEdited=true;save.tips.deckEditedWithBag=save.equipment[24]===24003;syncGoals(save,content);break;
    }
    case 'deck':
        validDeck(save,content,action.deck); save.deck = clone(action.deck); save.tips.deckEdited = true; save.tips.deckEditedWithBag = save.equipment[24] === 24003; syncGoals(save,content); break;
    case 'travel': {
        const previous = save.zone;
        assert(travelStatus(save,content,action.zone).allowed, travelStatus(save,content,action.zone).reason);
        save.zone = action.zone; save.position = islandSpawn(action.zone,content); save.positionCoordinateVersion=mapCoordinateVersion(action.zone,content); save.worldLayoutVersion = content.worldMapIndex.layoutVersion;
        if (action.zone === 'town') save.visitedTown = true;
        if (previous !== action.zone) supplementIslandTrack(save, content, action.zone, catalogStatSnapshot(save, content));
        break;
    }
    case 'retreat': {
        settleRunes(save);
        const landing=retreatLanding(save,content);
        save.pendingEncounter = null; if(content.pets)Pets.migratePetDeckRules(save,content); save.position = landing.position; notice=landing.message; break;
    }
    default: throw new Error('未知操作');
    }
    migrateBagRules(save,content);
    migrateDefaultPocket(save,content);
    syncDeckLayouts(save,content);
    syncEquipmentInstances(save,content);
    save.revision++;
    return { changed: true, quest: currentQuest(save,content), level: save.level, ...(notice ? { message: notice } : {}), ...(trackFull ? { full: true } : {}) };
}
export function beginEncounter(save,content,encounterId,access={}) {
    assert(!save.pendingEncounter, '已有进行中的战斗');
    const encounter = content.encounters.find(e => e.id === encounterId) || specialEncounter(save,content,encounterId);
    assert(encounter && encounter.zone === save.zone, '这里没有这个敌人');
    assert(!encounter.blocked?.length,encounter.blocked?.join('；'));
    assert(!dungeonProgress(save)?.[save.zone]?.cleared.includes(encounterId),'这组怪物已经击败，请重新开启副本后挑战');
    assert(!encounterCoolingDown(save,encounterId,access.now??0),'怪物尚未刷新，请稍后再挑战');
    const dungeon=dungeonFor(content,save.zone);
    if(dungeon?.kind==='city')assert(cityBattleReady(save,dungeon,encounterId),'请先完成这个地点的生活互动');
    if(dungeon&&dungeon.kind!=='city')assert(dungeon.arenas.find(a=>!dungeonProgress(save)[save.zone].cleared.includes(a.id))?.id===encounterId,'请先击败挡路的怪物');
    const monster = encounter.monster || content.monsters[encounter.monsterId];
    assert(encounterId !== 'death-scout' || (save.quests[63012]?.claimed), '请先完成考核前的准备');
    validDeck(save,content,save.deck);
    const magicStarLevel=magicStarCombatLevel(content,access),player=save.coopRun?.hero||playerSpec(save,content,magicStarLevel);
    const initialParty=journeyParty(save,dungeon,coopParty(save,player)||(content.pets?Pets.partySpecs(save,content,player):null));
    if(initialParty)assert(initialParty.some(u=>u.hp>0),'伙伴们需要休息恢复生命');
    const serial = ++save.encounterSerial;
    save.pendingEncounter = { id: `${save.seed}:${serial}`, encounterId,
        seed: hashSeed(`${save.seed}:encounter:${serial}`), player, decisions: [], equipmentStatsVersion: 2, magicStarLevel, magicStarExperiencePercent:magicStarLevel?content.magicStar.levels[magicStarLevel].exp:100, progressionRulesVersion:3, threatRulesVersion:5, reflectionRulesVersion:1, stealthRulesVersion:1, dispelRulesVersion:1, specialCardRulesVersion:1, captureRulesVersion:1 };
    if(encounter.monsterIds){const formation=journeyEnemyFormation(encounter,dungeon,initialParty);save.pendingEncounter.dungeonMonsterIds=[...formation.ids];save.pendingEncounter.dungeonMonsterSlots=[...formation.slots];}
    if(content.pets){
        const checkpoint=save.pendingEncounter,params=petTraitParams(content);
        const templates=checkpoint.dungeonMonsterIds?checkpoint.dungeonMonsterIds.map(id=>content.monsters[id]):[monster];
        const stamped=templates.map(m=>({...m,speciesId:m.speciesId||monsterCaptureSpecies(m,content.monsterArt)?.id}));
        const seed=encounterPetTraitSeed(save,encounterId,params),owned=Object.values(ownedPetRecords(save));
        checkpoint.petTraitRulesVersion=1;checkpoint.petTraitParams=clone(params);
        const byMonster=save.petTraitEncounters[encounterId]?.byMonster||{};
        checkpoint.monsterTraits=stamped.map((mob,index)=>byMonster[`${mob.id}:${index}`]??=monsterPetTraits(seed,mob,index,params,owned.find(p=>p.speciesId===mob.speciesId)?.passiveTraits));
        save.petTraitEncounters[encounterId]={seed,byMonster:clone(byMonster)};
    }
    const languageBuff=save.dailyLanguageBuff?dailyBuffs(save):dungeonLanguageBuff(save,content);
    if(save.dailyLanguageBuff)save.pendingEncounter.dailyLanguageVersion=1;
    if(languageBuff)save.pendingEncounter.languageBuff=languageBuff;
    save.pendingEncounter.runes = runeInventory(save,content);
    save.pendingEncounter.deferredRuneSettlement = true;
    save.pendingEncounter.runeUsed = {};
    if(content.pets){
        const party=initialParty;
        assert(party.some(u=>u.hp>0),'伙伴们需要休息恢复生命');
        Object.assign(save.pendingEncounter,{party,monster,petIds:journeyRewardPets(save,dungeon,party),captureStock:save.inventory[Pets.CAPTURE_ID]||0,heroLevel:save.level,ownedPets:ownedPetSpecies(save),adventureParams:clone(Pets.petParams(content))});
    }
    save.revision++; return { encounter, monster, checkpoint: save.pendingEncounter };
}
export function runeInventory(save,content) {
    return Object.entries(save.inventory).flatMap(([id,count])=>{
        const key=content.cardItems[id]||content.cardItems[Number(id)-1000];
        const item=content.items[id];
        return count>0&&item?.kind===18&&item.subtype===2&&key?[{itemId:Number(id),key,count}]:[];
    });
}
export function recordDecision(save, decision, battle) {
    assert(save.pendingEncounter,'没有进行中的战斗');
    assert(decision?.runeId===undefined||battle,'符文决定缺少战斗结果');
    if(battle){
        assert(battle.seed===save.pendingEncounter.seed,'战斗记录不属于当前遭遇');
        assert(battle.completedDecisions===save.pendingEncounter.decisions.length+1,'战斗决定未执行或已经记录');
        for(const rune of save.pendingEncounter.runes||[]){
            const used=battle.runeUsed?.[rune.itemId]||0;
            assert(Number.isInteger(used)&&used>=0&&used<=rune.count,'符文消耗记录无效');
            const previous=save.pendingEncounter.runeUsed?.[rune.itemId]??(rune.count-(save.inventory[rune.itemId]||0));
            assert(used>=previous,'符文消耗记录不能倒退');
        }
        // Keep consumption in the local checkpoint until finish/retreat, including legacy battles.
        save.pendingEncounter.runeUsed=clone(battle.runeUsed||{});
    }
    save.pendingEncounter.decisions.push(clone(decision)); save.revision++;
}
function settleRunes(save,battle) {
    const pending=save.pendingEncounter;
    if(!pending||pending.runesSettled)return;
    for(const rune of pending.runes||[]){
        const used=battle?.runeUsed?.[rune.itemId]??pending.runeUsed?.[rune.itemId]??(rune.count-(save.inventory[rune.itemId]||0));
        assert(Number.isInteger(used)&&used>=0&&used<=rune.count,'符文消耗记录无效');
    }
    for(const rune of pending.runes||[]){
        const used=battle?.runeUsed?.[rune.itemId]??pending.runeUsed?.[rune.itemId]??(rune.count-(save.inventory[rune.itemId]||0));
        save.inventory[rune.itemId]=rune.count-used;
    }
    pending.runesSettled=true;
}
export function settleEncounter(save,content,battle,{now=0}={}) {
    const pending = save.pendingEncounter;
    assert(pending && battle.finished && battle.seed === pending.seed,'战斗尚未结束');
    if (save.rewardedEncounters.includes(pending.id)) { save.pendingEncounter = null; return false; }
    const encounter = content.encounters.find(e => e.id === pending.encounterId)||specialEncounter(save,content,pending.encounterId), monster = pending.monster || content.monsters[encounter.monsterId];
    settleRunes(save,battle);
    if(content.pets)settleParty(save,content,battle);
    let insufficientStamina=false,staminaSpent=0;
    if (battle.winner === 'near') {
        if(save.petTraitEncounters)delete save.petTraitEncounters[pending.encounterId];
        const cityDungeon=dungeonFor(content,save.zone);
        if(cityDungeon?.kind==='city')recordCityBattleWin(save,cityDungeon,encounter.id);
        if(save.zone==='earth'){
            const event=content.earthWorld?.encounters.find(e=>e.id===pending.encounterId)?.chapterEvent;
            const chapter=content.earthWorld?.city?.quests;
            if(event&&chapter)earthChapterEvent(save,chapter,event);
        }
        if(!dungeonFor(content,save.zone))markEncounterDefeated(save,content,pending.encounterId,now);
        const cost=encounterStaminaCost(content,pending.encounterId);
        const gate=applyCombatStamina(save,content,cost);
        insufficientStamina=gate.insufficient;
        staminaSpent=gate.cost;
        if(gate.rewarded){
            const defeated=pending.dungeonMonsterIds?pending.dungeonMonsterIds.map(id=>content.monsters[id]):[monster];
            save.xp += defeated.reduce((n,m)=>n+Math.ceil(m.xp*(pending.magicStarExperiencePercent??100)/100),0);
            save.inventory[100] = (save.inventory[100] || 0) + defeated.reduce((n,m)=>n+m.coins,0);
            // Original water-bubble loot1 = {[17114,1]=20}; draw remains on the encounter's seeded RNG.
            if (monster.id === 'water-bubble' && battle.rng.int(1,100) <= 20) save.inventory[17114] = (save.inventory[17114] || 0) + 1;
        }
        if(pending.dungeonMonsterIds && dungeonFor(content,save.zone))dungeonProgress(save)[save.zone].cleared.push(encounter.id);
        recordTowerWin(save,dungeonFor(content,save.zone),encounter?.id);
        if (monster.goalId) signal(save,content,'defeat',monster.goalId);
        noteCatalogKills(save,content,pending.dungeonMonsterIds?pending.dungeonMonsterIds.map(id=>content.monsters[id]):[monster],createRng(hashSeed(`${save.seed}:quest:${pending.id}`)));
        syncProgression(save,content);
    }
    // Both outcomes leave the hero beside this encounter, outside contact range.
    save.position=retreatLanding(save,content).position;
    const relationshipEvents=[];
    if(save.coopRun&&battle.winner==='near'&&dungeonProgress(save)[save.zone]?.cleared.length===dungeonFor(content,save.zone)?.arenas.length){
        for(const member of save.coopRun.members)relationshipEvents.push({id:`dungeon:${save.coopRun.relationshipRunId||pending.id}:${member.profile.id}`,peer:member.profile,kind:'dungeon',at:now,reason:'共同通关副本'});
    }
    if(save.coopRun){save.coopRun.battles??=[];save.coopRun.battles.push({checkpoint:clone(pending),winner:battle.winner,turns:battle.turn});}
    save.rewardedEncounters.push(pending.id); save.pendingEncounter = null; if(content.pets)Pets.migratePetDeckRules(save,content); migrateBagRules(save,content); migrateDefaultPocket(save,content); syncEquipmentInstances(save,content); save.revision++;
    return {settled:true,insufficientStamina,staminaSpent,relationshipEvents};
}
export function parseSave(raw,content) {
    const s = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);
    if(s?.schemaVersion===1){s.schemaVersion=SAVE_VERSION;if(content.pets){Pets.initializePets(s,content);if(s.pet&&content.pets.legacy_gululu)Pets.addPet(s,content,'legacy_gululu',s.pet.xp);}}
    assert(s && s.schemaVersion === SAVE_VERSION && s.contentVersion === content.contentVersion,'存档版本不兼容');
    normalizeLocaleSave(s);
    validateHanziProgress(s.hanzi);
    validateTimeScrollProgress(s.timeScrollProgress);validateTimeScrollRuntime(s.timeScrollRuntime);
    assert(s.encounterRespawns===undefined||(s.encounterRespawns&&typeof s.encounterRespawns==='object'&&!Array.isArray(s.encounterRespawns)&&Object.values(s.encounterRespawns).every(n=>Number.isSafeInteger(n)&&n>=0)),'怪物刷新记录无效');
    validateLearningSave(s);validateCoopRun(s);validateRelationshipEvents(s);
    assert(s.defaultPocketVersion===undefined||s.defaultPocketVersion===1,'默认口袋规则版本无效');
    validateCheckin(s);
    validateSpeechClaims(s);
    validateTreeClaims(s);
    validateFishingRecords(s);
    validateMagicStarClaims(s,content);
    assert(SCHOOLS.includes(s.school) && (islandFor(s.zone)||dungeonFor(content,s.zone)?.playable),'存档角色无效');
    assert(typeof s.name === 'string' && s.name.length <= 16 && ['boy','girl'].includes(s.appearance),'存档外观无效');
    assert(s.bodyId===undefined||validHeroBodyId(s.bodyId,s.appearance),'存档身体形象无效');
    assert(s.headId===undefined||(typeof s.headId==='string'&&/^[a-z0-9-]{1,64}$/.test(s.headId)),'存档头部形象无效');
    if(s.customHead)s.customHead=publicPhotoHead(s.customHead,{id:s.headId,appearance:s.appearance});
    assert(Number.isSafeInteger(s.xp) && s.xp >= 0 && Number.isInteger(s.seed),'存档经验无效');
    validateTrainingPoints(s,content);
    assert(s.gemSerial===undefined||(Number.isSafeInteger(s.gemSerial)&&s.gemSerial>=0),'存档宝石操作记录无效');
    const oldLayout=s.worldLayoutVersion??0,currentLayout=content.worldMapIndex.layoutVersion;
    assert(Number.isInteger(oldLayout)&&oldLayout>=0&&oldLayout<=currentLayout,'地图版本不兼容');
    // Validate legacy global coordinates first, then migrate the independent camp revision.
    const bounds=oldLayout===currentLayout?worldDimensions(s.zone,content):oldLayout===1&&s.zone==='town'?{w:5600,h:4400}:{w:1800,h:1600};
    assert(Number.isFinite(s.position?.x) && Number.isFinite(s.position?.y) && s.position.x >= 0 && s.position.x <= bounds.w && s.position.y >= 0 && s.position.y <= bounds.h,'存档位置无效');
    if(oldLayout<currentLayout){
        if((oldLayout===0&&s.zone==='town')||!mapInfo(s.zone,content).retainPreviousPosition)s.position=islandSpawn(s.zone,content);
        s.worldLayoutVersion=currentLayout;
    }
    migrateSaveCoordinates(s,content);
    for (const field of ['inventory','equipment','upgrades','cards','quests','tips']) assert(s[field] && typeof s[field] === 'object' && !Array.isArray(s[field]),'存档数据不完整');
    if(content.pets)Pets.retireCaptureCrystals(s,content);
    for (const [id,n] of Object.entries(s.inventory)) assert(content.items[id] && Number.isInteger(n) && n >= 0,'存档物品无效');
    for (const [slot,id] of Object.entries(s.equipment)) assert(content.items[id]?.slot === Number(slot) && owns(s,id),'存档装备无效');
    if (s.mountId != null) assert(content.mountByItem?.[s.mountId]?.art?.cdn && owns(s, s.mountId), '存档坐骑无效');
    for (const [key,n] of Object.entries(s.cards)) assert(availableCardLessons(s,content).some(x => x.key === key) && Number.isInteger(n) && n >= 1 && n <= 3,'存档卡牌无效');
    assert(Array.isArray(s.rewardedEncounters) && Number.isInteger(s.encounterSerial) && s.encounterSerial >= 0,'存档战斗记录无效');
    assert(new Set(s.rewardedEncounters).size === s.rewardedEncounters.length && s.rewardedEncounters.every(x=>typeof x==='string'), '存档奖励记录无效');
    for(const [id,n] of Object.entries(s.upgrades))assert(content.items[id] && upgradeLevels(content,id).length && owns(s,id) && Number.isInteger(n) && n>=0 && (n===0||upgradeAt(content,id,n)),'存档强化记录无效');
    validateEquipmentInstances(s,content);
    syncProgression(s,content);
    assert(s.bagRulesVersion===undefined||s.bagRulesVersion===1,'卡包规则版本无效');
    migrateBagRules(s,content);
    for(const id of Object.values(s.equipment))assert(canEquip(s,content.items[id],content),'存档装备条件无效');
    let previous = true;
    for (const q of content.quests) {
        const state = s.quests[q.id];
        if (state) {
            assert(previous && typeof state.accepted === 'boolean' && typeof state.claimed === 'boolean' && state.progress && typeof state.progress === 'object','存档任务顺序无效');
            for (const n of Object.values(state.progress)) assert(Number.isInteger(n) && n >= 0,'存档任务进度无效');
        }
        if(state?.claimed)assert(state.accepted&&questProgress(s,q).every(g=>g.value===g.count),'存档任务未达标');
        previous = !!state?.claimed;
    }
    assert(!s.graduated || s.quests[63013]?.claimed,'毕业记录无效');
    validateCatalogQuests(s,content);
    validateDungeons(s,content);
    assert(dungeonFor(content,s.zone)?.playable||travelStatus({...s,pendingEncounter:null},content,s.zone).allowed,'存档目的地无效');
    dungeonLanguageBuff(s,content);
    if (s.pendingEncounter) {
        assert(s.pendingEncounter.dailyLanguageVersion===undefined||s.pendingEncounter.dailyLanguageVersion===1,'语言加成版本无效');
        if(s.pendingEncounter.player?.hanziBattle)validateHanziBattleSpec(s.pendingEncounter.player.hanziBattle);
        for(const unit of s.pendingEncounter.party||[])if(unit.hanziBattle)validateHanziBattleSpec(unit.hanziBattle);
        if(s.pendingEncounter.dailyLanguageVersion===1)validateDailyBuff(s.pendingEncounter.languageBuff);
        if(s.pendingEncounter.languageBuff!==undefined&&!s.pendingEncounter.dailyLanguageVersion)assert(JSON.stringify(s.pendingEncounter.languageBuff)===JSON.stringify(dungeonLanguageBuff(s,content)),'副本语言加成检查点无效');
        assert(s.pendingEncounter.equipmentStatsVersion===undefined||[1,2].includes(s.pendingEncounter.equipmentStatsVersion),'装备属性规则版本无效');
        assert(s.pendingEncounter.reflectionRulesVersion===undefined||s.pendingEncounter.reflectionRulesVersion===1,'反射规则版本无效');
        assert(s.pendingEncounter.specialCardRulesVersion===undefined||s.pendingEncounter.specialCardRulesVersion===1,'特殊卡牌规则版本无效');
        assert(s.pendingEncounter.dispelRulesVersion===undefined||s.pendingEncounter.dispelRulesVersion===1,'之敌规则版本无效');
        assert(s.pendingEncounter.stealthRulesVersion===undefined||s.pendingEncounter.stealthRulesVersion===1,'隐身规则版本无效');
        assert(s.pendingEncounter.progressionRulesVersion===undefined||[1,2,3].includes(s.pendingEncounter.progressionRulesVersion),'成长属性规则版本无效');
        assert(s.pendingEncounter.threatRulesVersion===undefined||[1,2,3,4,5].includes(s.pendingEncounter.threatRulesVersion),'仇恨规则版本无效');
        assert(s.pendingEncounter.magicStarLevel===undefined||Number.isInteger(s.pendingEncounter.magicStarLevel)&&s.pendingEncounter.magicStarLevel>=0&&s.pendingEncounter.magicStarLevel<=10,'魔法星战斗等级无效');
        assert(s.pendingEncounter.magicStarExperiencePercent===undefined||s.pendingEncounter.magicStarExperiencePercent===(s.pendingEncounter.magicStarLevel?content.magicStar?.levels[s.pendingEncounter.magicStarLevel]?.exp:100),'魔法星经验倍率无效');
        if(s.pendingEncounter.runes!==undefined){
            const runes=s.pendingEncounter.runes;
            assert(Array.isArray(runes)&&new Set(runes.map(row=>row.itemId)).size===runes.length,'存档符文无效');
            for(const rune of runes)assert(content.items[rune.itemId]?.kind===18&&content.items[rune.itemId].subtype===2&&(content.cardItems[rune.itemId]||content.cardItems[rune.itemId-1000])===rune.key&&(!String(rune.key).includes('CatchPet')||content.runeCatalog?.runes.some(row=>row.gsid===rune.itemId&&row.key===rune.key&&Number.isFinite(row.baseWeight)))&&Number.isSafeInteger(rune.count)&&rune.count>0&&(s.inventory[rune.itemId]||0)<=rune.count,'存档符文无效');
        }
        assert(s.pendingEncounter.id === `${s.seed}:${s.encounterSerial}` && s.pendingEncounter.seed === hashSeed(`${s.seed}:encounter:${s.encounterSerial}`),'存档战斗种子无效');
        assert(JSON.stringify(s.pendingEncounter.player) === JSON.stringify(s.coopRun?.hero||playerSpec(s,content)), '存档战斗角色无效');
        assert((content.encounters.some(e => e.id === s.pendingEncounter.encounterId && e.zone === s.zone)||specialEncounter(s,content,s.pendingEncounter.encounterId)) && Array.isArray(s.pendingEncounter.decisions) && s.pendingEncounter.decisions.length <= 200 && Number.isInteger(s.pendingEncounter.seed),'存档战斗无效');
    }
    if (s.pet) assert(s.pet.itemId === content.pet.itemId && Number.isSafeInteger(s.pet.xp) && s.pet.xp >= 0 && s.pet.xp <= content.pet.levels.max_exp && s.pet.level === petLevel(s.pet.xp,content),'存档宠物无效');
    const petContent=content.pets?Pets.migratePetDeckRules(s,content):content;
    if(s.pendingEncounter){
        const encounter=content.encounters.find(e=>e.id===s.pendingEncounter.encounterId);
        assert(JSON.stringify(s.pendingEncounter.dungeonMonsterIds)===JSON.stringify(journeyEnemyFormation(encounter,dungeonFor(content,s.zone),s.pendingEncounter.party).ids)&&JSON.stringify(s.pendingEncounter.dungeonMonsterSlots)===JSON.stringify(journeyEnemyFormation(encounter,dungeonFor(content,s.zone),s.pendingEncounter.party).slots),'副本阵容记录无效');
        assert(!encounter?.blocked?.length&&!dungeonProgress(s)?.[s.zone]?.cleared.includes(encounter?.id),'副本战斗记录无效');
    }
    if(content.pets){validatePetMeetings(s);validatePetWorld(s,content);Pets.validatePets(s,petContent);if(s.pendingEncounter?.party){assert(JSON.stringify(s.pendingEncounter.party)===JSON.stringify(journeyParty(s,dungeonFor(content,s.zone),coopParty(s,playerSpec(s,content))||Pets.partySpecs(s,petContent,playerSpec(s,content),{traits:s.pendingEncounter.petTraitRulesVersion===1}))),'存档阵容无效');const encounter=content.encounters.find(e=>e.id===s.pendingEncounter.encounterId)||specialEncounter(s,content,s.pendingEncounter.encounterId);assert(JSON.stringify(s.pendingEncounter.monster)===JSON.stringify(encounter.monster||content.monsters[encounter.monsterId]),'存档敌人无效');assert(s.pendingEncounter.captureStock===(s.inventory[Pets.CAPTURE_ID]||0)&&s.pendingEncounter.heroLevel===s.level,'存档捕获记录无效');const ownedPets=ownedPetSpecies(s);if(s.pendingEncounter.ownedPets!==undefined)assert(JSON.stringify(s.pendingEncounter.ownedPets)===JSON.stringify(ownedPets),'存档捕获记录无效');else if((s.pendingEncounter.runes||[]).some(rune=>String(rune.key).includes('CatchPet')))assert(false,'存档捕获记录无效');}}
    if(s.pendingEncounter?.party){
        assert(JSON.stringify(s.pendingEncounter.petIds)===JSON.stringify(journeyRewardPets(s,dungeonFor(content,s.zone),s.pendingEncounter.party)),'存档宠物奖励阵容无效');
        if(s.pendingEncounter.adventureParams){
            const expected=Pets.petParams(petContent),saved=s.pendingEncounter.adventureParams;
            const threatVersion=s.pendingEncounter.threatRulesVersion||0;
            const optional=new Set([
                ...(s.pendingEncounter.captureRulesVersion!==1?['catchMinChance','catchMaxChance','catchEnragedDifficulty']:[]),
                ...(s.pendingEncounter.specialCardRulesVersion!==1||threatVersion<3?['effectThreatSingleFreeze','effectThreatConversePositiveWard']:[]),
                ...(threatVersion<5?['iceAreaAttackThreatRatio']:[]),
                ...(threatVersion<1?['damageThreatRatio','splashDamageThreatRatio']:[]),
                ...(threatVersion<2?['singleHealThreatRatio']:[]),
                ...(threatVersion<3?['areaHealThreatRatio','effectThreatGlobal','effectThreatMiniAura','effectThreatRemovePositiveCharm','effectThreatRemoveNegativeCharm','effectThreatStealCharm','effectThreatCharms','effectThreatWards','effectThreatAreaCharm','effectThreatAreaWard','effectThreatAbsorb']:[]),
                'mountSpeed','gatherValue_flower','gatherValue_herb','gatherValue_stone','gatherValue_ore','gatherThreshold','gatherCellSize','gatherDensity','gatherDistance',
                // Added exploration-only defaults do not affect an already-started battle.
                // Older checkpoints may omit them; present values still require validation.
                'monsterRespawnMs','fieldEncounterRadius','dungeonEncounterRadius',
                ...(threatVersion<4?['splashManipulationThreatRatio','effectThreatStun','effectThreatRemovePositiveWard','effectThreatStealWard','effectThreatSymmetryWards','effectThreatReflectionShield','effectThreatAreaPowerPipBoost','effectThreatAreaCleanse','defensiveThreatWeight','tauntThreatWeight']:[]),
            ]);
            assert(Object.keys(saved).every(key=>Object.hasOwn(expected,key))&&Object.entries(expected).every(([key,value])=>!Object.hasOwn(saved,key)?optional.has(key):JSON.stringify(saved[key])===JSON.stringify(value)),'存档养成参数无效');
        }
    }
    if(s.earthProgress!==undefined)assert(s.earthProgress.version===1&&Number.isInteger(s.earthProgress.step)&&s.earthProgress.step>=0&&s.earthProgress.step<=5,'地球章节记录无效');
    validateEarthCityProgress(s.earthCityProgress);
    syncProgression(s,content); validDeck(s,content,s.deck);
    if(s.deckLayouts!==undefined)validateDeckLayouts(s,content,s.deckLayouts,s.activeDeckLayout);
    migrateDefaultPocket(s,content);
    syncDeckLayouts(s,content);
    migrateQuestPetRewards(s,content,rewardsFor);
    grantEggCompanion(s,content);
    syncEquipmentInstances(s,content);
    if(content.pets)Pets.mergeOwnedPetSpecies(s,content);
    return s;
}

export function specialEncounter(save,content,id){
    if(save.zone==='earth'&&String(id).startsWith('earth:'))return earthEncounter(content,id);
    if(!content.pets||typeof id!=='string')return null;
    const wild=id.startsWith('wild:')?content.pets[id.slice(5)]:null;
    const level=wild?Math.max(wild.unlockLevel,save.level):Number(id.slice(6));
    if(!wild&&!id.startsWith('trial:'))return null;
    assert(Number.isInteger(level)&&level>=1&&level<=save.level,'挑战等级尚未解锁');
    const school=wild?.school||save.school,p=Pets.petParams(content);
    const lessons=(wild?.lessons||content.learn[school]).filter(x=>x.level<=level);
    const pool=lessons.slice(-8).map(x=>({key:x.key,weight:10}));
    const monster={id:wild?'wild:'+wild.id:'trial:'+level,name:wild?.name||`${level}级魔法试炼`,school,level,hp:Pets.specMaxHp({school,level,stats:{}}),attributes:{ai_module:'Genes_Attacker',power_pip_percent:0,startup_pips_normal:1},pool,sequences:[],genes:[],cardsets:{},xp:p.encounterXpBase+p.encounterXpLevel*level,coins:p.encounterCoinsBase+p.encounterCoinsLevel*level};
    if(wild)Object.assign(monster,{speciesId:wild.id,unlockLevel:wild.unlockLevel});
    return {id,zone:save.zone,monster};
}
function settleCapturedPets(save,content,battle){
    const pending=save.pendingEncounter;if(!pending||pending.petCapturesSettled)return;
    const records=Object.values(ownedPetRecords(save));
    for(const id of battle.captured||[]){
        assert(content.pets[id],'未知宠物');
        const existing=records.find(p=>p.speciesId===id);
        assert(!existing||save.pets[save.petInstanceVersion===1?existing.id:existing.speciesId],'请先加载已拥有宠物的详情');
    }
    for(const [index,id] of (battle.captured||[]).entries())Pets.addPet(save,content,id,0,{traits:battle.capturedTraits?.[index]||{},captured:true});
    pending.petCapturesSettled=true;
}
export function settleParty(save,content,battle,{retreat=false}={}){
    settleRunes(save,battle);
    const pending=save.pendingEncounter,p=Pets.petParams(content);
    if(save.petTraitEncounters&&battle.sides.far.some(u=>u.hp<=0))delete save.petTraitEncounters[pending.encounterId];
    if(save.coopRun){settleCoopHealth(save,battle);if(!retreat)settleCapturedPets(save,content,battle);return;}
    save.heroHp=dungeonLanguageBaseHp(battle.unitsById.hero);
    if(battle.winner!=='near'||retreat)save.heroHp=Math.max(save.heroHp,Math.ceil((battle.unitsById.hero.languageBaseMaxHp||battle.unitsById.hero.maxHp)*p.defeatHp));
    for(const u of battle.sides.near)if(u.speciesId){const pet=save.pets[save.petInstanceVersion===1?u.id:u.speciesId];if(pet)pet.hp=u.hp;}
    save.inventory[Pets.CAPTURE_ID]=Math.max(0,(save.inventory[Pets.CAPTURE_ID]||0)-(battle.captureUsed||0));
    Pets.retireCaptureCrystals(save,content,{keepActiveBattle:false});
    if(!retreat){
        settleCapturedPets(save,content,battle);
        if(battle.winner==='near')for(const id of pending.petIds||[]){const pet=save.pets[id];pet.xp+=pending.dungeonMonsterIds?battle.monsterTemplates.reduce((sum,m)=>sum+m.xp,0):battle.monsterTemplates[0].xp;pet.level=Pets.petXpLevel(pet.xp,content);}
    }
}
