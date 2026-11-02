// combat_params_core.js — BalanceParams 覆盖层。
// 数据集（cards/charms/...）只读；所有可调数值集中在这里，引擎只读取 resolveParams() 的结果。
// 常量来源见 docs/lua-mapping.md §1。

import {PACK_ISLANDS} from './island_pack_registry_core.js';
export const SCHOOLS = ['fire', 'ice', 'storm', 'life', 'death'];
export const ALL_SCHOOLS = ['fire', 'ice', 'storm', 'myth', 'life', 'death', 'balance'];
export const VERSIONS = ['kids', 'teen'];

function perSchoolDefaults() {
    const out = {};
    for (const s of SCHOOLS) {
        out[s] = { hp: 1, damage: 1, heal: 1, accuracy: 0, powerPip: 0, resist: 0, crit: 0 };
    }
    return out;
}

/**
 * 默认参数（按版本）。
 * global 常量对照：
 *   maxPips            player_server.lua L58/L173/L186 (kids 7 / teen 14)
 *   maxRounds          player_server.lua L184/L188, arena_server.lua L96/L319 (kids 100 / teen 80)，单位为“半回合”（每边各出一次牌为 2）
 *   handSize           player_server.lua L295 (8)
 *   deckCapacity       卡包总容量：来自卡包道具 stats[167]（arena_server.lua L8011/L8154），本地无道具表；
 *                      初始卡包为 kids 14 / teen 18（CombatCardDeckSubPage.lua L38 / CombatCardManager.teen.lua L41），
 *                      正常玩家卡包约 40 张，默认 40
 *   deckEachCapacity   单卡上限：stats[170]（arena_server.lua L8087-8107），初始卡包 3 / 5，正常约 6，默认 6；teen 同名 spell_name 共享上限（L8119）
 *   deckPresetCopies   模拟器项：未自定义配卡时，官方 Aggressive 卡组每种卡带几份（带满不一定最好——抽不到想要的牌）
 *   critDamageRatio    card_server.lua L96 (1.3)
 *   dodgeDamageRatio   card_server.lua L99, InitConstants L191-200 (teen 0.5 / kids 0.00001)
 *   maxSpellPenetration card_server.lua L69 (70)
 *   protectRounds      card_server.lua L103 (6) kids PvP 绝对防御/致命一击保护回合
 *   arenaDamageBoostPerRound arena_server.lua L1405 (kids 4 / teen 2，teen 仅 bIncreasingDamage 时启用)
 *   startupPipsNormal  玩家开局 pips（Lua 来自装备 stat 184/185，此处给默认 0）
 */
