export const POINTER_TURN_MS=200;
const actions=new Set(['cast','fizzle','pass','capture']);
export function nextBattlePointer(battle) {
    if(battle.finished)return null;
    const opening=battle.sides.far.find(unit=>{
        if(unit.hp<=0)return false;
        const sequences=(unit.template?.sequences||[]).filter(rows=>rows.some(row=>String(row.round).endsWith('-')));
        const index=unit.aiMemory?.sequence_before;
        const candidates=index===undefined?sequences:[sequences[index]];
        const round=`${(unit.aiMemory?.round||0)+1}-`;
        return candidates.length>0&&candidates.every(rows=>rows?.some(row=>row.round===round&&row.card));
    });
    if(opening)return opening.id;
    const near=[...battle.sides.near].sort((a,b)=>(a.slot??0)-(b.slot??0));
    const order=battle.firstActingSide==='far'?[...battle.sides.far,...near]:[...near,...battle.sides.far];
    return order.find(unit=>unit.hp>0)?.id||null;
}
export function withBattlePointer(events,initial='hero',resetTo=null) {
    let previous=initial;
    const queue=events.flatMap(event=>{
        if(!actions.has(event.type)||!event.caster)return [event];
        const move={type:'movearrow',from:previous,caster:event.caster,round:event.round};
        previous=event.caster;
        return [move,event];
    });
    if(resetTo&&previous!==resetTo)queue.push({type:'movearrow',from:previous,caster:resetTo});
    return queue;
}

// ObjectManager.lua AnimateArrow L2290-2338: linear forward rotation, wrapping at 2π.
// Undo the ground ellipse projection before rotating, then project when drawing.
export function battlePointerAngle(center,from,to,progress=1,reduced=false) {
    const angle=point=>Math.atan2((point.y-center.y)/(.39/.76),point.x-center.x);
    const start=angle(from||to),end=angle(to),tau=Math.PI*2;
    const delta=((end-start)%tau+tau)%tau;
    return start+delta*(reduced?1:Math.max(0,Math.min(1,progress)));
}
