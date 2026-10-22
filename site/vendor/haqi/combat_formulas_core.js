// combat_formulas_core.js — 战斗核心公式，逐函数对照 Lua 源码（script/apps/Aries/Combat/ServerObject/）。
// 全部为纯函数；随机数由调用方传入 rng（rng_core.js）。
// version: 'kids' | 'teen'

/**
 * card_server.lua L1454-1460 above_min_boost
 * boost + 100，下限 50
 */
export function aboveMinBoost(boost) {
    boost = (boost || 0) + 100;
    if (boost > 50) return boost;
    return 50;
}

/**
 * card_server.lua L1473-1516 damage_expression
 * @param base 基础伤害
 * @param boostAbs 绝对加成（caster damage_absolute + target resist_absolute）
 * @param buffs { list: number[], damagePercent, resistPercent, spellPenetration, spellPenetrationReceive }
 *        list = charm/ward/aura 百分比列表（Lua 中 buffs 的数组部分）
 *        resistPercent 为负值表示抗性（Lua GetResist 返回 -R）
 * @param version
 * @param maxSpellPenetration card_server.lua L69 MAX_SPELL_PENETRATION = 70
 */
export function damageExpression(base, boostAbs, buffs, version, maxSpellPenetration = 70) {
    let damage = base;
    const list = buffs.list || [];
    const damagePercent = buffs.damagePercent || 0;
    let resistPercent = buffs.resistPercent || 0;
    let spellPenetration = buffs.spellPenetration || 0;
    const spellPenetrationReceive = buffs.spellPenetrationReceive || 0;

    if (version === 'kids') {
        damage = damage * (aboveMinBoost(boostAbs) / 100);
        if (spellPenetration > maxSpellPenetration) spellPenetration = maxSpellPenetration;
        resistPercent = Math.ceil(resistPercent * (100 - spellPenetration - spellPenetrationReceive) / 100);
        for (const boost of list) {
            damage = Math.ceil(damage * (100 + boost) / 100);
        }
        damage = Math.ceil(damage * (100 + damagePercent) / 100);
        damage = Math.ceil(damage * (100 + resistPercent) / 100);
    } else {
        damage = damage * (aboveMinBoost(boostAbs) / 100);
        let buffBonus = 0;
        for (const boost of list) {
            if (boost > 0) buffBonus += boost;
        }
        for (const boost of list) {
            if (boost < 0) damage = damage * (100 + boost) / 100;
        }
        damage = Math.ceil(damage * (100 + buffBonus) / 100);
        damage = Math.ceil(damage * (100 + damagePercent) / 100);
        damage = Math.ceil(damage * (100 + resistPercent) / 100);
    }
    return damage;
}

/**
 * card_server.lua L1522-1543 heal_expression
 * @param buffList 输出/输入治疗加成、charm、ward、全局光环 百分比列表
 */
export function healExpression(base, buffList, version) {
    let heal = base;
    if (version === 'kids') {
        for (const boost of buffList) heal = Math.ceil(heal * (100 + boost) / 100);
    } else {
        for (const boost of buffList) heal = heal * (100 + boost) / 100;
        if (heal <= 0) heal = 1;
    }
    return heal;
}

/**
 * card_server.lua L1548+ process_heal_penalty
 */
export function applyHealPenalty(heal, healPenalty) {
    if (!healPenalty) return heal;
    return Math.ceil(heal * (100 - healPenalty) / 100);
}

/**
 * card_server.lua L1310-1338 TryCriticalStrike
 * ret = clamp(crit - resilience + baseCrit, 0, 100); random(0,1000) <= ret*10
 */
export function tryCriticalStrike(rng, critPercent, resiliencePercent, baseCrit = 0) {
    let ret = (critPercent || 0) - (resiliencePercent || 0) + (baseCrit || 0);
    if (ret < 0) ret = 0;
    else if (ret > 100) ret = 100;
    // Optional analysis hook integrates this discrete Lua roll without changing live RNG.
    if (rng.probability) return rng.probability((Math.floor(ret * 10) + 1) / 1001);
    const r = rng.int(0, 1000);
    return r <= ret * 10;
}

/**
 * card_server.lua L1462-1467 GetCriticalStrikeDamageRatio
 */
export function critDamageRatio(baseRatio, bonus = 0) {
    return baseRatio + (bonus || 0);
}

/**
 * card_server.lua L1397-1452 TryDodge
 * @param ctx { hitChance, dodge, baseHit, casterLevel, targetLevel, targetIsMob, hitCharmBuffs: number[] }
 * @return true 表示被闪避
 * teen：hit = base + hit - dodge + (casterLv - targetLv) * (targetIsMob ? 5 : 1)
 * kids：hit = base + hit - dodge
 * clamp：<0 → 0；>=100 → 101；random(1,10000) <= hit*100 命中
 */
