import {resolveParams} from './combat_params_core.js';

// Authored Web adventures use exported kids templates. No original Lua story is implied.
export function journeyDungeons(worlds,config,monsters=null,params={}){
    if(!config)return [];
    if(config.version!==1||!Array.isArray(config.entries))throw Error('岛屿副本配置无效');
    const balance=resolveParams({cards:{}},params).dungeonJourney;
    return config.entries.map(entry=>{
        const source=worlds.find(d=>d.id===entry.sourceId);
        if(!source)throw Error('岛屿副本来源缺失：'+entry.sourceId);
        const supported=source.arenas.filter(a=>!a.blocked?.length);
        if(!supported.length)throw Error('副本没有可用关卡：'+entry.name);
        const tower=entry.kind==='tower';
        if(tower&&monsters)supported.sort((a,b)=>monsters[a.monsterIds[0]].hp-monsters[b.monsterIds[0]].hp);
        const count=tower?entry.floors:(entry.arenaCount||supported.length);
        const arenas=Array.from({length:count},(_,i)=>{
            const arena=structuredClone(supported[Math.min(supported.length-1,Math.floor(i*supported.length/count))]);
            arena.id=`${entry.id}:floor-${i+1}`;
            arena.blocked=[];
            if(monsters){
                let ids=entry.enemyTemplateIds?.length?[entry.enemyTemplateIds[Math.min(entry.enemyTemplateIds.length-1,Math.floor(i*entry.enemyTemplateIds.length/count))]]:arena.monsterIds||arena.slots.filter(Boolean);
                if(ids.some(id=>!monsters[id]))throw Error('岛屿副本怪物来源缺失：'+entry.id);
                if(tower){
                    const original=monsters[ids[0]],id=`${entry.id}:guardian-${i+1}`;
                    monsters[id]={...structuredClone(original),id,name:`${original.name}·第${i+1}层`,hp:Math.ceil(original.hp*(1+i*balance.hpGrowth)),goalId:null};
                    ids=[id];
                }else ids=Array.from({length:entry.partySize},(_,slot)=>ids[slot%ids.length]);
                arena.slots=ids;arena.monsterIds=ids;
            }
            return arena;
        });
        return {...structuredClone(source),...structuredClone(entry),...(tower?{mapInfo:{w:1400,h:Math.max(1200,(entry.floors+2)*240+350),spawn:{x:350,y:350},initialSpawn:{x:350,y:350},retainPreviousPosition:true}}:{}),arenas,playable:true,warnings:[],loaded:!!monsters,bossArenaId:arenas.at(-1).id};
    });
}

// Tower opponents match the chosen party size. The checkpoint still uses real,
// deterministic monster IDs and is validated against the current encounter.
export function journeyEnemyFormation(encounter,dungeon,party){
    if(dungeon?.kind!=='tower')return {ids:encounter?.monsterIds,slots:encounter?.monsterSlots};
    const count=Math.max(1,Math.min(4,party?.length||1));
    return {ids:Array(count).fill(encounter.monsterIds[0]),slots:Array.from({length:count},(_,i)=>i)};
}
export function journeyParty(save,dungeon,party){
    if(!dungeon?.kind||!party)return party;
    // Towers follow the lineup already chosen in the party room or pet formation.
    const size=dungeon.kind==='elite'?dungeon.partySize:Math.max(1,Math.min(4,party.length));
    if(party.length<size)throw Error(`本次挑战需要${size}个出战单位，请先安排宠物或邀请伙伴`);
    return party.slice(0,size);
}
export function journeyRewardPets(save,dungeon,party){
    if(save.coopRun)return [];
    const ids=save.formation.filter(Boolean);
    if(!dungeon?.kind)return ids;
    return ids.filter(id=>id===save.formation[save.heroSlot]||party?.some(unit=>unit.id===id));
}
export function towerRecord(save,id){return save.towerRecords?.[id]||{floor:0,claimed:[]};}
export function recordTowerWin(save,dungeon,encounterId){
    if(dungeon?.kind!=='tower')return;
    const floor=dungeon.arenas.findIndex(a=>a.id===encounterId)+1;
    const row=towerRecord(save,dungeon.id);
    if(floor!==row.floor+1)return;
    save.towerRecords??={};save.towerRecords[dungeon.id]={floor,claimed:[...row.claimed]};
}
export function towerRewardSteps(d){return d?.kind==='tower'?Array.from({length:Math.ceil(d.floors/10)},(_,i)=>Math.min(d.floors,(i+1)*10)):[];}
export function towerRewardAmount(content,d,floor){
    const p=resolveParams({cards:{}},content.balanceParams||{}).dungeonJourney;
    return Math.round(floor*p.rewardPerFloor*(floor===d.floors?p.summitMultiplier:1));
}
export function claimTowerReward(save,content,id,floor){
    if(save.pendingEncounter)throw Error('请先结束战斗');
    const d=content.dungeons.find(d=>d.id===id),row=towerRecord(save,id);
    if(!towerRewardSteps(d).includes(floor)||row.floor<floor||row.claimed.includes(floor))throw Error('奖励尚未解锁或已经领取');
    const coins=towerRewardAmount(content,d,floor);
    row.claimed.push(floor);save.inventory[100]=(save.inventory[100]||0)+coins;save.revision++;
    return coins;
}
export function validateTowerRecords(save,content){
    if(save.dungeonMode!==undefined&&![1,2,3,4].includes(save.dungeonMode))throw Error('副本人数无效');
    if(save.towerRecords===undefined)return;
    if(typeof save.towerRecords!=='object'||Array.isArray(save.towerRecords)||!save.towerRecords)throw Error('试炼塔记录无效');
    for(const [id,row] of Object.entries(save.towerRecords)){
        const d=content.dungeons?.find(d=>d.id===id);
        if(d?.kind!=='tower'||!Number.isInteger(row?.floor)||row.floor<0||row.floor>d.floors||!Array.isArray(row.claimed)||new Set(row.claimed).size!==row.claimed.length||row.claimed.some(n=>n>row.floor||!towerRewardSteps(d).includes(n)))throw Error('试炼塔记录无效');
    }
}
