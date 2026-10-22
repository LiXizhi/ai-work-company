// Web adaptation requested 2026-09-21: remaining calendar months, capped at 10.
// Original MagicStar used M points instead; encounters snapshot the active level.
import {createRng,hashSeed} from './rng_core.js';
export function magicStarStatus(member,now) {
    const end=Date.parse(member?.expiresAt),active=member?.isVip===true&&(!Number.isFinite(end)||end>now);
    if(!active)return {level:0,days:0,expiresAt:null};
    if(!Number.isFinite(end))return {level:1,days:null,expiresAt:null};
    const start=new Date(now);
    let months=1;
    for(;months<10;months++){
        const boundary=new Date(now);boundary.setUTCDate(1);boundary.setUTCMonth(start.getUTCMonth()+months);
        const last=new Date(Date.UTC(boundary.getUTCFullYear(),boundary.getUTCMonth()+1,0)).getUTCDate();
        boundary.setUTCDate(Math.min(start.getUTCDate(),last));
        if(end<=boundary.getTime())break;
    }
    return {level:months,days:Math.ceil((end-now)/86400000),expiresAt:member.expiresAt};
}
export const magicStarWeek=now=>Math.floor((now+8*3600000+3*86400000)/(7*86400000));
export function magicPocketRemaining(record,level,now) {
    if(!Number.isFinite(now)||!Number.isInteger(level)||level<0||level>10)throw Error('魔法口袋参数无效');
    if(record&&(!Number.isSafeInteger(record.week)||record.week<0||!Number.isSafeInteger(record.used)||record.used<0||record.used>11))throw Error('魔法口袋记录无效');
    if(!level)return 0;
    const week=magicStarWeek(now);
    if(record?.week>week)return 0;
    return Math.max(0,level+1-(record?.week===week?record.used:0));
}
export function magicStarCombatLevel(content,access={}) {
    if(!Number.isFinite(access.now)||access.keepworkVip!==true)return 0;
    const level=magicStarStatus({isVip:true,expiresAt:access.expiresAt},access.now).level;
    return content.magicStar?.levels[level]&&level>0?level:0;
}
export function applyMagicStarCombat(stats,content,level) {
    if(!Number.isInteger(level)||level<0||level>10)throw Error('魔法星战斗等级无效');
    if(!level)return;
    const row=content.magicStar?.levels[level];
    if(!row)throw Error('魔法星战斗配置缺失');
    stats.magicStarHpPct=row.HP;
    stats.damagePct.all=(stats.damagePct.all||0)+row.attack;stats.resistPct.all=(stats.resistPct.all||0)+row.guard;stats.accuracyPct.all=(stats.accuracyPct.all||0)+row.hit;
    stats.outputHealPct+=row.cure;stats.inputHealPct+=row.becured;
}
export function validateMagicStarClaims(save,content) {
    const record=save.magicStarClaims;if(record===undefined)return;
    if(!record||!Array.isArray(record.items)||new Set(record.items).size!==record.items.length||
        record.items.some(id=>!content.magicStar?.rewards.some(r=>r.id===id))||
        (record.week!==null&&(!Number.isSafeInteger(record.week)||record.week<0)))throw Error('魔法星领取记录无效');
    if(record.pocket!==undefined){
        if(!record.pocket)throw Error('魔法口袋记录无效');
        magicPocketRemaining(record.pocket,0,0);
    }
}
export function claimMagicStar(save,content,action,access) {
    const now=access.now,config=content.magicStar;
    if(!Number.isFinite(now)||!config||access.keepworkVip!==true)throw Error('请先登录会员账号，再领取魔法星奖励。');
    const star=magicStarStatus({isVip:access.keepworkVip,expiresAt:access.expiresAt},now);
    if(star.level===0)throw Error('会员已到期，请先升级会员。');
    validateMagicStarClaims(save,content);
    const record=save.magicStarClaims||{items:[],week:null};
    if(action.rewardId==='pocket'){
        if(!magicPocketRemaining(record.pocket,star.level,now))throw Error('本周魔法口袋次数已用完。');
        const gifts=content.progressionBonuses?.gifts;
        if(!Array.isArray(gifts)||!gifts.length||gifts.some(row=>!content.items[row.itemId]||!Number.isSafeInteger(row.weight)||row.weight<=0))throw Error('魔法口袋奖池尚未配置完整。');
        const totalWeight=gifts.reduce((sum,row)=>sum+row.weight,0);
        if(!Number.isSafeInteger(totalWeight))throw Error('魔法口袋奖池无效');
        const week=magicStarWeek(now),used=record.pocket?.week===week?record.pocket.used:0;
        let roll=createRng(hashSeed(`${save.seed}:magic-pocket:${week}:${used}`)).int(1,totalWeight);
        const reward=gifts.find(row=>(roll-=row.weight)<=0);
        const total=(save.inventory[reward.itemId]||0)+1;
        if(!Number.isSafeInteger(total))throw Error('物品数量超出上限');
        save.inventory[reward.itemId]=total;
        save.magicStarClaims={...record,items:[...record.items],pocket:{week,used:used+1}};
        return;
    }
    let itemId,count;
    if(action.rewardId==='weekly'){
        const week=magicStarWeek(now);
        if(record.week!==null&&record.week>=week)throw Error('本周仙豆已经领取。');
        itemId=config.weeklyItemId;count=config.levels[star.level].weekly_money;
    }else{
        const reward=config.rewards.find(r=>r.id===action.rewardId);
        if(!reward)throw Error('奖励不存在');
        if(record.items.includes(reward.id)||(save.inventory[reward.itemId]||0)>0)throw Error('已经拥有或领取过这件奖励。');
        if(star.level<reward.starLevel||save.level<reward.heroLevel)throw Error('魔法星或角色等级尚未达到领取条件。');
        itemId=reward.itemId;count=1;
    }
    if(!content.items[itemId])throw Error('奖励尚未配置');
    const total=(save.inventory[itemId]||0)+count;
    if(!Number.isSafeInteger(total))throw Error('物品数量超出上限');
    save.inventory[itemId]=total;
    save.magicStarClaims={...record,items:action.rewardId==='weekly'?[...record.items]:[...record.items,action.rewardId],week:action.rewardId==='weekly'?magicStarWeek(now):record.week};
}