export function defaultParams(version = 'teen') {
    const teen = version === 'teen';
    return {
        version,
        // Local companion behavior and service budgets, independent of combat formulas.
        companionAI: {thinkMs:1000,followDistance:220,comfortDistance:110,followSpacing:65,blockedRetryMs:30000,arrivalDistance:18,exploreRadius:180,goalMs:18000,gatherMs:9000,enemyClearance:150,speechMinMs:45000,speechMaxMs:90000,quietMinMs:120000,quietMaxMs:180000,dailyRequests:120,dailyProactive:40,recentMessages:24,recentEvents:20,summaryChars:2000,replyChars:500,inputChars:2000,recordMaxMs:20000,modelTokens:1600,battleTimeoutMs:5000},
        // Web Earth exploration budgets; independent of combat RNG and formulas.
        cityDungeons: {gridSize:9,tileSize:140,encounters:3,levelStep:1,monsterIds:['fire-scout','ice-scout','storm-scout','life-scout','water-bubble'],streetSize:2400,streetRoadWidth:150,streetWalkWidth:120,streetBuildingHeight:370,streetBuildingMaxWidth:220,streetShopWidth:280,streetPropDepth:22,streetHeroRadius:18,streetMovementStep:2,streetEdgeMargin:24},
        earth: {unitsPerDegree:24000,mapCityPickRadius:48,atlasMarkerSpacing:42,atlasMarkerRadius:6,atlasStoryMarkerRadius:8,mapDragThreshold:8,generationVersion:1,chunkSize:1000,activeRadius:2,prefetchRadius:3,maxConcurrent:4,maxTiles:12,maxCityTiles:4,maxChunks:64,maxSceneCities:24,maxQueuedRequests:48,maxDecodedBytes:33554432,requestTimeoutMs:20000,cityRadius:480,roadWidth:70,roadSampleStep:24,roadSafeMargin:65,buildingSafeMargin:100,buildingsPerCity:12,buildingSpacing:150,buildingOffset:170,treesPerChunk:12,monstersPerChunk:9,wildMaxActors:6,wildSpawnClearance:40,wildUrbanSampleStep:500,wildNearDistance:1500,wildFarDistance:12000,wildNearLevelOffset:-3,wildFarLevelOffset:5,wildNearPowerRatio:.85,wildFarPowerRatio:1.3,wildMaxPower:10000,wildPipBudgetShare:.12,wildResistBudgetShare:.3,wildMaxPip:80,wildMaxResist:60,wildHpBudgetShare:.15,wildMaxHpBonus:1,monsterClearance:350,arrivalRadius:1500,arrivalStep:48,navigationRadius:1200,maxPathNodes:2500,streamIntervalMs:350,surfaceChunkSize:256,surfaceResolution:256,surfaceMaxChunks:64,surfacePrefetchRing:1,landmarkRoadClearance:20,landmarkPlacementStep:60,landmarkPlacementRadius:900,surfaceFrameBudgetMs:4,surfaceFallbackBudgetMs:2,surfaceMobileResolution:192,surfaceTexturePeriod:192,decorationsPerChunk:80,forestDecorationsPerChunk:100,cityPopulationLarge:1000000,cityPopulationMedium:100000,cityDensities:[.7,.88,.98],cityInfluenceRadius:12000,settlementRadiusSmall:550,settlementRadiusMedium:900,settlementRadiusLarge:1400,transitRailOffset:250,transitCorridorWidth:35,transitMinimumLength:240,transitStationOffset:180,transitStationSize:250,transitTrainSize:270,transitHighSpeedPopulation:1000000,cityDrawSceneRoads:false,cityGroundPeriod:768,cityConnectionDistance:24000,cityConnectionBend:.12,cityConnectionSegment:120,cityConnectionWidth:52,cityBridgeMaxSpan:480,boatSize:100,dockSize:112,cityConnectionShoulderWidth:4,cityConnectionBlendWidth:20,cityConnectionTextureOpacity:.26,surfaceDetailStrength:.5,surfaceDetailSpacing:18,surfaceDetailDensity:.38,streamBuildBudgetMs:2,streamPrefetchDistance:450,streamTurnCancelDistance:8,streamCacheChunks:192,streamRouteCacheEntries:64,streamUrbanSampleEntries:8192,streamPacketRows:64,collisionCellSize:256, surfaceVegetationTint:.62,cityBlockSize:500,cityBlockInset:110,cityLaneWidth:48,citySidewalkWidth:28,cityBuildingClearance:12,cityBuildingSetback:60,cityCellsPerChunk:6,cityStreetFraction:.28,maxUrbanObjects:1800},
        // Web cross-cultural relationships; not original combat formula values.
        characterRelations: {initialMin:0,initialMax:60,maxAiDelta:5,giftGain:3,dungeonGain:3,matchGain:2,dailyFreeMessages:2,recentMessages:20,compactAt:40,indexPageSize:100},
        // Web island unlock levels; original world configuration is unavailable.
        dungeonJourney: { hpGrowth:.055, rewardPerFloor:30, summitMultiplier:5 },
        wordCards: {poolSize:10,speechAttempts:3,recordMaxMs:15000},
        hanziMemory: {chantSeconds:4,guardianLeadSeconds:1,fragmentsRequired:3,nodeCount:12,collectRadius:55,candidateStep:100},
        hanzi: {attackPercent:3,defensePercent:3,healPercent:3,maxTriggers:3},
        worldTravel: { camp:1, town:1, fire:10, ice:20, desert:30, dark:40, ...Object.fromEntries(PACK_ISLANDS.map(i=>[i.id,i.recommendedLevel])) },
        petInteractions: {
            memoryCapacity:10, memoryProtectionMs:7*86400000, marksRequired:3,
            cooldownMs:3*86400000, babyScale:.5, interactionDistance:100,
            feedingDistance:180, effectMs:4500, playIntervalMs:12000,
            encounterDistanceMultiplier:2, meetingSpacing:48, meetingArrivalDistance:64,
            idleSleepMs:60000, idleMoveDistance:4, seriousHpRatio:.25,
            meetingOwnerClearanceX:78, meetingOwnerClearanceY:135, meetingOffset:140, meetingTargetTolerance:12,
            indexPageSize:100,
        },
        // autoJoin* mirrors kids CombatRoom empty-seat open → delayed AI fill (RoomDetailPage 4 slots).
        // roadSlack / spawnMinActors: wander along roads near quest hubs; keep a few residents by the world spawn/plaza.
        // actorSeparation is the standing hero box (78) plus a visible gap, so two AI sprites do not touch.
        socialActions: { durationMs:3600, cooldownMs:4000, danceAffinity:30, heartAffinity:60 },
        islandSocial: { camp:6, medium:12, large:16, interactionDays:30, idleMin:30, idleMax:90, travelMin:120, travelMax:300, speed:90, hotspotRadius:100, hotspotSpread:90, roadSlack:16, spawnMinActors:2, separation:50, actorSeparation:120, npcClearance:65, monsterClearance:96, entranceClearance:115, followDistance:110, followSpacing:42, boatFollowSpacing:28, boatFollowOffset:10, partyIdleDelay:1.2, partyIdleRadius:5, partyPetOffsetX:32, partyPetOffsetY:18, followWait:2, dungeonFollowSpeed:262.5, dungeonRegroupDistance:280, approachRadius:150, approachReleaseRadius:180, converseRadius:95, viewPadding:120, sceneMaxActors:6, sceneLoadDistance:1000, sceneUnloadDistance:1200, sceneUnloadDelay:1.5, sceneFadeIn:.8, sceneFadeOut:.5, autoJoinMinMs:1500, autoJoinMaxMs:3500 },
        checkin: { minutes: [1, 15, 30, 60, 90], coins: 100 },
        timeScroll: {walkSpeed:260,interactionRange:100},
        dailyLanguage: {percentPerLine:1,maxPercent:10,rewardSteps:[5,10,20,30,40],rewardItems:[100,100,100,17213,17213],rewardAmounts:[10,20,30,5,10]},
        dungeonLanguage: {recordMaxMs:20000,percentPerLine:1,maxPercent:3,minSpeechAccuracy:0.3,speechPracticeCount:3},
        languageAdventure: { inviteRange:150, interactionRange:85, greetingMs:2500, basicReward:10, beginnerReward:30, intermediateReward:50, advancedReward:80, basicDailyCap:100, challengeDailyCap:200, basicCourseLimit:2, challengeCourseLimit:1, promptCooldownMs:90000, sourceCooldownMs:300000, maxTurns:8 },
        // Web progression schedule; original server training-point grant table is unavailable.
        skillLearning: { pointLevels: [4,8,12,16,20,25,30,35,40,45,50] },
        // SueSue_equipment_extend_panel.lua GetAllOdds: kids level 1–5.
        gems: { odds: [100,80,60,40,25] },
        fishing: {
            // Web-only fishing challenge and cosmetic weights; no reward/stat effect.
            fishingMinGrams:180, fishingMaxGrams:18000, fishingWeightPower:3,
            fishingMinPulls:3, fishingMaxPulls:5, fishingBiteMs:1400,
            fishingWindowStepMs:150, fishingRestMinMs:650, fishingRestMaxMs:1100,
            fishingInputGraceMs:180,
            fishingMistakePenalty:.15, fishingSmallWeightRatio:.08,
            fishingPerfectWeightFloor:.25, fishingLargeGrams:6000, fishingHugeGrams:12000,
            fishingAutoEscapeChance:.01,
        },
        // Web red-mushroom matchmaking, not original server ranking rules.
        // arena_server.lua L69–73: PvP pickcard_timeout_time_pvp = 30000; readyMs is the web match confirmation.
        redMushroom: { arrivalMinMs:3000, arrivalMaxMs:5000, readyMs:15000, pickMs:30000, firstMin:.55, firstMax:.7, min:.5, max:1.6, jitter:.08, feedback:1.2, window:20, winPoints:25, drawPoints:10 },
        // Scene motion stays outside adventureParams saved in battle checkpoints.
        monsterScene: { territoryRadius:84, perceptionMultiplier:2, alertDelay:1.5, dungeonWanderRadius:22, wanderSpeed:15, chaseSpeed:115, returnSpeed:45, restMin:2.5, restMax:6.5 },
        petTraits: {
            gatheringChance:.2,
            countWeights:[65,28,7], rankWeights:[5000,2500,1250,650,350,170],
            rareChance:.05, rareRankWeights:[80,17,3],
            values:{attack:[3,6,10,15,21,28,36,47,60],defense:[2,4,6,9,12,16,20,25,30],
                vitality:[4,8,12,18,25,33,42,51,60],critical:[1,2,4,6,9,12,16,20,24],
                accuracy:[1,2,3,4,6,8,10,12,15],mana:[1,2,3,5,7,9,12,15,18],
                gathering:[10,20,35,50,70,95,125,160,200],healing:[3,5,8,12,17,23,30,37,45],frugal:[3,6,10,15,20,26,32,38,45]},
            encounterCacheSize:128,
        },
        adventure: {
            gatherValue_flower:5,gatherValue_herb:5,gatherValue_stone:10,gatherValue_ore:20,
            gatherThreshold:50,gatherCellSize:260,gatherDensity:.65,gatherDistance:82,
            gatherUnits:3,gatherDwellSeconds:1,gatherUnitSeconds:1.5,
            gatherSmeltValue:60,gatherSmeltSeconds:2,gatherDropDistance:65,gatherPickupDistance:23,
            gatherFairyChance:.2,gatherFairyAmount:5,gatherBeanAmount:60,gatherPetCooldown:12,gatherPetRange:160,
            monsterRespawnMs:30000,
            fieldEncounterRadius:24,
            dungeonEncounterRadius:84,
            iceAreaAttackThreatRatio:2,
            damageThreatRatio:1, splashDamageThreatRatio:0.05,
            singleHealThreatRatio:0.3,
            areaHealThreatRatio:0.2,
            splashManipulationThreatRatio:0.2,
            effectThreatGlobal:200,
            effectThreatMiniAura:80,
            effectThreatRemovePositiveCharm:100,
            effectThreatRemoveNegativeCharm:100,
            effectThreatStealCharm:100,
            effectThreatCharms:80,
            effectThreatWards:80,
            effectThreatAreaCharm:60,
            effectThreatAreaWard:60,
            effectThreatAbsorb:400,
            effectThreatStun:500,
            effectThreatSingleFreeze:200,
            effectThreatConversePositiveWard:200,
            effectThreatRemovePositiveWard:100,
            effectThreatStealWard:100,
            effectThreatSymmetryWards:200,
            effectThreatReflectionShield:100,
            effectThreatAreaPowerPipBoost:50,
            effectThreatAreaCleanse:100,
            defensiveThreatWeight:3,
            tauntThreatWeight:5,
            levelCap: Math.max(50,...PACK_ISLANDS.map(i=>i.recommendedLevel)), stageLevels: [1,10,25,40], petCapacities: [2,4,6,8],
            petCopies: 3, heroRegenPerSecond: .02, regenPerMinute: .05, hungerPerMinute: 1, restingHungerPerMinute: .5, feedThreshold: 30,
            foodRestore: 40, petFoodRules: {'17172':{restore:40,price:30},'17185':{restore:70,price:120},'17211':{restore:100,price:240}}, defeatHp: .1, captureBase: .2, captureWounded: .65,
            catchMinChance: .01, catchMaxChance: .95, catchEnragedDifficulty: 2,
            foodPrice: 10, capturePrice: 25, petPriceBase: 100, petPriceLevel: 40,
            gearPriceBase: 30, gearPriceLevel: 15, duplicateXp: 50, mountSpeed: 1.35,
            // Permanent mounts with 0/0 globalstore prices (e.g. zodiac transform pills) list in the mall at this 魔豆 price.
            mountUnpricedDefault: 100,
            encounterXpBase: 25, encounterXpLevel: 12, encounterCoinsBase: 30, encounterCoinsLevel: 8,
            xpGrowth: 300, petXpStep: 30,
        },
        global: {
            // kids card_server.lua L5967–5993; player_server.lua L187, L2465.
            freezeProtectionRounds: 8,
            freezeSiblingProtectionRounds: 3,
            freezeResistPercent: 80,
            freezeWardId: 27,
            guardianReviveHp: 2000,
            maxReflectDamage: teen ? 5000 : 4500,
            maxPips: teen ? 14 : 7,
            maxRounds: teen ? 80 : 100,
            handSize: 8,
            deckCapacity: 40,
            deckEachCapacity: 6,
            deckPresetCopies: 3,
            critDamageRatio: 1.3,
            dodgeDamageRatio: teen ? 0.5 : 0.00001,
            maxSpellPenetration: 70,
            protectRounds: 6,
            arenaDamageBoostPerRound: teen ? 0 : 4,
            healPenalty: 0,
            forceAccuracy100: teen, // teen 版 Lua 强制卡牌 accuracy=100（研究结论）
            startupPipsNormal: 0,
            startupPipsPower: 0,
        },
        perSchool: perSchoolDefaults(),
        cardOverrides: {},
        battleAI: {
            branches: 12, candidateCount: 3, chainCandidates: 3, chainDiscount: 0.65,
            lethalValue: 600, pipValue: 24, reserveValue: 0.25, survivalValue: 1.6,
            severeGap: 0.25, confidenceThreshold: 0.9, nearTie: 0.08,
            temperatures: { easy: 0.7, normal: 0.3, advanced: 0.12, expert: 0 },
            closeMargin: 0.25, minimumCloseFrames: 3,
            deckSupportShare: 0.45, deckBurstThreshold: 0.75, deckSetupDiscount: 0.8,
            deckAttackShare: 0.4, deckCounterCopies: 2, deckHealCopies: 2,
            pipEfficiencyWeight: 0.25,
            tacticalSetupLimit: 3, tacticalSetupMaxCost: 1, tacticalDrawCandidates: 8,
            tacticalMissingAttackCandidates: 1,
            tacticalWaitCost: 0.12, tacticalSetupCost: 0.08, tacticalFocusRetention: 0.08,
            tacticalProgressWeight: 1.2, tacticalEarlyReleaseCost: 0.9,
            tacticalCapReserve: 2, tacticalOverflowCost: 0.7,
            tacticalMaxDiscards: 2, tacticalDrawWeight: 0.5, tacticalDiscardCost: 6,
        },
        fairPlay: null,
    };
}

