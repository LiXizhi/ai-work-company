// Web learning rules: language-neutral curriculum, isolated RNG and reward ledger.
import {createRng, hashSeed} from './rng_core.js';
import {resolveParamGroup} from './combat_params_core.js';

const own = (o, k) => Object.hasOwn(o || {}, k);
const assert = (ok, message) => { if (!ok) throw Error(message); };
function englishNumber(value) {
    const small=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
    if(value<20)return small[value];
    if(value<100)return ['', '', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'][Math.floor(value/10)]+(value%10?' '+small[value%10]:'');
    for(const [base,name] of [[1000000000,'billion'],[1000000,'million'],[1000,'thousand'],[100,'hundred']])if(value>=base)return englishNumber(Math.floor(value/base))+' '+name+(value%base?' '+englishNumber(value%base):'');
}
function chineseNumber(text) {
    const digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
    if(!/[十百千万亿]/.test(text))return [...text].map(x=>digits[x]).join('');
    let total=0,section=0,number=0;
    for(const ch of text){if(own(digits,ch)){number=digits[ch];continue;}
        const unit={'十':10,'百':100,'千':1000,'万':10000,'亿':100000000}[ch];
        if(unit<10000){section+=(number||1)*unit;number=0;}else{total+=(section+number)*unit;section=0;number=0;}
    }
    return String(total+section+number);
}
export function courseAvailable(catalog,course,locale) {
    const table=catalog.dictionaries?.[locale];
    return !!catalog.languages?.[locale]?.content&&!!table&&[course.scenario,...course.goals.map(g=>g.text),...course.pairs.flatMap(p=>[p.question,p.answer])].every(key=>typeof table[key]==='string'&&table[key].trim());
}
export function learningParams(content = {}) {
    return resolveParamGroup(content.balanceParams, 'languageAdventure');
}
export function renderLearningTemplate(source, locale, dictionaries, slots = {}) {
    const template = dictionaries[locale]?.[source];
    if (!template) return null; // Never use UI fallback for teaching.
    let complete = true;
    const text = template.replace(/\{([a-zA-Z][\w]*)\}/g, (_, key) => {
        if (!own(slots,key) || slots[key] === null) { complete = false; return ''; }
        return String(slots[key]);
    });
    return complete ? text : null;
}
export function normalizeSpeech(text, locale) {
    let s = String(text || '').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'");
    if (locale === 'en') {
        const contractions = {"i'm":"i am","it's":"it is","don't":"do not","let's":"let us","i'd":"i would","can't":"cannot","that's":"that is","you're":"you are"};
        for (const [a,b] of Object.entries(contractions)) s=s.replaceAll(a,b);
        s=s.replace(/\b\d+\b/g,x=>Number(x)<=999999999999?englishNumber(Number(x)):x).replace(/\b(hundred|thousand|million) and\b/g,'$1');
    } else if (locale === 'zh-CN') {
        s=s.replace(/[零〇一二两三四五六七八九十百千万亿]+/g,chineseNumber);
    } else return ''; // Add explicit rules with new learning languages.
    s=s.replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/g,' ').trim();
    return locale==='zh-CN'?s.replaceAll(' ',''):s;
}
export function matchesSpeech(text, answers, locale) {
    const normalized=normalizeSpeech(text,locale);
    return !!normalized && answers.some(answer=>normalizeSpeech(answer,locale)===normalized);
}
export function targetLanguageText(text, locale, properNames=[]) {
    let value=String(text||'');
    for(const name of properNames.filter(x=>typeof x==='string'&&x.trim()))value=value.replaceAll(name,' ');
    if(locale==='en')return /[a-z]{2}/i.test(value)&&!/[\u3400-\u9fff]/u.test(value);
    if(locale==='zh-CN')return /[\u3400-\u9fff]/u.test(value);
    return false;
}
export function selectLesson(catalog, {event, source, locale, seed, serial=0, slots={}, progress={}}) {
    const binding=catalog.npcs?.[source] || catalog.locations?.[source];
    let courses=catalog.courses.filter(c=>c.events.includes(event)&&(!binding||binding.includes(c.id)));
    courses=courses.filter(c=>(!c.requiresItem||slots.item)&&courseAvailable(catalog,c,locale)&&c.pairs.some(p=>renderLearningTemplate(p.question,locale,catalog.dictionaries,slots)&&renderLearningTemplate(p.answer,locale,catalog.dictionaries,slots)));
    if(!courses.length)return null;
    const rng=createRng(hashSeed(`${seed}:learning:${source}:${serial}`));
    // Unpractised and least recently practised material wins before seeded selection.
    const oldest=Math.min(...courses.map(c=>progress[c.id]?.lastAt||0));
    courses=courses.filter(c=>(progress[c.id]?.lastAt||0)===oldest);
    const course=rng.pick(courses);
    const pairs=course.pairs.filter(p=>renderLearningTemplate(p.question,locale,catalog.dictionaries,slots)&&renderLearningTemplate(p.answer,locale,catalog.dictionaries,slots));
    return {course,pairs:rng.shuffle([...pairs]).slice(0,2)};
}
export function triggerAllowed(state, {zone, enabled, busy, source, now}, params) {
    return zone==='camp'&&enabled&&!busy&&Number.isFinite(now)
        && now-(state.lastAt??-Infinity)>=params.promptCooldownMs
        && now-(state.sources?.[source]??-Infinity)>=params.sourceCooldownMs;
}
export function evaluateEvidence(course, previous, result, transcript, locale, events=[],properNames=[]) {
    assert(result && typeof result.reply==='string' && result.reply.length<=1000 && Array.isArray(result.completed),'对话结果无效，请重试');
    const completed={...previous};
    if(targetLanguageText(transcript,locale,properNames))for(const row of result.completed){
        const goal=course.goals.find(g=>g.id===row.id);
        if(!goal||completed[goal.id]||typeof row.quote!=='string'||!row.quote.trim()||!transcript.includes(row.quote)||!targetLanguageText(row.quote,locale,properNames))continue;
        if(goal.event&&!events.includes(goal.event))continue;
        completed[goal.id]=row.quote;
    }
    return {completed,score:course.goals.reduce((sum,g)=>sum+(completed[g.id]?g.weight:0),0),reply:result.reply};
}
export function learningDay(now) {
    assert(Number.isSafeInteger(now)&&now>=0,'学习时间无效');
    return Math.floor((now+8*3600000)/86400000);
}
export function rewardStatus(save, content, course, mode, now) {
    assert(['basic','challenge','listening'].includes(mode),'课程奖励类型无效');
    const p=learningParams(content),day=learningDay(now),old=save.languageAdventure?.ledger;
    const ledger=old&&old.day>=day?old:{day,totals:{},courses:{},attempts:[]};
    const currency=mode==='challenge'?17213:100;
    const amount=mode==='basic'?p.basicReward:p[`${course.tier||'beginner'}Reward`];
    const cap=mode==='basic'?p.basicDailyCap:p.challengeDailyCap;
    const limit=mode==='basic'?p.basicCourseLimit:p.challengeCourseLimit;
    const key=`${course.id}:${mode}`,count=ledger.courses[key]||0;
    return {ledger,currency,key,count,limit,amount:mode==='listening'||count>=limit?0:Math.max(0,Math.min(amount,cap-(ledger.totals[currency]||0)))};
}
export function recordLearningCompletion(save, content, completion, access) {
    assert(access?.learningCompletion===completion,'缺少当次学习完成记录');
    const {course,mode,locale,attemptId,now,score,spoken}=completion;
    assert((save.zone==='camp'||save.zone==='earth'&&completion.story?.id?.startsWith('earth-shenzhen:'))&&save.languageLearning?.enabled&&save.languageLearning.target===locale,'学习场景已变化');
    assert((mode==='listening'?completion.heard===true:(spoken===true||completion.answered===true&&!!completion.story))&&score===100&&/^[\w-]{1,80}$/.test(attemptId),'学习任务尚未完成');
    if(completion.story){
        const s=completion.story;
        if(completion.answered===true)assert(Array.isArray(s.proof)&&s.proof.every(p=>p.input==='speech'||p.input==='text'),'故事回答方式不完整');
        assert(typeof s.id==='string'&&s.id.length<100&&Array.isArray(s.turnIds)&&s.turnIds.length===3&&new Set(s.turnIds).size===3&&Array.isArray(s.proof)&&s.proof.length===3&&s.proof.every((p,i)=>p.turnId===s.turnIds[i]&&typeof p.quote==='string'&&p.quote.trim()&&typeof p.hinted==='boolean'),'故事回答记录不完整');
    }
    const status=rewardStatus(save,content,course,mode,now);
    if(status.ledger.attempts.includes(attemptId))return {amount:0,currency:status.currency,duplicate:true};
    const state=save.languageAdventure||{version:1,progress:{}};
    if(completion.story&&state.stories?.[locale]?.[completion.story.id]?.completed)status.amount=0;
    const byLanguage={...(state.progress[locale]||{})};
    const old=byLanguage[course.id]||{basic:0,challenge:0,lastAt:0};
    byLanguage[course.id]={...old,listening:old.listening||0,[mode]:(old[mode]||0)+1,lastAt:now};
    const ledger=structuredClone(status.ledger);
    ledger.attempts.push(attemptId);
    // Keep reward attempt history bounded by paid claims; zero-reward completions only update practice.
    if(!status.amount)ledger.attempts=ledger.attempts.slice(-128);
    if(status.amount){
        ledger.courses[status.key]=status.count+1;
        ledger.totals[status.currency]=(ledger.totals[status.currency]||0)+status.amount;
        const count=(save.inventory[status.currency]||0)+status.amount;
        assert(Number.isSafeInteger(count),'学习奖励数值无效');
        save.inventory[status.currency]=count;
    }
    let stories=state.stories;
    if(completion.story){const s=completion.story,rows=stories?.[locale]||{},old=rows[s.id]||{};
        stories={...stories,[locale]:{...rows,[s.id]:{completed:(old.completed||0)+1,firstAt:old.firstAt??now,independent:old.independent===true||s.hintsUsed!==true,lastAt:now,hintsUsed:s.hintsUsed===true,passedTurns:[...s.turnIds]}}};
    }
    save.languageAdventure={version:1,progress:{...state.progress,[locale]:byLanguage},ledger,...(stories?{stories}:{})};
    return {amount:status.amount,currency:status.currency};
}
export function validateLearningSave(save) {
    const state=save.languageAdventure;
    if(state===undefined){save.languageAdventure={version:1,progress:{}};return;}
    assert(state?.version===1&&state.progress&&typeof state.progress==='object'&&!Array.isArray(state.progress),'学习记录无效');
    for(const rows of Object.values(state.progress)){
        assert(rows&&typeof rows==='object'&&!Array.isArray(rows),'学习记录无效');
        for(const row of Object.values(rows)){
            for(const key of ['basic','challenge','lastAt'])assert(Number.isSafeInteger(row[key])&&row[key]>=0,'学习进度无效');
            if(row.listening!==undefined)assert(Number.isSafeInteger(row.listening)&&row.listening>=0,'听力记录无效');
        }
    }
    if(state.stories!==undefined){
        assert(state.stories&&typeof state.stories==='object'&&!Array.isArray(state.stories),'故事记录无效');
        for(const rows of Object.values(state.stories)){
            assert(rows&&typeof rows==='object'&&!Array.isArray(rows),'故事记录无效');
            for(const row of Object.values(rows))assert(Number.isSafeInteger(row.completed)&&row.completed>=0&&Number.isSafeInteger(row.lastAt)&&row.lastAt>=0&&typeof row.hintsUsed==='boolean'&&Array.isArray(row.passedTurns)&&row.passedTurns.length===3&&row.passedTurns.every(x=>typeof x==='string'&&x.length<100),'故事进度无效');
        }
    }
    for(const rows of Object.values(state.stories||{}))for(const row of Object.values(rows)){
        if(row.firstAt!==undefined)assert(Number.isSafeInteger(row.firstAt)&&row.firstAt>=0,'首通时间无效');
        if(row.independent!==undefined)assert(typeof row.independent==='boolean','独立表达记录无效');
    }
    if(!state.ledger)return;
    const l=state.ledger;
    assert(Number.isSafeInteger(l.day)&&l.day>=0&&Array.isArray(l.attempts)&&l.attempts.length<=256&&l.attempts.every(x=>typeof x==='string'&&/^[\w-]{1,80}$/.test(x))&&new Set(l.attempts).size===l.attempts.length,'学习奖励账本无效');
    for(const field of ['totals','courses']){
        assert(l[field]&&typeof l[field]==='object'&&!Array.isArray(l[field]),'学习奖励账本无效');
        for(const value of Object.values(l[field]))assert(Number.isSafeInteger(value)&&value>=0,'学习奖励账本无效');
    }
}
