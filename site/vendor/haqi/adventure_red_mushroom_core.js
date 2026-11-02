import {dailyBuffs,validateDailyBuff} from './language_daily_buff_core.js';
import {applyDungeonLanguageBuff} from './adventure_dungeon_language_core.js';
// Web adaptation of the original four-seat free_pvp arena. No IO or wall clock.
import {createRng} from './rng_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {createUnit} from './combat_unit_core.js';
import {createArena,startCombat,playTurn,castableCards,validTargets} from './combat_arena_core.js';
import {ReasoningBot,coordinateTeam} from './battle_ai/policy_core.js';
import {socialDataHash,snapshotUnit} from './adventure_social_core.js';
import {playerSpec} from './adventure_core.js';
import {partySpecs,petAppearanceStage} from './adventure_pets_core.js';
import {noteCatalogSignal} from './adventure_catalog_quests_core.js';

export const ARENA_MODES=[1,2,3,4];
const check=(ok,message)=>{if(!ok)throw Error(message);};
export const emptyArenaRecord=()=>({version:1,total:0,wins:0,draws:0,losses:0,recent:[],lastDay:null,active:null});
export function arenaDifficulty(record,day,seed,rules=defaultParams('kids').redMushroom){
    const rng=createRng(seed),first=record.lastDay!==day;
    const recent=(record.recent||[]).slice(-rules.window);
    const rate=recent.length?recent.reduce((n,r)=>n+(r.result==='win'?1:r.result==='draw'?.5:0),0)/recent.length:.5;
    const scale=first?rules.firstMin+rng.float()*(rules.firstMax-rules.firstMin):Math.max(rules.min,Math.min(rules.max,1+(rate-.5)*rules.feedback+(rng.float()*2-1)*rules.jitter));
    return {first,scale,rate};
}
export function beginArenaRecord(record,{id,day,mode},rules=defaultParams('kids').redMushroom){
    check(ARENA_MODES.includes(mode)&&id&&day,'赛场信息无效');
    const clean=record.active?finishArenaRecord(record,record.active.id,'loss',rules):record;
    return {...clean,lastDay:day,active:{id,day,mode}};
}
export function finishArenaRecord(record,id,result,rules=defaultParams('kids').redMushroom){
    if(!record.active||record.active.id!==id)return record;
    check(['win','draw','loss'].includes(result),'赛场结果无效');
    return {...record,active:null,total:record.total+1,wins:record.wins+(result==='win'?1:0),draws:record.draws+(result==='draw'?1:0),losses:record.losses+(result==='loss'?1:0),recent:[...record.recent,{...record.active,result}].slice(-rules.window)};
}
export function arenaSeats(save,content,dataset,allies=[],mode=1){
    check(ARENA_MODES.includes(mode),'请选择有效赛场模式');
    const opponentMountId=save.mountId||Object.keys(content.mountByItem||{}).sort().find(id=>content.mountByItem[id].art?.cdn)||null;
    const hero={...playerSpec(save,content),id:'hero',kind:'self',appearance:save.appearance,bodyId:save.bodyId,mountId:save.mountId,opponentMountId};
    if(save.dailyLanguageBuff)hero.dailyLanguageBuff=dailyBuffs(save);
    const pets=arenaPetRoster(save,content,hero);
    const used=new Set();
    return [hero,...[0,1,2].map(i=>{
        if(i>=mode-1)return null;
        const ally=allies[i];
        if(ally){check(!used.has(ally.id),'不能重复招募同一伙伴');used.add(ally.id);return {...snapshotUnit(ally,dataset,`ally${i+1}`,i+1),kind:'ally',appearance:ally.appearance,bodyId:ally.bodyId,mountId:ally.mountId,profileId:ally.id};}
        return pets[i]||null;
    })];
}
function arenaPetRoster(save,content,hero){
    const ids=[...new Set([...(save.formation||[]),...Object.keys(save.pets||{})].filter(id=>id&&save.pets?.[id]?.deck))].slice(0,3);
    const prepared={...save,heroSlot:0,formation:[null,...ids]};
    const pets=content.pets?partySpecs(prepared,content,hero).slice(1):[];
    return pets.map(pet=>{
        const record=save.pets[pet.id]||Object.values(save.pets||{}).find(row=>row.id===pet.id);
        return {...pet,kind:'pet',appearanceStage:petAppearanceStage(record,content)};
    });
}
export function arenaBenchPets(save,content,seats=[]){
    const active=new Set(seats.filter(pet=>pet?.kind==='pet').map(pet=>pet.id));
    return arenaPetRoster(save,content,playerSpec(save,content)).filter(pet=>!active.has(pet.id));
}
export function startRedMushroom(dataset,seats,mode,seed,difficulty,params=defaultParams('kids')){
    check(ARENA_MODES.includes(mode)&&seats.slice(0,mode).filter(Boolean).length===mode,'请先补齐出战席位');
    const resolved=resolveParams(dataset,params),rng=createRng(seed);
    const local=seats.some(p=>p?.localOwner===1&&!p.speciesId);
    const near=seats.slice(0,mode).map((p,i)=>({...structuredClone(p),id:local?p.id:i?`ally${i}`:'hero',isBot:local?!!p.speciesId||!Number.isInteger(p.localOwner):i>0}));
    const names=rng.shuffle(['赤枫','绯羽','焰铃','丹露']);
    const far=near.map((p,i)=>{
        const u=createUnit(p,resolved),stats=structuredClone(p.stats||{});
        // Change opponent specification before combat; normal Lua HP calculation still applies.
        const star=1+(stats.magicStarHpPct||0)/100;
        stats.hpFlat=(stats.hpFlat||0)+Math.round(u.maxHp*(difficulty.scale-1)/star);
        const pet=!!p.speciesId;
        const opponent={...structuredClone(p),id:`rival${i}`,name:pet?p.name:names[i],kind:pet?'pet':'rival',isBot:true,stats};
        if(!pet){opponent.appearance=i%2?'girl':'boy';opponent.mountId=p.mountId||near[0].opponentMountId||null;delete opponent.bodyId;}
        else delete opponent.mountId;
        delete opponent.profileId;delete opponent.opponentMountId;delete opponent.dailyLanguageBuff;
        return opponent;
    });
    const replay={version:local?4:3,...(local?{localHumanIds:near.filter(u=>!u.speciesId&&Number.isInteger(u.localOwner)).sort((a,b)=>a.localOwner-b.localOwner).map(u=>u.id)}:{}),specialCardRulesVersion:1,dataHash:socialDataHash(dataset),mode,seed,params:structuredClone(params),difficulty:structuredClone(difficulty),near,far,actions:[]};
    return createMatch(dataset,replay);
}
function createMatch(dataset,replay){
    const arena=createArena({resolved:resolveParams(dataset,replay.params),near:replay.near,far:replay.far,seed:replay.seed,firstSide:'near',specialCardRulesVersion:replay.specialCardRulesVersion??0,applyTempAntiFreezeForPartners:replay.specialCardRulesVersion===1});
    if(replay.localHumanIds)arena.localHumanIds=[...replay.localHumanIds];
    if(replay.near[0].dailyLanguageBuff)applyDungeonLanguageBuff(arena.unitsById.hero,validateDailyBuff(replay.near[0].dailyLanguageBuff),arena.resolved.dailyLanguage);
    arena.redMushroom=true;
    for(const spec of [...replay.near,...replay.far]){
        const unit=arena.unitsById[spec.id];unit.speciesId=spec.speciesId;unit.appearanceStage=spec.appearanceStage;
        if(replay.localHumanIds)unit.slot=spec.slot;
        if(!spec.speciesId)unit.arenaProfile={name:spec.name,school:spec.school,level:spec.level,appearance:spec.appearance,bodyId:spec.bodyId,mountId:spec.mountId};
    }
    const policies=Object.fromEntries([...arena.sides.near,...arena.sides.far].map(u=>[u.id,new ReasoningBot()]));
    startCombat(arena);return {arena,replay,policies};
}
function legal(a,u,pick){return pick&&((pick.pass===true)||u.hp>0&&castableCards(a,u).some(c=>c.seq===pick.seq&&c.key===pick.key&&validTargets(a,u,c.card).some(t=>t.id===pick.targetId)));}
export function playRedMushroom(state,decision,{recorded=null}={}){
    const a=state.arena;check(!a.finished&&a.currentSide==='near','当前不能出牌');
    if(a.localHumanIds){check(decision.humanDecisions&&Object.keys(decision.humanDecisions).length===2&&a.localHumanIds.every(id=>legal(a,a.unitsById[id],decision.humanDecisions[id])),'请等待两位玩家选择有效卡牌与目标');}
    else check(legal(a,a.unitsById.hero,decision),'请选择有效卡牌与目标');
    const entry={decision:structuredClone(decision),turns:[]};
    // Bots are evaluated even when replaying to advance the exact same RNG stream.
    // Recorded actions remain authoritative, and malformed/extra actions are rejected.
    const turn=(side,heroDecision)=>{
        const submitted=side==='near'?(a.localHumanIds?heroDecision.humanDecisions:a.unitsById.hero.hp>0?{hero:heroDecision}:{}):{};
        const generated=coordinateTeam(a,state.policies,submitted);
        const saved=recorded?.turns?.[entry.turns.length];
        if(recorded){check(saved&&JSON.stringify(saved)===JSON.stringify(generated),'战报行动无效');}
        entry.turns.push(structuredClone(generated));playTurn(a,generated);
    };
    turn('near',decision);
    if(!a.finished)turn('far');
    // Web arena adjudication: short beginner decks otherwise almost always draw.
    // Original combat events/formulae are untouched; append the visible adjudication.
    if(a.finished&&a.winner==null){
        const vitality=side=>a.sides[side].reduce((sum,u)=>sum+Math.max(0,u.hp),0)/a.sides[side].reduce((sum,u)=>sum+u.maxHp,0);
        const near=vitality('near'),far=vitality('far');
        a.winner=near===far?null:near>far?'near':'far';
        state.adjudication={near,far};
        a.events.push({type:'arena_adjudication',turn:a.turn,winner:a.winner,near,far});
    }
    if(recorded)check(recorded.turns.length===entry.turns.length,'战报行动数量无效');
    state.replay.actions.push(entry);return state;
}
export function restoreRedMushroom(dataset,replay){
    check([3,4].includes(replay?.version)&&replay.dataHash===socialDataHash(dataset)&&ARENA_MODES.includes(replay.mode)&&replay.near?.length===replay.mode&&replay.far?.length===replay.mode&&Array.isArray(replay.actions)&&replay.actions.length<=200,'赛场战报版本不兼容');
    if(replay.version===4)check(replay.localHumanIds?.length===2&&new Set(replay.localHumanIds).size===2&&replay.localHumanIds.every(id=>replay.near.some(u=>u.id===id&&!u.speciesId)),'双人战报操控位无效');
    const state=createMatch(dataset,{...structuredClone(replay),actions:[]});
    for(const entry of replay.actions)playRedMushroom(state,entry.decision,{recorded:entry});
    return state;
}
export function settleArenaQuests(save,content,mode,winner,rules=defaultParams('kids').redMushroom){
    // custom_goal_list.xml 20046/20048 = points, 52212 = completed 2v2 games.
    const before=JSON.stringify(save.quests);
    const points=winner==='near'?rules.winPoints:winner==null||winner==='draw'?rules.drawPoints:0;
    if(mode===1||mode===2)noteCatalogSignal(save,content,'custom',mode===1?20046:20048,points);
    if(mode===2)noteCatalogSignal(save,content,'custom',52212,1);
    return before!==JSON.stringify(save.quests);
}