export function cloneParams(params) {
    return JSON.parse(JSON.stringify(params));
}

/** 深合并：patch 覆盖 base（对象递归，数组/标量替换） */
export function mergeParams(base, patch) {
    const out = cloneParams(base);
    (function walk(dst, src) {
        for (const k of Object.keys(src || {})) {
            const v = src[k];
            if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') {
                walk(dst[k], v);
            } else {
                dst[k] = v;
            }
        }
    })(out, patch);
    return out;
}

/** 列出 cur 相对 base 的差异 [{path, from, to}] */
export function diffParams(base, cur) {
    const diffs = [];
    (function walk(a, b, path) {
        const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
        for (const k of keys) {
            const av = a ? a[k] : undefined;
            const bv = b ? b[k] : undefined;
            const p = path ? `${path}.${k}` : k;
            if (av && bv && typeof av === 'object' && typeof bv === 'object') {
                walk(av, bv, p);
            } else if (av !== bv && !(av === undefined && bv === null) && !(av === null && bv === undefined)) {
                if (typeof av === 'object' || typeof bv === 'object') {
                    if (JSON.stringify(av) !== JSON.stringify(bv)) diffs.push({ path: p, from: av, to: bv });
                } else {
                    diffs.push({ path: p, from: av, to: bv });
                }
            }
        }
    })(base, cur, '');
    return diffs;
}

