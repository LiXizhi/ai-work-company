// Shared presentation poses, anchored at the feet; no gameplay state or RNG.
export const HIT_DURATION_MS=650;
export const PREVIEW_HIT_DURATION_MS=650;
// Preview targets have no damage events; synchronize their recoil with the spell impact.
export function previewTargetAction(spec,timeline,elapsed,duration,mode='auto') {
    if(mode!=='auto')return {action:mode,progress:Math.min(1,elapsed/duration)};
    const impact=spec.kind==='summon'?timeline.summonImpact:timeline.impact;
    const progress=(elapsed-impact*duration)/PREVIEW_HIT_DURATION_MS;
    return !spec.friendly&&progress>=0&&progress<1?{action:'hit',progress}:{action:'idle',progress:0};
}
export function actorPose(action='idle',progress=0,direction=1,reduced=false) {
    const p=Math.max(0,Math.min(1,progress)),wave=Math.sin(Math.PI*p);
    const pose={x:0,y:0,rotation:0,sx:1,sy:1,alpha:1,brightness:1};
    if(action==='cast') {
        pose.y=reduced?0:-12*wave;pose.sx=1-.07*wave;pose.sy=1+.09*wave;
        pose.brightness=1+.3*wave;
    } else if(action==='hit') {
        // Slower readable recoil, brief hold, then a damped recovery.
        const kick=p<.12?p/.12:p<.25?1:Math.pow((1-p)/.75,2);
        const tremor=p>.25?Math.sin((p-.25)*Math.PI*6)*(1-p)*2.5:0;
        pose.x=reduced?0:-direction*(18*kick+tremor);pose.rotation=reduced?0:-direction*.19*kick;
        pose.sx=1+.14*kick;pose.sy=1-.17*kick;pose.brightness=1+2.4*Math.max(0,1-p/.22);
    } else if(action==='death') {
        const q=Math.max(0,(p-.25)/.75),fall=q*q*(3-2*q);
        const impact=Math.sin(Math.min(1,p/.25)*Math.PI);
        pose.x=reduced?0:-direction*12*impact;pose.brightness=1+1.5*impact;
        pose.y=reduced?0:20*fall;pose.rotation=reduced?0:-direction*.55*fall;
        pose.sx=1+.15*fall;pose.sy=1-.45*fall;pose.alpha=1-fall;
    }
    return pose;
}

export function battleActorAction(id,hp,event,progress=0) {
    if(hp<=0)return {action:'death',progress:['damage','dot'].includes(event?.type)&&event.target===id?progress:1};
    if(['damage','dot'].includes(event?.type)&&event.target===id&&event.amount>0&&!event.recoilPlayed)return {action:'hit',progress};
    if(['cast','fizzle'].includes(event?.type)&&event.caster===id)return {action:'cast',progress:Math.min(1,progress/.45)};
    return {action:'idle',progress:0};
}

// Read only actual queued damage: healing, misses and fully absorbed hits do not recoil.
export function castHitReactions(events,index,progress,duration,impact) {
    if(events[index]?.type!=='cast')return [];
    const hitProgress=(progress-impact)*duration/HIT_DURATION_MS;
    if(hitProgress<0||hitProgress>=1)return [];
    const reactions=[];
    for(let i=index+1;i<events.length;i++) {
        const event=events[i];
        if(event.periodic||['movearrow','cast','fizzle','pass','speak'].includes(event.type))break;
        if(event.type==='damage'&&event.amount>0)reactions.push({eventIndex:i,target:event.target,progress:hitProgress});
    }
    return reactions;
}
