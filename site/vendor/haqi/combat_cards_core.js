import {triggerHanziCard} from './hanzi_battle_core.js';
// combat_cards_core.js — 卡牌效果处理器（对应 card_server.lua Card.UseCard 内各 template.type 分支）。
// 入口 useCard(arena, caster, card, target)；每个分支的 Lua 行号见 docs/lua-mapping.md。
// 未实现的 type 通过 registerUnsupported 记录到 arena.unsupported，并按 Pass 处理。
import {
    damageExpression, healExpression, applyHealPenalty, tryCriticalStrike, tryDodge, rollFizzle, critDamageRatio,
} from './combat_formulas_core.js';
import * as U from './combat_unit_core.js';
import {tauntThreat} from './combat_threat_core.js';
import {canEnrageTarget, enrageTarget} from './combat_enrage_core.js';

/** card_server.lua L1246-1263 GetNumericalValueFromSection：数字或 "600p"（每费） */
export function numericFromSection(section, realcost) {
    if (section === undefined || section === null || section === '') return 0;
    const n = Number(section);
    if (!Number.isNaN(n)) return n;
    const m = /^(\d+)p$/.exec(String(section).trim());
    if (m) return Number(m[1]) * (realcost || 0);
    return 0;
}

function splitList(str) {
    if (str === undefined || str === null) return [];
    return String(str).split(',').map(s => s.trim()).filter(s => s !== '');
}

function emit(arena, ev) {
    ev.turn = arena.turn;
    if(arena.wordCardCast&&arena.wordCardCast.caster===ev.caster&&arena.wordCardCast.baseCardKey===ev.card){ev.wordCardId=arena.wordCardCast.id;ev.wordCardText=arena.wordCardCast.readText;ev.wordCardSeq=arena.wordCardCast.seq;}
    arena.events.push(ev);
    if (arena.onEvent) arena.onEvent(ev);
}

// ---------------------------------------------------------------------------
// 目标选择
// ---------------------------------------------------------------------------

/** 卡牌目标类型：hostile（默认） / friendly / self / all */
export function cardTargetKind(card) {
    const t = card.type;
    if (card.target) return card.target;
    if (/^Single(Heal|Cleanse|Stealth|Guardian)|^Area(Heal|Cleanse|Ward|Absorb|Charm|PowerPipBoost)|^Absorb|^Charms$|^Wards$|^StandingWards$|^ReflectionShield$|^GainPips$|^Revive$|^HoT$|^SymmetryWards$/.test(t)) {
        // AreaCharm 在数据中实际是敌方减益（weakness），特殊处理
        if (t === 'AreaCharm') return 'hostile';
        return 'friendly';
    }
    // CatchPet targets the mob (card_server.lua L2388). It is resolved by the PvE catch rune, not a generic handler.
    if (/^(Global|Stance|MiniAura|Pass|Fizzle|PickPet)$/.test(t)) return 'self';
    if (t === 'ArenaAttack') return 'all';
    return 'hostile';
}

export function isAreaCard(card) {
    return /^Area|^Arena|^DoT$/.test(card.type) || card.type === 'Global';
}

export function isAttackCard(card) {
    return /Attack|^DoT$|^DOTAttack/.test(card.type) && card.type !== 'Fizzle';
}
export function isHealCard(card) {
    return /Heal|^HoT$|^Revive$/.test(card.type);
}
export function canTargetStealth(card,target) {
    return !target.stealth||/area|arena|singleheal/i.test(card.key);
}

/** 期望伤害（不含目标属性），用于 UI/简单 Bot 排序 */
export function expectedBaseDamage(card) {
    const p = card.params || {};
    let v = 0;
    if (p.damage_min !== undefined) v += (numericFromSection(p.damage_min, Math.abs(card.pipcost)) + numericFromSection(p.damage_max, Math.abs(card.pipcost))) / 2;
    if (p.times) v *= Number(p.times) || 1;
    for (const d of splitList(p.dots)) v += Number(d) || 0;
    return v;
}
export function expectedBaseHeal(card) {
    const p = card.params || {};
    let v = 0;
    if (p.heal_min !== undefined) v += (numericFromSection(p.heal_min, Math.abs(card.pipcost)) + numericFromSection(p.heal_max, Math.abs(card.pipcost))) / 2;
    for (const h of splitList(p.hots)) v += Number(h) || 0;
    if (p.absorb_pts !== undefined) v += numericFromSection(p.absorb_pts, Math.abs(card.pipcost));
    return v;
}

// ---------------------------------------------------------------------------
// 伤害管线（card_server.lua L2998-3330 SingleAttack 分支，L4205-4480 AreaAttack 分支）
// ---------------------------------------------------------------------------

/**
 * 计算并施加一次伤害。
 * @param opts { baseDamage, damageSchool, baseCrit, baseHit, baseSpellPen, skipResist, buffsTargetList(共享 charm 列表), damagePercent, boostAbs, label }
 * @return { damage, mark, school }
 */
