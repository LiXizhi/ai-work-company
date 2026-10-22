import {magicStarStatus} from './adventure_magic_star_core.js';
import { defaultParams, resolveParams } from './combat_params_core.js';

const DAY_MS=86400000;
const dayAt=now=>Math.floor((now+8*3600000)/DAY_MS);
function dayState(save,now){
    const day=dayAt(now),old=save.checkin;
    return old?.version===2&&old.day>=day?old:{version:2,day,onlineMs:0,claimed:[]};
}
// MiJiuHuLu.lua GetObtainAwardState L326-389: daily flags, strictly > threshold.
// MiJiuHuLu.html L332-482: five gourds, cumulative online 1/15/30/60/90 minutes.
// Web adaptation: visible gameplay time, China midnight reset, original exchange rewards plus separately claimed VIP bonuses.
export function checkinStatus(save,content,now,member={}){
    const {minutes,coins}=resolveParams({cards:{}},content.balanceParams||defaultParams('kids')).checkin;
    if(!Number.isSafeInteger(now)||now<0||!Array.isArray(minutes)||minutes.length!==5||minutes.some(x=>!Number.isSafeInteger(x)||x<1)||!Number.isSafeInteger(coins)||coins<1)throw new Error('签到参数无效');
    const state=dayState(save,now),star=magicStarStatus(member,now);
    const vipCoins=content.checkinConfig?.vipCoinsByLevel[star.level]||0;
    const gourds=minutes.map((minute,index)=>{
        const claimed=state.claimed.includes(index),remainingMs=Math.max(0,minute*60000+1-state.onlineMs);
        const rewards=content.checkinConfig?.gourds[index].rewards||[{id:100,count:coins}];
        const vipClaimed=(state.vipClaimed||[]).includes(index),vipReady=star.level>0&&claimed&&!vipClaimed&&remainingMs===0;
        return {index,minute,coins:rewards[0].count,rewards,claimed,remainingMs,ready:!claimed&&remainingMs===0,vipClaimed,vipReady,vipCoins};
    });
    const pending=gourds.filter(g=>!g.claimed||(star.level>0&&!g.vipClaimed));
    return {gourds,starLevel:star.level,baseCount:state.claimed.length,vipCount:(state.vipClaimed||[]).length,onlineMs:state.onlineMs,coins,ready:gourds.some(g=>g.ready||g.vipReady),finished:!pending.length,remainingMs:pending.length?Math.min(...pending.map(g=>g.remainingMs)):0};
}
// Elapsed visible play time is supplied by the browser controller; never count offline gaps.
export function tickCheckin(save,now,elapsedMs){
    if(!Number.isSafeInteger(now)||now<0||!Number.isFinite(elapsedMs)||elapsedMs<0)throw new Error('签到时间无效');
    const state=dayState(save,now),sinceMidnight=(now+8*3600000)%DAY_MS;
    const delta=Math.min(Math.floor(elapsedMs),sinceMidnight);
    state.onlineMs=Math.min(DAY_MS,state.onlineMs+delta);
    const coreChanged=save.checkin!==state;
    save.checkin=state;
    return coreChanged;
}
// MiJiuHuLu.lua: base flags 50321–50341, separate VIP flag 50342.
export function claimCheckin(save,content,now,index,access={},bonus=false){
    const member={isVip:access.keepworkVip,expiresAt:access.expiresAt};
    const status=checkinStatus(save,content,now,member),gourd=status.gourds[index];
    if(!Number.isInteger(index)||!gourd)throw new Error('请选择一个葫芦');
    if(bonus){
        if(!status.starLevel)throw new Error('请先登录会员账号，再领取魔法星奖励。');
        if(gourd.vipClaimed)throw new Error('这个葫芦的魔法星奖励今天已经领取过了。');
        if(!gourd.claimed)throw new Error('请先领取这个葫芦的普通奖励。');
        if(!gourd.vipReady)throw new Error('在线时间不足，葫芦还不能领取。');
    }else{
        if(gourd.claimed)throw new Error('这个葫芦今天已经领取过了。');
        if(!gourd.ready)throw new Error('在线时间不足，葫芦还不能领取。');
    }
    const rewards=bonus?[{id:17213,count:gourd.vipCoins}]:gourd.rewards;
    const inventory={...save.inventory};
    for(const reward of rewards){
        if(!content.items[reward.id]||!Number.isSafeInteger(reward.count)||reward.count<1)throw Error('签到奖励配置无效');
        inventory[reward.id]=(inventory[reward.id]||0)+reward.count;
        if(!Number.isSafeInteger(inventory[reward.id]))throw Error('签到数值超出范围');
    }
    const state=dayState(save,now);
    save.inventory=inventory;
    save.checkin=bonus?{...state,vipClaimed:[...(state.vipClaimed||[]),index]}:{...state,claimed:[...state.claimed,index]};
}
export function validateCheckin(save){
    const s=save.checkin;if(s===undefined)return;
    if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('存档签到记录无效');
    // Previous single-reward saves keep their currency; the new daily track starts fresh.
    if(s.version===undefined&&Number.isSafeInteger(s.nextAt)&&s.nextAt>=0)return;
    if(s.version!==2||!Number.isSafeInteger(s.day)||s.day<0||!Number.isSafeInteger(s.onlineMs)||s.onlineMs<0||s.onlineMs>DAY_MS||!Array.isArray(s.claimed)||new Set(s.claimed).size!==s.claimed.length||s.claimed.some(i=>!Number.isInteger(i)||i<0||i>4))throw new Error('存档签到记录无效');
    if(s.vipClaimed!==undefined&&(!Array.isArray(s.vipClaimed)||new Set(s.vipClaimed).size!==s.vipClaimed.length||s.vipClaimed.some(i=>!Number.isInteger(i)||!s.claimed.includes(i))))throw new Error('存档签到记录无效');
}
