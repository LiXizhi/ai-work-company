import {defaultParams} from './combat_params_core.js';

// Web scene expressions, inspired by Paracraft EasyFriendAction's relationship tiers.
export const socialActions=[
    {id:'greet',label:'打招呼',icon:'👋'},
    {id:'smile',label:'相视一笑',icon:'😊'},
    {id:'clap',label:'为你鼓掌',icon:'👏'},
    {id:'jump',label:'一起跳一跳',icon:'🎉',jump:true},
    {id:'highfive',label:'默契击掌',icon:'🙌',friend:true},
    {id:'heart',label:'送小心心',icon:'💕',friend:true},
    {id:'dance',label:'欢乐双人舞',icon:'✨',tier:'danceAffinity',jump:true},
    {id:'cheer',label:'友谊比心',icon:'🫶',tier:'heartAffinity'},
];
export const socialActionParams=content=>({...defaultParams('kids').socialActions,...content?.balanceParams?.socialActions});
export function socialActionOptions({profile,friend=false,affinity=null,content}){
    const p=socialActionParams(content);
    return socialActions.filter(a=>!a.friend||profile.kind==='account').map(a=>{
        const reason=a.friend&&!friend?'成为好友后解锁':a.tier&&(affinity===null||affinity<p[a.tier])?`好感度达到 ${p[a.tier]} 解锁`:'';
        return {...a,disabled:!!reason,detail:reason|| (a.friend?'好友专属':a.tier?'好感动作':'免费互动')};
    });
}
export function socialGesturePose(effect,id,at,reduced=false){
    if(!effect||!effect.ids.includes(id)||at<effect.at||at>=effect.until)return null;
    const action=socialActions.find(a=>a.id===effect.action);if(!action)return null;
    const elapsed=at-effect.at,index=effect.ids.indexOf(id),phase=Math.max(0,elapsed-index*180)/1000;
    return {icon:action.icon,hop:!reduced&&action.jump?Math.abs(Math.sin(phase*5))*15:0};
}

// The menu invitation and paired expressions share the same overhead slot.
export const socialHeadAnchor=position=>({x:position.x,y:position.y-95});