function applyDamage(arena, caster, target, card, opts) {
    const R = arena.resolved;
    const rng = arena.rng;
    const version = R.version;
    let damage = opts.baseDamage;
    let school = opts.damageSchool;
    const buffs = { list: [...(opts.buffsTargetList || [])], damagePercent: opts.damagePercent || 0 };
    let boostAbs = opts.boostAbs || 0;

    // 目标 shield / trap / prism
    school = U.processDamageAgainstWards(target, R, buffs.list, school);
    if (!opts.skipResist) {
        buffs.resistPercent = U.getResist(target, school, R, arena);
        buffs.spellPenetration = U.getSpellPenetration(caster, school, R, arena) + (Number(opts.baseSpellPen) || 0);
        buffs.spellPenetrationReceive = U.getSpellPenetrationReceive(target);
        boostAbs += U.getResistAbs(target, school);
    }
    // 全局光环
    if (arena.aura && arena.aura.boostSchool === school && arena.aura.boostDamage) buffs.list.push(arena.aura.boostDamage);

    damage = damageExpression(damage, boostAbs, buffs, version, R.global.maxSpellPenetration);

    let mark = '';
    const dodgeCtx = {
        baseHit: opts.baseHit ?? card.hitchance ?? 100,
        hitChance: U.getHitChance(caster, R, arena), dodge: U.getDodge(target),
        casterLevel: caster.level, targetLevel: target.level, targetIsMob: !!target.isMob,
    };
    const crit = U.getCriticalStrike(caster, school, R, arena);
    const resil = U.getResilience(target, school, R, arena);
    // card_server.lua L3234: kids PvE uses the normal dodge branch (no PvP remedy).
    if (version !== 'kids' || arena.mode === 'pve') {
        if (tryDodge(rng, dodgeCtx, version)) {
            damage = Math.ceil(damage * R.global.dodgeDamageRatio);
            mark = 'd';
        } else if (tryCriticalStrike(rng, crit, resil, opts.baseCrit || 0)) {
            damage = Math.ceil(damage * critDamageRatio(R.global.critDamageRatio, U.getCriticalStrikeDamageRatioBonus(caster, R, arena)));
            if (card.params.extra_damage_if_critical) damage = damage * (1 + Number(card.params.extra_damage_if_critical));
            mark = 'c';
        }
    } else {
        // kids free_pvp：绝对防御（伤害=1，保护 6 回合）
        if (target.remedy.absoluteDefense <= 0 && tryDodge(rng, dodgeCtx, version)) {
            damage = 1;
            mark = 'd';
            target.remedy.absoluteDefense = R.global.protectRounds;
        } else if (tryCriticalStrike(rng, crit, resil, opts.baseCrit || 0)) {
            damage = Math.ceil(damage * critDamageRatio(R.global.critDamageRatio, U.getCriticalStrikeDamageRatioBonus(caster, R, arena)));
            if (card.params.extra_damage_if_critical) damage = damage * (1 + Number(card.params.extra_damage_if_critical));
            mark = 'c';
        }
    }

    const areaThreat=arena.threatRulesVersion>=4&&opts.areaThreat;
    if(areaThreat)arena.onDamageThreat?.(caster,target,opts.halve?Math.ceil(damage/2):damage,true,card.type==='AreaAttackWithExtraThreat'?Number(card.params.threat_ratio??1):arena.threatRulesVersion>=5&&card.type==='AreaAttack'&&caster.school==='ice'?R.adventure.iceAreaAttackThreatRatio:1);
    damage = Math.ceil(damage * U.getOutputDamageFinalWeight(caster, arena, R));
    damage = Math.ceil(damage * U.getReceiveDamageFinalWeight(target, school, R));
    if (opts.maxDamage !== undefined && damage > opts.maxDamage) damage = opts.maxDamage;
    if (opts.halve) damage = Math.ceil(damage / 2);

    if(!areaThreat)arena.onDamageThreat?.(caster,target,damage);
    damage = U.absorbUnitDamage(target, damage);
    const reflected = target.reflectAmount > 0 && damage > 0 ? damage : 0;
    if(reflected){const absorbed=Math.min(target.reflectAmount,damage);target.reflectAmount-=absorbed;damage-=absorbed;}
    U.takeDamage(target, damage);
    breakFreeze(arena, target, card.key);
    caster.totals.damageDealt += damage;
    emit(arena, { type: 'damage', caster: caster.id, target: target.id, card: card.key, school, amount: damage, mark, label: opts.label || '' });
    if(reflected){
        const reflectBuffs={list:[]};
        const reflectSchool=U.processDamageAgainstWards(caster,R,reflectBuffs.list,school);
        reflectBuffs.resistPercent=U.getResist(caster,reflectSchool,R,arena);
        reflectBuffs.spellPenetration=U.getSpellPenetration(caster,reflectSchool,R,arena);
        reflectBuffs.spellPenetrationReceive=U.getSpellPenetrationReceive(caster);
        if(arena.aura?.boostSchool===reflectSchool&&arena.aura.boostDamage)reflectBuffs.list.push(arena.aura.boostDamage);
        let amount=damageExpression(reflected,0,reflectBuffs,version,R.global.maxSpellPenetration);
        amount=Math.ceil(amount*U.getOutputDamageFinalWeight(caster,arena,R));
        amount=Math.ceil(amount*U.getReceiveDamageFinalWeight(caster,reflectSchool,R));
        amount=Math.max(0,Math.min(U.absorbUnitDamage(caster,amount),R.global.maxReflectDamage,caster.hp-1));
        U.takeDamage(caster,amount);target.totals.damageDealt+=amount;
        emit(arena,{type:'damage',caster:target.id,target:caster.id,card:card.key,school:reflectSchool,amount,mark:'',label:'reflection'});
    }
    return { damage, mark, school };
}

/** 施法者对某系的加成，含弹出 blade/weakness charm（card_server.lua L3045-3056） */
function casterDamageBuffs(arena, caster, school) {
    const R = arena.resolved;
    const list = [];
    const damagePercent = U.getDamageBoost(caster, school, arena, R);
    const boostAbs = U.getDamageBoostAbs(caster, school);
    U.processStatAgainstCharms(caster, R, list, 'boost_damage', school);
    return { list, damagePercent, boostAbs };
}

/** DOT 序列生成（card_server.lua L3062-3119 / L4041-4140） */
function buildDotSequence(arena, caster, target, card, dotsStr, buffsList, siblingRatio = 1, realcost = 0) {
    const R = arena.resolved;
    const school = card.params.damage_school || card.spellSchool;
    const schools = splitList(card.params.dots_damage_school);
    const seq = {
        cardKey: card.key, casterId: caster.id, damageSchool: school,
        buffsTarget: [...buffsList],
        damageBoostAbs: U.getDamageBoostAbs(caster, school),
        spellPenetration: U.getSpellPenetration(caster, school, R, arena),
        outputWeight: U.getOutputDamageFinalWeight(caster, arena, R),
        ticks: [],
    };
    const crit = U.getCriticalStrike(caster, school, R, arena);
    const resil = U.getResilience(target, school, R, arena);
    let round = 0;
    const threatTicks=[];
    for (const d of splitList(dotsStr)) {
        // card_server.lua L4100 / L4342：每段可为 "42p"（X 费卡按实际消耗能量倍乘）
        let dmg = numericFromSection(d, realcost);
        dmg = dmg * siblingRatio;
        const tickSchool = schools[round] || school;
        let critical = false;
        if (tryCriticalStrike(arena.rng, crit, resil, 0)) {
            dmg = Math.ceil(dmg * critDamageRatio(R.global.critDamageRatio, U.getCriticalStrikeDamageRatioBonus(caster, R, arena)));
            critical = true;
        }
        seq.ticks.push({ dmg, critical, damageSchool: tickSchool, damageBoostAbs: U.getDamageBoostAbs(caster, tickSchool), spellPenetration: U.getSpellPenetration(caster, tickSchool, R, arena) });
        const threatBase=critical?Math.ceil(numericFromSection(d,realcost)*critDamageRatio(R.global.critDamageRatio,U.getCriticalStrikeDamageRatioBonus(caster,R,arena))):numericFromSection(d,realcost);
        threatTicks.push(buffsList.reduce((damage,boost)=>Math.ceil(damage*(100+boost)/100),threatBase));
        round++;
    }
    // Lua 从尾部取值：反转使第一回合先跳 dots[0]
    seq.ticks.reverse();
    if(['DOTAttack','DOTAttackWithHOT'].includes(card.type))arena.onDotThreat?.(caster,target,seq.ticks.map(tick=>buffsList.reduce((damage,boost)=>Math.ceil(damage*(100+boost)/100),tick.dmg)));
    if(['SingleAttackWithDOT','AreaAttackWithDOT'].includes(card.type))arena.onDotThreat?.(caster,target,[...threatTicks].reverse(),card.type==='AreaAttackWithDOT',false);
    if(arena.threatRulesVersion>=5&&card.type==='AreaDOTAttack')arena.onDotThreat?.(caster,target,[...threatTicks].reverse(),true,false);
    return seq;
}