export function tryDodge(rng, ctx, version) {
    const base = ctx.baseHit ?? 100;
    let hitWeight = 100;
    if (version === 'teen') {
        const levelTerm = ((ctx.casterLevel || 0) - (ctx.targetLevel || 0)) * (ctx.targetIsMob ? 5 : 1);
        hitWeight = (base + (ctx.hitChance || 0) - (ctx.dodge || 0)) + levelTerm;
    } else if (version === 'kids') {
        hitWeight = base + (ctx.hitChance || 0) - (ctx.dodge || 0);
    }
    if (hitWeight < 0) hitWeight = 0;
    else if (hitWeight >= 100) hitWeight = 100 + 1;
    for (const w of ctx.hitCharmBuffs || []) hitWeight += w;
    if (rng.probability) return !rng.probability(Math.max(0, Math.min(1, Math.floor(hitWeight * 100) / 10000)));
    const r = rng.int(1, 10000);
    if (r <= hitWeight * 100) return false;
    return true;
}

/**
 * card_server.lua L2514-2560 accuracy / fizzle
 * accuracy = template.accuracy + Σ accuracy charms + caster accuracy boost；random(0,100) > accuracy → fizzle
 * @return true 表示法术失误
 */
export function rollFizzle(rng, accuracy) {
    if (rng.probability) return !rng.probability(Math.max(0, Math.min(1, (Math.floor(accuracy) + 1) / 101)));
    const r = rng.int(0, 100);
    return r > accuracy;
}

/**
 * player_server.lua L1741-1786 GetUpdatedMaxHP 基础曲线（未含装备 stat242/101 与 VIP）
 * kids：level 1→50 线性插值；teen：线性
 */
export function baseMaxHp(school, level, version) {
    const L = level;
    let hp;
    if (version === 'teen') {
        switch (school) {
            case 'fire': hp = Math.ceil(36 * (L - 1) + 450); break;
            case 'ice': hp = Math.ceil(48 * (L - 1) + 600); break;
            case 'storm': hp = Math.ceil(34 * (L - 1) + 425); break;
            case 'life': hp = Math.ceil(42 * (L - 1) + 540); break;
            case 'death': hp = Math.ceil(40 * (L - 1) + 500); break;
            default: hp = Math.ceil(34 * (L - 1) + 425);
        }
    } else {
        switch (school) {
            case 'fire': hp = Math.ceil((1500 - 415) * (L - 1) / 49 + 415); break;
            case 'ice': hp = Math.ceil((2025 - 500) * (L - 1) / 49 + 500); break;
            case 'storm': hp = Math.ceil((1200 - 400) * (L - 1) / 49 + 400); break;
            case 'life': hp = Math.ceil((1800 - 460) * (L - 1) / 49 + 460); break;
            case 'death': hp = Math.ceil((1650 - 450) * (L - 1) / 49 + 450); break;
            default: hp = Math.ceil((1200 - 400) * (L - 1) / 49 + 400);
        }
    }
    return hp;
}

/**
 * player_server.lua L1788-1813：装备 HP% (stat 242) 与 HP 固定值 (stat 101)
 * kids：hp += hp * 3.14 * pct / 100；teen：hp *= (100 + pct) / 100；最后 + flat
 */
export function applyHpStats(baseHp, hpPercentStat, hpFlatStat, version) {
    let hp = baseHp;
    if (version === 'kids') hp = Math.ceil(hp + hp * 3.14 * (hpPercentStat || 0) / 100);
    else hp = Math.ceil(hp * (100 + (hpPercentStat || 0)) / 100);
    return hp + (hpFlatStat || 0);
}

/**
 * player_server.lua L2137-2146 GetPowerPipChance 等级部分
 * kids：level<10 → 0，否则 floor((40-10)*(level-10)/40 + 10)；teen：level/2
 */
export function powerPipChanceByLevel(level, version) {
    if (version === 'teen') return level / 2;
    if (level < 10) return 0;
    return Math.floor((40 - 10) * (level - 10) / 40 + 10);
}

/**
 * player_server.lua L1980-2002 GeneratePip
 * @param pips { normal, power } 原地修改
 * @return 'power' | 'normal'
 */
export function generatePip(rng, pips, powerPipChance, maxPips, version) {
    const power = rng.probability ? rng.probability(Math.max(0, Math.min(1, Math.floor(powerPipChance) / 100))) : rng.int(1, 100) <= powerPipChance;
    if (power) {
        if (version === 'teen') {
            pips.normal += 2;
            if (pips.normal + pips.power > maxPips) pips.normal = maxPips - pips.power;
        } else {
            pips.power += 1;
            if (pips.normal + pips.power > maxPips) pips.power = maxPips - pips.normal;
        }
        return 'power';
    }
    pips.normal += 1;
    if (pips.normal + pips.power > maxPips) pips.normal = maxPips - pips.power;
    return 'normal';
}

/**
 * 是否按“本系”计费：player_server.lua L2014 —— school == 自身系，或 teen 版的 balance
 */
export function isOwnSchoolCost(cardSchool, unitSchool, version) {
    return cardSchool === unitSchool || (cardSchool === 'balance' && version === 'teen');
}

