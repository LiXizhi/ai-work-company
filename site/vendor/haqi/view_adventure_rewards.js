import { fill, setText, tr } from './locale_runtime.js';
// DockTip.lua L630–687: bottom bag notification, equip apparel / inspect cards.
const HOLD_MS=4800,STACK_LIMIT=8;
function itemKey(item){
    if(item.kind==='dictionary')return `dictionary:${item.id}`;
    if(item.kind==='card')return `card:${item.key}`;
    if(item.kind==='pet')return `pet:${item.id}`;
    return `item:${item.id??item.name}`;
}
// A burst already waiting in the queue is one acquisition, not one tip per item.
function absorbReward(target,event){
    target.xp=(target.xp||0)+(event.xp||0);
    if(event.level){
        if(target.fromLevel==null)target.fromLevel=event.fromLevel;
        target.level=event.level;
    }
    for(const item of event.items||[]){
        const found=target.items.find(row=>itemKey(row)===itemKey(item));
        if(found)found.count+=(item.count||0);
        else target.items.push({...item});
    }
}
export function createRewardFeedback(root,{describe,activate,showBanner=true}) {
    const queue=[];let active=null,shown=null,started=0,lastTick=null;
    const banner=document.createElement('div');banner.className='reward-banner';banner.setAttribute('role','status');
    const popup=document.createElement('section');popup.className='reward-popup';popup.hidden=true;popup.setAttribute('aria-label',tr('新获得的物品'));
    root.append(banner,popup);root.hidden=true;
    function dismiss(){active=null;popup.replaceChildren();popup.hidden=true;}
    function takeBurst(){
        const burst=queue.shift();
        while(queue.length)absorbReward(burst,queue.shift());
        return burst;
    }
    function paintBanner(event){
        const rows=[];
        if(event.level)rows.push(['升级了！ {from} → {to} 级',{from:event.fromLevel,to:event.level}]);
        if(event.xp)rows.push(['获得经验 +{xp}',{xp:event.xp}]);
        for(const item of event.items.slice(0,STACK_LIMIT))rows.push(['{name} ×{count}',{name:item.name,count:item.count}]);
        if(event.items.length>STACK_LIMIT)rows.push(['另获 {count} 种奖励',{count:event.items.length-STACK_LIMIT}]);
        banner.replaceChildren(...rows.map(([source,vars])=>{
            const node=document.createElement('div');node.className='reward-stack-row';
            setText(node,source,vars);return node;
        }));
        banner.classList.remove('reward-stack-dense');
        if(rows.length>4)banner.classList.add('reward-stack-dense');
    }
    function paint(){
        popup.replaceChildren();
        popup.setAttribute('aria-label',tr('新获得的物品'));
        const reward=active.items[0];if(!reward){popup.hidden=true;return;}popup.hidden=false;
        const info=describe(reward),heading=document.createElement('strong'),name=document.createElement('p'),hint=document.createElement('small');
        setText(heading,reward.kind==='dictionary'?'获得汉字卡':reward.kind==='card'?'获得新卡牌':reward.gear?'获得新装备':'获得新物品');
        setText(name,'{name} ×{count}',{name:info.name||reward.name,count:reward.count});
        setText(hint,info.reason||(reward.kind==='dictionary'?'点击翻开这个字的故事':'已放入背包'));
        if(info.art)popup.append(info.art);
        const use=document.createElement('button');use.type='button';use.className='primary';use.disabled=!!info.reason;
        setText(use,info.label);
        use.onclick=()=>{if(activate(reward)!==false)next();};
        const skip=document.createElement('button');skip.type='button';skip.className='secondary';
        if(active.items.length>1)setText(skip,'稍后处理 · 下一件（{count}）',{count:active.items.length-1});
        else setText(skip,'稍后处理');
        skip.onclick=next;
        popup.append(heading,name,hint,use,skip);
    }
    function next(){active.items.shift();paint();}
    function actionable(item){return item.kind==='dictionary'||item.gear||item.kind==='card'||item.kind==='pet';}
    return {
        get hasPendingItems(){return !!active?.items.length||queue.some(event=>event.items.some(actionable));},
        push(event){if(event.xp||event.level||event.items.length)queue.push({...event,items:[...event.items]});},
        reset(){queue.length=0;shown=null;dismiss();root.hidden=true;banner.replaceChildren();banner.classList.remove('reward-stack-dense');lastTick=null;},
        tick(now,visible){
            if(!visible&&active&&lastTick!==null)started+=now-lastTick;
            lastTick=now;root.hidden=!visible;if(!visible)return null;
            if(queue.length&&active&&shown&&now-started<=HOLD_MS){
                const burst=takeBurst();
                absorbReward(shown,burst);
                active.items.push(...burst.items.filter(actionable));
                active.xp=shown.xp;active.level=shown.level;active.fromLevel=shown.fromLevel;
                paintBanner(shown);
                if(popup.hidden&&active.items.length)paint();
            }else if(queue.length&&(!active||now-started>HOLD_MS)){
                const pending=active?.items||[];const burst=takeBurst();started=now;
                shown={xp:0,fromLevel:null,level:null,items:[]};absorbReward(shown,burst);paintBanner(shown);
                active={...burst,items:[...pending,...burst.items.filter(actionable)]};
                banner.classList.remove('reward-enter');void banner.offsetWidth;banner.classList.add('reward-enter');paint();
            }
            const elapsed=now-started;
            banner.hidden=!showBanner||!active||elapsed>HOLD_MS;
            if(!active)return null;
            const effect=elapsed<HOLD_MS?{...active,elapsed}:null;
            if(!active.items.length&&elapsed>HOLD_MS)dismiss();
            return effect;
        },
    };
}

export function drawRewardEffect(c,x,y,event,reduced=false) {
    if(!event)return;
    const t=event.elapsed/1000,level=!!event.level,color=level?'#ffe498':'#94ffdf';
    c.save();
    try {
    c.translate(x,y);c.globalAlpha=Math.min(1,(4.8-t)*1.4);c.shadowColor=color;c.shadowBlur=level?22:12;
    if(level){
        const beam=c.createLinearGradient(0,-210,0,0);beam.addColorStop(0,'#ffe99900');beam.addColorStop(1,'#ffe99999');c.fillStyle=beam;c.fillRect(-42,-210,84,210);
    }
    c.strokeStyle=color;c.lineWidth=3;
    for(let i=0;i<3;i++){const r=30+i*17+(reduced?0:Math.sin(t*3-i)*6);c.beginPath();c.ellipse(0,-4-i*7,r,r*.32,0,0,Math.PI*2);c.stroke();}
    if(!reduced)for(let i=0;i<24;i++){const a=i*2.399+t*.8,r=28+(i%5)*10,h=(t*65+i*17)%190;c.fillStyle=color;c.beginPath();c.arc(Math.cos(a)*r,-h,2+i%3,0,Math.PI*2);c.fill();}
    c.shadowBlur=5;c.font='bold 24px "Microsoft YaHei", sans-serif';c.textAlign='center';c.lineWidth=5;c.strokeStyle='#3e3921';c.fillStyle=level?'#fff0a4':'#b8ffed';
    const label=level?fill('升到 {level} 级！',{level:event.level}).text:event.xp?fill('经验 +{xp}',{xp:event.xp}).text:tr('获得物品！'),dy=-112-(reduced?0:Math.min(t*10,25));
    c.strokeText(label,0,dy);c.fillText(label,0,dy);
    } finally {c.restore();}
}