/** card_server.lua L1841-1930：单位行动前结算自身 DOT */
export function tickDots(arena, unit) {
    const R = arena.resolved;
    const applyTick = (victim, baseDamage, dot, label) => {
        const buffs = { list: [...(dot.buffsTarget || [])], damagePercent: 0 };
        let school = U.processDamageAgainstWards(victim, R, buffs.list, dot.damageSchool);
        buffs.resistPercent = U.getResist(victim, school, R);
        buffs.spellPenetration = dot.spellPenetration;
        buffs.spellPenetrationReceive = U.getSpellPenetrationReceive(victim);
        if (arena.aura && arena.aura.boostSchool === school && arena.aura.boostDamage) buffs.list.push(arena.aura.boostDamage);
        let dmg = damageExpression(baseDamage, (dot.damageBoostAbs || 0) + U.getResistAbs(victim, school), buffs, R.version, R.global.maxSpellPenetration);
        dmg = Math.ceil(dmg * (dot.outputWeight || 1));
        dmg = Math.ceil(dmg * U.getReceiveDamageFinalWeight(victim, school, R));
        dmg = U.absorbUnitDamage(victim, dmg);
        if(victim.reflectAmount>0&&dmg>0){const absorbed=Math.min(victim.reflectAmount,dmg);victim.reflectAmount-=absorbed;dmg-=absorbed;}
        U.takeDamage(victim, dmg);
        breakFreeze(arena, victim, dot.cardKey);
        const caster = arena.unitsById[dot.casterId];
        if (caster) caster.totals.damageDealt += dmg;
        emit(arena, { type: 'dot', caster: dot.casterId, target: victim.id, card: dot.cardKey, school, amount: dmg, mark: dot.critical ? 'c' : '', label });
    };
    for (const dot of U.popDoT(unit)) {
        if (dot.damage === 0) continue;
        if (dot.damage < 0) {
            // card_server.lua L1978-2060 splash：负值段为“溅射”，以绝对值打在持有者及其相邻（站位 ±1）存活队友身上
            const side = arena.sides[unit.side];
            const victims = [unit, ...side.filter(v => v !== unit && U.isAlive(v) && Math.abs(v.slot - unit.slot) === 1)];
            for (const v of victims) applyTick(v, Math.abs(dot.damage), dot, 'splash');
        } else {
            applyTick(unit, dot.damage, dot, '');
        }
        if (!U.isAlive(unit)) break;
    }
}

/** card_server.lua L2173+：单位行动前结算自身 HOT */
export function tickHots(arena, unit) {
    if (!U.isAlive(unit)) return;
    for (const hot of U.popHoT(unit)) {
        const buffs = [U.getInputHealBoost(unit, arena.resolved, arena)];
        if (arena.aura && arena.aura.boostHeal) buffs.push(arena.aura.boostHeal);
        let heal = healExpression(hot.heal, buffs, arena.resolved.version);
        heal = applyHealPenalty(Math.ceil(heal), arena.resolved.global.healPenalty);
        const done = U.takeHeal(unit, heal);
        const caster = arena.unitsById[hot.casterId];
        if (caster) caster.totals.healDone += done;
        emit(arena, { type: 'hot', caster: hot.casterId, target: unit.id, card: hot.cardKey, amount: heal });
    }
}

// ---------------------------------------------------------------------------
// 治疗管线（card_server.lua L3711-3900 SingleHeal, L4985-5100 AreaHeal）
// ---------------------------------------------------------------------------

function applyHeal(arena, caster, target, card, baseHeal, casterBuffs, label, collectThreat) {
    const R = arena.resolved;
    const buffs = [...casterBuffs];
    U.processHealAgainstWards(target, R, buffs);
    if (arena.aura && arena.aura.boostHeal) buffs.push(arena.aura.boostHeal);
    buffs.push(U.getInputHealBoost(target, R, arena));
    let heal = healExpression(baseHeal, buffs, R.version);
    if(card.type.startsWith('SingleHeal'))arena.onSingleHealThreat?.(caster,heal);
    collectThreat?.(heal);
    heal = applyHealPenalty(Math.ceil(heal), R.global.healPenalty);
    const done = U.takeHeal(target, heal);
    caster.totals.healDone += done;
    emit(arena, { type: 'heal', caster: caster.id, target: target.id, card: card.key, amount: heal, label: label || '' });
    return heal;
}

function casterHealBuffs(arena, caster) {
    const R = arena.resolved;
    const buffs = [];
    U.processStatAgainstCharms(caster, R, buffs, 'boost_heal', 'skipschool');
    buffs.push(U.getOutputHealBoost(caster, R));
    return buffs;
}

function buildHotSequence(arena, caster, card, hotsStr, casterBuffs, realcost = 0) {
    const seq = { cardKey: card.key, casterId: caster.id, ticks: [] };
    for (const h of splitList(hotsStr)) {
        let heal = healExpression(numericFromSection(h, realcost), casterBuffs, arena.resolved.version);
        seq.ticks.push(Math.ceil(heal));
    }
    seq.ticks.reverse();
    if(['SingleHealWithHOT','DOTAttackWithHOT'].includes(card.type))arena.onHotThreat?.(caster,seq.ticks);
    if(card.type==='AreaHealWithHOT')arena.onHotThreat?.(caster,seq.ticks,true);
    return seq;
}

// ---------------------------------------------------------------------------
// 目标集合
// ---------------------------------------------------------------------------

function aliveEnemies(arena, caster) {
    return arena.sides[caster.side === 'near' ? 'far' : 'near'].filter(U.isAlive);
}
function aliveAllies(arena, caster) {
    return arena.sides[caster.side].filter(U.isAlive);
}

/** 眩晕：card_server.lua L3167-3200（stun absorb ward 31） */
export const STUN_ABSORB_WARD_ID = 31;
function applyStun(arena, caster, target, card) {
    const R = arena.resolved;
    let absorbed = false;
    for (const w of target.wards) {
        if (w.id > 0 && !w.absorb) {
            const tpl = R.wards[w.id];
            if (tpl && (tpl.stunabsorb === true || tpl.stunabsorb === 'true')) { w.id = 0; absorbed = true; break; }
        }
    }
    if (absorbed) {
        emit(arena, { type: 'stun_absorbed', caster: caster.id, target: target.id, card: card.key });
        return false;
    }
    target.stunned = true;
    arena.onEffectThreat?.(caster,target,'Stun',false,true);
    if (!(card.params.do_not_generate_absorb === true || card.params.do_not_generate_absorb === 'true')) {
        const n = R.version === 'teen' ? 2 : 4;
        for (let i = 0; i < n; i++) U.appendWard(target, STUN_ABSORB_WARD_ID);
    }
    emit(arena, { type: 'stun', caster: caster.id, target: target.id, card: card.key });
    return true;
}

// ---------------------------------------------------------------------------
// 分支处理器
// ---------------------------------------------------------------------------

const handlers = {};

const SINGLE_ATTACK_TYPES = [
    'SingleAttack', 'SingleAttackWithDOT', 'SingleAttackWithStandingWards', 'SingleAttackWithTrap',
    'SingleAttackWithExplode', 'SingleAttackWithLifeTap', 'SingleAttackWithImmolate', 'SingleAttackWithPercent',
    'SingleAttackWithStun', 'SingleAttackWithSelfStun', 'SingleAttackWithLifeTapAndStandingWards', 'SingleAttackHP',
];

