import {dailyBuffs,dailyBuffParams,localBuffDay} from './language_daily_buff_core.js';

// Web daily speaking milestones; progress follows the existing qualified speech buffs.
// Only claim flags persist to the cloud, like check-in rewards; buffs stay on-device.
export function speechRewardStatus(save,content={},now=Date.now()){
    const day=localBuffDay(now),count=Object.values(dailyBuffs(save,now)).reduce((a,b)=>a+b,0);
    const p=dailyBuffParams(content),record=save.languageSpeechClaims;
    const claimed=record?.day>=day?record.claimed:[];
    const rewards=p.rewardSteps.map((target,index)=>({index,target,itemId:p.rewardItems[index],amount:p.rewardAmounts[index],claimed:claimed?.includes(index)||false}));
    for(const row of rewards)row.ready=count>=row.target&&!row.claimed;
    return {day,count,rewards};
}
export function claimSpeechReward(save,content,index,now=Date.now()){
    const status=speechRewardStatus(save,content,now),reward=status.rewards[index];
    if(!Number.isInteger(index)||!reward)throw Error('请选择学习奖励');
    if(reward.claimed)throw Error('这份奖励今天已领取');
    if(!reward.ready)throw Error('再完成几次语言练习，就能领取了');
    const total=(save.inventory[reward.itemId]||0)+reward.amount;
    if(!content.items[reward.itemId]||!Number.isSafeInteger(reward.amount)||reward.amount<1||!Number.isSafeInteger(total))throw Error('学习奖励配置无效');
    const previous=save.languageSpeechClaims;
    save.languageSpeechClaims={day:previous?.day>status.day?previous.day:status.day,claimed:[...(previous?.day>=status.day?previous.claimed:[]),index]};
    save.inventory[reward.itemId]=total;
}
export function validateSpeechClaims(save){
    const row=save.languageSpeechClaims;if(row===undefined)return;
    if(!row||!/^\d{4}-\d{2}-\d{2}$/.test(row.day)||!Array.isArray(row.claimed)||row.claimed.length>5||new Set(row.claimed).size!==row.claimed.length||row.claimed.some(i=>!Number.isInteger(i)||i<0||i>=5))throw Error('学习奖励记录无效');
}
