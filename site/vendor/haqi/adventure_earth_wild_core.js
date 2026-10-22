import {createRng,hashSeed} from './rng_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {baseMaxHp} from './combat_formulas_core.js';
import {monsterGearScore} from './combat_power_core.js';

// Reuse the four-stage catalog and existing adventure trial stats/rewards.
// Stage is an appearance choice, independent of combat level and unlock level.
export function earthWildSpecies(content){
    return Object.values(content.pets||{}).filter(p=>!p.staticAppearance&&p.art?.rows===4&&p.art?.cols===4&&p.lessons?.some(l=>l.level<=1))
        .map(p=>p.id).sort();
}
// Web wilderness progression, not an original Lua combat formula.
// Urban land-cover samples use Earth world coordinates; longitude distance wraps at the date line.
export function earthWildDistanceFactor(content,point,cities,rules={...defaultParams('kids').earth,...content?.balanceParams?.earth}){
    const width=360*rules.unitsPerDegree;
    const squared=cities.reduce((nearest,cell)=>{
        const dx=((point.x-cell.x+width*1.5)%width)-width/2,dy=point.y-cell.y;
        return Math.min(nearest,dx*dx+dy*dy);
    },Infinity);
    const distance=Math.sqrt(squared);
    const range=Math.max(1,rules.wildFarDistance-rules.wildNearDistance);
    const t=Math.max(0,Math.min(1,(distance-rules.wildNearDistance)/range));
    return t;
}
export function earthWildLevel(content,playerLevel,point,cities,rules={...defaultParams('kids').earth,...content?.balanceParams?.earth}){
    const t=earthWildDistanceFactor(content,point,cities,rules);
    const offset=Math.round(rules.wildNearLevelOffset+(rules.wildFarLevelOffset-rules.wildNearLevelOffset)*t);
    return Math.max(1,Math.min(50,Math.floor(Number(playerLevel)||1)+offset));
}
export function createEarthWildEncounter(content,{chunkX,chunkY,slot,level=1,targetPower=null,version=1,species=earthWildSpecies(content)}){
    const rng=createRng(hashSeed(`earth-wild:${version}:${chunkX}:${chunkY}:${slot}`));
    const petId=rng.pick(species);if(!petId)return null;
    const stage=rng.int(0,3),combatLevel=Math.max(1,Math.min(50,Math.floor(Number(level)||1)));
    const rules={...defaultParams('kids').earth,...content?.balanceParams?.earth};
    const power=targetPower===null?null:Math.max(200,Math.min(rules.wildMaxPower,Math.ceil(Number(targetPower)||200)));
    const id=power===null?`earth:wild:${petId}:${combatLevel}:${stage}:${chunkX}:${chunkY}:${slot}`:`earth:wild2:${petId}:${combatLevel}:${stage}:${power}:${chunkX}:${chunkY}:${slot}`;
    return restoreEarthWildEncounter(content,id);
}
export function restoreEarthWildEncounter(content,id){
    const powered=/^earth:wild2:([\w-]+):(\d+):([0-3]):(\d+):(\d+):(\d+):(\d+)$/.exec(id);
    const match=powered?[powered[0],...powered.slice(1,4),...powered.slice(5)]:/^earth:wild:([\w-]+):(\d+):([0-3]):(\d+):(\d+):(\d+)$/.exec(id);
    if(!match)return null;
    const [,petId,levelText,stageText,xText,yText,slotText]=match,pet=content.pets?.[petId],level=Number(levelText);
    const params=resolveParams({cards:{}},content.balanceParams||defaultParams('kids')),rules=params.earth,p=params.adventure;
    if(!pet||pet.staticAppearance||pet.art?.rows!==4||pet.art?.cols!==4||level<1||level>50||Number(xText)>=Math.ceil(360*rules.unitsPerDegree/rules.chunkSize)||Number(yText)>=Math.ceil(180*rules.unitsPerDegree/rules.chunkSize)||Number(slotText)>=rules.monstersPerChunk)return null;
    const pool=(pet.lessons||[]).filter(l=>l.level<=level).slice(-8).map(l=>({key:l.key,weight:10}));
    if(!pool.length)return null;
    const monster={id,name:pet.name,school:pet.school,level,appearanceStage:Number(stageText),speciesId:petId,unlockLevel:1,
        hp:baseMaxHp(pet.school,level,'kids'),attributes:{ai_module:'Genes_Attacker',power_pip_percent:0,startup_pips_normal:1},
        pool,sequences:[],genes:[],cardsets:{},xp:p.encounterXpBase+p.encounterXpLevel*level,coins:p.encounterCoinsBase+p.encounterCoinsLevel*level};
    if(powered){
        const target=Number(powered[4]);if(!Number.isSafeInteger(target)||target<200||target>rules.wildMaxPower)return null;
        // A deterministic virtual equipment budget, not invented original item IDs.
        // Spend score above the naked baseline on real attack/resist/pip bonuses.
        const budget=target-200,pip=Math.min(rules.wildMaxPip,budget*rules.wildPipBudgetShare);
        const defense=Math.min(100/(1-rules.wildMaxResist/100)-100,budget*rules.wildResistBudgetShare);
        const damage=Math.max(0,budget-pip-defense),resist=100-10000/(100+defense);
        Object.assign(monster.attributes,{power_pip_percent:pip,damage_all_percent:damage,resist_all_percent:resist});
        const hpBonus=Math.round(monster.hp*Math.min(rules.wildMaxHpBonus,budget/200*rules.wildHpBudgetShare));
        monster.equipmentBonuses={version:1,damagePct:damage,resistPct:resist,powerPipPct:pip,hpFlat:hpBonus};
        monster.hp+=hpBonus;monster.gearScore=monsterGearScore(monster);
    }
    return {id,zone:'earth',monsterId:id,monster};
}

export function earthWildTargetPower(content,playerPower,point,cities,rules={...defaultParams('kids').earth,...content?.balanceParams?.earth}){
    const t=earthWildDistanceFactor(content,point,cities,rules);
    const ratio=rules.wildNearPowerRatio+(rules.wildFarPowerRatio-rules.wildNearPowerRatio)*t;
    return Math.max(200,Math.min(rules.wildMaxPower,Math.ceil(playerPower*ratio)||200));
}
