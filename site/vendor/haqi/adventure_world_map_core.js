import { resolveParams } from './combat_params_core.js';
import { mapInfo } from './adventure_island_layout_core.js';
import {PACK_ISLANDS} from './island_pack_registry_core.js';

// Original world identities: Scene/WorldManager.lua L1160–1165.
// Recommended levels use the web adaptation in BalanceParams. Below-level
// travel asks for confirmation in the controller instead of locking islands.
export const ISLANDS = [
    {id:'camp',name:'魔法营地',source:'NewUserIsland',description:'初心之旅的起点，五系导师等你归来。'},
    {id:'town',name:'哈奇岛',source:'61HaqiTown',description:'熟悉的哈奇小镇，阳光与绿意环绕的家园。'},
    {id:'fire',name:'火鸟岛',source:'FlamingPhoenixIsland',description:'赤红火山与金色海岸，探索炽热的远方。'},
    {id:'ice',name:'寒冰岛',source:'FrostRoarIsland',description:'冰蓝山峰矗立海上，踏上覆雪的旅途。'},
    {id:'desert',name:'沙漠岛',source:'AncientEgyptIsland',description:'穿过金色沙丘，在绿洲旁寻找歇脚之处。'},
    {id:'dark',name:'幽暗岛',source:'DarkForestIsland',description:'紫色雾气笼罩古老密林，通往更远的冒险。'},
    ...PACK_ISLANDS,
];
export function islandFor(zone){return zone==='earth'?{id:'earth',name:'现实世界'}:ISLANDS.find(row=>row.id===zone);}
export function islandName(zone){return islandFor(zone)?.name||'未知岛屿';}
export function travelStatus(save,content,zone){
    const island=islandFor(zone);
    if(!island)return {allowed:false,reason:'目的地不存在'};
    const minLevel=resolveParams({cards:{}},content.balanceParams||{version:'kids'}).worldTravel[zone];
    const reason=save.pendingEncounter?'请先完成当前战斗':'';
    return {allowed:!reason,reason,minLevel,requiresConfirmation:save.level<minLevel,current:save.zone===zone};
}
export function islandSpawn(zone,content){return {...mapInfo(zone,content).spawn};}