/** card_server.lua L2998-3330 */
function singleAttack(arena, caster, card, target, realcost) {
    const R = arena.resolved;
    const p = card.params;
    const type = card.type;
    let dmin = numericFromSection(p.damage_min, realcost);
    let dmax = numericFromSection(p.damage_max, realcost);
    if (type === 'SingleAttackWithPercent') {
        const real = Math.ceil(target.hp * Number(p.damage_percent || 0) / 100);
        dmin = real; dmax = real;
    }
    if (type === 'SingleAttackWithExplode') {
        const exists = target.dots.some(s => s.ticks.some(t => t.dmg < 0));
        if (exists) {
            target.dots = target.dots.filter(s => !s.ticks.some(t => t.dmg < 0));
            dmin = numericFromSection(p.damage_min_explode, realcost);
            dmax = numericFromSection(p.damage_max_explode, realcost);
        }
    }
    const baseDamage = arena.rng.int(dmin, dmax);
    const school = p.damage_school || card.spellSchool;
    const cb = casterDamageBuffs(arena, caster, school);
    const skipResist = type === 'SingleAttackWithPercent';

    // immolate：施法者自伤（card_server.lua L3036-3043 + L3360+）
    if (type === 'SingleAttackWithImmolate' && p.immolate_damage_min !== undefined) {
        const iSchool = p.immolate_damage_school || school;
        const base = arena.rng.int(numericFromSection(p.immolate_damage_min, realcost), numericFromSection(p.immolate_damage_max, realcost));
        applyDamage(arena, caster, caster, card, { baseDamage: base, damageSchool: iSchool, buffsTargetList: [], damagePercent: U.getDamageBoost(caster, iSchool, arena, R), boostAbs: U.getDamageBoostAbs(caster, iSchool), label: 'immolate' });
    }

    if (type === 'SingleAttackWithDOT' && p.dots) {
        U.appendDoT(target, buildDotSequence(arena, caster, target, card, p.dots, cb.list, 1, realcost));
        emit(arena, { type: 'dot_applied', caster: caster.id, target: target.id, card: card.key, ticks: splitList(p.dots).length });
    }
    if ((type === 'SingleAttackWithStandingWards' || type === 'SingleAttackWithLifeTapAndStandingWards') && p.wards) {
        for (const w of splitList(p.wards)) U.appendStandingWard(target, Number(w), Number(p.rounds || 1));
    }
    if (type === 'SingleAttackWithTrap' && p.target_wards) {
        for (const w of splitList(p.target_wards)) U.appendWard(target, Number(w));
    }
    // card_server.lua L3138–3164: charging is an effect flag, not a separate card type.
    // Scope this added port to PvE so the existing simulator's PvP behavior is unchanged.
    if (arena.mode === 'pve' && (p.bCharging === true || p.bCharging === 'true')) {
        const ids = R.global.stormChargingWardIds;
        let rank = -1;
        for (const ward of target.standingWards) if (ward.rounds > 0) rank = Math.max(rank, ids.indexOf(ward.id));
        target.standingWards = target.standingWards.filter(ward => !ids.includes(ward.id));
        const id = ids[Math.min(rank + 1, ids.length - 1)];
        if (!id || !R.wards[id]) throw new Error('Missing storm charging ward');
        U.appendStandingWard(target, id, 2);
        emit(arena, { type: 'ward_applied', caster: caster.id, target: target.id, card: card.key, ward: id, rounds: 2 });
    }
    if (type === 'SingleAttackWithStun') applyStun(arena, caster, target, card);

    const res = applyDamage(arena, caster, target, card, {
        baseDamage, damageSchool: school, buffsTargetList: skipResist ? [] : cb.list,
        damagePercent: skipResist ? 0 : cb.damagePercent, boostAbs: skipResist ? 0 : cb.boostAbs,
        baseCrit: Number(p.base_criticalstrike || 0), baseSpellPen: p.base_spellpenetration, skipResist,
        // card_server.lua L3281-3290：百分比伤害上限按目标类型选择 damage_max_mob / damage_max_player
        maxDamage: type === 'SingleAttackWithPercent' ? Number((target.isMob ? p.damage_max_mob : p.damage_max_player) || p.damage_max || Infinity) : undefined,
    });

    if ((type === 'SingleAttackWithLifeTap' || type === 'SingleAttackWithLifeTapAndStandingWards') && U.isAlive(caster)) {
        // card_server.lua L3496-3497 吸血：damage * convert_rate / 100
        const conv = Math.ceil(res.damage * Number(p.convert_rate || 0) / 100);
        if (conv > 0) {
            const done = U.takeHeal(caster, conv);
            caster.totals.healDone += done;
            emit(arena, { type: 'heal', caster: caster.id, target: caster.id, card: card.key, amount: conv, label: 'lifetap' });
        }
    }
    if (type === 'SingleAttackWithSelfStun') { caster.stunned = true; emit(arena, { type: 'stun', caster: caster.id, target: caster.id, card: card.key }); }
}
for (const t of SINGLE_ATTACK_TYPES) handlers[t] = singleAttack;

/** card_server.lua L2620-2760 SingleAttackWithMultipleDamage（times 次） */
handlers.SingleAttackWithMultipleDamage = function (arena, caster, card, target, realcost) {
    const p = card.params;
    const school = p.damage_school || card.spellSchool;
    const cb = casterDamageBuffs(arena, caster, school);
    let times = Number(p.times || 1);
    if (p.random_times) {
        const m = /(\d+)\s*,\s*(\d+)/.exec(String(p.random_times));
        if (m) times = arena.rng.int(Number(m[1]), Number(m[2]));
    }
    const equal = p.damage_equal === true || p.damage_equal === 'true' || p.everyround_damage_equal === 'true';
    let base = arena.rng.int(numericFromSection(p.damage_min, realcost), numericFromSection(p.damage_max, realcost));
    for (let i = 1; i <= times; i++) {
        if (!U.isAlive(target)) break;
        let dmin, dmax, tSchool = school, baseCrit = Number(p.base_criticalstrike || 0);
        if (!equal && p[`damage_min_${i}`] !== undefined) {
            dmin = numericFromSection(p[`damage_min_${i}`], realcost);
            dmax = numericFromSection(p[`damage_max_${i}`], realcost);
            tSchool = p[`damage_school_${i}`] || school;
            baseCrit = Number(p[`base_criticalstrike_${i}`] || 0);
            base = arena.rng.int(dmin, dmax);
        } else if (!equal) {
            base = arena.rng.int(numericFromSection(p.damage_min, realcost), numericFromSection(p.damage_max, realcost));
        }
        applyDamage(arena, caster, target, card, { baseDamage: base, damageSchool: tSchool, buffsTargetList: cb.list, damagePercent: cb.damagePercent, boostAbs: cb.boostAbs, baseCrit, baseSpellPen: p.base_spellpenetration, label: `hit${i}` });
    }
};

/** card_server.lua L4041-4140 DOTAttack / DOTAttackWithHOT / DoT */
function dotAttack(arena, caster, card, target, realcost) {
    const p = card.params;
    const school = p.damage_school || card.spellSchool;
    const cb = casterDamageBuffs(arena, caster, school);
    U.appendDoT(target, buildDotSequence(arena, caster, target, card, p.dots, cb.list, 1, realcost));
    emit(arena, { type: 'dot_applied', caster: caster.id, target: target.id, card: card.key, ticks: splitList(p.dots).length });
    if (card.type === 'DOTAttackWithHOT' && p.hots) {
        U.appendHoT(caster, buildHotSequence(arena, caster, card, p.hots, casterHealBuffs(arena, caster), realcost));
        emit(arena, { type: 'hot_applied', caster: caster.id, target: caster.id, card: card.key, ticks: splitList(p.hots).length });
    }
}
handlers.DOTAttack = dotAttack;
handlers.DOTAttackWithHOT = dotAttack;
handlers.DoT = dotAttack;