export function serializeParams(params) {
    return JSON.stringify(params, null, 2);
}

export function parseParams(text, fallbackVersion = 'teen') {
    const obj = JSON.parse(text);
    const version = VERSIONS.includes(obj.version) ? obj.version : fallbackVersion;
    return mergeParams(defaultParams(version), obj);
}

const parameterGroupDefaults=new Map();
const parameterGroupEntries=new Map();
function copyParamDefault(value){return Array.isArray(value)?value.map(copyParamDefault):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,copyParamDefault(item)])):value;}
// Read only the requested BalanceParams section in per-frame adventure code.
// Preserve fresh defaults (including nested arrays), live overrides and in-place edits.
export function resolveParamGroup(params,group,fallbackVersion='teen'){
    const version=params?.version||fallbackVersion;let defaults=parameterGroupDefaults.get(version);
    if(!defaults){defaults=defaultParams(version);parameterGroupDefaults.set(version,defaults);}
    let entries=parameterGroupEntries.get(version);if(!entries){entries=new Map();parameterGroupEntries.set(version,entries);}if(!entries.has(group))entries.set(group,Object.entries(defaults[group]||{}));
    const overrides=params?.[group],result={};for(const [key,value] of entries.get(group))if(!overrides||!Object.hasOwn(overrides,key))result[key]=copyParamDefault(value);
    Object.assign(result,overrides);
    if(group==='petTraits')result.values={...copyParamDefault(defaults.petTraits.values),...overrides?.values};
    return result;
}

