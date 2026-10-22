import {residents} from './world-state.mjs';
import {loadRig,drawRig,previewPose} from './world-rig.mjs';
const $=id=>document.getElementById(id),cards=[];
for(const r of residents){const card=document.createElement('section');card.className='rig-card';const title=document.createElement('h2');title.textContent=r.name;const canvas=document.createElement('canvas');const caption=document.createElement('p');caption.textContent='场景角色（2× 检查比例）';const portrait=document.createElement('div');portrait.className='avatar-art';portrait.style.backgroundPosition=`${r.index*100/3}% 50%`;const label=document.createElement('p');label.textContent='角色档案立绘';card.append(title,canvas,caption,portrait,label);$('rig-cards').append(card);cards.push(canvas);}
let assets,time=0,last=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,request=null;
function render(){if(!assets)return;cards.forEach((canvas,index)=>{const pose=previewPose(assets,index,{time,moving:$('body-mode').value==='walk',facing:Number($('facing').value),head:$('head-mode').value==='auto'?null:Number($('head-mode').value)});drawRig(canvas,assets,index,pose,{bodyOnly:!$('show-head').checked,debug:$('show-anchor').checked,time});});}
function loop(now){request=null;if(paused||document.hidden)return;time+=Math.min(40,now-last||16)/1000;last=now;render();request=requestAnimationFrame(loop);}
function sync(){if(request)cancelAnimationFrame(request);request=null;last=0;$('lab-pause').textContent=paused?'播放':'暂停';render();if(!paused&&!document.hidden)request=requestAnimationFrame(loop);}
$('lab-pause').addEventListener('click',()=>{paused=!paused;sync();});document.querySelectorAll('select,input').forEach(el=>el.addEventListener('change',render));document.addEventListener('visibilitychange',sync);
loadRig().then(value=>{assets=value;$('lab-status').textContent='原版 Haqi 引擎已加载 · 每人独立 16 方向头部纹理 + 四方向 6 帧行走及待机身体纹理';sync();}).catch(e=>{$('lab-status').textContent='图集加载失败：'+e.message;});
