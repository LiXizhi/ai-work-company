import {prepareWordHand} from './word_cards_core.js';
import {validateHanziBattleSpec} from './hanzi_battle_core.js';
// combat_unit_core.js — 战斗单位状态与属性查询（对应 player_server.lua 的 Player 对象）。
// 单位不持有 DOM / 网络；所有随机经由传入的 rng。
import {
    baseMaxHp, applyHpStats, powerPipChanceByLevel, generatePip, canAffordCard, costPips,
    isOwnSchoolCost, arenaDamageBoost, absorbDamage,
} from './combat_formulas_core.js';
import { schoolFactor } from './combat_params_core.js';

/** 装备 stat id → 属性名与系（player_server.lua GetAccuracyBoost/GetDamageBoost/GetResist 注释） */
const STAT_ID_SCHOOL = ['all', 'fire', 'ice', 'storm', 'myth', 'life', 'death', 'balance'];
export function statIdToEntry(id) {
    id = Number(id);
    if (id === 101) return { stat: 'hpFlat', school: 'all' };
    if (id === 102) return { stat: 'powerPipPct', school: 'all' };
    if (id >= 103 && id <= 110) return { stat: 'accuracyPct', school: STAT_ID_SCHOOL[id - 103] };
    if (id >= 111 && id <= 118) return { stat: 'damagePct', school: STAT_ID_SCHOOL[id - 111] };
    if (id >= 119 && id <= 126) return { stat: 'resistPct', school: STAT_ID_SCHOOL[id - 119] };
    if (id >= 151 && id <= 158) return { stat: 'damageAbs', school: STAT_ID_SCHOOL[id - 151] };
    if (id >= 159 && id <= 166) return { stat: 'resistAbs', school: STAT_ID_SCHOOL[id - 159] };
    if (id >= 196 && id <= 203) return { stat: 'critPct', school: STAT_ID_SCHOOL[id - 196] };
    if (id >= 204 && id <= 211) return { stat: 'resiliencePct', school: STAT_ID_SCHOOL[id - 204] };
    if (id >= 212 && id <= 219) return { stat: 'penetration', school: STAT_ID_SCHOOL[id - 212] };
    if (id === 242) return { stat: 'hpPct', school: 'all' };
    if (id === 182) return { stat: 'outputHealPct', school: 'all' };
    if (id === 183) return { stat: 'inputHealPct', school: 'all' };
    if (id === 184) return { stat: 'startupNormal', school: 'all' };
    if (id === 185) return { stat: 'startupPower', school: 'all' };
    return null;
}

const SCHOOL_STATS = ['damagePct', 'damageAbs', 'resistPct', 'resistAbs', 'accuracyPct', 'critPct', 'resiliencePct', 'penetration'];
const SCALAR_STATS = ['penetrationReceive', 'hitPct', 'dodgePct', 'powerPipPct', 'outputHealPct', 'inputHealPct', 'hpPct', 'hpFlat', 'startupNormal', 'startupPower', 'critRatioBonus'];

/** 把用户给的部分属性补全为完整结构。按系属性可给数字（视为 all）或 {all, fire, ...} */
export function normalizeStats(partial = {}) {
    const stats = {};
    for (const name of SCHOOL_STATS) {
        const v = partial[name];
        if (typeof v === 'number') stats[name] = { all: v };
        else stats[name] = { ...(v || {}) };
    }
    for (const name of SCALAR_STATS) stats[name] = Number(partial[name] || 0);
    if(partial.magicStarHpPct)stats.magicStarHpPct=Number(partial.magicStarHpPct);
    return stats;
}

/**
 * player_server.lua GetStatsSum：装备属性 + standing ward 的 stats + 全场光环 aura2 的 stats
 * （unit._arena 由 arena 创建时注入，用于读取 resolved 模板与 aura2）
 */
function schoolStat(unit, name, school) {
    const table = unit.stats[name] || {};
    let v = (table.all || 0) + (school ? (table[school] || 0) : 0);
    const arena = unit._arena;
    if (arena) {
        const R = arena.resolved;
        for (const sw of unit.standingWards) {
            if (sw.rounds <= 0) continue;
            const tpl = R.wards[sw.id];
            if (tpl && tpl.stats) v += statsFromTemplate(tpl, name, school);
        }
        if (arena.aura2) {
            const tpl = R.globalauras[arena.aura2.id];
            if (tpl && tpl.stats) v += statsFromTemplate(tpl, name, school);
        }
    }
    return v;
}

/** 标量属性（powerPipPct 等）+ standing ward / aura2 附加 */
function scalarStat(unit, name) {
    let v = unit.stats[name] || 0;
    const arena = unit._arena;
    if (arena) {
        const R = arena.resolved;
        for (const sw of unit.standingWards) {
            if (sw.rounds <= 0) continue;
            const tpl = R.wards[sw.id];
            if (tpl && tpl.stats) v += statsFromTemplate(tpl, name, 'all');
        }
        if (arena.aura2) {
            const tpl = R.globalauras[arena.aura2.id];
            if (tpl && tpl.stats) v += statsFromTemplate(tpl, name, 'all');
        }
    }
    return v;
}

function statsFromTemplate(tpl, statName, school) {
    let sum = 0;
    for (const { id, value } of tpl._stats || (tpl._stats = parseMiniauraStats(tpl.stats))) {
        const e = statIdToEntry(id);
        if (!e || e.stat !== statName) continue;
        if (e.school === 'all' || e.school === school) sum += value;
    }
    return sum;
}