/** card_server.lua L4205-4480 AreaAttack 家族；ArenaAttack 打全场（友方半伤） */
function areaAttack(arena, caster, card, target, realcost) {
    const R = arena.resolved;
    const p = card.params;
    const type = card.type;
    const school = p.damage_school || card.spellSchool;
    const cb = casterDamageBuffs(arena, caster, school);
    let targets = aliveEnemies(arena, caster);
    if (type === 'ArenaAttack') targets = [...aliveEnemies(arena, caster), ...aliveAllies(arena, caster)];
    const hasDirect = p.damage_min !== undefined;
    const base = hasDirect ? arena.rng.int(numericFromSection(p.damage_min, realcost), numericFromSection(p.damage_max, realcost)) : 0;
    let total = 0;
    for (const t of targets) {
        const sibling = t !== target;
        if (type === 'AreaAttackWithStun' || type === 'AreaStun') applyStun(arena, caster, t, card);
        if ((type === 'AreaAttackWithDOT' || type === 'AreaDOTAttack') && p.dots) {
            const ratio = sibling && R.version === 'kids' ? 0.83 : 1; // card_server.lua L66/L198 splash_damage_siblin_ratio
            U.appendDoT(t, buildDotSequence(arena, caster, t, card, p.dots, cb.list, ratio, realcost));
        }
        if (hasDirect) {
            const res = applyDamage(arena, caster, t, card, {
                baseDamage: base, damageSchool: school, buffsTargetList: cb.list, damagePercent: cb.damagePercent, boostAbs: cb.boostAbs,
                baseCrit: Number(p.base_criticalstrike || 0), baseSpellPen: p.base_spellpenetration,
                halve: type === 'ArenaAttack' && t.side === caster.side,
                areaThreat:true,
            });
            total += res.damage;
        }
    }
    if (type === 'AreaAttackWithLifeTap' && U.isAlive(caster)) {
        const conv = Math.ceil(total * Number(p.convert_rate || 0) / 100);
        if (conv > 0) { caster.totals.healDone += U.takeHeal(caster, conv); emit(arena, { type: 'heal', caster: caster.id, target: caster.id, card: card.key, amount: conv, label: 'lifetap' }); }
    }
    if (type === 'AreaAttackWithImmolate' && p.immolate_damage_min !== undefined) {
        const iSchool = p.immolate_damage_school || school;
        const b = arena.rng.int(numericFromSection(p.immolate_damage_min, realcost), numericFromSection(p.immolate_damage_max, realcost));
        applyDamage(arena, caster, caster, card, { baseDamage: b, damageSchool: iSchool, buffsTargetList: [], damagePercent: U.getDamageBoost(caster, iSchool, arena, R), boostAbs: 0, label: 'immolate' });
    }
}
for (const t of ['AreaAttack', 'AreaAttackWithDOT', 'AreaDOTAttack', 'AreaAttackWithStun', 'ArenaAttack', 'AreaAttackWithLifeTap', 'AreaAttackWithExtraThreat', 'AreaAttackWithImmolate']) handlers[t] = areaAttack;

/** card_server.lua L5614+ SingleStun / AreaStun */
handlers.SingleStun = (arena, caster, card, target) => { applyStun(arena, caster, target, card); };
handlers.AreaStun = (arena, caster, card) => { for (const t of aliveEnemies(arena, caster)) applyStun(arena, caster, t, card); };

/** card_server.lua L3711-3900 SingleHeal 家族 */
function singleHeal(arena, caster, card, target, realcost) {
    const R = arena.resolved;
    const p = card.params;
    const base = arena.rng.int(numericFromSection(p.heal_min, realcost), numericFromSection(p.heal_max, realcost));
    const cbuffs = casterHealBuffs(arena, caster);
    if (card.type === 'SingleHealWithImmolate' && p.immolate_damage_min !== undefined) {
        const iSchool = p.immolate_damage_school || card.spellSchool;
        const b = arena.rng.int(numericFromSection(p.immolate_damage_min, realcost), numericFromSection(p.immolate_damage_max, realcost));
        applyDamage(arena, caster, caster, card, { baseDamage: b, damageSchool: iSchool, buffsTargetList: [], damagePercent: U.getDamageBoost(caster, iSchool, arena, R), boostAbs: 0, label: 'immolate' });
    }
    if (card.type === 'SingleHealWithHOT' && p.hots) {
        U.appendHoT(target, buildHotSequence(arena, caster, card, p.hots, cbuffs, realcost));
        emit(arena, { type: 'hot_applied', caster: caster.id, target: target.id, card: card.key, ticks: splitList(p.hots).length });
    }
    if (card.type === 'SingleHealWithCleanse') U.popAllNegativeEffects(target, R);
    applyHeal(arena, caster, target, card, base, cbuffs);
}
for (const t of ['SingleHeal', 'SingleHealWithHOT', 'SingleHealWithImmolate', 'SingleHealWithCleanse']) handlers[t] = singleHeal;

/** card_server.lua L4985-5100 AreaHeal 家族（基础值只 roll 一次，逐目标结算） */
function areaHeal(arena, caster, card, target, realcost) {
    const R = arena.resolved;
    const p = card.params;
    const base = arena.rng.int(numericFromSection(p.heal_min, realcost), numericFromSection(p.heal_max, realcost));
    const cbuffs = casterHealBuffs(arena, caster);
    let totalThreat=0;
    for (const t of aliveAllies(arena, caster)) {
        if (card.type === 'AreaHealWithHOT' && p.hots) U.appendHoT(t, buildHotSequence(arena, caster, card, p.hots, cbuffs, realcost));
        if (card.type === 'AreaHealWithAbsorb' && p.absorb_pts !== undefined) U.appendAbsorb(t, numericFromSection(p.absorb_pts, realcost), Number(p.ward || 0));
        applyHeal(arena, caster, t, card, base, cbuffs,undefined,heal=>{
            totalThreat+=Math.ceil(heal*R.adventure.damageThreatRatio);
            if(card.type==='AreaHealWithAbsorb')totalThreat+=R.adventure.effectThreatAbsorb;
        });
    }
    arena.onAreaHealThreat?.(caster,totalThreat);
    if (card.type === 'AreaCleanse') for (const t of aliveAllies(arena, caster)) U.popAllNegativeEffects(t, R);
}
for (const t of ['AreaHeal', 'AreaHealWithHOT', 'AreaHealWithAbsorb']) handlers[t] = areaHeal;

handlers.HoT = (arena, caster, card, target, realcost) => {
    U.appendHoT(target, buildHotSequence(arena, caster, card, card.params.hots, casterHealBuffs(arena, caster), realcost));
    emit(arena, { type: 'hot_applied', caster: caster.id, target: target.id, card: card.key, ticks: splitList(card.params.hots).length });
};

/** card_server.lua L6305 Charms（含 charms="11,11"）/ L6354 AreaCharm（对敌方全体 charm=） */
handlers.Charms = (arena, caster, card, target) => {
    for (const c of splitList(card.params.charms ?? card.params.charm)) U.appendCharm(target, Number(c));
    emit(arena, { type: 'charm', caster: caster.id, target: target.id, card: card.key, ids: splitList(card.params.charms ?? card.params.charm) });
};
handlers.AreaCharm = (arena, caster, card) => {
    const ids = splitList(card.params.charm ?? card.params.charms);
    const R = arena.resolved;
    const positive = ids.length && R.charms[Number(ids[0])] && (R.charms[Number(ids[0])].positive === true || R.charms[Number(ids[0])].positive === 'true');
    const targets = positive ? aliveAllies(arena, caster) : aliveEnemies(arena, caster);
    for (const t of targets) { for (const c of ids) U.appendCharm(t, Number(c)); emit(arena, { type: 'charm', caster: caster.id, target: t.id, card: card.key, ids }); }
};

