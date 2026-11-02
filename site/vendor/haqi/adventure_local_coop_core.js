// Local couch co-op rules. No browser, clocks or persistence dependencies.
import {partySpecs} from './adventure_pets_core.js';
import {playerSpec,runeInventory,settleParty,settleEncounter,applyAction} from './adventure_core.js';
import {settleArenaQuests} from './adventure_red_mushroom_core.js';

const check=(ok,message)=>{if(!ok)throw Error(message);};
// CSS viewport pixels: two 400px player panes keep the action rows unwrapped.
// 480px leaves room above the compact hands for the round/retreat controls.
// Taller windows do not reduce either player's usable area.
export function wideEnough(width,height){return width>=800&&height>=480;}
export function createLocalFormation(roleIds,saves){
    check(roleIds.length===2&&new Set(roleIds).size===2,'请选择两个不同角色');
    return {version:1,roleIds:[...roleIds],slots:[{owner:0,kind:'hero'},{owner:1,kind:'hero'},...saves.map((s,owner)=>{
        const id=s.formation.find((id,i)=>id&&i!==s.heroSlot);
        return id?{owner,kind:'pet',id}:null;
    })]};
}
export function validateLocalFormation(value,roleIds,saves){
    check(value?.version===1&&JSON.stringify(value.roleIds)===JSON.stringify(roleIds)&&value.slots?.length===4,'双人阵容无效');
    for(let owner=0;owner<2;owner++){
        check(value.slots.filter(u=>u?.owner===owner&&u.kind==='hero').length===1,'每位玩家必须有一个主角');
        const pets=value.slots.filter(u=>u?.owner===owner&&u.kind==='pet');
        check(pets.length<=1,'每位玩家最多派出一只宠物');
        for(const pet of pets)check(pet.id&&saves[owner].formation[saves[owner].heroSlot]!==pet.id&&(saves[owner].pets[pet.id]||saves[owner].petFileRefs?.[pet.id]),'宠物不存在或已提供随身卡');
    }
    check(value.slots.every(u=>u===null||[0,1].includes(u.owner)&&['hero','pet'].includes(u.kind)),'卡位无效');
    return value;
}
export function moveLocalSeat(formation,from,to){
    check([from,to].every(i=>Number.isInteger(i)&&i>=0&&i<4),'卡位无效');
    const next=structuredClone(formation);[next.slots[from],next.slots[to]]=[next.slots[to],next.slots[from]];return next;
}
export function equipLocalPet(formation,owner,id,target,saves){
    check([0,1].includes(owner)&&Number.isInteger(target)&&target>=0&&target<4,'卡位无效');
    check(!formation.slots[target]||formation.slots[target].kind==='pet'&&formation.slots[target].owner===owner,'请先移动主角或队友宠物');
    const next=structuredClone(formation);
    next.slots=next.slots.map(u=>u?.owner===owner&&u.kind==='pet'?null:u);
    if(id)next.slots[target]={owner,kind:'pet',id};
    return validateLocalFormation(next,formation.roleIds,saves);
}
export function localParty(formation,saves,content,allies=[]){
    validateLocalFormation(formation,formation.roleIds,saves);
    const units=formation.slots.flatMap((seat,slot)=>{
        if(!seat)return [];
        const s=saves[seat.owner],hero={...playerSpec(s,content),id:seat.owner===0?'hero':'local-hero-1'};
        const temporary={...s,heroSlot:0,formation:[s.formation[s.heroSlot],...(seat.kind==='pet'?[seat.id]:[]),null,null].slice(0,4)};
        const specs=partySpecs(temporary,content,hero);
        const unit=seat.kind==='hero'?specs[0]:specs.find(u=>u.id===seat.id||u.speciesId===s.pets[seat.id]?.speciesId);
        check(unit,'请先加载出战宠物');
        return [{...unit,id:seat.kind==='hero'?hero.id:`local-pet-${seat.owner}`,slot,localOwner:seat.owner,sourcePetId:seat.id,isBot:seat.kind!=='hero',appearance:s.appearance,bodyId:s.bodyId,headId:s.headId,customHead:s.customHead,mountId:s.mountId}];
    });
    check(allies.length<=2,'双人队伍最多邀请两位伙伴');
    // Both local heroes keep their seats. Guests take empty seats, then pet seats.
    for(const ally of allies){
        let slot=formation.slots.findIndex((_,i)=>!units.some(u=>u.slot===i));
        if(slot<0){const index=units.findLastIndex(u=>u.speciesId);check(index>=0,'队伍已满');slot=units[index].slot;units.splice(index,1);}
        units.push({...structuredClone(ally),slot,isBot:true});
    }
    // Existing adventure presentation and checkpoint validation keep leader first.
    return units.sort((a,b)=>(a.id==='hero'?-1:b.id==='hero'?1:a.slot-b.slot));
}
export function localHumanResources(saves,content){
    return Object.fromEntries(saves.map((s,i)=>[i===0?'hero':'local-hero-1',{runes:runeInventory(s,content),heroLevel:s.level,ownedPets:Object.values(s.pets).map(p=>p.speciesId),captureStock:0}]));
}
export function fitLocalCamera(positions,width,height,requested=1){
    const minX=Math.min(...positions.map(p=>p.x)),maxX=Math.max(...positions.map(p=>p.x));
    const minY=Math.min(...positions.map(p=>p.y)),maxY=Math.max(...positions.map(p=>p.y));
    // Resizing can shrink the view after the players have separated. Always fit
    // both immediately; the movement constraint still uses the normal .75 limit.
    const scale=Math.min(requested,(width-240)/Math.max(1,maxX-minX),(height-260)/Math.max(1,maxY-minY));
    return {center:{x:(minX+maxX)/2,y:(minY+maxY)/2},scale};
}
export function constrainLocalPosition(candidate,peer,width,height){
    const x=Math.max(0,(width-240)/.75),y=Math.max(0,(height-260)/.75);
    return Math.abs(candidate.x-peer.x)<=x&&Math.abs(candidate.y-peer.y)<=y;
}
export function createLocalReady(){
    let round=null,choices={};
    return {
        reset(turn){if(turn!==round){round=turn;choices={};}},
        get choices(){return structuredClone(choices);},
        cancel(id){delete choices[id];},
        submit(id,decision,ids){check(ids.includes(id),'不是本地玩家');choices[id]=structuredClone(decision);},
        complete(ids,units){return ids.every(id=>units[id].hp<=0||units[id].freezeRounds>0||choices[id]);},
        decisions(ids,units){return Object.fromEntries(ids.map(id=>[id,units[id].hp<=0||units[id].freezeRounds>0?{pass:true}:structuredClone(choices[id])]));},
    };
}