/**
 * 解析 miniaura 模板 stats 字符串 "(120,70)(104,20)" → [{id, value}]
 */
export function parseMiniauraStats(str) {
    const out = [];
    if (!str) return out;
    const re = /\((\d+)\s*,\s*(-?\d+)\)/g;
    let m;
    while ((m = re.exec(String(str)))) out.push({ id: Number(m[1]), value: Number(m[2]) });
    return out;
}

function miniauraStat(unit, resolved, statName, school) {
    if (!unit.miniaura || unit.miniaura.rounds <= 0) return 0;
    const tpl = resolved.miniauras[unit.miniaura.id];
    if (!tpl) return 0;
    let sum = 0;
    for (const { id, value } of tpl._stats || parseMiniauraStats(tpl.stats)) {
        const e = statIdToEntry(id);
        if (!e || e.stat !== statName) continue;
        if (e.school === 'all' || e.school === school) sum += value;
    }
    return sum;
}

// ---------------------------------------------------------------------------
// 创建
// ---------------------------------------------------------------------------

let unitAutoId = 1;

/**
 * @param spec { id?, name?, side, school, level, stats?, deck: [{key,count}] | string[], isBot?, policy?, tags? }
 * @param resolved resolveParams() 的结果
 */
export function createUnit(spec, resolved) {
    const version = resolved.version;
    const school = spec.school;
    const unit = {
        id: spec.id || `u${unitAutoId++}`,
        name: spec.name || `${school}-${spec.level}`,
        side: spec.side,
        slot: spec.slot ?? 0,
        school,
        level: spec.level || 1,
        isMob: false,
        isBot: spec.isBot !== false,
        policy: spec.policy || null,
        stats: normalizeStats(spec.stats),
        maxHp: 0,
        hp: 0,
        pips: { normal: 0, power: 0 },
        charms: [],
        wards: [],          // [{id, pts?}]  id=0 表示已弹出
        standingWards: [],  // [{id, rounds}]
        dots: [],
        hots: [],
        miniaura: null,
        stance: null,       // {name, rounds}
        stunned: false,
        cooldowns: {},
        remedy: { absoluteDefense: 0, deadlyAttack: 0 },
        deckSeq: [],
        deckMap: [],        // 0 未用 1 手牌 -1 弃 -2 已用 -3 失误
        picked: null,       // {cardKey, seq, targetId}
        hasStartupPips: false,
        turnsPlayed: 0,
        totals: { damageDealt: 0, healDone: 0, damageTaken: 0, casts: 0, fizzles: 0, passes: 0, noCardPasses: 0 },
    };
    if(spec.hanziBattle){validateHanziBattleSpec(spec.hanziBattle);unit.hanziBattle={...structuredClone(spec.hanziBattle),triggers:0};}
    unit.maxHp = computeMaxHp(unit, resolved);
    unit.hp = unit.maxHp;
    unit.deckCapacity = spec.deckCapacity ?? resolved.global.deckCapacity ?? 0;
    unit.deckEachCapacity = spec.deckEachCapacity ?? resolved.global.deckEachCapacity ?? 0;
    setDeck(unit, spec.deck || [], resolved);
    return unit;
}

/**
 * player_server.lua L1741-1815 GetUpdatedMaxHP + BalanceParams perSchool.hp 乘子 + fairPlay.maxHp
 */
export function computeMaxHp(unit, resolved) {
    const fair = resolved.fairPlay;
    if (fair && fair.maxHp && fair.maxHp[unit.school]) return Math.ceil(fair.maxHp[unit.school]);
    let hp = baseMaxHp(unit.school, unit.level, resolved.version);
    hp = Math.ceil(hp * (schoolFactor(resolved, unit.school).hp || 1));
    hp = applyHpStats(hp, unit.stats.hpPct, unit.stats.hpFlat, resolved.version);
    if(resolved.version==='kids'&&unit.stats.magicStarHpPct)hp=Math.ceil(hp*(100+unit.stats.magicStarHpPct)/100);
    return Math.max(1, hp);
}

/**
 * 设置卡组并按卡包容量裁剪（arena_server.lua L8022-8166 进入战斗时的 deck 校验）：
 *  - 单卡 count > deckEachCapacity → 截为上限（L8106）；teen 同 spell_name 共享上限（L8119）
 *  - 总数 > deckCapacity → Lua 直接清空整个卡组（L8156），模拟器改为按顺序保留前 capacity 张并记录 deckTrimmed
 * capacity / eachCapacity 为 0 或缺省表示不限制（mob 卡组）。
 */
export function setDeck(unit, deck, resolved) {
    const norm = [];
    for (const entry of deck) {
        if (typeof entry === 'string') norm.push({ key: entry, count: 1 });
        else if (entry && entry.key) norm.push({ key: entry.key, count: entry.count || 1 });
    }
    const { deck: clamped, trimmed } = clampDeck(norm, {
        capacity: unit.deckCapacity || 0,
        eachCapacity: unit.deckEachCapacity || 0,
        cards: resolved ? resolved.cards : null,
        version: resolved ? resolved.version : 'kids',
    });
    unit.deckSpec = clamped;
    unit.deckTrimmed = trimmed;
}

/**
 * 纯函数：按容量裁剪 [{key,count}]。
 * @param opts { capacity, eachCapacity, cards?: resolved.cards（teen 同名共享用）, version }
 * @return { deck: [{key,count}], trimmed: number（被裁掉的张数）, total }
 */