/** card_server.lua L6482 Wards / L6700 AreaWard, AreaAbsorb / L6531 StandingWards / L5516 Absorb */
handlers.Wards = (arena, caster, card, target) => {
    const ids = splitList(card.params.wards ?? card.params.ward);
    for (const w of ids) U.appendWard(target, Number(w));
    emit(arena, { type: 'ward', caster: caster.id, target: target.id, card: card.key, ids });
};
/** card_server.lua SymmetryWards：target_wards 贴敌方目标，caster_wards 贴施法者自身 */
handlers.SymmetryWards = (arena, caster, card, target) => {
    const p = card.params;
    const tids = splitList(p.target_wards ?? p.wards ?? p.ward);
    const cids = splitList(p.caster_wards);
    for (const w of tids) U.appendWard(target, Number(w));
    for (const w of cids) U.appendWard(caster, Number(w));
    emit(arena, { type: 'ward', caster: caster.id, target: target.id, card: card.key, ids: tids });
    if (cids.length) emit(arena, { type: 'ward', caster: caster.id, target: caster.id, card: card.key, ids: cids });
};
handlers.AreaWard = (arena, caster, card) => {
    const ids = splitList(card.params.ward ?? card.params.wards);
    const R = arena.resolved;
    const tpl = ids.length ? R.wards[Number(ids[0])] : null;
    const negative = tpl && (tpl.positive === false || tpl.positive === 'false');
    const targets = negative ? aliveEnemies(arena, caster) : aliveAllies(arena, caster);
    for (const t of targets) { for (const w of ids) U.appendWard(t, Number(w)); emit(arena, { type: 'ward', caster: caster.id, target: t.id, card: card.key, ids }); }
};
handlers.StandingWards = (arena, caster, card, target) => {
    const rounds = Number(card.params.rounds || 1);
    for (const w of splitList(card.params.wards ?? card.params.ward)) U.appendStandingWard(target, Number(w), rounds);
    emit(arena, { type: 'standing_ward', caster: caster.id, target: target.id, card: card.key, rounds });
};
function absorbCard(arena, caster, card, target, realcost) {
    const p = card.params;
    let pts = numericFromSection(p.absorb_pts, realcost);
    if (card.type === 'Absorb_Adv') {
        // Teen Absorb_Adv：base + scale * 等级（近似：base_absorb_pts * (1 + boost%)），受生命攻击加成
        pts = Math.ceil(Number(p.base_absorb_pts || 0) * (1 + U.getDamageBoost(caster, card.spellSchool, null, arena.resolved) / 100));
    }
    const targets = card.type === 'AreaAbsorb' ? aliveAllies(arena, caster) : [target];
    for (const t of targets) {
        U.appendAbsorb(t, pts, Number(p.ward || 0));
        emit(arena, { type: 'absorb', caster: caster.id, target: t.id, card: card.key, amount: pts });
    }
}
handlers.Absorb = absorbCard;
handlers.Absorb_Adv = absorbCard;
handlers.AreaAbsorb = absorbCard;

handlers.ReflectionShield = (arena, caster, card, target) => {
    if(arena.reflectionRulesVersion===1){
        const amount=Number(card.params.reflect_amount||0);
        target.reflectAmount=(target.reflectAmount||0)+amount;
        emit(arena,{type:'absorb',caster:caster.id,target:target.id,card:card.key,amount,label:'reflection'});
        return;
    }
    U.appendAbsorb(target, Number(card.params.reflect_amount || 0), 0);
    emit(arena, { type: 'absorb', caster: caster.id, target: target.id, card: card.key, amount: Number(card.params.reflect_amount || 0), label: 'reflect≈absorb' });
};

/** card_server.lua L5213 Global */
handlers.Global = (arena, caster, card) => {
    const p = card.params;
    arena.aura = {
        name: card.spellSchool === 'death' && p.boost_damage !== undefined ? 'death_damage' : card.spellSchool,
        boostDamage: p.boost_damage !== undefined ? Number(p.boost_damage) : null,
        boostSchool: p.school ? String(p.school).toLowerCase() : null,
        boostHeal: p.boost_heal !== undefined ? Number(p.boost_heal) : null,
        boostPowerPip: p.boost_powerpip !== undefined ? Number(p.boost_powerpip) : null,
        cardKey: card.key,
    };
    emit(arena, { type: 'aura', caster: caster.id, card: card.key, aura: { ...arena.aura } });
};

/** Global2（teen）：全场属性光环，stats 通过 GetStatsSum 计入所有单位（player_server.lua L3579-3595） */
handlers.Global2 = (arena, caster, card) => {
    arena.aura2 = { id: Number(card.params.globalaura), school: card.params.school, cardKey: card.key };
    emit(arena, { type: 'aura2', caster: caster.id, card: card.key, id: arena.aura2.id });
};

/** MiniAura：自身小光环（rounds） */
handlers.MiniAura = (arena, caster, card) => {
    caster.miniaura = { id: Number(card.params.miniaura), rounds: Number(card.params.rounds || 3) };
    emit(arena, { type: 'miniaura', caster: caster.id, card: card.key, id: caster.miniaura.id, rounds: caster.miniaura.rounds });
};

/** Stance：姿态（fire_kids/ice_kids/defensive/vampire/electric...） */
handlers.Stance = (arena, caster, card) => {
    caster.stance = { name: String(card.params.stance), rounds: Number(card.params.rounds || 5) };
    emit(arena, { type: 'stance', caster: caster.id, card: card.key, stance: caster.stance.name, rounds: caster.stance.rounds });
};

/** GainPips / AreaPowerPipBoost */
handlers.GainPips = (arena, caster, card, target) => {
    const n = Number(card.params.pips || 1);
    const max = arena.resolved.global.maxPips;
    target.pips.normal = Math.min(max - target.pips.power, target.pips.normal + n);
    emit(arena, { type: 'pips', caster: caster.id, target: target.id, card: card.key, amount: n });
};
handlers.AreaPowerPipBoost = (arena, caster, card) => {
    const n = Number(card.params.powerpips || 1);
    const max = arena.resolved.global.maxPips;
    for (const t of aliveAllies(arena, caster)) {
        if (arena.resolved.version === 'teen') t.pips.normal = Math.min(max - t.pips.power, t.pips.normal + n * 2);
        else t.pips.power = Math.min(max - t.pips.normal, t.pips.power + n);
        emit(arena, { type: 'pips', caster: caster.id, target: t.id, card: card.key, amount: n });
    }
};

