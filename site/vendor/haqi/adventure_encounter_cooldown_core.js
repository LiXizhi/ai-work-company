import {defaultParams,resolveParams} from './combat_params_core.js';

// Web scene respawn rule. IO supplies wall-clock time; timers stay on this device.
export function encounterCoolingDown(save,id,now=0) {
    return (save?.encounterRespawns?.[id]||0)>now;
}
export function markEncounterDefeated(save,content,id,now) {
    const defaults=defaultParams('kids');
    const params=resolveParams({version:'kids'},content.balanceParams||defaults);
    const configured=Number(params.adventure.monsterRespawnMs);
    const duration=Number.isFinite(configured)?Math.max(defaults.adventure.monsterRespawnMs,Math.ceil(configured)):defaults.adventure.monsterRespawnMs;
    save.encounterRespawns=Object.fromEntries(Object.entries(save.encounterRespawns||{}).filter(([,until])=>until>now));
    save.encounterRespawns[id]=now+duration;
}