export function clampDeck(deck, opts = {}) {
    const capacity = opts.capacity || 0;
    const each = opts.eachCapacity || 0;
    const cards = opts.cards || {};
    const teen = opts.version === 'teen';
    const out = [];
    const byName = {};
    let total = 0, trimmed = 0;
    for (const { key, count } of deck) {
        let n = Math.max(0, count | 0);
        if (each > 0) {
            const card = cards[key];
            const groupKey = teen && card && card.spellName ? card.spellName : key;
            const used = byName[groupKey] || 0;
            const allow = Math.max(0, each - used);
            if (n > allow) { trimmed += n - allow; n = allow; }
            byName[groupKey] = used + n;
        }
        if (capacity > 0 && total + n > capacity) { trimmed += total + n - capacity; n = Math.max(0, capacity - total); }
        if (n > 0) {
            const prev = out.find(e => e.key === key);
            if (prev) prev.count += n; else out.push({ key, count: n });
            total += n;
        }
    }
    return { deck: out, trimmed, total };
}

export function deckSize(unit) {
    return unit.deckSpec.reduce((a, e) => a + e.count, 0);
}

// ---------------------------------------------------------------------------
// 属性查询（对应 Player:GetXxx）
// ---------------------------------------------------------------------------

/** player_server.lua L2231-2301 GetDamageBoost（百分比） */
export function getDamageBoost(unit, school, arena, resolved) {
    if (resolved.fairPlay && resolved.fairPlay.forceDamageBoost !== undefined && resolved.fairPlay.forceDamageBoost !== null) {
        return resolved.fairPlay.forceDamageBoost;
    }
    let stat = schoolStat(unit, 'damagePct', school);
    if (arena) stat += arenaDamageBoost(resolved.global.arenaDamageBoostPerRound, resolved.global.maxRounds, arena.remainingRounds);
    // BalanceParams.perSchool[school].damage：模拟器附加乘子，按施法者本系换算成百分比加成（1 = 原版）
    stat += Math.round(((schoolFactor(resolved, unit.school).damage || 1) - 1) * 100);
    return stat;
}

/** player_server.lua L2307+ GetDamageBoost_absolute */
export function getDamageBoostAbs(unit, school) {
    return schoolStat(unit, 'damageAbs', school);
}

/** player_server.lua L2406+ GetResist：返回负值（-R） */
export function getResist(unit, school, resolved) {
    if (resolved.fairPlay && resolved.fairPlay.forceResist !== undefined && resolved.fairPlay.forceResist !== null) {
        return -resolved.fairPlay.forceResist;
    }
    let stat = schoolStat(unit, 'resistPct', school) + (schoolFactor(resolved, unit.school).resist || 0);
    // player_server.lua L2465–2468; mob_server.lua L2081–2085.
    if (unit.freezeRounds > 0) stat = 100 - (100 - stat) * (100 - resolved.global.freezeResistPercent) / 100;
    return -stat;
}

/** player_server.lua L2476+ GetResist_absolute（返回负值） */
export function getResistAbs(unit, school) {
    return -schoolStat(unit, 'resistAbs', school);
}

/** player_server.lua L2171-2226 GetAccuracyBoost（含 miniaura 命中） */
export function getAccuracyBoost(unit, school, resolved) {
    if (resolved.fairPlay && resolved.fairPlay.forceAccuracyBoost !== undefined && resolved.fairPlay.forceAccuracyBoost !== null) {
        return resolved.fairPlay.forceAccuracyBoost;
    }
    return schoolStat(unit, 'accuracyPct', school) + miniauraStat(unit, resolved, 'accuracyPct', school)
        + (schoolFactor(resolved, unit.school).accuracy || 0);
}

/** player_server.lua L2605+ GetCriticalStrike */
export function getCriticalStrike(unit, school, resolved, arena) {
    return schoolStat(unit, 'critPct', school) + (schoolFactor(resolved, unit.school).crit || 0)
        // player_server.lua L2660-2686：kids 任一同侧单位持有 storm_kids 姿态 → 全队暴击 +20
        + (resolved.version === 'kids' && stanceSibling(unit, arena, 'storm_kids') ? 20 : 0);
}

/** player_server.lua L2715+ GetResilience */
export function getResilience(unit, school, resolved, arena) {
    return schoolStat(unit, 'resiliencePct', school)
        // player_server.lua L2759-2784：kids 任一同侧单位持有 death_kids 姿态 → 全队韧性 +20
        + (resolved && resolved.version === 'kids' && stanceSibling(unit, arena, 'death_kids') ? 20 : 0);
}

/** player_server.lua L2811+ GetHitChance（已换算为百分比） */
export function getHitChance(unit, resolved, arena) {
    return (unit.stats.hitPct || 0)
        // player_server.lua L2816-2840：kids 任一同侧单位持有 death_kids 姿态 → 全队命中 +10
        + (resolved && resolved.version === 'kids' && stanceSibling(unit, arena, 'death_kids') ? 10 : 0);
}

/** player_server.lua L2858+ GetDodge（已换算为百分比） */
export function getDodge(unit) {
    return unit.stats.dodgePct || 0;
}

/** player_server.lua L2908+ GetSpellPenetration */
export function getSpellPenetration(unit, school, resolved, arena) {
    return schoolStat(unit, 'penetration', school)
        // player_server.lua L2945-2969：kids 任一同侧单位持有 life_kids 姿态 → 全队穿透 +15
        + (resolved && resolved.version === 'kids' && stanceSibling(unit, arena, 'life_kids') ? 15 : 0);
}