/**
 * player_server.lua L1908-1931 可出牌判定
 * 本系卡：pipcost <= normal + power*2；teen 他系卡：pipcost*2 <= normal + power；kids 他系卡：pipcost <= normal + power
 */
export function canAffordCard(pips, pipcost, ownSchool, version) {
    if (pipcost < 0) return true; // X 费卡
    if (ownSchool) return pipcost <= pips.normal + pips.power * 2;
    if (version === 'teen') return pipcost * 2 <= pips.normal + pips.power;
    return pipcost <= pips.normal + pips.power;
}

/**
 * player_server.lua L2007-2091 CostPips
 * 本系：每 2 费优先扣 1 颗 power，否则扣 normal；末位 1 费先扣 normal 再扣 power
 * teen 他系：每 1 费扣 2 normal（只剩 1 normal 时算半费），否则扣 1 power
 * kids 他系：全部按 normal 扣，不足部分扣 power
 * @param pips {normal, power} 原地修改
 * @return realcost 实际消耗（X 费卡用）
 */
export function costPips(pips, pipcost, ownSchool, version) {
    let realcost = 0;
    let count = pipcost;
    if (count < 0) count = -count;
    if (ownSchool) {
        while (count > 0) {
            if (count >= 2) {
                if (pips.power > 0) { pips.power -= 1; count -= 2; realcost += 2; }
                else if (pips.normal > 0) { pips.normal -= 1; count -= 1; realcost += 1; }
                else { pips.normal -= 1; count -= 1; }
            } else {
                if (pips.normal > 0) { pips.normal -= 1; count -= 1; realcost += 1; }
                else if (pips.power > 0) { pips.power -= 1; count -= 1; realcost += 1; }
                else { pips.power -= 1; count -= 1; }
            }
        }
    } else if (version === 'teen') {
        while (count > 0) {
            if (pips.normal >= 2) { pips.normal -= 2; count -= 1; realcost += 1; }
            else if (pips.normal === 1) { pips.normal -= 1; count -= 1; realcost += 0.5; }
            else if (pips.power > 0) { pips.power -= 1; count -= 1; realcost += 1; }
            else { pips.normal -= 2; count -= 1; }
        }
    } else {
        if (count <= pips.normal) {
            pips.normal -= count;
            realcost += count;
        } else {
            realcost += Math.min(pips.power, count - pips.normal);
            pips.power -= (count - pips.normal);
            realcost += pips.normal;
            pips.normal = 0;
        }
    }
    if (pips.power < 0) pips.power = 0;
    if (pips.normal < 0) pips.normal = 0;
    return realcost;
}

/**
 * arena_server.lua L1403-1418 GetArenaDamageBoost（free_pvp）
 * kids：perRound * floor((maxRounds - remainingRounds) / 2)，perRound 默认 4（全生命系 2，3v3 排位 8）
 * teen：仅 bIncreasingDamage 时 2；默认 0
 */
export function arenaDamageBoost(perRound, maxRounds, remainingRounds) {
    if (!perRound) return 0;
    return perRound * Math.floor((maxRounds - remainingRounds) / 2);
}

/**
 * card_server.lua L1265-1283 AbsorbDamage：依序消耗 absorb 层
 * @param absorbs [{pts}] 原地修改（pts 归零的层由调用方清理）
 */
export function absorbDamage(absorbs, damage, onLayer = null) {
    for (const layer of absorbs) {
        if (layer.pts <= 0) continue;
        if (damage - layer.pts >= 0) {
            damage -= layer.pts;
            layer.pts = 0;
            onLayer?.(layer);
        } else {
            layer.pts -= damage;
            damage = 0;
            onLayer?.(layer);
            break;
        }
    }
    return damage;
}

/**
 * teen 命中/闪避评级换算（player_server.lua L1416-1421 注释）：rating / (level*50 + 50) + flat%
 */
export function ratingToPercent(rating, level, flatPercent = 0) {
    return (rating || 0) / (level * 50 + 50) + (flatPercent || 0);
}

/** Combat/main.lua GetGearScoreV2 L581–611, GetPowerPipChance L1410–1440.
 * Five schools only, highest attack, average resistance, ceil once at the end.
 * Monster callers supply their explicit power-pip chance, without player level bonus.
 */
export function gearScoreV2(spec,version='kids',powerPipChance=null){
    const stats=spec.stats||{},schools=['fire','ice','storm','life','death'];
    const value=(name,school)=>typeof stats[name]==='number'?stats[name]:(stats[name]?.all||0)+(stats[name]?.[school]||0);
    const pip=powerPipChance??(powerPipChanceByLevel(spec.level||1,version)+(stats.powerPipPct||0));
    const attack=Math.max(...schools.map(s=>(100+value('damagePct',s))*(1+value('damageAbs',s)/100)));
    const resist=schools.reduce((sum,s)=>sum+value('resistPct',s),0)/5;
    const absolute=schools.reduce((sum,s)=>sum+value('resistAbs',s),0)/5;
    return Math.ceil(pip+attack+100/(1-resist/100)*(1+absolute/100));
}
