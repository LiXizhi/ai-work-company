// Web-authored Hanzi card rules v1; original Lua damage/heal formulas are unchanged.
import {resolveParams} from './combat_params_core.js';

export const HANZI_BATTLE_CARDS = {huo:'火',shui:'水',tu:'土'};
export const ownsHanziCard = (progress,id) => progress?.memories?.fragments?.[id] >= 3 || progress?.questCards?.includes(id) || progress?.entries?.[id]?.attempts?.length === 3;
export function hanziBattleSpec(save,content) {
    if(save.pendingEncounter)return save.pendingEncounter.player?.hanziBattle?structuredClone(save.pendingEncounter.player.hanziBattle):null;
    const id=save.hanzi?.battleCard;
    if(!id||!ownsHanziCard(save.hanzi,id))return null;
    const params=resolveParams({cards:{},version:'kids'},content.balanceParams||{},{groups:['hanzi']}).hanzi;
    const spec={version:1,id,params:{...params}};validateHanziBattleSpec(spec);return spec;
}
export function validateHanziBattleSpec(spec) {
    if(!spec||spec.version!==1||!Object.hasOwn(HANZI_BATTLE_CARDS,spec.id)||!spec.params)throw Error('汉字战斗卡无效');
    for(const key of ['attackPercent','defensePercent','healPercent','maxTriggers']){
        const value=spec.params[key];
        if(!Number.isInteger(value)||value<1||value>100)throw Error('汉字增益参数无效');
    }
}
export function hanziBattleDescription(spec,triggers=0) {
    if(!spec)return '';
    const p=spec.params,action=spec.id==='huo'?`攻击 +${p.attackPercent}%` : spec.id==='tu'?`防御 +${p.defensePercent}%` : `恢复自身 ${p.healPercent}% 最大生命`;
    return `汉字卡「${HANZI_BATTLE_CARDS[spec.id]}」：成功施法后${action}，本场 ${triggers}/${p.maxTriggers} 次；攻击与防御持续到战斗结束`;
}
export function triggerHanziCard(arena,caster,card) {
    const state=caster.hanziBattle;
    if(!state||caster.hp<=0||state.triggers>=state.params.maxTriggers||['Pass','Fizzle','Dead','PickPet'].includes(card.type))return;
    state.triggers++;
    let amount;
    if(state.id==='huo'){amount=state.params.attackPercent;caster.stats.damagePct.all=(caster.stats.damagePct.all||0)+amount;}
    else if(state.id==='tu'){amount=state.params.defensePercent;caster.stats.resistPct.all=(caster.stats.resistPct.all||0)+amount;}
    else {
        amount=Math.min(caster.maxHp-caster.hp,Math.ceil(caster.maxHp*state.params.healPercent/100));
        caster.hp+=amount;caster.totals.healDone+=amount;
        arena.onSingleHealThreat?.(caster,amount);
        const heal={type:'heal',turn:arena.turn,caster:caster.id,target:caster.id,card:card.key,amount,label:'hanzi'};
        arena.events.push(heal);arena.onEvent?.(heal);
    }
    const event={type:'hanzi_buff',turn:arena.turn,caster:caster.id,target:caster.id,card:card.key,hanzi:state.id,amount,triggers:state.triggers,description:hanziBattleDescription(state,state.triggers)};
    arena.events.push(event);arena.onEvent?.(event);
}