/** player_server.lua L2975+ GetSpellPenetrationReceive */
export function getSpellPenetrationReceive(unit) {
    return unit.stats.penetrationReceive || 0;
}

/** player_server.lua L2988 / L3015 */
export function getOutputHealBoost(unit, resolved) {
    return (unit.stats.outputHealPct || 0) + Math.round(((schoolFactor(resolved, unit.school).heal || 1) - 1) * 100);
}
export function getInputHealBoost(unit, resolved, arena) {
    return (unit.stats.inputHealPct || 0)
        // player_server.lua L3045-3069：kids 任一同侧单位持有 death_kids 姿态 → 全队受到治疗效果 +30
        + (resolved && resolved.version === 'kids' && stanceSibling(unit, arena, 'death_kids') ? 30 : 0);
}

/** player_server.lua L2705-2711 GetCriticalStrikeDamageRatioBonus（stat 376，0.001/点）
 *  player_server.lua L3621-3641：kids 任一同侧单位持有 storm_kids 姿态 → stat376 +200（即 +0.2 暴击伤害比） */
export function getCriticalStrikeDamageRatioBonus(unit, resolved, arena) {
    return (unit.stats.critRatioBonus || 0)
        + (resolved && resolved.version === 'kids' && stanceSibling(unit, arena, 'storm_kids') ? 0.2 : 0);
}

/** kids 姿态同队判定：任一同侧存活单位（含自己）持有该姿态即生效（player_server.lua 各 Get* 的 friendlys 循环） */
function stanceSibling(unit, arena, name) {
    if (!arena || !arena.sides || !arena.sides[unit.side]) return false;
    for (const ally of arena.sides[unit.side]) {
        if (ally.stance && ally.stance.rounds > 0 && ally.stance.name === name) return true;
    }
    return false;
}

/** player_server.lua L2108-2166 GetPowerPipChance */
export function getPowerPipChance(unit, arena, resolved) {
    let bonus = 0;
    if (arena && arena.aura && arena.aura.boostPowerPip) bonus = arena.aura.boostPowerPip;
    const fair = resolved.fairPlay;
    const forced = fair && fair.forcePowerPipChance !== undefined && fair.forcePowerPipChance !== null;
    if (!forced) bonus += powerPipChanceByLevel(unit.level, resolved.version);
    bonus += miniauraStat(unit, resolved, 'powerPipPct', 'all');
    bonus += schoolFactor(resolved, unit.school).powerPip || 0;
    const base = scalarStat(unit, 'powerPipPct');
    if (forced) return base + fair.forcePowerPipChance + bonus;
    return base + bonus;
}

/** player_server.lua L4596-4655 GetOutputDamageFinalWeight（stance） */
export function getOutputDamageFinalWeight(unit, arena, resolved) {
    let weight = 1;
    const st = unit.stance && unit.stance.rounds > 0 ? unit.stance.name : null;
    if (st === 'defensive') weight = 0.75;
    else if (st === 'vampire') weight = 1 + (1 - unit.hp / unit.maxHp) / 2;
    else if (st === 'electric') weight = 1 + 0.22;
    else if (st === 'ice_kids') weight = 0.9;
    if (resolved.version === 'kids' && arena) {
        for (const ally of arena.sides[unit.side]) {
            if (ally.stance && ally.stance.rounds > 0 && ally.stance.name === 'fire_kids') { weight *= 1.15; break; }
        }
    }
    return weight;
}

/** player_server.lua L4658-4722 GetReceiveDamageFinalWeight（miniaura 抗性 + stance） */
export function getReceiveDamageFinalWeight(unit, school, resolved) {
    let weight = 1;
    const extra = miniauraStat(unit, resolved, 'resistPct', school);
    if (extra) {
        weight = weight * (100 - extra) / 100;
        if (weight < 0) weight = 0;
    }
    const st = unit.stance && unit.stance.rounds > 0 ? unit.stance.name : null;
    if (st === 'defensive') weight *= (1 - (resolved.version === 'teen' ? 0.3 : 0.25));
    else if (st === 'fire_kids' || st === 'storm_kids' || st === 'life_kids' || st === 'death_kids') weight *= 1.1;
    return weight;
}

// ---------------------------------------------------------------------------
// HP / pips
// ---------------------------------------------------------------------------

export function isAlive(unit) {
    return unit.hp > 0;
}

/** player_server.lua L3684-3757 TakeDamage：死亡时清空全部状态 */
export function takeDamage(unit, points) {
    points = Math.max(0, points || 0);
    unit.hp -= points;
    unit.totals.damageTaken += Math.min(points, points + Math.min(0, unit.hp));
    if (unit.hp <= 0) {
        unit.hp = 0;
        unit.dots = [];
        unit.hots = [];
        unit.charms = [];
        unit.wards = [];
        unit.standingWards = [];
        unit.miniaura = null;
        unit.stance = null;
        unit.stunned = false;
        if (unit.freezeRounds !== undefined) {
            unit.freezeRounds = 0; unit.antiFreezeRounds = 0; unit.antiFreezeSiblingRounds = 0;
        }
        // bWithGuardian survives death until Card.CheckGuardian revives the unit.
        if(unit.reflectAmount!==undefined)unit.reflectAmount=0;
        if(unit.stealth!==undefined){unit.stealth=false;unit.stealthRounds=null;}
        unit.pips.normal = 0;
        unit.pips.power = 0;
        unit.picked = null;
        unit.remedy.absoluteDefense = 0;
        unit.remedy.deadlyAttack = 0;
    }
}

