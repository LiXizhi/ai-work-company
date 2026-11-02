// combat_arena_core.js — 回合状态机（对应 arena_server.lua 的 *_v PvP 流程）。
// StartCombat_v(L4258) → AdvanceOneTurn_v(L4775) → PlayOneTurn_v(L5401) → FinishOneTurn_v(L5740) → FinishCombat_v
// PvP 每个 turn 只有一方行动（currentPlayingSide 交替）；nRemainingRounds 每 turn 减 1。
import { createRng, hashSeed } from './rng_core.js';
import {canEnrageTarget} from './combat_enrage_core.js';
import * as U from './combat_unit_core.js';
import { useCard, tickDots, tickHots, cardTargetKind, canTargetStealth, specialCardsEnabled, hasConvertibleWard, reviveGuardians } from './combat_cards_core.js';

export const SIDES = ['near', 'far'];

function emit(arena, ev) {
    ev.turn = arena.turn;
    arena.events.push(ev);
    if (arena.onEvent) arena.onEvent(ev);
}

/**
 * @param opts { resolved, near: unitSpec[], far: unitSpec[], seed?, firstSide?: 'near'|'far'|'random', onEvent?, keepEvents? }
 */
export function createArena(opts) {
    if (opts.specialCardRulesVersion !== undefined && ![0,1].includes(opts.specialCardRulesVersion)) throw Error('特殊卡牌规则版本无效');
    const seed = opts.seed ?? 1;
    const rng = createRng(typeof seed === 'string' ? hashSeed(seed) : seed);
    const arena = {
        resolved: opts.resolved,
        rng,
        seed,
        mode: 'free_pvp',
        specialCardRulesVersion: opts.specialCardRulesVersion ?? (opts.resolved.version === 'kids' ? 1 : 0),
        applyTempAntiFreezeForPartners: opts.applyTempAntiFreezeForPartners === true,
        turn: 0,
        remainingRounds: opts.resolved.global.maxRounds,
        currentSide: null,
        firstSide: opts.firstSide || 'random',
        sides: { near: [], far: [] },
        unitsById: {},
        aura: null,
        aura2: null,
        events: [],
        keepEvents: opts.keepEvents !== false,
        onEvent: opts.onEvent || null,
        unsupported: {},
        cardStats: {},
        finished: false,
        winner: null,
        timeout: false,
        phase: 'init', // init | pick | done
    };
    for (const side of SIDES) {
        (opts[side] || []).forEach((spec, i) => {
            const unit = U.createUnit({ ...spec, side, slot: i, id: spec.id || `${side}${i + 1}` }, arena.resolved);
            Object.defineProperty(unit, '_arena', { value: arena, enumerable: false, writable: true });
            arena.sides[side].push(unit);
            arena.unitsById[unit.id] = unit;
        });
    }
    return arena;
}

export function allUnits(arena) {
    return [...arena.sides.near, ...arena.sides.far];
}

export function enemiesOf(arena, unit) {
    return arena.sides[unit.side === 'near' ? 'far' : 'near'];
}
export function alliesOf(arena, unit) {
    return arena.sides[unit.side];
}

/** arena_server.lua L4258-4300 StartCombat_v：决定先手、洗牌 */
export function startCombat(arena) {
    if (arena.firstSide === 'random') arena.currentSide = arena.rng.int(0, 200) <= 100 ? 'far' : 'near';
    else arena.currentSide = arena.firstSide === 'near' ? 'far' : 'near'; // advanceTurn 会先交换
    arena.firstActingSide = arena.currentSide === 'near' ? 'far' : 'near';
    for (const u of allUnits(arena)) U.shuffleDeck(u, arena.rng);
    emit(arena, { type: 'combat_start', firstSide: arena.firstActingSide, near: arena.sides.near.map(u => U.summarizeUnit(u, arena.resolved)), far: arena.sides.far.map(u => U.summarizeUnit(u, arena.resolved)) });
    advanceTurn(arena);
}

/**
 * arena_server.lua L4775-4960 AdvanceOneTurn_v：
 * 交换行动方；全体开局 pips（一次）；行动方存活单位：生成 pip、弃牌结算、冷却、光环/姿态/保护回合递减；补手牌。
 */
export function advanceTurn(arena) {
    arena.turn += 1;
    arena.currentSide = arena.currentSide === 'near' ? 'far' : 'near';
    const R = arena.resolved;
    for (const u of allUnits(arena)) {
        u.picked = null;
        if (!u.hasStartupPips && U.isAlive(u)) U.setStartupPips(u, R);
    }
    for (const u of arena.sides[arena.currentSide]) {
        if (!U.isAlive(u)) continue;
        const kind = U.generateUnitPip(u, arena, R, arena.rng);
        U.validateDiscardedCards(u);
        U.validateCooldown(u);
        U.validateRounds(u);
        U.prepareCard(u, R.global.handSize);
        emit(arena, { type: 'pip', unit: u.id, kind, pips: { ...u.pips } });
    }
    arena.phase = 'pick';
    emit(arena, { type: 'turn_begin', side: arena.currentSide, remainingRounds: arena.remainingRounds });
}

