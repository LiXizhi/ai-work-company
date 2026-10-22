// Framework-free decision service. All game knowledge is supplied by rulesAdapter.
import {createRng, hashSeed} from '../rng_core.js';
export const AI_VERSION = 1;
const actionKey = action => JSON.stringify([action.pass || false, action.seq ?? null, action.key ?? null, action.targetId ?? null, [...(action.discardSeqs || [])].sort((a,b)=>a-b)]);
export function analyzeDecision(observation, {rulesAdapter, difficulty='advanced', config={}, memory={}}={}) {
    if (!rulesAdapter) throw Error('缺少战斗规则适配器');
    if(!['easy','normal','advanced','expert'].includes(difficulty))throw Error('未知 AI 难度');
    const settings={...rulesAdapter.settings(observation),...config};
    if(!Number.isInteger(settings.branches)||settings.branches<1||settings.branches>64||!Number.isInteger(settings.candidateCount)||settings.candidateCount<1||settings.candidateCount>3)throw Error('AI 分支预算或候选数量无效');
    if(rulesAdapter.prepare)settings.context=rulesAdapter.prepare(observation,{...settings,difficulty},memory);
    const actions=rulesAdapter.actions(observation,{...settings,difficulty});
    const cache=new Map();
    const semanticKey=action=>JSON.stringify([action.pass||false,action.key||null,action.targetId||null,action.discardSeqs||[]]);
    const evaluated=actions.map(action=>{const key=semanticKey(action);if(!cache.has(key))cache.set(key,rulesAdapter.evaluate(observation,action,{...settings,difficulty,memory}));return {action,...cache.get(key)};});
    evaluated.sort((a,b)=>b.score-a.score||actionKey(a.action).localeCompare(actionKey(b.action)));
    const best=evaluated[0]?.score??0, scale=Math.max(1,...evaluated.map(x=>Math.abs(x.score)));
    // Keep meaningful alternatives; never fill the list with clearly losing moves.
    const seen=new Set();
    const candidates=evaluated.filter(x=>{const key=semanticKey(x.action);if(seen.has(key)||best-x.score>scale*(difficulty==='easy'?0.7:0.4))return false;seen.add(key);return true;}).slice(0,settings.candidateCount);
    const temperature=settings.temperatures?.[difficulty]??0.3;
    const weights=candidates.map(x=>temperature===0?Number(x===candidates[0]):Math.exp((x.score-best)/(scale*temperature)));
    const sum=weights.reduce((a,b)=>a+b,0)||1;
    candidates.forEach((x,i)=>x.selectionProbability=weights[i]/sum);
    return {version:AI_VERSION,stateId:rulesAdapter.stateId(observation),unitId:observation.unitId,difficulty,
        candidates,evaluated,settings,coverage:rulesAdapter.coverage(observation),memory:rulesAdapter.nextMemory?.(settings.context,memory)||{...memory},
        strategy:rulesAdapter.summarize?.(settings.context)||null,
        probabilityMeaning:'选择概率不是获胜概率'};
}
export function chooseDecision(analysis,{mode,difficulty=analysis.difficulty,seed=1,stateId=analysis.stateId}={}) {
    if(stateId!==analysis.stateId)throw Error('战场已经变化，请重新分析');
    if(!analysis.candidates.length)return {pass:true};
    if(mode==='best'||(!mode&&difficulty==='expert'))return structuredClone(analysis.candidates[0].action);
    const rng=createRng(hashSeed(`${AI_VERSION}:${seed}:${analysis.stateId}:${analysis.unitId}`));
    let roll=rng.float();
    for(const candidate of analysis.candidates){roll-=candidate.selectionProbability;if(roll<=0)return structuredClone(candidate.action);}
    return structuredClone(analysis.candidates.at(-1).action);
}
export function compareDecision(analysis,action) {
    const selected=analysis.evaluated.find(row=>actionKey(row.action)===actionKey(action));
    const best=analysis.candidates[0];
    if(!selected||!best)return {shouldPrompt:false,confidence:0,reason:'此行动尚未完成可靠评估',action};
    const gap=best.score-selected.score, relativeGap=gap/Math.max(1,Math.abs(best.score),Math.abs(selected.score));
    const confidence=Math.min(best.confidence,selected.confidence);
    return {action,alternative:best.action,gap,relativeGap,confidence,
        shouldPrompt:relativeGap>=analysis.settings.severeGap&&confidence>=analysis.settings.confidenceThreshold,
        selectedEvidence:selected.evidence,alternativeEvidence:best.evidence,
        reason:relativeGap<=analysis.settings.nearTie?'这两个选择的收益接近':`建议${best.label}：${best.evidence.map(e=>e.text).join('；')}`};
}

// A bounded probability tree for a SINGLE spell, never an exhaustive game tree.
// Rules may branch on exact discrete chances. Large integer damage ranges use
// weighted bins, explicitly reducing confidence instead of claiming exact odds.
export function integrateOutcomes(run,{branches=12}={}) {
    const pending=[{path:[],weight:1}],leaves=[];
    let executions=0;
    while(pending.length&&executions<branches){
        pending.sort((a,b)=>b.weight-a.weight);
        const node=pending.shift();let cursor=0,approximate=false;
        const choose=options=>{
            const choices=options.filter(o=>o.probability>0);
            if(choices.length===1)return choices[0].value;
            if(cursor<node.path.length)return node.path[cursor++];
            throw {branch:true,choices};
        };
        const rng={
            probability:p=>choose([{value:true,probability:Math.max(0,Math.min(1,p))},{value:false,probability:1-Math.max(0,Math.min(1,p))}]),
            int:(lo,hi)=>{
                if(!Number.isFinite(lo)||!Number.isFinite(hi))throw Error('卡牌随机区间缺少有效数值');
                lo=Math.floor(lo);hi=Math.floor(hi);if(hi<lo)[lo,hi]=[hi,lo];
                const n=hi-lo+1,bins=Math.min(n,3);if(n>bins)approximate=true;
                return choose(Array.from({length:bins},(_,i)=>{const a=lo+Math.floor(n*i/bins),b=lo+Math.floor(n*(i+1)/bins)-1;return {value:Math.floor((a+b)/2),probability:(b-a+1)/n};}));
            },
        };
        rng.pick=arr=>arr?.length?arr[rng.int(0,arr.length-1)]:undefined;
        executions++;
        try{leaves.push({value:run(rng),probability:node.weight,approximate});}
        catch(error){if(!error?.branch)throw error;for(const choice of error.choices)pending.push({path:[...node.path,choice.value],weight:node.weight*choice.probability});}
    }
    // Preserve all remaining probability mass using a deterministic conditional
    // representative, and report it as unresolved (not Monte Carlo certainty).
    let unresolvedMass=0;
    for(const node of pending){let cursor=0;unresolvedMass+=node.weight;
        const rng={probability:p=>p<=0?false:p>=1?true:cursor<node.path.length?node.path[cursor++]:p>=0.5,int:(lo,hi)=>lo===hi?lo:cursor<node.path.length?node.path[cursor++]:Math.floor((lo+hi)/2)};
        rng.pick=arr=>arr?.length?arr[rng.int(0,arr.length-1)]:undefined;
        leaves.push({value:run(rng),probability:node.weight,approximate:true});
    }
    const approximateMass=leaves.filter(x=>x.approximate).reduce((sum,x)=>sum+x.probability,0);
    if(Math.abs(leaves.reduce((sum,x)=>sum+x.probability,0)-1)>1e-8)throw Error('卡牌概率分支不完整');
    return {leaves,unresolvedMass,approximateMass,confidence:Math.max(0,1-approximateMass)};
}
