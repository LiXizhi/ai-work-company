export function appendThreat(mob,unit,value,pending=[],weight=1) {
    mob.threats??={};mob.pendingThreats??={};
    mob.threats[unit.id]=(mob.threats[unit.id]||0)+value*weight;
    if(pending.length)(mob.pendingThreats[unit.id]??=[]).push(pending.map(value=>value*weight));
}
export function tauntThreat(mob,unit,bonus=0) {
    mob.threats??={};
    mob.threats[unit.id]=Math.max(0,...Object.values(mob.threats))+bonus;
}
export function advanceThreat(mob,units) {
    for(const unit of units){
        if(unit.hp<=0){delete mob.threats?.[unit.id];delete mob.pendingThreats?.[unit.id];continue;}
        for(const queue of mob.pendingThreats?.[unit.id]||[])if(queue.length)appendThreat(mob,unit,queue.pop());
        if(mob.pendingThreats?.[unit.id])mob.pendingThreats[unit.id]=mob.pendingThreats[unit.id].filter(queue=>queue.length);
    }
}
export function threatTarget(mob,targets,lowest=false) {
    return targets.filter(unit=>unit.hp>0&&unit.combatActive!==false).sort((left,right)=>{
        const difference=(mob.threats?.[left.id]||0)-(mob.threats?.[right.id]||0);
        return (lowest?difference:-difference)||(left.slot||0)-(right.slot||0);
    })[0]||null;
}