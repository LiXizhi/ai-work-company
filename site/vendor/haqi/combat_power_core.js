import {applyPetTraitStats} from './adventure_pet_traits_core.js';
import {normalizeStats} from './combat_unit_core.js';
import {gearScoreV2} from './combat_formulas_core.js';

// mob_server.lua GetDamageBoost/GetResist and absolute variants L1994–2134.
// Shared by evaluation and PvE, so the displayed score uses the applied bonuses.
export function monsterCombatStats(monster,{absolute=true,traitParams}={}){
    const stats=normalizeStats(),a=monster.attributes||{};
    for(const school of ['fire','ice','storm','life','death','all','balance']){
        if(!absolute&&school==='balance')continue;
        for(const [key,field] of [['damagePct','damage_percent'],['resistPct','resist_percent'],['accuracyPct','accuracy_percent'],['damageAbs','damage_absolute'],['resistAbs','resist_absolute']]){
            if(!absolute&&key.endsWith('Abs'))continue;
            const [kind,suffix]=field.split('_');stats[key][school]=Number(a[`${kind}_${school}_${suffix}`]||0);
        }
    }
    stats.powerPipPct=Number(a.power_pip_percent||0);
    return monster.passiveTraits?applyPetTraitStats(stats,monster.passiveTraits,traitParams):stats;
}
export const monsterGearScore=monster=>gearScoreV2({level:monster.level,stats:monsterCombatStats(monster)},'kids',Number(monster.attributes?.power_pip_percent||0));
