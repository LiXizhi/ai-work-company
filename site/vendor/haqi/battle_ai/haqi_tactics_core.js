import * as U from '../combat_unit_core.js';
import {validTargets} from '../combat_arena_core.js';
import {useCard,isAttackCard,isSupportedType,expectedBaseDamage} from '../combat_cards_core.js';
import {isOwnSchoolCost} from '../combat_formulas_core.js';

const clone=(observation,arena,tools)=>tools.arenaFrom({...observation,units:Object.values(arena.unitsById)},tools.nominalRng());
const unique=rows=>[...new Map(rows.map(r=>[r.key,r])).values()];
export function drawChance(total,wanted,draws){
    if(total<=0||wanted<=0)return 0;
    let miss=1;for(let i=0;i<Math.min(total,Math.max(0,draws));i++)miss*=Math.max(0,total-wanted-i)/(total-i);
    return 1-miss;
}

// Resource feasibility only: no turn advance, invented draws, or enemy actions.
// The same public buffs and shields remain in place for each conditional probe.
function probe(observation,arena,attack,targetId,settings,tools){
    const b=clone(observation,arena,tools),actor=b.unitsById[observation.unitId],card=b.resolved.cards[attack.key],target=b.unitsById[targetId];
    if(!card||!target||!U.isAlive(actor)||!U.isAlive(target))return null;
    const own=isOwnSchoolCost(card.spellSchool,actor.school,b.resolved.version),current={...actor.pips};
    const chance=Math.max(0,Math.min(1,U.getPowerPipChance(actor,b,b.resolved)/100)),cap=b.resolved.global.maxPips;
    const effective=p=>p.normal+p.power*(own?2:1);
    const missing=Math.max(0,Number(card.pipcost)-effective(current));
    let add=missing;
    // Fill missing ordinary pips algebraically; if slots are insufficient, the
    // conditional resource goal requires power pips. This is never a prediction.
    const room=Math.max(0,cap-current.normal-current.power),normal=Math.min(room,add);
    actor.pips.normal+=normal;add-=normal;
    if(add>0&&own&&chance>0){const upgrades=Math.min(add,actor.pips.normal);actor.pips.normal-=upgrades;actor.pips.power+=upgrades;add-=upgrades;}
    if(add>0)return null;
    const cooldown=Math.max(0,actor.cooldowns[card.spellName]||0);actor.cooldowns[card.spellName]=0;
    if(!U.canCast(actor,card,b.resolved)||!validTargets(b,actor,card).some(t=>t.id===targetId))return null;
    const projected={...actor.pips},before=U.pipValue(actor),hp=Object.fromEntries(Object.values(b.unitsById).map(u=>[u.id,u.hp]));
    useCard(b,actor,card,target,attack.seq);
    const damage=b.events.filter(e=>e.type==='damage'&&b.unitsById[e.target]?.side!==actor.side).reduce((sum,e)=>sum+e.amount,0);
    const enemies=Object.values(b.unitsById).filter(u=>u.side!==actor.side),effectiveDamage=enemies.reduce((sum,u)=>sum+Math.max(0,hp[u.id]-u.hp),0);
    const kills=enemies.filter(u=>hp[u.id]>0&&!U.isAlive(u)).length,cost=before-U.pipValue(actor);
    return {damage,effectiveDamage,kills,value:effectiveDamage+kills*settings.lethalValue,pipEquivalentSpent:cost,
        normalSpent:projected.normal-actor.pips.normal,powerSpent:projected.power-actor.pips.power,damagePerPip:cost>0?effectiveDamage/cost:null,
        resource:{current,projected,missing,estimatedWait:Math.max(cooldown,missing/(own&&current.normal+current.power>=cap&&missing>0?Math.max(chance,Number.EPSILON):1+(own?chance:0))),slotsUsed:current.normal+current.power,cap},
        conditional:missing>0||cooldown>0};
}
function recipe(observation,arena,attack,targetId,settings,tools){
    const base=probe(observation,arena,attack,targetId,settings,tools);if(!base)return null;
    let prepared=base,b=clone(observation,arena,tools);const steps=[],used=new Set();
    const limit=settings.difficulty==='easy'?0:settings.difficulty==='normal'?1:settings.tacticalSetupLimit;
    // Fixed mechanism order, not a tree of future rounds. Only actual damage
    // improvement earns a slot; repeated non-stacking effects earn nothing.
    for(const role of ['cleanse','breakShield','convert','blade','trap']){
        if(steps.length>=limit)break;
        const actor=b.unitsById[observation.unitId];
        const cards=unique(U.selectableCards(actor)).filter(h=>!used.has(h.seq)&&!isAttackCard(b.resolved.cards[h.key])&&tools.semantics(b.resolved.cards[h.key],b.resolved).roles.includes(role)
            &&Number(b.resolved.cards[h.key].pipcost)<=settings.tacticalSetupMaxCost&&U.canCast(actor,b.resolved.cards[h.key],b.resolved));
        let best=null;
        for(const h of cards.slice(0,settings.chainCandidates))for(const target of validTargets(b,actor,b.resolved.cards[h.key]).filter(t=>t.id===targetId||t.id===actor.id)){
            const next=clone(observation,b,tools),caster=next.unitsById[actor.id],pipsBefore=U.pipValue(caster);
            useCard(next,caster,next.resolved.cards[h.key],next.unitsById[target.id],h.seq);
            const impact=probe(observation,next,attack,targetId,settings,tools);if(!impact)continue;
            const gain=impact.value-prepared.value;
            if(gain>0&&(!best||gain>best.gain))best={arena:next,impact,gain,step:{key:h.key,seq:h.seq,targetId:target.id,role,damageGain:impact.damage-prepared.damage,pipEquivalentSpent:pipsBefore-U.pipValue(caster)}};
        }
        if(best){b=best.arena;prepared=best.impact;steps.push(best.step);used.add(best.step.seq);}
    }
    const totalCost=prepared.pipEquivalentSpent+steps.reduce((sum,s)=>sum+s.pipEquivalentSpent,0);
    return {version:2,targetId,attackKey:attack.key,attackSeq:attack.seq,source:attack.source,base,prepared,steps,comboPipEquivalentSpent:totalCost,comboDamagePerPip:totalCost>0?prepared.effectiveDamage/totalCost:null};
}
export function prepareTactics(observation,settings,memory,tools){
    const arena=tools.arenaFrom(observation,tools.nominalRng()),actor=arena.unitsById[observation.unitId];
    const pool=observation.remainingCards||[],total=pool.reduce((s,r)=>s+r.count,0),hand=U.cardsInHand(actor);
    const attackCard=h=>arena.resolved.cards[h.key]&&isSupportedType(arena.resolved.cards[h.key].type)&&isAttackCard(arena.resolved.cards[h.key]);
    const rank=(a,b)=>expectedBaseDamage(arena.resolved.cards[b.key])-expectedBaseDamage(arena.resolved.cards[a.key]);
    const held=unique(U.selectableCards(actor)).filter(attackCard).map(h=>({...h,source:'hand'}));
    const missing=pool.filter(r=>attackCard(r)&&!held.some(h=>h.key===r.key)).map(r=>({...r,source:'remaining'}));
    const candidates=[...held.sort(rank).slice(0,settings.chainCandidates),...missing.sort(rank).slice(0,settings.tacticalMissingAttackCandidates)];
    const goals=[];
    for(const attack of candidates)for(const enemy of observation.units.filter(u=>u.side!==actor.side&&U.isAlive(u))){
        const goal=recipe(observation,arena,attack,enemy.id,settings,tools);if(!goal)continue;
        const probability=attack.source==='hand'?1:drawChance(total,attack.count,Math.max(1,arena.resolved.global.handSize-hand.length));
        goal.drawProbability=probability;
        goal.utility=(goal.prepared.value+(goal.comboDamagePerPip||0)*settings.pipEfficiencyWeight)*probability/
            (1+goal.prepared.resource.estimatedWait*settings.tacticalWaitCost+goal.steps.length*settings.tacticalSetupCost);
        if(memory?.targetId===enemy.id)goal.utility*=1+settings.tacticalFocusRetention;
        goals.push(goal);
    }
    goals.sort((a,b)=>b.utility-a.utility||a.targetId.localeCompare(b.targetId));
    const goal=goals[0]||null,missingKeys=[],drawGains={};
    if(goal){
        const actorId=actor.id;
        // A small set of replacement capabilities, tested against the chosen
        // target's actual public effects. Deck counts are known; order is not.
        const possible=pool.filter(row=>{
            const c=arena.resolved.cards[row.key];return c&&isSupportedType(c.type)&&(row.key===goal.attackKey||(goal.source==='hand'&&!isAttackCard(c)&&tools.semantics(c,arena.resolved).roles.some(r=>['blade','trap','breakShield','cleanse','convert'].includes(r))));
        }).slice(0,settings.tacticalDrawCandidates);
        for(const row of possible){
            if(row.key===goal.attackKey){if(goal.source==='remaining'){missingKeys.push(row.key);drawGains[row.key]=goal.prepared.value;}continue;}
            const card=arena.resolved.cards[row.key];if(!U.canCast(actor,card,arena.resolved))continue;
            for(const target of validTargets(arena,actor,card).filter(t=>t.id===goal.targetId||t.id===actorId)){
                const next=clone(observation,arena,tools);useCard(next,next.unitsById[actorId],card,next.unitsById[target.id]);
                const impact=probe(observation,next,{key:goal.attackKey,seq:goal.attackSeq},goal.targetId,settings,tools);
                if(impact&&impact.value>goal.base.value){missingKeys.push(row.key);drawGains[row.key]=impact.value-goal.base.value;break;}
            }
        }
    }
    const wanted=pool.filter(r=>missingKeys.includes(r.key)).reduce((s,r)=>s+r.count,0);
    const meanDrawGain=wanted?pool.reduce((sum,r)=>sum+(drawGains[r.key]||0)*r.count,0)/wanted:0;
    const discard=[];
    if(goal&&wanted){
        const protectedAttack=held.find(h=>h.key===goal.attackKey)||held.slice().sort((a,b)=>expectedBaseDamage(arena.resolved.cards[b.key])-expectedBaseDamage(arena.resolved.cards[a.key]))[0];
        const seen=new Set();
        for(const h of hand){
            const c=arena.resolved.cards[h.key],semantic=tools.semantics(c,arena.resolved),duplicate=seen.has(h.key);seen.add(h.key);
            if(h.seq===protectedAttack?.seq||goal.steps.some(s=>s.seq===h.seq))continue;
            const irrelevantShield=semantic.roles.includes('shield')&&semantic.effects.every(e=>e.boost_damage<0&&e.school&&e.school!=='all'&&!observation.units.some(u=>u.side!==actor.side&&u.hp>0&&u.school===e.school));
            const spentSetup=semantic.effects.length&&semantic.effects.every(e=>e.boost_damage>0&&(e.kind==='charm'?actor.charms.includes(Number(e.id)):arena.unitsById[goal.targetId].wards.some(w=>w.id===Number(e.id))));
            const weakerAttack=isAttackCard(c)&&h.key!==goal.attackKey&&expectedBaseDamage(c)<expectedBaseDamage(arena.resolved.cards[goal.attackKey]);
            if(duplicate||irrelevantShield||spentSetup||weakerAttack)discard.push(h.seq);
        }
    }
    const drops=discard.slice(0,settings.tacticalMaxDiscards);
    return {goal,missingKeys,total,wanted,meanDrawGain,handCount:hand.length,discardBundles:drops.map((_,i)=>drops.slice(0,i+1))};
}

