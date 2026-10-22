import {resolveParams} from './combat_params_core.js';
import {compareDungeonSpeech} from './dungeon_speech_core.js';

export const LANGUAGE_REWARD_NAMES={hp:'生命',attack:'攻击',defense:'防御',powerPip:'超级魔力生成率'};
export function dungeonLanguageParams(content={}){return resolveParams({cards:{},version:'kids'},content.balanceParams||{}).dungeonLanguage;}
export function createLineAttempt(line,now,content){return {id:line.id,reward:line.reward,phase:'waiting',qualified:0,params:dungeonLanguageParams(content)};}
export function startLineAttempt(attempt,now){
    if(attempt.phase!=='waiting')return false;
    attempt.phase='recording';return true;
}
export function finishLineAttempt(attempt,transcript,expected,locale){
    if(attempt.phase!=='recording')return false;
    // ASR validates a spoken line, not pronunciation. Empty/irrelevant speech never earns a buff.
    attempt.feedback=compareDungeonSpeech(transcript,expected,locale);
    if(attempt.feedback.accuracy>=attempt.params.minSpeechAccuracy)attempt.qualified++;
    const passed=attempt.feedback.accuracy===1||(attempt.feedback.accuracy>=attempt.params.minSpeechAccuracy&&attempt.qualified>=attempt.params.speechPracticeCount);
    attempt.phase=passed?'awarded':'waiting';return passed;
}
export function dungeonLanguageBuff(save,content){
    const record=save.dungeonLanguageBuff;
    if(!record)return null;
    const d=content.dungeons?.find(d=>d.id===record.dungeonId);
    if(!d||save.zone!==d.id||!Array.isArray(record.lines)||new Set(record.lines).size!==record.lines.length)throw Error('副本语言奖励记录无效');
    const limits=dungeonLanguageParams(content),buff={hp:0,attack:0,defense:0};
    for(const id of record.lines){
        const line=d.story?.find(line=>line.id===id&&line.role==='player');
        if(!line||!Object.hasOwn(buff,line.reward))throw Error('副本语言奖励台词无效');
        buff[line.reward]=Math.min(limits.maxPercent,buff[line.reward]+limits.percentPerLine);
    }
    return buff;
}
export function awardDungeonLine(save,content,lineId){
    const record=save.dungeonLanguageBuff;
    if(!record||record.lines.includes(lineId))return false;
    const next={...save,dungeonLanguageBuff:{...record,lines:[...record.lines,lineId]}};
    dungeonLanguageBuff(next,content);save.dungeonLanguageBuff=next.dungeonLanguageBuff;return true;
}
export function applyDungeonLanguageBuff(unit,buff,limits){
    if(!buff)return;
    if(Object.keys(buff).some(k=>!Object.hasOwn(LANGUAGE_REWARD_NAMES,k))||Object.values(buff).some(v=>!Number.isFinite(v)||v<0||v>limits.maxPercent))throw Error('副本语言加成无效');
    // Web-only entry reward. Existing Lua damage/resistance formulas remain untouched.
    const extra=Math.ceil(unit.maxHp*(buff.hp||0)/100);
    const base=unit.maxHp;
    unit.maxHp+=extra;if(unit.hp>0)unit.hp=Math.ceil(unit.hp*unit.maxHp/base);
    unit.stats.damagePct.all=(unit.stats.damagePct.all||0)+(buff.attack||0);
    unit.stats.resistPct.all=(unit.stats.resistPct.all||0)+(buff.defense||0);
    unit.stats.powerPipPct=(unit.stats.powerPipPct||0)+(buff.powerPip||0);
    unit.languageBuff={...buff};
    unit.languageBaseMaxHp=unit.maxHp-extra;
}
export function dungeonLanguageBaseHp(unit){
    return unit.languageBaseMaxHp?Math.ceil(unit.hp*unit.languageBaseMaxHp/unit.maxHp):unit.hp;
}