/** player_server.lua L3766-3772 TakeHeal */
export function takeHeal(unit, points) {
    const before = unit.hp;
    unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, points || 0));
    return unit.hp - before;
}

/** player_server.lua L1831-1860 SetStartupPips */
export function setStartupPips(unit, resolved) {
    const maxPips = resolved.global.maxPips;
    let normal = (unit.stats.startupNormal || 0) + (resolved.global.startupPipsNormal || 0);
    let power = (unit.stats.startupPower || 0) + (resolved.global.startupPipsPower || 0);
    if (resolved.version === 'teen') { normal = power * 2 + normal; power = 0; }
    unit.pips.normal = Math.max(0, Math.min(maxPips, normal));
    unit.pips.power = Math.max(0, Math.min(maxPips, power));
    unit.hasStartupPips = true;
}

export function generateUnitPip(unit, arena, resolved, rng) {
    return generatePip(rng, unit.pips, getPowerPipChance(unit, arena, resolved), resolved.global.maxPips, resolved.version);
}

export function pipValue(unit) {
    return unit.pips.normal + unit.pips.power * 2;
}

export function canCast(unit, card, resolved) {
    if (!card) return false;
    const own = isOwnSchoolCost(card.spellSchool, unit.school, resolved.version);
    if (!canAffordCard(unit.pips, card.pipcost, own, resolved.version)) return false;
    if (card.type === 'Stance' && card.spellSchool !== unit.school && card.spellSchool !== 'balance') return false;
    if ((unit.cooldowns[card.spellName] || 0) > 0) return false;
    return true;
}

export function payCard(unit, card, resolved) {
    const own = isOwnSchoolCost(card.spellSchool, unit.school, resolved.version);
    return costPips(unit.pips, card.pipcost, own, resolved.version);
}

// ---------------------------------------------------------------------------
// charms / wards（player_server.lua L3774-4100）
// ---------------------------------------------------------------------------

export function appendCharm(unit, id) { unit.charms.push(Number(id)); }
export function appendWard(unit, id) { unit.wards.push({ id: Number(id) }); }
export function appendAbsorb(unit, pts, wardId) { unit.wards.push({ id: Number(wardId) || 0, pts: Number(pts) || 0, absorb: true }); }
export function appendStandingWard(unit, id, rounds) { unit.standingWards.push({ id: Number(id), rounds }); }

export function popCharm(unit, id) {
    for (let i = 0; i < unit.charms.length; i++) {
        if (unit.charms[i] === id) { unit.charms[i] = 0; return true; }
    }
    return false;
}

/** player_server.lua L3956-3977 PopWard：先看 standing wards（不消耗），再弹普通 ward */
export function popWard(unit, id) {
    for (const sw of unit.standingWards) {
        if (sw.id === id && sw.rounds > 0) return true;
    }
    for (const w of unit.wards) {
        if (w.id === id && !w.absorb) { w.id = 0; return true; }
    }
    return false;
}

function isPositive(tpl) {
    return tpl && (tpl.positive === true || tpl.positive === 'true');
}

export function hasPositiveCharm(unit, resolved) {
    return unit.charms.some(id => id > 0 && isPositive(resolved.charms[id]));
}
export function hasNegativeCharm(unit, resolved) {
    return unit.charms.some(id => id > 0 && resolved.charms[id] && !isPositive(resolved.charms[id]));
}

/**
 * player_server.lua L3898-3933 ProcessStatAgainstCharms：从后往前，每个 base id（id % 1000）只生效一次，
 * 系匹配（或 all / skipschool）则弹出并把数值加入 buffs
 */
export function processStatAgainstCharms(unit, resolved, buffs, statName, school, buffs2) {
    // Optional read-only presentation notifications preserve the exact consumption
    // order; they never add events, change buffs, or consume random numbers.
    const effected = {};
    for (let order = unit.charms.length - 1; order >= 0; order--) {
        const id = unit.charms[order];
        if (!id) continue;
        const tpl = resolved.charms[id];
        if (!tpl || tpl[statName] === undefined || tpl[statName] === null) continue;
        const baseId = id % 1000;
        if (effected[baseId]) continue;
        const tplSchool = String(tpl.school || 'all').toLowerCase();
        if (school === 'skipschool' || tplSchool === String(school).toLowerCase() || tplSchool === 'all') {
            unit.charms[order] = 0;
            unit._arena?.onStatusEffect?.({type:'effect_used',target:unit.id,kind:'charm',id,order});
            buffs.push(Number(tpl[statName]));
            if (buffs2) buffs2.push(Number(tpl[statName]));
            effected[baseId] = true;
        }
    }
    return school;
}

/**
 * player_server.lua L4001-4039 ProcessDamageAgainstWards：从后往前弹 boost_damage ward 与 prism ward
 * @return 最终 damage_school
 */
export function processDamageAgainstWards(unit, resolved, buffs, damageSchool) {
    const effected = {};
    for (let order = unit.wards.length - 1; order >= 0; order--) {
        const w = unit.wards[order];
        if (!w.id || w.absorb) continue;
        const tpl = resolved.wards[w.id];
        if (!tpl) continue;
        const baseId = w.id % 1000;
        if (tpl.boost_damage !== undefined && tpl.boost_damage !== null) {
            if (effected[baseId]) continue;
            const tplSchool = String(tpl.school || 'all').toLowerCase();
            if (tplSchool === String(damageSchool).toLowerCase() || tplSchool === 'all') {
                const id=w.id;
                w.id = 0;
                unit._arena?.onStatusEffect?.({type:'effect_used',target:unit.id,kind:'ward',id,order});
                buffs.push(Number(tpl.boost_damage));
                effected[baseId] = true;
            }
        } else if (tpl.prism_from && tpl.prism_to) {
            if (String(tpl.prism_from).toLowerCase() === String(damageSchool).toLowerCase()) {
                const id=w.id;
                w.id = 0;
                unit._arena?.onStatusEffect?.({type:'effect_used',target:unit.id,kind:'ward',id,order});
                damageSchool = String(tpl.prism_to).toLowerCase();
            }
        }
    }
    return damageSchool;
}