export function scoreTactic(observation,arena,action,settings,tools){
    const context=settings.context?.tactics,goal=context?.goal,actor=arena.unitsById[observation.unitId];
    if(!goal||!U.isAlive(actor))return {score:0,goal:null,draw:null};
    let score=0,after=null;
    const releases=action.key===goal.attackKey&&action.targetId===goal.targetId;
    const target=arena.unitsById[goal.targetId];
    if(target&&U.isAlive(target)){
        if(!releases){
            after=probe(observation,arena,{key:goal.attackKey,seq:goal.attackSeq},goal.targetId,settings,tools);
            if(after){
                score+=(after.value-goal.base.value)*settings.tacticalProgressWeight;
                score+=(goal.base.resource.estimatedWait-after.resource.estimatedWait)*settings.pipValue;
            }
        }else{
            // Releasing early gives up the still-achievable setup gain. At cap,
            // conserving pips stops being a reason to postpone an adequate hit.
            const room=goal.base.resource.cap-goal.base.resource.slotsUsed;
            score-=Math.max(0,goal.prepared.value-goal.base.value)*settings.tacticalEarlyReleaseCost*Math.min(1,room);
        }
    }
    if(!releases&&U.pipValue(actor)>=U.pipValue(observation.units.find(u=>u.id===actor.id))){
        const lostSlots=Math.max(0,actor.pips.normal+actor.pips.power+settings.tacticalCapReserve-arena.resolved.global.maxPips);
        score-=lostSlots*Math.max(settings.pipValue,goal.base.damagePerPip||0)*settings.tacticalOverflowCost;
    }
    let draw=null;
    if(action.discardSeqs?.length&&context.wanted){
        const played=Number(!action.pass&&U.cardsInHand(observation.units.find(u=>u.id===actor.id)).some(h=>h.seq===action.seq));
        const baseDraws=Math.max(0,observation.resolved.global.handSize-context.handCount+played),draws=baseDraws+action.discardSeqs.length;
        const before=drawChance(context.total,context.wanted,baseDraws),after=drawChance(context.total,context.wanted,draws);
        score+=(after-before)*context.meanDrawGain*settings.tacticalDrawWeight-action.discardSeqs.length*settings.tacticalDiscardCost;
        draw={keys:context.missingKeys,before,after,draws:Math.min(draws,context.total),population:context.total,wanted:context.wanted};
    }
    return {score,goal,after,draw};
}