// One receipt covers both role updates. The IO layer commits this pair in one
// catalog write before clearing the local checkpoint, so retries cannot pay twice.
export function settleLocalBattle(saves,formation,content,battle,pending,{retreat=false,now=0}={}){
    check(retreat||battle.finished,'战斗尚未结束');
    const next=structuredClone(saves),ids=battle.localHumanIds||Object.keys(battle.localHumans||{});
    const receipt=pending.receipt||pending.base?.id||`local:${pending.replay.seed}`;
    const leaderContext={zone:next[0].zone,dungeonRuns:structuredClone(next[0].dungeonRuns),dungeonReturn:next[0].dungeonReturn};
    for(let owner=0;owner<2;owner++){
        const s=next[owner];if(s.rewardedEncounters.includes(receipt))continue;
        if(battle.redMushroom){
            if(!retreat)settleArenaQuests(s,content,battle.sides.near.length,battle.winner);
            s.rewardedEncounters.push(receipt);s.revision++;continue;
        }
        const human=ids[owner],resources=battle.localHumans[human],hero=battle.unitsById[human];
        const near=battle.sides.near.filter(u=>u.id===human||u.id===`local-pet-${owner}`).map(u=>({...u,id:u.id===human?'hero':formation.slots.find(v=>v?.owner===owner&&v.kind==='pet')?.id}));
        const view={...battle,...resources,sides:{...battle.sides,near},unitsById:{...battle.unitsById,hero},captured:resources.captured,capturedTraits:resources.capturedTraits};
        s.pendingEncounter={...structuredClone(pending.base),runes:resources.runes,runeUsed:resources.runeUsed,petIds:near.filter(u=>u.speciesId).map(u=>u.id)};
        const oldRuns=s.dungeonRuns,oldReturn=s.dungeonReturn;
        if(owner)Object.assign(s,structuredClone(leaderContext));
        if(retreat){settleParty(s,content,view,{retreat:true});applyAction(s,content,{type:'retreat'});}else settleEncounter(s,content,view,{now});
        if(owner){s.dungeonRuns=oldRuns;s.dungeonReturn=oldReturn;}
        if(!s.rewardedEncounters.includes(receipt))s.rewardedEncounters.push(receipt);
    }
    return next;
}