/** 弹出 heal ward（card_server.lua SingleHeal 分支：wards.boost_heal） */
export function processHealAgainstWards(unit, resolved, buffs) {
    for (let order = unit.wards.length - 1; order >= 0; order--) {
        const w = unit.wards[order];
        if (!w.id || w.absorb) continue;
        const tpl = resolved.wards[w.id];
        if (tpl && tpl.boost_heal !== undefined && tpl.boost_heal !== null) {
            const id=w.id;
            w.id = 0;
            unit._arena?.onStatusEffect?.({type:'effect_used',target:unit.id,kind:'ward',id,order});
            buffs.push(Number(tpl.boost_heal));
        }
    }
}

/** card_server.lua L1265-1283 AbsorbDamage */
export function absorbUnitDamage(unit, damage) {
    const layers = unit.wards.filter(w => w.absorb && w.pts > 0);
    damage = absorbDamage(layers, damage, unit._arena?.onStatusEffect
        ? layer=>unit._arena.onStatusEffect({type:'effect_used',target:unit.id,kind:'ward',id:layer.id})
        : null);
    for (const w of unit.wards) if (w.absorb && w.pts <= 0) w.id = 0;
    return damage;
}

/** player_server.lua L4985+ IfHasShield：是否持有对该系（或 all）的负 boost_damage ward */
export function ifHasShield(unit, resolved, school, skipGlobal = false) {
    for (const w of unit.wards) {
        if (!w.id || w.absorb) continue;
        const tpl = resolved.wards[w.id];
        if (!tpl || tpl.boost_damage === undefined || Number(tpl.boost_damage) >= 0) continue;
        const s = String(tpl.school || 'all').toLowerCase();
        if (school == null) { if (s === 'all') return true; continue; }
        if (s === school) return true;
        if (!skipGlobal && s === 'all') return true;
    }
    return false;
}

export function hasWard(unit, id) {
    return unit.wards.some(w => w.id === id) || unit.standingWards.some(s => s.id === id && s.rounds > 0);
}

export function popRandomCharm(unit, resolved, rng, onlyPositive) {
    const idx = [];
    unit.charms.forEach((id, i) => {
        if (id <= 0) return;
        const tpl = resolved.charms[id];
        if (onlyPositive === true && !isPositive(tpl)) return;
        if (onlyPositive === false && isPositive(tpl)) return;
        idx.push(i);
    });
    if (!idx.length) return null;
    const i = idx[rng.int(0, idx.length - 1)];
    const id = unit.charms[i];
    unit.charms[i] = 0;
    return id;
}

export function popRandomWard(unit, resolved, rng, onlyPositive) {
    const idx = [];
    unit.wards.forEach((w, i) => {
        if (w.id <= 0 || w.absorb) return;
        const tpl = resolved.wards[w.id];
        if (!tpl || tpl.can_manipulate === false || tpl.can_manipulate === 'false') return;
        if (onlyPositive === true && !isPositive(tpl)) return;
        if (onlyPositive === false && isPositive(tpl)) return;
        idx.push(i);
    });
    if (!idx.length) return null;
    const i = idx[rng.int(0, idx.length - 1)];
    const id = unit.wards[i].id;
    unit.wards[i].id = 0;
    return id;
}

/** player_server.lua L4255-4293 PopAllNegativeEffects */
export function popAllNegativeEffects(unit, resolved) {
    unit.charms = unit.charms.map(id => (id > 0 && resolved.charms[id] && !isPositive(resolved.charms[id])) ? 0 : id);
    for (const w of unit.wards) {
        if (w.id > 0 && !w.absorb) {
            const tpl = resolved.wards[w.id];
            if (tpl && tpl.can_manipulate !== false && !isPositive(tpl)) w.id = 0;
        }
    }
    for (const sw of unit.standingWards) {
        const tpl = resolved.wards[sw.id];
        if (tpl && !isPositive(tpl)) sw.rounds = 0;
    }
    unit.dots = [];
}

/** Deck_Attacker 条件用：统计某类 charm 数量（card_server.lua GetSpecificCharmCount 语义近似） */
export function countCharms(unit, resolved, kind, school) {
    let n = 0;
    for (const id of unit.charms) {
        if (id <= 0) continue;
        const tpl = resolved.charms[id];
        if (!tpl) continue;
        const s = String(tpl.school || 'all').toLowerCase();
        const schoolOk = !school || s === school || s === 'all';
        if (kind === 'damageboost' && Number(tpl.boost_damage) > 0 && schoolOk) n++;
        else if (kind === 'damageweakness' && Number(tpl.boost_damage) < 0 && schoolOk) n++;
        else if (kind === 'healboost' && Number(tpl.boost_heal) > 0) n++;
        else if (kind === 'healweakness' && Number(tpl.boost_heal) < 0) n++;
    }
    return n;
}