/** 当前需要出牌的单位（行动方存活单位） */
export function actingUnits(arena) {
    return arena.sides[arena.currentSide].filter(U.isAlive);
}

/** 目标是否对该卡合法 */
export function validTargets(arena, unit, card) {
    const kind = cardTargetKind(card);
    const available=target=>U.isAlive(target)&&(arena.stealthRulesVersion!==1||canTargetStealth(card,target))&&
        (!specialCardsEnabled(arena) || (card.type !== 'ConversePositiveWard' || hasConvertibleWard(target,card)) &&
        (card.type !== 'SingleGuardianWithImmolate' || !target.speciesId || target.isMob));
    if (kind === 'self') return available(unit)?[unit]:[];
    if (kind === 'friendly') return alliesOf(arena, unit).filter(available);
    if (kind === 'all') return [...enemiesOf(arena, unit).filter(available), ...alliesOf(arena, unit).filter(available)];
    const enemies = enemiesOf(arena, unit).filter(available);
    if (card.type === 'Enrage' && specialCardsEnabled(arena)) return enemies.filter(target=>canEnrageTarget(arena,unit,card,target));
    if (card.type === 'CatchPet') return arena.captureRulesVersion===1
        ? enemiesOf(arena,unit).filter(target=>target.isMob&&U.isAlive(target)&&target.template?.speciesId)
        : enemies.filter(target => !target.enragedBy && target.template?.speciesId && !arena.ownedPets?.includes(target.template.speciesId) && !arena.captured?.includes(target.template.speciesId));
    return enemies;
}

/** 手牌中可施放的卡 [{seq, key, card}] */
export function castableCards(arena, unit) {
    const R = arena.resolved;
    const out = [];
    for (const { seq, key } of U.selectableCards(unit)) {
        const card = R.cards[key];
        if (card && (!unit.wordCards?.[seq]||unit.wordCards[seq].activated) && U.canCast(unit, card, R)) out.push({ seq, key, card });
    }
    return out;
}

/**
 * arena_server.lua L5401-5510 PlayOneTurn_v + FinishOneTurn_v(L5740-5760)
 * @param picks { [unitId]: {seq, key, targetId} | {pass:true} | null }
 */
export function playTurn(arena, picks = {}) {
    if (arena.finished) return;
    const R = arena.resolved;
    arena.phase = 'play';
    for (const u of arena.sides[arena.currentSide]) {
        if (!U.isAlive(u)) continue;
        u.turnsPlayed++;
        // 行动前结算自身 DOT / HOT（card_server.lua L1841 / L2173）
        tickDots(arena, u);
        const diedFromDot = !U.isAlive(u);
        reviveGuardians(arena);
        if (diedFromDot) { checkFinish(arena); if (arena.finished) return; continue; }
        tickHots(arena, u);
        if (u.stunned) {
            u.stunned = false;
            u.totals.passes++;
            emit(arena, { type: 'pass', caster: u.id, reason: 'stunned' });
            continue;
        }
        if (u.freezeRounds > 0) {
            u.totals.passes++;
            emit(arena, {type:'pass', caster:u.id, reason:'frozen'});
            continue;
        }
        const pick = picks[u.id] || u.picked;
        // 弃牌（player_server.lua L891 DiscardCard）：与是否出牌无关，下次轮到自己时变为已用并补牌
        if (pick && pick.discardSeqs) for (const s of pick.discardSeqs) U.discardCard(u, s);
        if (!pick || pick.pass) {
            u.totals.passes++;
            const noCards = U.cardsInHand(u).length === 0;
            if (noCards) u.totals.noCardPasses++;
            emit(arena, { type: 'pass', caster: u.id, reason: noCards ? (U.isDeckExhausted(u) ? 'deck_empty' : 'no_cards') : 'pass' });
            continue;
        }
        const card = R.cards[pick.key];
        const handEntry = U.cardsInHand(u).find(c => c.seq === pick.seq && c.key === pick.key);
        if (!card || !handEntry || !U.canCast(u, card, R)) {
            u.totals.passes++;
            emit(arena, { type: 'pass', caster: u.id, reason: 'invalid_pick', key: pick.key });
            continue;
        }
        const targets = validTargets(arena, u, card);
        let target = targets.find(t => t.id === pick.targetId);
        if (!target) target = targets[0];
        if (!target) {
            u.totals.passes++;
            emit(arena, { type: 'pass', caster: u.id, reason: 'no_target' });
            continue;
        }
        useCard(arena, u, card, target, pick.seq);
        checkFinish(arena);
        if (arena.finished) return;
    }
    arena.remainingRounds -= 1; // arena_server.lua L5064
    emit(arena, { type: 'turn_end', side: arena.currentSide, remainingRounds: arena.remainingRounds });
    checkFinish(arena);
    if (!arena.finished) {
        if (!arena.keepEvents) arena.events.length = 0;
        advanceTurn(arena);
    }
}