/** Cleanse / Remove / Steal（card_server.lua L5300-5600 区间） */
handlers.SingleCleanse = (arena, caster, card, target) => { U.popAllNegativeEffects(target, arena.resolved); emit(arena, { type: 'cleanse', caster: caster.id, target: target.id, card: card.key }); };
handlers.AreaCleanse = (arena, caster, card) => { for (const t of aliveAllies(arena, caster)) { U.popAllNegativeEffects(t, arena.resolved); emit(arena, { type: 'cleanse', caster: caster.id, target: t.id, card: card.key }); } };
handlers.RemovePositiveCharm = (arena, caster, card, target) => {
    const n = Number(card.params.remove_count || 1);
    for (let i = 0; i < n; i++) { const id = U.popRandomCharm(target, arena.resolved, arena.rng, true); if (id == null) break; emit(arena, { type: 'remove_charm', caster: caster.id, target: target.id, card: card.key, id }); }
};
handlers.RemoveNegativeCharm = (arena, caster, card, target) => {
    const n = Number(card.params.remove_count || 1);
    for (let i = 0; i < n; i++) { const id = U.popRandomCharm(target, arena.resolved, arena.rng, false); if (id == null) break; emit(arena, { type: 'remove_charm', caster: caster.id, target: target.id, card: card.key, id }); }
};
handlers.RemovePositiveWard = (arena, caster, card, target) => {
    const n = Number(card.params.remove_count || 1);
    for (let i = 0; i < n; i++) { const id = U.popRandomWard(target, arena.resolved, arena.rng, true); if (id == null) break; emit(arena, { type: 'remove_ward', caster: caster.id, target: target.id, card: card.key, id }); }
};
handlers.StealCharm = (arena, caster, card, target) => {
    const n = Number(card.params.steal_count || 1);
    for (let i = 0; i < n; i++) { const id = U.popRandomCharm(target, arena.resolved, arena.rng, true); if (id == null) break; U.appendCharm(caster, id); emit(arena, { type: 'steal_charm', caster: caster.id, target: target.id, card: card.key, id }); }
};
handlers.StealWard = (arena, caster, card, target) => {
    const n = Number(card.params.steal_count || 1);
    for (let i = 0; i < n; i++) { const id = U.popRandomWard(target, arena.resolved, arena.rng, true); if (id == null) break; U.appendWard(caster, id); emit(arena, { type: 'steal_ward', caster: caster.id, target: target.id, card: card.key, id }); }
};

handlers.Pass = () => {};
handlers.SingleTaunt = (arena,caster,card,target) => {
    if(target?.isMob&&U.isAlive(target)&&target.combatActive!==false)tauntThreat(target,caster,Number(card.params.additional_threat||0));
};
handlers.AreaTaunt = (arena,caster,card) => {
    for(const target of aliveEnemies(arena,caster))handlers.SingleTaunt(arena,caster,card,target);
};
handlers.SingleStealth = (arena,caster,card,target) => {
    target.stealth=true;
    target.stealthRounds=card.params.rounds===undefined?null:Number(card.params.rounds);
    arena.onEffectThreat?.(caster,target,'Stun');
    emit(arena,{type:'stealth',caster:caster.id,target:target.id,card:card.key,rounds:target.stealthRounds});
};

const SPECIAL_TYPES = new Set(['SingleFreeze', 'SingleGuardianWithImmolate', 'ConversePositiveWard', 'Enrage']);
export function specialCardsEnabled(arena) {
    return arena.resolved.version === 'kids' && arena.specialCardRulesVersion === 1;
}

/** card_server.lua L2355, L6235–6266: precheck includes base quality;
 * conversion itself only pops +1000/+2000/+3000/+4000, in that order. */
export function hasConvertibleWard(target, card) {
    const from = Number(card.params.fromward);
    return !!target?.wards?.some(w => !w.absorb && [0,1000,2000,3000,4000].some(offset => w.id === from + offset));
}

/** card_server.lua L1915, L2082, L3467, L4621: attack contact breaks freeze,
 * including a hit fully absorbed by shields; protection rounds remain. */
function breakFreeze(arena, target, card) {
    if (!(target.freezeRounds > 0)) return;
    target.freezeRounds = 0;
    emit(arena, {type:'freeze_break', target:target.id, card});
}

/** card_server.lua L5932–6041, kids branch. */
handlers.SingleFreeze = (arena, caster, card, target) => {
    const g = arena.resolved.global;
    const immune = target.isMob && [true,'true'].includes(target.template?.attributes?.is_immune_to_freeze);
    const success = !immune && !(target.antiFreezeRounds > 0) && !(target.antiFreezeSiblingRounds > 0);
    if (success) {
        if (arena.applyTempAntiFreezeForPartners) {
            for (const unit of arena.sides[target.side]) if (U.isAlive(unit) && unit.combatActive !== false) unit.antiFreezeSiblingRounds = g.freezeSiblingProtectionRounds;
        }
        const offset = arena.mode === 'pve' && arena.firstActingSide === 'near' ? 0 : 1;
        target.freezeRounds = Number(card.params.rounds) + offset;
        target.antiFreezeRounds = g.freezeProtectionRounds + offset;
        target.antiFreezeSiblingRounds = 0;
        U.appendWard(target, g.freezeWardId);
    }
    // Lua applies this threat even when freeze is resisted.
    arena.onEffectThreat?.(caster, target, 'SingleFreeze');
    emit(arena, {type:'freeze', caster:caster.id, target:target.id, card:card.key, success, rounds:target.freezeRounds||0});
};

/** card_server.lua L3916–4040: self damage consumes charms/wards, includes
 * absolute stats and final weights, excludes percentage stats and crit/dodge. */
handlers.SingleGuardianWithImmolate = (arena, caster, card, target) => {
    const R = arena.resolved, p = card.params, buffs = {list:[]};
    let school = p.immolate_damage_school;
    U.processStatAgainstCharms(caster, R, buffs.list, 'boost_damage', school);
    school = U.processDamageAgainstWards(caster, R, buffs.list, school);
    if (arena.aura?.boostSchool === school && arena.aura.boostDamage) buffs.list.push(arena.aura.boostDamage);
    let amount = damageExpression(arena.rng.int(Number(p.immolate_damage_min), Number(p.immolate_damage_max)), U.getDamageBoostAbs(caster, school) + U.getResistAbs(caster, school), buffs, R.version, R.global.maxSpellPenetration);
    amount = Math.ceil(amount * U.getOutputDamageFinalWeight(caster, arena, R));
    amount = Math.ceil(amount * U.getReceiveDamageFinalWeight(caster, school, R));
    amount = U.absorbUnitDamage(caster, amount);
    U.takeDamage(caster, amount);
    emit(arena, {type:'damage', caster:caster.id, target:caster.id, card:card.key, school, amount, mark:'', label:'immolate'});
    target.guardian = true;
    arena.onEffectThreat?.(caster, target, 'AreaWard', true);
    emit(arena, {type:'guardian', caster:caster.id, target:target.id, card:card.key});
};

handlers.ConversePositiveWard = (arena, caster, card, target) => {
    for (const offset of [1000,2000,3000,4000]) {
        const id = Number(card.params.fromward) + offset;
        if (!U.popWard(target, id)) continue;
        U.appendWard(target, Number(card.params.toward));
        emit(arena, {type:'remove_ward', caster:caster.id, target:target.id, card:card.key, id});
        emit(arena, {type:'ward', caster:caster.id, target:target.id, card:card.key, id:Number(card.params.toward)});
        break;
    }
    arena.onEffectThreat?.(caster, target, 'ConversePositiveWard');
};

// Enrage changes the mob before accuracy/payment (Lua's precheck pass 10).
handlers.Enrage = () => {};

/** card_server.lua L6833–6857 CheckGuardian; player/mob Revive clears death
 * state and restores kids REVIVE_BASE_HP=2000, capped at the unit's max HP. */