/** 读取 school 的系数条目（未知系回退到 balance 的空系数） */
export function schoolFactor(params, school) {
    return params.perSchool[school] || { hp: 1, damage: 1, heal: 1, accuracy: 0, powerPip: 0, resist: 0, crit: 0 };
}

function numberish(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return v;
}

/**
 * 单体 charm / ward 类卡的目标阵营由模板 positive 决定：
 * 增益（盾、专注）→ friendly；减益（诅咒/陷阱、虚弱）→ hostile。
 * 与官方 AI 表（deck_attacker_ai/*.csv 首列 target）一致；原版由客户端选目标，服务器不校验。
 * @return 'friendly' | 'hostile' | undefined（非 charm/ward 卡交由 cardTargetKind 按 type 推断）
 */
export function inferTargetKind(card, charmsRoot) {
    const t = card.type;
    if (!/^(Charms|Wards|StandingWards|SymmetryWards)$/.test(t)) return undefined;
    const p = card.params || {};
    const list = (v) => v === undefined || v === null || v === '' ? [] : String(v).split(',').map(s => s.trim()).filter(Boolean);
    let ids, table;
    if (t === 'Charms') { ids = list(p.charms ?? p.charm); table = charmsRoot.charm || {}; }
    else { ids = list(p.target_wards ?? p.wards ?? p.ward); table = charmsRoot.ward || {}; }
    if (!ids.length) return t === 'SymmetryWards' ? 'hostile' : undefined;
    const negative = ids.some(id => { const tpl = table[id]; return tpl && (tpl.positive === false || tpl.positive === 'false'); });
    return negative ? 'hostile' : 'friendly';
}