/** arena_server.lua IsCombatFinished_v + nRemainingRounds<=0 */
export function checkFinish(arena) {
    if (arena.finished) return true;
    reviveGuardians(arena);
    const nearAlive = arena.sides.near.some(U.isAlive);
    const farAlive = arena.sides.far.some(U.isAlive);
    if (!nearAlive || !farAlive) {
        arena.finished = true;
        arena.winner = nearAlive ? 'near' : (farAlive ? 'far' : null);
    } else if (arena.remainingRounds <= 0) {
        arena.finished = true;
        arena.timeout = true;
        arena.winner = null;
    } else if (allDecksExhausted(arena)) {
        // 模拟器加速：双方存活单位卡包全部打空且无 DOT 在身 → 之后只剩跳过，结果必然是回合耗尽平局，提前判定
        arena.finished = true;
        arena.timeout = true;
        arena.decksExhausted = true;
        arena.winner = null;
    }
    if (arena.finished) {
        arena.phase = 'done';
        emit(arena, { type: 'combat_end', winner: arena.winner, timeout: arena.timeout, decksExhausted: !!arena.decksExhausted, turn: arena.turn, hp: hpSnapshot(arena) });
    }
    return arena.finished;
}

/** 双方存活单位是否都已打空卡包（手牌为空、无可抽）且身上没有 DOT（DOT 仍可能改变结果） */
export function allDecksExhausted(arena) {
    const alive = allUnits(arena).filter(U.isAlive);
    if (!alive.length) return false;
    for (const u of alive) {
        if (!U.isDeckExhausted(u)) return false;
        if (u.dots.some(d => d.ticks.length)) return false;
    }
    return true;
}

export function hpSnapshot(arena) {
    const out = {};
    for (const u of allUnits(arena)) out[u.id] = { hp: u.hp, maxHp: u.maxHp };
    return out;
}

export function sideHpRatio(arena, side) {
    const units = arena.sides[side];
    const hp = units.reduce((a, u) => a + u.hp, 0);
    const max = units.reduce((a, u) => a + u.maxHp, 0);
    return max ? hp / max : 0;
}

/**
 * 用各单位 policy 自动跑完整场（批量模拟用）。
 * @param policies { [unitId]: policy } 或 unit.policy；policy.pick(arena, unit) → pick
 * @param maxTurns 安全上限
 */
export function runToEnd(arena, policies = {}, maxTurns = 1000, planPicks = null) {
    if (arena.phase === 'init') startCombat(arena);
    while (!arena.finished && arena.turn < maxTurns) {
        const picks = planPicks ? planPicks(arena,policies) : {};
        for (const u of planPicks ? [] : actingUnits(arena)) {
            const pol = policies[u.id] || u.policy;
            picks[u.id] = pol ? pol.pick(arena, u) : { pass: true };
        }
        playTurn(arena, picks);
    }
    if (!arena.finished) { arena.finished = true; arena.timeout = true; arena.phase = 'done'; }
    return summarizeResult(arena);
}

export function summarizeResult(arena) {
    const units = {};
    for (const u of allUnits(arena)) {
        units[u.id] = { side: u.side, school: u.school, hp: u.hp, maxHp: u.maxHp, deckSize: U.deckSize(u), deckRemaining: U.deckRemaining(u), ...u.totals };
    }
    return {
        winner: arena.winner,
        timeout: arena.timeout,
        decksExhausted: !!arena.decksExhausted,
        firstSide: arena.firstActingSide || null,
        turns: arena.turn,
        rounds: Math.ceil(arena.turn / 2),
        seed: arena.seed,
        units,
        cardStats: arena.cardStats,
        unsupported: arena.unsupported,
        nearHpRatio: sideHpRatio(arena, 'near'),
        farHpRatio: sideHpRatio(arena, 'far'),
    };
}

/** UI 用快照 */
export function snapshot(arena) {
    return {
        turn: arena.turn,
        remainingRounds: arena.remainingRounds,
        currentSide: arena.currentSide,
        phase: arena.phase,
        finished: arena.finished,
        winner: arena.winner,
        timeout: arena.timeout,
        aura: arena.aura ? { ...arena.aura } : null,
        near: arena.sides.near.map(u => U.summarizeUnit(u, arena.resolved)),
        far: arena.sides.far.map(u => U.summarizeUnit(u, arena.resolved)),
    };
}