export function reviveGuardians(arena) {
    if (!specialCardsEnabled(arena)) return;
    for (const unit of [...arena.sides.near, ...arena.sides.far]) {
        if (U.isAlive(unit) || !unit.guardian || unit.combatActive === false) continue;
        unit.guardian = false;
        const amount = U.takeHeal(unit, arena.resolved.global.guardianReviveHp);
        emit(arena, {type:'heal', caster:unit.id, target:unit.id, amount, label:'guardian', revived:true});
    }
}

/** 未实现列表（透明记录） */
export const UNSUPPORTED_TYPES = [
    'Random', 'Fizzle', 'PickPet', 'CatchPet', 'Revive', 'Dead', 'AreaControl',
];

export function isSupportedType(type) {
    return Boolean(handlers[type]);
}

export function supportedTypes() {
    return Object.keys(handlers);
}

function registerUnsupported(arena, card) {
    const rec = arena.unsupported[card.type] || (arena.unsupported[card.type] = { count: 0, cards: {} });
    rec.count++;
    rec.cards[card.key] = (rec.cards[card.key] || 0) + 1;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 施放一张卡：命中判定 → 扣费 → 分支处理。
 * 施法者行动前的 DOT/HOT 结算由 arena 调用 tickDots/tickHots。
 * @return { ok, fizzled, unsupported }
 */
export function useCard(arena, caster, card, target, seq) {
    const R = arena.resolved;
    arena.advanceCasterThreat?.(caster);
    if (!handlers[card.type] || (SPECIAL_TYPES.has(card.type) && !specialCardsEnabled(arena)) || (card.type==='SingleStealth'&&arena.stealthRulesVersion!==1)) {
        registerUnsupported(arena, card);
        emit(arena, { type: 'unsupported', caster: caster.id, card: card.key, cardType: card.type });
        return { ok: false, unsupported: true };
    }
    if (specialCardsEnabled(arena) && (caster.freezeRounds > 0 ||
        (SPECIAL_TYPES.has(card.type) && (!target || !U.isAlive(target))) ||
        (card.type === 'Enrage' && !canEnrageTarget(arena, caster, card, target)) ||
        (card.type === 'ConversePositiveWard' && !hasConvertibleWard(target, card)) ||
        (card.type === 'SingleGuardianWithImmolate' && target?.speciesId && !target.isMob))) {
        emit(arena, {type:'pass', caster:caster.id, reason:caster.freezeRounds > 0 ? 'frozen' : 'invalid_target'});
        return {ok:false};
    }
    // Stance 校验（card_server.lua L1812-1823）
    if(arena.stealthRulesVersion===1&&target&&!canTargetStealth(card,target)){
        emit(arena,{type:'pass',caster:caster.id,reason:'stealth'});
        return {ok:false};
    }
    if (card.type === 'Stance' && card.spellSchool !== caster.school && card.spellSchool !== 'balance') {
        emit(arena, { type: 'pass', caster: caster.id, reason: 'stance_school' });
        return { ok: false };
    }
    if (card.type === 'Enrage') {
        const previousHp = target.hp;
        enrageTarget(arena, caster, target);
        emit(arena, {type:'enrage', caster:caster.id, target:target.id, card:card.key, maxHp:target.maxHp});
        emit(arena, {type:'heal', caster:caster.id, target:target.id, card:card.key, amount:Math.max(0,target.hp-previousHp), label:'enrage', hp:target.hp, maxHp:target.maxHp});
    }
    // 命中（card_server.lua L2514-2560）：accuracy + accuracy charms + caster boost
    const accBuffs = [];
    U.processStatAgainstCharms(caster, R, accBuffs, 'boost_accuracy', card.spellSchool);
    let accuracy = Number(card.accuracy) + accBuffs.reduce((a, b) => a + b, 0) + U.getAccuracyBoost(caster, card.spellSchool, R);
    if (R.fairPlay && R.fairPlay.forceAccuracy !== undefined && R.fairPlay.forceAccuracy !== null) accuracy = R.fairPlay.forceAccuracy;
    caster.totals.casts++;
    // 失误发生在扣费之前（card_server.lua L2560-2578）
    const missed=rollFizzle(arena.rng, accuracy);
    // card_server.lua L2546-2559: pop one matching dispel even on a natural miss.
    let dispel=null;
    if(arena.mode!=='pve'||arena.dispelRulesVersion===1){
        for(const [id,charm] of Object.entries(R.charms)){
            if(charm.dispel_school&&String(charm.dispel_school).toLowerCase()===String(card.spellSchool).toLowerCase()&&U.popCharm(caster,Number(id))){
                dispel=Number(id);break;
            }
        }
    }
    if (missed) {
        caster.totals.fizzles++;
        if (seq !== undefined) U.markCardFizzled(caster, seq);
        emit(arena, { type: 'fizzle', caster: caster.id, card: card.key, target: target ? target.id : null, accuracy,...(dispel!==null?{dispel}: {}) });
        return { ok: false, fizzled: true };
    }
    const realcost = U.payCard(caster, card, R);
    // card_server.lua L2577-2598; mob_server.lua L3197-3200. Forced fizzle
    // happens AFTER pip payment, before cooldown/effect execution.
    const immune=caster.isMob&&[true,'true'].includes(caster.template?.attributes?.is_immune_to_dispel);
    if(dispel!==null&&!immune){
        caster.totals.fizzles++;
        if(seq!==undefined)U.markCardFizzled(caster,seq);
        emit(arena,{type:'fizzle',caster:caster.id,card:card.key,target:target?.id??null,accuracy,dispel,reason:'dispel',realcost});
        return {ok:false,fizzled:true};
    }
    if (card.params.cooldown) U.setCooldown(caster, card.spellName, Number(card.params.cooldown));
    if (seq !== undefined) U.markCardUsed(caster, seq);
    emit(arena, { type: 'cast', caster: caster.id, card: card.key, cardType: card.type, target: target ? target.id : null, school: card.spellSchool, pipcost: card.pipcost, realcost });
    arena.cardStats[card.key] = (arena.cardStats[card.key] || 0) + 1;
    handlers[card.type](arena, caster, card, target || caster, realcost);
    const effectThreat={
        Global:['Global',true],Global2:['Global',true],MiniAura:['MiniAura',false],
        RemovePositiveCharm:['RemovePositiveCharm',false],RemoveNegativeCharm:['RemoveNegativeCharm',true],StealCharm:['StealCharm',false],
        Charms:['Charms',false],Wards:['Wards',false],AreaCharm:['AreaCharm',true],AreaWard:['AreaWard',true],Absorb:['Absorb',true],
        RemovePositiveWard:['RemovePositiveWard',false],StealWard:['StealWard',false],
        SymmetryWards:['SymmetryWards',false],ReflectionShield:['ReflectionShield',false],
        AreaPowerPipBoost:['AreaPowerPipBoost',true],AreaCleanse:['AreaCleanse',true],
    }[card.type];
    if(effectThreat)arena.onEffectThreat?.(caster,target||caster,...effectThreat);
    triggerHanziCard(arena,caster,card);
    reviveGuardians(arena);
    // Optional presentation observer also sees silent secondary effects (e.g. an
    // attack attaching a trap). It is not part of the deterministic event log.
    arena.onStatusEffect?.({type:'effects_settled',caster:caster.id,card:card.key});
    return { ok: true };
}
