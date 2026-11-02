import {applyPetTraitStats} from './adventure_pet_traits_core.js';
import {applyHpStats} from './combat_formulas_core.js';
// Kids card_server.lua L2442–2511; mob_server.lua L1250–1279, L3923–3937,
// L4750–4755 and L5231–5380. Data comes from EnrageStats/EnrageAICards.xml.
import {isAlive, takeHeal} from './combat_unit_core.js';

export function canEnrageTarget(arena, caster, card, target) {
    if (arena.mode !== 'pve' || caster.isMob || !target?.isMob || !isAlive(target) || target.enragedBy) return false;
    const attrs = target.template?.attributes || {}, p = card.params || {}, catalog = arena.resolved.enrage;
    if (![true,'true'].includes(attrs.enrage_enable)) return false;
    if (target.level < Number(p.can_enrage_minlevel || 0) || target.level > Number(p.can_enrage_maxlevel || 0)) return false;
    // Lua tests presence/truthiness, not XML boolean coercion, for these flags.
    if (attrs.rarity === 'boss' && !p.can_enrage_boss) return false;
    const difficulty = target.template.difficulty || 'normal';
    if (['easy','normal','hard'].includes(difficulty) && attrs[`cannot_enrage_${difficulty}`]) return false;
    if (attrs.enrage_stats_key && !catalog?.stats?.[attrs.enrage_stats_key]) return false;
    const ai = attrs.enrage_ai_cards_key && catalog?.ai?.[attrs.enrage_ai_cards_key];
    if (attrs.enrage_ai_cards_key && !ai) return false;
    return !ai || [...ai.pool.map(r=>r.key), ...ai.sequences.flat().map(r=>r.card),
        ...ai.genes.map(r=>r.card), ...Object.values(ai.cardsets).flat().map(r=>r.key)]
        .filter(Boolean).every(key=>arena.resolved.cards[key]);
}

export function enrageTarget(arena, caster, target) {
    const original = target.template, catalog = arena.resolved.enrage;
    const attributes = {...original.attributes, ...catalog?.stats?.[original.attributes.enrage_stats_key]};
    const ai = catalog?.ai?.[original.attributes.enrage_ai_cards_key];
    target.template = {...original, ...(ai ? structuredClone(ai) : {}), attributes};
    target.enragedBy = caster.id;
    target.maxHp = Number(attributes.hp || original.maxHp || original.hp);
    target.hp = Math.min(target.hp, target.maxHp);
    for (const school of ['fire','ice','storm','life','death','all']) {
        target.stats.damagePct[school] = Number(attributes[`damage_${school}_percent`] || 0);
        target.stats.resistPct[school] = Number(attributes[`resist_${school}_percent`] || 0);
        target.stats.accuracyPct[school] = Number(attributes[`accuracy_${school}_percent`] || 0);
    }
    target.stats.powerPipPct = Number(attributes.power_pip_percent || 0);
    if(arena.petTraitRulesVersion===1&&target.passiveTraits){
        // Reapply only fields reset by enrage; retained crit/heal passives must not stack twice.
        const reset=Object.fromEntries(Object.entries(target.passiveTraits).filter(([key])=>['attack','defense','accuracy','mana'].includes(key)));
        target.stats=applyPetTraitStats(target.stats,reset,arena.resolved.petTraits);
        target.maxHp=applyHpStats(target.maxHp,applyPetTraitStats({},target.passiveTraits,arena.resolved.petTraits).hpPct,0,'kids');
    }
    // Original reset keeps sequence choices, only restarts round and HP memory.
    target.aiMemory = {...target.aiMemory, round:0, lastHp:target.maxHp};
    takeHeal(target, target.maxHp);
}
