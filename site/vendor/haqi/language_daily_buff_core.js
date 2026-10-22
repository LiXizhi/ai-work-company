import {createRng,hashSeed} from './rng_core.js';
import {resolveParams} from './combat_params_core.js';

export const DAILY_BUFF_NAMES={hp:'生命',attack:'攻击',defense:'防御',powerPip:'超级魔力生成率'};
export const localBuffDay=(now=Date.now())=>{const d=new Date(now);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const dailyBuffParams=(content={})=>{const p=resolveParams({cards:{},version:'kids'},content.balanceParams||{}).dailyLanguage;return {...p,maxPercent:Math.max(1,Math.min(10,p.maxPercent)),percentPerLine:1};};
export function validateDailyBuff(buff){
    if(!buff||Object.keys(buff).length!==4||Object.keys(buff).some(k=>!Object.hasOwn(DAILY_BUFF_NAMES,k))||Object.values(buff).some(v=>!Number.isInteger(v)||v<0||v>10)||(buff.powerPip>0&&['hp','attack','defense'].some(k=>buff[k]!==10)))throw Error('每日语言加成无效');
    return buff;
}
export function dailyBuffs(save,now=Date.now()){
    const row=save?.dailyLanguageBuff;
    return Object.fromEntries(Object.keys(DAILY_BUFF_NAMES).map(k=>[k,row?.day===localBuffDay(now)?Math.max(0,Math.min(10,Math.floor(Number(row.counts?.[k])||0))):0]));
}
export function previewDailySpeech(save,content,now=Date.now()){
    const counts=dailyBuffs(save,now),limits=dailyBuffParams(content),day=localBuffDay(now);
    let keys=['hp','attack','defense'].filter(k=>counts[k]<limits.maxPercent);
    if(!keys.length)keys=['powerPip'].filter(k=>counts[k]<limits.maxPercent);
    const serial=save.dailyLanguageBuff?.day===day?(save.dailyLanguageBuff.events?.length||0):0;
    return createRng(hashSeed(`${save.seed}:${day}:${serial}`)).pick(keys)||null;
}
export function awardDailySpeech(save,content,eventId,now=Date.now(),preferredKey=null){
    if(!eventId)return null;
    const day=localBuffDay(now),limits=dailyBuffParams(content);
    if(save.dailyLanguageBuff?.day!==day)save.dailyLanguageBuff={day,counts:dailyBuffs(null,now),events:[]};
    const row=save.dailyLanguageBuff,counts=dailyBuffs(save,now);
    if(!Array.isArray(row.events))row.events=[];
    if(row.events.includes(eventId))return null;
    let keys=['hp','attack','defense'].filter(k=>counts[k]<limits.maxPercent);
    if(!keys.length)keys=['powerPip'].filter(k=>counts[k]<limits.maxPercent);
    if(!keys.length)return null;
    const key=keys.includes(preferredKey)?preferredKey:previewDailySpeech(save,content,now);
    counts[key]=Math.min(limits.maxPercent,counts[key]+limits.percentPerLine);
    row.counts=counts;row.events.push(eventId);
    return {key,percent:counts[key],total:Object.values(counts).reduce((a,b)=>a+b,0)};
}
export function dailyBuffDescription(save,now=Date.now()){
    return Object.entries(dailyBuffs(save,now)).map(([k,v])=>`${DAILY_BUFF_NAMES[k]} +${v}%`).join('\n')+'\n本机时间次日 00:00 清零';
}