export function countWards(unit, resolved, kind, school) {
    let n = 0;
    for (const w of unit.wards) {
        if (w.id <= 0 || w.absorb) continue;
        const tpl = resolved.wards[w.id];
        if (!tpl) continue;
        const s = String(tpl.school || 'all').toLowerCase();
        const schoolOk = !school || s === school || s === 'all';
        if (kind === 'damagetrap' && Number(tpl.boost_damage) > 0 && schoolOk) n++;
        else if (kind === 'shield' && Number(tpl.boost_damage) < 0 && schoolOk) n++;
    }
    return n;
}

// ---------------------------------------------------------------------------
// DOT / HOT（player_server.lua L4154-4253）
// ---------------------------------------------------------------------------

export function appendDoT(unit, sequence) { if (sequence) unit.dots.push(sequence); }
export function appendHoT(unit, sequence) { if (sequence) unit.hots.push(sequence); }

/** PopDoT：每个序列从尾部取一段；负值（爆炸标记）优先 */
export function popDoT(unit) {
    const applied = [];
    const take = (pred) => {
        for (const seq of unit.dots) {
            const last = seq.ticks[seq.ticks.length - 1];
            if (last && pred(last.dmg)) {
                seq.ticks.pop();
                applied.push({
                    damageSchool: last.damageSchool || seq.damageSchool,
                    buffsTarget: seq.buffsTarget,
                    damageBoostAbs: last.damageBoostAbs ?? seq.damageBoostAbs,
                    spellPenetration: last.spellPenetration ?? seq.spellPenetration,
                    outputWeight: seq.outputWeight,
                    casterId: seq.casterId,
                    damage: last.dmg,
                    critical: last.critical,
                    cardKey: seq.cardKey,
                });
            }
        }
    };
    take(d => d < 0);
    take(d => d >= 0);
    unit.dots = unit.dots.filter(seq => seq.ticks.length > 0);
    return applied;
}

export function popHoT(unit) {
    const applied = [];
    for (const seq of unit.hots) {
        if (seq.ticks.length > 0) {
            applied.push({ heal: seq.ticks.pop(), casterId: seq.casterId, cardKey: seq.cardKey });
        }
    }
    unit.hots = unit.hots.filter(seq => seq.ticks.length > 0);
    return applied;
}

export function dotRoundsRemaining(unit) {
    return unit.dots.reduce((m, s) => Math.max(m, s.ticks.length), 0);
}
export function hotRoundsRemaining(unit) {
    return unit.hots.reduce((m, s) => Math.max(m, s.ticks.length), 0);
}

// ---------------------------------------------------------------------------
// 卡组 / 手牌（player_server.lua L743-770 ShuffleDeck, L803-853 PrepareCard/GetCardsInHand, L1952-1975 冷却/弃牌）
// ---------------------------------------------------------------------------

export function shuffleDeck(unit, rng) {
    const singles = [];
    for (const { key, count } of unit.deckSpec) {
        for (let i = 0; i < count; i++) singles.push({ key, weight: rng.int(1, 999999) });
    }
    singles.sort((a, b) => b.weight - a.weight);
    unit.deckSeq = singles.map(s => s.key);
    unit.deckMap = singles.map(() => 0);
}

/** 补牌到 handSize（默认 8） */
export function prepareCard(unit, handSize = 8) {
    if(unit.wordCards)return prepareWordHand(unit,handSize);
    let inHand = 0;
    for (let i = 0; i < unit.deckMap.length; i++) {
        const st = unit.deckMap[i];
        if (st === 1) inHand++;
        else if (st === 0 && inHand < handSize) { unit.deckMap[i] = 1; inHand++; }
        if (inHand >= handSize) break;
    }
}

export function cardsInHand(unit) {
    const out = [];
    for (let i = 0; i < unit.deckMap.length; i++) {
        if (unit.deckMap[i] === 1) out.push({ seq: i, key: unit.deckSeq[i] });
    }
    return out;
}

// player_server.lua ShuffleFollowPetCards L773-800, GetCardsInHand L829-853:
// a separate, fully available pet pile; it never occupies normal hand slots.
// Lua uses seq >= 10000 for pet picks (HasCard / UseCard L5253-5267, L5332-5335).
export const PET_CARD_SEQ_BASE = 10000;
export function preparePetCards(unit, deck, rng) {
    const singles=[];
    for(const {key,count} of deck)for(let i=0;i<count;i++)singles.push({key,weight:rng.int(1,999999)});
    singles.sort((a,b)=>b.weight-a.weight);
    unit.petDeckSeq=singles.map(row=>row.key);
    unit.petDeckMap=singles.map(()=>1);
}
export function petCardsInHand(unit) {
    return (unit.petDeckSeq||[]).flatMap((key,i)=>unit.petDeckMap[i]===1?[{seq:PET_CARD_SEQ_BASE+i,key}]:[]);
}
export function selectableCards(unit) { return [...cardsInHand(unit),...petCardsInHand(unit)]; }

export function deckRemaining(unit) {
    return unit.deckMap.filter(s => s === 0 || s === 1 || s === -1).length;
}

/**
 * player_server.lua L855-884 GetDeckRemainingAndTotalCount 的细分版：
 * remaining = 手牌 + 待弃 + 未抽；total 不含失误补入的 -3 占位。
 */