/**
 * 合并数据集与参数，产出引擎实际读取的 resolved 结构：
 * { version, global, perSchool, cards, charms, wards, miniauras, globalauras, aiDecks, statsByGear, manifest }
 * 单卡覆盖：cardOverrides[key] = { pipcost?, accuracy?, params?: {damage_min?...} }
 */
export function resolveParams(dataset, params, {groups=null}={}) {
    const version = params.version || dataset.version || 'teen';
    if(groups){const resolved={version};for(const group of groups)resolved[group]=resolveParamGroup(params,group,version);return resolved;}
    const defaults=defaultParams(version);
    const cards = {};
    for (const key of Object.keys(dataset.cards || {})) {
        const src = dataset.cards[key];
        const ov = params.cardOverrides[key];
        const card = {
            key: src.key || key,
            spellName: src.spellName || src.spell_name || key,
            type: src.type,
            target: src.target,
            pipcost: numberish(src.pipcost ?? 0),
            accuracy: numberish(src.accuracy ?? 100),
            hitchance: numberish(src.hitchance ?? 100),
            spellSchool: (src.spellSchool || src.spell_school || 'balance').toLowerCase(),
            requireLevel: numberish(src.requireLevel ?? src.require_level ?? 0),
            canLearn: src.canLearn ?? src.can_learn,
            params: { ...(src.params || {}) },
        };
        if (params.global.forceAccuracy100) card.accuracy = 100;
        if (ov) {
            if (ov.pipcost !== undefined) card.pipcost = numberish(ov.pipcost);
            if (ov.accuracy !== undefined) card.accuracy = numberish(ov.accuracy);
            if (ov.params) Object.assign(card.params, ov.params);
        }
        for (const k of Object.keys(card.params)) card.params[k] = numberish(card.params[k]);
        if (!card.target) card.target = inferTargetKind(card, dataset.charms || {});
        cards[key] = card;
    }
    const charmsRoot = dataset.charms || {};
    return {
        version,
        global: { ...params.global },
        enrage: dataset.pve?.enrage,
        battleAI: { ...defaults.battleAI, ...params.battleAI },
        // Web island unlock levels; original world configuration is unavailable.
        dungeonJourney: { ...defaults.dungeonJourney, ...params.dungeonJourney },
        timeScroll: { ...defaults.timeScroll, ...params.timeScroll },
        dailyLanguage: { ...defaults.dailyLanguage, ...params.dailyLanguage },
        dungeonLanguage: { ...defaults.dungeonLanguage, ...params.dungeonLanguage },
        earth: { ...defaults.earth, ...params.earth },
        cityDungeons: { ...defaults.cityDungeons, ...params.cityDungeons },
        hanzi: { ...defaults.hanzi, ...params.hanzi },
        wordCards: {...defaults.wordCards,...params.wordCards},
        hanziMemory: { ...defaults.hanziMemory, ...params.hanziMemory },
        worldTravel: { ...defaults.worldTravel, ...params.worldTravel },
        petInteractions: { ...defaults.petInteractions, ...params.petInteractions },
        petTraits: { ...defaults.petTraits, ...params.petTraits, values:{...defaults.petTraits.values,...params.petTraits?.values} },
        checkin: { ...defaults.checkin, ...params.checkin },
        languageAdventure: { ...defaults.languageAdventure, ...params.languageAdventure },
        fishing: { ...defaults.fishing, ...params.fishing },
        adventure: { ...defaults.adventure, ...params.adventure },
        monsterScene: { ...defaults.monsterScene, ...params.monsterScene },
        redMushroom: { ...defaults.redMushroom, ...params.redMushroom },
        perSchool: params.perSchool,
        fairPlay: params.fairPlay || null,
        cards,
        charms: charmsRoot.charm || {},
        wards: charmsRoot.ward || {},
        miniauras: charmsRoot.miniaura || {},
        globalauras: charmsRoot.globalaura || {},
        aiDecks: dataset.aiDecks || {},
        statsByGear: dataset.statsByGear || {},
        hpTable: dataset.hpTable || {},
        manifest: dataset.manifest || {},
    };
}
