// Presentation-only definitions and seeded samples. Never consumes the arena RNG.
import { createRng, hashSeed } from './rng_core.js';
import {SUBJECT_MOTIONS,SUBJECT_PLACEMENTS} from './spell_choreography_core.js';
export const EFFECT_KINDS = ['bolt','burst','meteor','swords','lightning','vines','vortex','shield','blade','trap','heal','drain','summon','absorb','reflect','aura','cleanse','steal','stun','freeze','stealth','enrage','pips','capture','pet','dissolve','pass'];
export function centeredSpellSubject(spec) {return spec.kind==='summon'||spec.subjectPlacement==='center';}
export function validateSpellEffects(config, cards) {
    if(config?.version!==2)throw new Error('技能特效配置版本无效');
    if(!Array.isArray(config.atlasSize)||config.atlasSize.length!==2||!config.atlasSize.every(v=>Number.isFinite(v)&&v>0))throw new Error('召唤图集坐标尺寸无效');
    const t=config.timeline;
    if(!t||!(0<t.attack&&t.attack<t.impact&&t.impact<1&&0<t.summonAttack&&t.summonAttack<t.summonImpact&&t.summonImpact<1))throw new Error('技能时间轴无效');
    for(const card of Object.values(cards)) {
        const reference=config.cards[card.key];
        const effect=config.bases[reference?.base];
        if(!reference||!effect)throw new Error(`缺少卡牌特效：${card.key}`);
        if(!config.variantAuras[reference.variant?.rank]||!Number.isFinite(reference.variant.level)||reference.variant.level<0)throw new Error(`卡牌变体光环无效：${card.key}`);
        if(!(effect.scale>0&&effect.scale<=3)||!EFFECT_KINDS.includes(effect.kind)||!config.palettes[card.spellSchool]||!(effect.duration>=500&&effect.duration<=4000)||!Number.isInteger(effect.count)||effect.count<1||effect.count>160)throw new Error(`技能特效参数无效：${card.key}`);
        if(effect.secondary&&!EFFECT_KINDS.includes(effect.secondary)&&effect.secondary!=='dot')throw new Error(`附加演出无效：${card.key}`);
        if(effect.subjectPlacement!==undefined&&effect.subjectPlacement!=='center')throw new Error(`主体定位无效：${card.key}`);
        const choreography=effect.choreography;
        if(choreography&&(!SUBJECT_MOTIONS.includes(choreography.motion)||!SUBJECT_PLACEMENTS.includes(choreography.placement)||!EFFECT_KINDS.includes(choreography.attack)||typeof choreography.returnToCaster!=='boolean'||!['caster','target'].includes(choreography.secondaryTarget)))throw new Error(`技能编舞无效：${card.key}`);
        if(effect.kind==='summon'&&(!config.summons[effect.summon]||!EFFECT_KINDS.includes(effect.attack)))throw new Error(`召唤特效无效：${card.key}`);
    }
    for(const def of Object.values(config.summons)) {
        if(def.asset!=='summons'||!(def.size>0&&def.size<=300))throw new Error('召唤角色资源无效');
        for(const tile of [def.tile,def.attackTile??def.tile]) {
            const rect=config.frames?.[tile];
            if(!rect||rect.length!==4||!rect.every(Number.isFinite)||rect[0]<0||rect[1]<0||rect[2]<=0||rect[3]<=0)throw new Error('召唤角色裁剪无效');
        }
    }
    return Object.keys(cards).length;
}
export function spellEffect(config,card) {
    if(!card)return null;
    const ref=config.cards[card.key],effect=config.bases[ref?.base];
    if(!effect)throw new Error(`缺少卡牌特效：${card.key}`);
    const quickAttack=card.pipcost===0&&/Attack|LifeTap/.test(card.type);
    return {...effect,quickAttack,duration:quickAttack?550:effect.duration,name:ref.name,base:ref.base,variant:ref.variant,variantAura:config.variantAuras[ref.variant.rank],palette:config.palettes[card.spellSchool],summonDef:config.summons[effect.summon]};
}
export function effectParticles(key,count,seed=0) {
    const rng=createRng(hashSeed(`spell-visual:${seed}:${key}`));
    return Array.from({length:count},()=>({angle:rng.float()*Math.PI*2,speed:.3+rng.float()*.7,phase:rng.float(),size:1+rng.float()*3,spin:rng.float()*6.28}));
}
export function effectDuration(config,card,reducedMotion=false) {return reducedMotion?500:(spellEffect(config,card)?.duration??650);}
