import {prepareTactics,scoreTactic} from './haqi_tactics_core.js';
import * as U from '../combat_unit_core.js';
import {validTargets} from '../combat_arena_core.js';
import {useCard,tickDots,tickHots,isSupportedType,isAttackCard,expectedBaseDamage,reviveGuardians} from '../combat_cards_core.js';
import {hashSeed} from '../rng_core.js';
import {describeCard} from '../card_description_core.js';
import {integrateOutcomes} from './inference_core.js';

const publicFields=['id','name','side','slot','school','level','isMob','stats','maxHp','hp','pips','charms','wards','standingWards','dots','hots','miniaura','stance','stunned','cooldowns','remedy','hasStartupPips','turnsPlayed','totals','reflectAmount','stealth','stealthRounds','combatActive','freezeRounds','antiFreezeRounds','antiFreezeSiblingRounds','guardian','speciesId','enragedBy'];
const copy=value=>value===undefined?undefined:structuredClone(value);
export function observeBattle(arena,unitId,{periodicsApplied=false}={}) {
    const actor=arena.unitsById[unitId];if(!actor)throw Error('战斗位置不存在');
    const units=Object.values(arena.unitsById).map(unit=>{
        const out=Object.fromEntries(publicFields.filter(key=>unit[key]!==undefined).map(key=>[key,copy(unit[key])]));
        out.deckSeq=[];out.deckMap=[];
        // Only the acting unit's visible hand. Neither hidden order nor enemy deck
        // composition can reach the analysis layer, even through a copied arena.
        if(unit.id===unitId){for(const hand of U.cardsInHand(unit)){out.deckSeq[hand.seq]=hand.key;out.deckMap[hand.seq]=1;}
            if(unit.wordCards)out.wordCards=copy(Object.fromEntries(Object.entries(unit.wordCards).filter(([seq])=>unit.deckMap[seq]===1)));out.petDeckSeq=copy(unit.petDeckSeq||[]);out.petDeckMap=copy(unit.petDeckMap||[]);
        }
        if(unit.isMob){const attrs=unit.template?.attributes||{};out.template={hp:unit.maxHp,difficulty:unit.template?.difficulty,attributes:Object.fromEntries(['is_immune_to_dispel','is_immune_to_freeze','enrage_enable','enrage_stats_key','enrage_ai_cards_key','rarity','cannot_enrage_easy','cannot_enrage_normal','cannot_enrage_hard'].filter(key=>attrs[key]!==undefined).map(key=>[key,attrs[key]]))};}
        return out;
    });
    const remainingCounts={};for(let i=0;i<actor.deckSeq.length;i++)if(actor.deckMap[i]===0)remainingCounts[actor.deckSeq[i]]=(remainingCounts[actor.deckSeq[i]]||0)+1;
    return {unitId,units,remainingCards:Object.entries(remainingCounts).sort(([a],[b])=>a.localeCompare(b)).map(([key,count])=>({key,count})),resolved:arena.resolved,mode:arena.mode,turn:arena.turn,currentSide:arena.currentSide,
        remainingRounds:arena.remainingRounds,aura:copy(arena.aura),aura2:copy(arena.aura2),periodicsApplied,
        publicHistory:(arena.events||[]).filter(e=>e.type==='cast').slice(-32).map(e=>({caster:e.caster,key:e.card,turn:e.turn})),
        reflectionRulesVersion:arena.reflectionRulesVersion,stealthRulesVersion:arena.stealthRulesVersion,
        applyTempAntiFreezeForPartners:arena.applyTempAntiFreezeForPartners,specialCardRulesVersion:arena.specialCardRulesVersion,dispelRulesVersion:arena.dispelRulesVersion,threatRulesVersion:arena.threatRulesVersion};
}
function arenaFrom(observation,rng) {
    const units=copy(observation.units),a={...observation,rng,events:[],unsupported:{},cardStats:{},onEvent:null,
        sides:{near:units.filter(u=>u.side==='near'),far:units.filter(u=>u.side==='far')},unitsById:Object.fromEntries(units.map(u=>[u.id,u]))};
    for(const u of units)Object.defineProperty(u,'_arena',{value:a,enumerable:false});
    return a;
}
export function cardSemantics(card,resolved) {
    const p=card.params||{},effects=[];
    for(const id of String(p.charms||p.charm||'').split(',')){const effect=resolved.charms[id];if(effect)effects.push({kind:'charm',id,...effect});}
    for(const id of String(p.wards||p.ward||'').split(',')){const effect=resolved.wards[id];if(effect)effects.push({kind:'ward',id,...effect});}
    const roles=[];
    if(isAttackCard(card))roles.push('attack');
    if(/Heal|HoT/.test(card.type))roles.push('heal');
    if(/DOT|DoT/.test(card.type))roles.push('dot');
    if(/Cleanse|RemoveNegative/.test(card.type))roles.push('cleanse');
    if(/RemovePositiveWard|StealWard/.test(card.type))roles.push('breakShield');
    if(/RemovePositiveCharm|StealCharm/.test(card.type))roles.push('breakBoost');
    if(effects.some(e=>e.kind==='charm'&&Number(e.boost_damage)>0))roles.push('blade');
    if(effects.some(e=>e.kind==='ward'&&Number(e.boost_damage)>0))roles.push('trap');
    if(effects.some(e=>e.kind==='ward'&&Number(e.boost_damage)<0))roles.push('shield');
    if(effects.some(e=>Number(e.boost_damage)>0))roles.push('boost');
    if(effects.some(e=>Number(e.boost_damage)<0)||/Absorb|Shield/.test(card.type))roles.push('defend');
    if(effects.some(e=>e.dispel_school))roles.push('dispel');
    if(effects.some(e=>e.prism_from&&e.prism_to))roles.push('convert');
    if(/Pip/.test(card.type))roles.push('resource');
    return {key:card.key,type:card.type,school:card.spellSchool,cost:card.pipcost,effects,roles,
        support:isSupportedType(card.type)?'approximate':'unsupported',source:'combat_cards_core.js / card_server.lua UseCard'};
}
export function auditCards(resolved){return Object.values(resolved.cards).map(card=>cardSemantics(card,resolved));}
export function projectDecision(observation,action){
    const a=arenaFrom(observation,nominalRng()),unit=a.unitsById[observation.unitId];
    if(!observation.periodicsApplied){tickDots(a,unit);if(U.isAlive(unit))tickHots(a,unit);}
    if(!action.pass&&U.isAlive(unit)&&!unit.stunned)useCard(a,unit,a.resolved.cards[action.key],a.unitsById[action.targetId],action.seq);
    return Object.values(a.unitsById).map(u=>Object.fromEntries(publicFields.filter(key=>u[key]!==undefined).map(key=>[key,copy(u[key])])));
}

