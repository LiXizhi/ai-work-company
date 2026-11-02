import {analyzeDecision,chooseDecision} from './inference_core.js';
import {observeBattle,haqiRulesAdapter,projectDecision} from './haqi_adapter_core.js';
export class ReasoningBot {
    constructor({difficulty='advanced',mode,config={},fallback=null}={}){this.name='reasoning';this.difficulty=difficulty;this.mode=mode;this.config=config;this.fallback=fallback;this.memories=new WeakMap();}
    memory(arena,unitId){return this.memories.get(arena)?.[unitId]||{};}
    remember(arena,unitId,memory){if(!this.memories.has(arena))this.memories.set(arena,{});this.memories.get(arena)[unitId]=memory;}
    analyze(arena,unit,options={}){return analyzeDecision(observeBattle(arena,unit.id,options),{rulesAdapter:haqiRulesAdapter,difficulty:this.difficulty,config:this.config,memory:this.memory(arena,unit.id)});}
    pick(arena,unit,options={}){if(arena.resolved.version!=='kids'&&this.fallback)return this.fallback.pick(arena,unit);const analysis=this.analyze(arena,unit,options);this.remember(arena,unit.id,analysis.memory);return chooseDecision(analysis,{mode:this.mode,seed:arena.seed});}
}
// Soft team intentions use only already submitted ally choices and public effects.
// Live execution still validates every action against the real state.
export function coordinateTeam(arena,policies={},submitted={}){
    let projected=null;const picks={...submitted};
    for(const unit of arena.sides[arena.currentSide]){
        if(unit.hp<=0)continue;
        const policy=policies[unit.id]||unit.policy;
        const observation=observeBattle(arena,unit.id);
        if(projected)observation.units=observation.units.map(u=>({...u,...projected.find(p=>p.id===u.id)}));
        if(!picks[unit.id]){
            if(policy?.name==='reasoning'&&arena.resolved.version==='kids'){
                const analysis=analyzeDecision(observation,{rulesAdapter:haqiRulesAdapter,difficulty:policy.difficulty,config:policy.config,memory:policy.memory(arena,unit.id)});
                policy.remember(arena,unit.id,analysis.memory);picks[unit.id]=chooseDecision(analysis,{mode:policy.mode,seed:arena.seed});
            }else picks[unit.id]=policy?.pick(arena,unit)||{pass:true};
        }
        projected=projectDecision(observation,picks[unit.id]);
    }
    return picks;
}
