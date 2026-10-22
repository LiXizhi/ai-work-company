import {petInteractionParams} from './adventure_pet_interactions_core.js';
// Presentation state only: no saved gameplay values or combat RNG are changed.
export function petBattleMood(hp,maxHp,content){
    if(hp<=0)return 'sleeping';
    return maxHp>0&&hp/maxHp<=petInteractionParams(content).seriousHpRatio?'sad':'idle';
}
export function updatePetIdle(actor,owner,now,content,{happy=false,wake=false}={}){
    const p=petInteractionParams(content);
    if(!actor.idleAnchor||Math.hypot(owner.x-actor.idleAnchor.x,owner.y-actor.idleAnchor.y)>p.idleMoveDistance||wake){actor.idleAnchor={...owner};actor.activeAt=now;}
    actor.mood=happy?'happy':now-actor.activeAt>=p.idleSleepMs?'sleeping':'idle';
    return actor.mood;
}