function potential(unit,a,settings){
    const R=a.resolved, scale=unit.maxHp*settings.reserveValue;
    const foes=Object.values(a.unitsById).filter(u=>u.side!==unit.side&&U.isAlive(u));
    const matches=(effect,units)=>!effect.school||effect.school==='all'||units.some(u=>u.school===effect.school);
    let value=0;
    for(const id of unit.charms){const effect=R.charms[id];if(!effect)continue;
        if(matches(effect,[unit])&&Number(effect.boost_damage)<0)value+=scale*Number(effect.boost_damage)/100;
        if(effect.dispel_school===unit.school)value-=scale;
    }
    for(const ward of unit.wards){const effect=R.wards[ward.id];if(ward.absorb)value+=Math.min(ward.pts||0,scale);
        if(effect&&matches(effect,foes)&&Number(effect.boost_damage)<0)value-=scale*Number(effect.boost_damage)/100;
    }
    value+=Math.min(unit.reflectAmount||0,scale);
    if(unit.guardian)value+=Math.min(R.global.guardianReviveHp,unit.maxHp)*settings.reserveValue;
    if(unit.stunned)value-=scale;
    return value;
}
function boardValue(a,side,settings){
    let value=0;
    for(const unit of Object.values(a.unitsById)){
        const sign=unit.side===side?1:-1;
        value+=sign*(unit.hp+(U.isAlive(unit)?settings.lethalValue:0)+potential(unit,a,settings));
    }
    return value;
}
function nominalRng(){const rng={probability:p=>p>=0.5,int:(lo,hi)=>Math.floor((lo+hi)/2)};rng.pick=arr=>arr?.[0];return rng;}
function publicThreats(observation){
    const actor=observation.units.find(u=>u.id===observation.unitId),a=arenaFrom(observation,nominalRng());
    return observation.units.filter(u=>u.side!==actor.side&&U.isAlive(u)).map(enemy=>{
        const caster=a.unitsById[enemy.id];U.generateUnitPip(caster,a,a.resolved,a.rng);
        const seen=observation.publicHistory.filter(e=>e.caster===enemy.id).map(e=>e.key);
        const cards=Object.values(a.resolved.cards).filter(card=>isSupportedType(card.type)&&isAttackCard(card)&&card.spellSchool===enemy.school&&Number(card.requireLevel||0)<=enemy.level&&U.canCast(caster,card,a.resolved));
        const known=cards.filter(c=>seen.includes(c.key));
        const style=`Aggressive${enemy.school.charAt(0).toUpperCase()}${enemy.school.slice(1)}`;
        const publicPrior=new Set(Object.keys(a.resolved.aiDecks[style]?.cards||{}));
        const ordinary=cards.filter(c=>publicPrior.has(c.key));
        // Source templates often omit level metadata. Do not infer that an NPC-
        // only or special accuracy variant is a learnable low-level player card.
        const prior=ordinary.length?ordinary:cards.filter(c=>!/(NPC|Boss|Rune|VIP|1000Accuracy|Crazy|Pet|Deleted)/i.test(c.key));
        const ranked=(known.length?known:prior).sort((x,y)=>expectedBaseDamage(y)-expectedBaseDamage(x)||x.key.localeCompare(y.key)).slice(0,3);
        const total=ranked.reduce((sum,card)=>sum+1+seen.filter(key=>key===card.key).length,0);
        return {unitId:enemy.id,source:known.length?'observed':'schoolPrior',cards:ranked.map(card=>({key:card.key,probability:(1+seen.filter(key=>key===card.key).length)/total}))};
    });
}
function exposure(a,side,settings){
    let penalty=0;
    for(const threat of settings.context?.threats||[]){
        if(!U.isAlive(a.unitsById[threat.unitId]))continue;
        for(const hypothesis of threat.cards){
            const observation={...a,units:Object.values(a.unitsById)},b=arenaFrom(observation,nominalRng()),caster=b.unitsById[threat.unitId],card=b.resolved.cards[hypothesis.key];
            U.generateUnitPip(caster,b,b.resolved,b.rng);if(!U.canCast(caster,card,b.resolved))continue;
            const targets=validTargets(b,caster,card).filter(t=>t.side===side).sort((x,y)=>x.hp-y.hp),target=targets[0];if(!target)continue;
            const before=Object.values(b.unitsById).filter(u=>u.side===side&&U.isAlive(u)).map(u=>({id:u.id,hp:u.hp}));
            useCard(b,caster,card,target);
            for(const row of before){const after=b.unitsById[row.id];if(after.hp<=0)penalty+=hypothesis.probability*settings.lethalValue*settings.survivalValue;
                else penalty+=hypothesis.probability*Math.max(0,row.hp-after.hp)*settings.reserveValue;
            }
        }
    }
    return penalty;
}
function simulate(observation,action,rng,settings){
    const a=arenaFrom(observation,rng),unit=a.unitsById[observation.unitId],before=boardValue(a,unit.side,settings);
    const initialExposure=settings.initialExposure||0;
    const pipBefore=U.pipValue(unit);
    for(const seq of action.discardSeqs||[])U.discardCard(unit,seq);
    let diedFromDot=false;
    if(!observation.periodicsApplied){tickDots(a,unit);diedFromDot=!U.isAlive(unit);reviveGuardians(a);if(!diedFromDot)tickHots(a,unit);}
    if(!diedFromDot&&U.isAlive(unit)&&!unit.stunned&&!action.pass){const card=a.resolved.cards[action.key],target=a.unitsById[action.targetId];useCard(a,unit,card,target,action.seq);}
    // Materialize one tick of known periodic effects to value DOT/HOT through the
    // real engine. Longer survival/hidden enemy responses remain approximate.
    for(const enemy of Object.values(a.unitsById))if(enemy.id!==unit.id&&U.isAlive(enemy)){tickDots(a,enemy);if(U.isAlive(enemy))tickHots(a,enemy);}
    reviveGuardians(a);
    const riskReduction=settings.difficulty==='easy'?0:initialExposure-exposure(a,unit.side,settings);
    const immediate=boardValue(a,unit.side,settings)-before-(pipBefore-U.pipValue(unit))*settings.pipValue+riskReduction;
    const tactic=settings.difficulty==='easy'?{score:0,goal:null}:scoreTactic(observation,a,action,settings,{arenaFrom,nominalRng,semantics:cardSemantics});
    return {score:immediate,immediate,riskReduction,tactic,
        damage:a.events.filter(e=>e.type==='damage'&&a.unitsById[e.target]?.side!==unit.side).reduce((s,e)=>s+e.amount,0),
        heal:a.events.filter(e=>e.type==='heal'&&a.unitsById[e.target]?.side===unit.side).reduce((s,e)=>s+e.amount,0),
        lethal:Object.values(a.unitsById).filter(u=>u.side!==unit.side&&u.hp<=0&&observation.units.find(v=>v.id===u.id)?.hp>0).length,
        died:unit.hp<=0,events:a.events,pips:unit.pips};
}
export const haqiRulesAdapter={
    settings:observation=>observation.resolved.battleAI,
    prepare:(observation,settings,memory)=>{const context={threats:publicThreats(observation)},a=arenaFrom(observation,nominalRng());context.initialExposure=exposure(a,a.unitsById[observation.unitId].side,{...settings,context});context.tactics=prepareTactics(observation,settings,memory,{arenaFrom,nominalRng,semantics:cardSemantics});return context;},
    summarize:context=>context?.tactics?.goal||null,
    nextMemory:(context,memory)=>({...memory,targetId:context?.tactics?.goal?.targetId||null}),
    stateId:observation=>{
        // Earth geography/visual budgets must never change combat decision seeds.
        const {earth,...resolved}=observation.resolved;
        return String(hashSeed(JSON.stringify({...observation,resolved})));
    },
    coverage:observation=>U.selectableCards(observation.units.find(u=>u.id===observation.unitId)).map(h=>observation.resolved.cards[h.key]).filter(Boolean).filter(c=>!isSupportedType(c.type)).map(c=>({key:c.key,type:c.type,status:'unsupported'})),
    actions(observation,settings={}){
        const a=arenaFrom(observation,null),unit=a.unitsById[observation.unitId],out=[{pass:true}];
        if(!U.isAlive(unit)||unit.stunned)return out;
        for(const h of U.selectableCards(unit)){if(unit.wordCards?.[h.seq]&&!unit.wordCards[h.seq].activated)continue;const card=a.resolved.cards[h.key];if(!card||!isSupportedType(card.type)||!U.canCast(unit,card,a.resolved))continue;
            for(const target of validTargets(a,unit,card))out.push({seq:h.seq,key:h.key,targetId:target.id});
        }
        const base=[...out];
        for(const drops of settings.context?.tactics?.discardBundles||[]){
            out.push(...base.filter(p=>!drops.includes(p.seq)).map(p=>({...p,discardSeqs:drops})));
        }
        return out;
    },
    evaluate(observation,action,settings){
        settings={...settings,initialExposure:settings.difficulty==='easy'?0:settings.context?.initialExposure||0};
        const branchBudget=Math.max(3,Math.round(settings.branches*(settings.difficulty==='expert'?2:settings.difficulty==='easy'?0.5:1)));
        const central=simulate(observation,action,nominalRng(),settings);
        // Integrate spell randomness exactly where the budget allows. Unknown
        // enemy intentions / nominal continuation are computed once per action,
        // not re-expanded for every crit and damage branch of every target.
        const forecast=integrateOutcomes(rng=>simulate(observation,action,rng,{...settings,difficulty:'easy',initialExposure:0}),{branches:branchBudget});
        const mean=key=>forecast.leaves.reduce((sum,row)=>sum+row.probability*Number(row.value[key]),0);
        const score=mean('score')+central.riskReduction+central.tactic.score,card=observation.resolved.cards[action.key];
        const evidence=[{code:'effective_result',text:`预计伤害 ${Math.round(mean('damage'))}，恢复 ${Math.round(mean('heal'))}`,damage:mean('damage'),heal:mean('heal')}];
        if(card){const description=describeCard(card,{dataset:{charms:{charm:observation.resolved.charms,ward:observation.resolved.wards,miniaura:observation.resolved.miniauras,globalaura:observation.resolved.globalauras}}});evidence.unshift({code:'mechanism',text:description.summary});}
        const goal=central.tactic.goal;
        if(goal){const name=observation.units.find(u=>u.id===goal.targetId)?.name||'目标';evidence.push({code:'tactical_goal',text:`优先针对${name}，${goal.source==='remaining'?'还需补到目标攻击牌；':''}按当前效果、魔力足够时，该攻击命中约造成 ${Math.round(goal.base.damage)} 伤害`,targetId:goal.targetId,attackKey:goal.attackKey,source:goal.source});
            if(goal.steps.length)evidence.push({code:'tactical_setup',text:`可通过${goal.steps.map(step=>({breakShield:'破盾',blade:'叠术',trap:'放陷阱',convert:'棱镜转换',cleanse:'净化'}[step.role])).join('、')}提高本次爆发收益`,steps:goal.steps,preparedDamage:goal.prepared.damage});
        }
        if(central.tactic.draw)evidence.push({code:'tactical_draw',text:'弃掉与当前战术关联较弱或重复的牌，提高下次补牌获得所需能力的机会；不能保证抽到',...central.tactic.draw,discardSeqs:action.discardSeqs});
        if(card?.pipcost)evidence.push({code:'pip_cost',text:'已按本系与跨系规则计算超级魔力点消耗'});
        if(central.riskReduction>0)evidence.push({code:'survival',text:'按对手公开行动与学系推测，这个选择可减轻下一轮生存压力',value:central.riskReduction});

        const enemies=observation.units.filter(u=>u.side!==observation.units.find(v=>v.id===observation.unitId).side&&U.isAlive(u)).length;
        const decisive=enemies>0&&mean('lethal')>=enemies*0.999&&mean('died')===0;
        const confidence=forecast.confidence*(!decisive&&(central.tactic.score!==0||central.riskReduction!==0)?0.75:1);
        const schoolName={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡',balance:'平衡',myth:'神话'}[card?.spellSchool]||'魔法';
        const targetName=observation.units.find(u=>u.id===action.targetId)?.name||'所选目标';
        return {score,label:action.pass?'等待魔力':`${card?.name||`${schoolName}系卡牌（${card?.pipcost??0}费）`} → ${targetName}`,confidence,evidence,
            forecast:{damage:mean('damage'),heal:mean('heal'),lethalProbability:mean('lethal'),deathProbability:mean('died'),approximateMass:forecast.approximateMass,tactic:central.tactic},
            limitations:['敌方行动根据公开记录与学系推测，不代表其实际手牌','爆发组合按当前公开状态作条件比较，不预测多轮敌方行动；补牌概率来自剩余卡牌数量']};
    },
};