export function deckCounts(unit) {
    const c = { inHand: 0, discarding: 0, unused: 0, used: 0, fizzled: 0, remaining: 0, total: 0 };
    for (const st of unit.deckMap) {
        if (st === 1) c.inHand++;
        else if (st === -1) c.discarding++;
        else if (st === 0) c.unused++;
        else if (st === -2) c.used++;
        else if (st === -3) { c.fizzled++; continue; }
        c.total++;
    }
    c.remaining = c.inHand + c.discarding + c.unused;
    return c;
}

/** 卡包耗尽：没有手牌也没有可抽的牌 */
export function isDeckExhausted(unit) {
    return deckRemaining(unit) === 0;
}

/** player_server.lua L914-930 RestoreDiscardedCard：撤销弃牌标记 */
export function restoreDiscardedCard(unit, seq) {
    if (unit.deckMap[seq] === -1) unit.deckMap[seq] = 1;
}

export function markCardUsed(unit, seq) {
    if(seq>=PET_CARD_SEQ_BASE){
        const i=seq-PET_CARD_SEQ_BASE;
        if(unit.petDeckMap?.[i]===1)unit.petDeckMap[i]=-1;
        return;
    }
    if (unit.deckMap[seq] === 1) unit.deckMap[seq] = -2;
}

/** 失误：Lua 标记 -3 并把同卡追加到卡尾（可再抽到） */
export function markCardFizzled(unit, seq) {
    // player_server.lua UseCard L5379-5390: only normal cards move to the tail;
    // a fizzled pet card remains available in its separate pile.
    if(unit.wordCards?.[seq]){markCardUsed(unit,seq);return;}
    if(seq>=PET_CARD_SEQ_BASE)return;
    if (unit.deckMap[seq] === 1) {
        unit.deckMap[seq] = -3;
        unit.deckSeq.push(unit.deckSeq[seq]);
        unit.deckMap.push(0);
    }
}

export function discardCard(unit, seq) {
    if (unit.deckMap[seq] === 1) unit.deckMap[seq] = -1;
}

/** player_server.lua L1962+ ValidateDiscardedCards：弃牌变为已用 */
export function validateDiscardedCards(unit) {
    for (let i = 0; i < unit.deckMap.length; i++) if (unit.deckMap[i] === -1) unit.deckMap[i] = -2;
}

export function setCooldown(unit, spellName, rounds) {
    if (rounds > 0) unit.cooldowns[spellName] = rounds;
}

/** player_server.lua L1952-1959 ValidateCoolDown */
export function validateCooldown(unit) {
    for (const k of Object.keys(unit.cooldowns)) if (unit.cooldowns[k] > 0) unit.cooldowns[k] -= 1;
}

/** ValidateMiniAura / ValidateStandingEffects / ValidateStance / ValidateProtectRounds */
export function validateRounds(unit) {
    for (const key of ['freezeRounds', 'antiFreezeRounds', 'antiFreezeSiblingRounds']) if (unit[key] > 0) unit[key]--;
    if(unit.stealthRounds>0&&--unit.stealthRounds===0){unit.stealth=false;unit.stealthRounds=null;}
    if (unit.miniaura) {
        unit.miniaura.rounds -= 1;
        if (unit.miniaura.rounds <= 0) unit.miniaura = null;
    }
    for (const sw of unit.standingWards) if (sw.rounds > 0) sw.rounds -= 1;
    unit.standingWards = unit.standingWards.filter(sw => sw.rounds > 0);
    if (unit.stance) {
        unit.stance.rounds -= 1;
        if (unit.stance.rounds <= 0) unit.stance = null;
    }
    if (unit.remedy.absoluteDefense > 0) unit.remedy.absoluteDefense -= 1;
    if (unit.remedy.deadlyAttack > 0) unit.remedy.deadlyAttack -= 1;
}

/** 状态摘要（UI / 事件流用） */
export function summarizeUnit(unit, resolved) {
    return {
        id: unit.id, name: unit.name, side: unit.side, slot: unit.slot, school: unit.school, level: unit.level,
        hp: unit.hp, maxHp: unit.maxHp, pips: { ...unit.pips }, stunned: unit.stunned,
        ...Object.fromEntries(['freezeRounds','antiFreezeRounds','antiFreezeSiblingRounds','guardian','enragedBy'].filter(key=>unit[key]!==undefined).map(key=>[key,unit[key]])),
        charms: unit.charms.filter(id => id > 0).map(id => ({ id, ...(resolved.charms[id] || {}) })),
        wards: unit.wards.filter(w => w.id > 0).map(w => ({ id: w.id, pts: w.pts, ...(resolved.wards[w.id] || {}) })),
        standingWards: unit.standingWards.filter(s => s.rounds > 0).map(s => ({ ...s })),
        dots: dotRoundsRemaining(unit), hots: hotRoundsRemaining(unit),
        dotList: unit.dots.map(d => ({ cardKey: d.cardKey, school: d.damageSchool, ticks: d.ticks.slice().reverse().map(t => Math.abs(t.dmg)) })),
        hotList: unit.hots.map(d => ({ cardKey: d.cardKey, ticks: d.ticks.slice().reverse() })),
        miniaura: unit.miniaura ? { ...unit.miniaura, ...(resolved.miniauras && resolved.miniauras[unit.miniaura.id] ? { desc: resolved.miniauras[unit.miniaura.id].desc } : {}) } : null,
        stance: unit.stance ? { ...unit.stance } : null,
        cooldowns: Object.fromEntries(Object.entries(unit.cooldowns).filter(([, v]) => v > 0)),
        deck: deckCounts(unit),
        deckCapacity: unit.deckCapacity, deckTrimmed: unit.deckTrimmed || 0,
        isBot: unit.isBot,
    };
}
