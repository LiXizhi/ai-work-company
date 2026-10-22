import {locationSnapshot} from './adventure_coordinates_core.js';
import {dungeonLanguageBaseHp} from './adventure_dungeon_language_core.js';
import {snapshotUnit,socialDataHash} from './adventure_social_core.js';
import {dungeonProgress} from './adventure_city_dungeons_core.js';
export {dungeonProgress};
export function startCoopRun(save,profiles,dataset,dungeon,hero=null){
    if(save.pendingEncounter||save.coopRun)throw Error('请先退出当前组队挑战');
    if(profiles.length<1||profiles.length>3||new Set(profiles.map(p=>p.id)).size!==profiles.length)throw Error('请选择一至三位不同伙伴');
    if(!dungeon?.playable||dungeon.arenas.some(a=>a.blocked?.length))throw Error('这个副本尚不支持完整组队挑战');
    save.coopRun={version:1,dungeonId:dungeon.id,dataHash:socialDataHash(dataset),hero:hero?structuredClone(hero):null,members:profiles.map((p,i)=>({profile:structuredClone(p),unit:snapshotUnit(p,dataset,`ally${i+1}`,i+1)})),runs:{[dungeon.id]:{cleared:[]}},returnTo:locationSnapshot(save)};
    // Hero HP is local runtime state; the first encounter starts at full health.
    save.heroHp=null;
}
export function coopParty(save,player){
    if(!save.coopRun)return null;
    return [{...structuredClone(save.coopRun.hero||player),slot:0,...(Number.isFinite(save.heroHp)?{hp:save.heroHp}:{})},...save.coopRun.members.map(m=>structuredClone(m.unit))];
}
export function settleCoopHealth(save,battle){
    if(!save.coopRun)return;
    save.heroHp=dungeonLanguageBaseHp(battle.sides.near[0]);
    for(const m of save.coopRun.members){const unit=battle.unitsById[m.unit.id];if(unit)m.unit.hp=unit.hp;}
}
export function validateCoopRun(save){
    const r=save.coopRun;if(!r)return;
    if(r.version!==1||r.dungeonId!==save.zone||!Array.isArray(r.members)||r.members.length<1||r.members.length>3||!r.runs?.[save.zone]||!r.returnTo||new Set(r.members.map(m=>m.unit.id)).size!==r.members.length)throw Error('组队记录无效');
    for(const [i,m]of r.members.entries())if(m.unit.id!==`ally${i+1}`||m.unit.slot!==i+1||!Number.isFinite(m.unit.hp)||m.unit.hp<0||m.unit.hp>m.unit.maxHp)throw Error('组队生命记录无效');
}
