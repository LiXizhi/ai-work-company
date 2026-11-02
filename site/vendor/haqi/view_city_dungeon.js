import {createCloseButton} from './view_adventure_controls.js';
import {tr} from './locale_runtime.js';
// View-only: the controller supplies action availability and all intent callbacks.
export function renderCityInteraction(root,{dungeon,hotspot,actions,state,showChinese=true},{close,apply,practice,read,toggleChinese}){
    const el=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
    root.replaceChildren();root.className='overlay visible';
    const panel=el('section',null,'modal city-interaction'),header=el('div',null,'modal-header');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',hotspot.name);
    header.append(el('h2',hotspot.name),createCloseButton(close));const body=el('div',null,'modal-body');
    body.append(el('p',dungeon.name));
    if(dungeon.scene.streetscape){body.append(el('p',dungeon.scene.streetscape.note||'这是原创生成街区。'));if(dungeon.scene.streetscape.provenance?.kind==='osm-derived'){const credit=el('a','© OpenStreetMap contributors · 数据来源');credit.href='https://www.openstreetmap.org/copyright';credit.target='_blank';credit.rel='noopener noreferrer';body.append(credit);}}
    if(hotspot.text)body.append(el('p',hotspot.text));
    if(hotspot.language==='en'){
        if(showChinese&&hotspot.zh)body.append(el('p',hotspot.zh));
        const toggle=el('button',tr(showChinese?'隐藏中文释义':'显示中文释义'),'secondary');toggle.type='button';toggle.onclick=toggleChinese;body.append(toggle);
        const listen=el('button',tr('听示范'),'secondary');listen.type='button';listen.onclick=()=>read(hotspot.text,'en');body.append(listen);
    }
    const carried=Object.entries(state.items).filter(([,n])=>n>0).map(([id,n])=>`${dungeon.scene.items[id]?.name||id} × ${n}`);
    if(carried.length)body.append(el('p',tr('随身场景道具：')+carried.join('、')));
    for(const row of actions){
        const group=el('div',null,'city-action-row'),button=el('button',row.status==='complete'?`${row.action.label}（已完成）`:row.action.label,'primary');button.type='button';button.disabled=row.status!=='ready';button.onclick=()=>apply(row.action.id);group.append(button);
        if(row.status==='locked')group.append(el('p',row.hint));
        if(row.status==='complete'){group.append(el('p',row.action.replyEn||row.action.reply));if(row.action.replyEn&&showChinese)group.append(el('p',row.action.reply));}
        if(row.action.learning&&row.status!=='locked'){
            const learn=el('button',tr('练习这句话（可跳过）'),'secondary');learn.type='button';learn.onclick=()=>practice(row.action.learning);group.append(learn);
        }
        body.append(group);
    }
    if(dungeon.scene.completion?.every(id=>state.done.includes(id)))body.append(el('p',tr('你完成了这个地点的故事，可以继续探索或返回。')));
    panel.append(header,body);root.append(panel);header.querySelector('button')?.focus();
}
// Original, native Canvas scenery; no runtime generation or external art dependency.
export function drawCityScene(c,world){
    const {w,h}=world,theme=world.dungeon.scene.theme;
    if(theme==='generated'){
        c.fillStyle='#a9c397';c.fillRect(0,0,w,h);c.fillStyle='#d6d0bb';c.fillRect(w/2-48,0,96,h);c.fillRect(0,h/2-48,w,96);
        for(const b of world.dungeon.scene.blocks){c.fillStyle=b.type==='park'?'#769c66':'#c7d3b7';c.fillRect(b.x-58,b.y-58,116,116);if(b.type==='park'){c.fillStyle='#497950';for(let i=0;i<3;i++){c.beginPath();c.ellipse(b.x-24+i*24,b.y-12+(i%2)*20,14,20,0,0,Math.PI*2);c.fill();}}}
        c.fillStyle='#b5855f';c.fillRect(w/2-42,h/2-30,84,50);c.fillStyle='#ebd7a5';c.fillRect(w/2-48,h/2-42,96,16);
        c.font='bold 24px sans-serif';c.fillStyle='#314c3b';c.textAlign='center';c.fillText(`${world.layout.name} · ${world.dungeon.scene.challengeLevel}级街区挑战`,w/2,80);c.font='14px sans-serif';c.fillText('城市车站',w/2,h/2-54);c.textAlign='start';return;
    }
    c.fillStyle=theme==='market'?'#e6d5b7':'#d6e8bf';c.fillRect(20,20,w-40,h-40);
    c.fillStyle='#f4e5bc';c.fillRect(90,700,w-180,115);c.fillRect(540,190,125,600);
    c.strokeStyle='#ad9273';c.lineWidth=3;c.strokeRect(20,20,w-40,h-40);
    if(theme==='wetland'||theme==='harbor'){
        c.fillStyle='#74b6c5';c.fillRect(40,40,w-80,155);c.strokeStyle='#d4f0e9';
        for(let x=60;x<w-70;x+=80){c.beginPath();c.moveTo(x,120);c.quadraticCurveTo(x+20,105,x+50,120);c.stroke();}
        c.fillStyle='#7c9b4e';for(let x=80;x<w-60;x+=100)c.fillRect(x,178,8,55);
    }else{
        c.fillStyle='#be8567';c.fillRect(60,80,w-120,150);c.fillStyle='#fcdf9d';for(let x=90;x<w-90;x+=120)c.fillRect(x,112,78,70);
    }
    c.font='bold 26px sans-serif';c.textAlign='center';c.fillStyle='#375645';c.fillText(world.layout.name,w/2,265);c.textAlign='start';
}
export function drawCityHotspot(c,o){
    o={...o,kind:o.visualKind||o.kind};
    c.save();c.translate(o.x,o.y);c.lineWidth=3;c.strokeStyle='#6f5944';
    if(o.kind==='sign'){c.fillStyle='#98734a';c.fillRect(-5,-40,10,45);c.fillStyle='#f7e9bd';c.fillRect(-42,-76,84,48);c.strokeRect(-42,-76,84,48);c.fillStyle='#527555';c.fillRect(-27,-61,53,5);c.fillRect(-27,-48,34,5);}
    else if(o.kind==='binoculars'){c.fillStyle='#587f8c';c.fillRect(-5,-42,10,45);for(const x of [-15,15]){c.beginPath();c.ellipse(x,-50,17,24,0,0,Math.PI*2);c.fill();c.stroke();}c.fillStyle='#ade4e6';c.fillRect(-25,-58,18,8);c.fillRect(7,-58,18,8);}
    else{c.fillStyle=o.cityDone?'#89b98b':o.kind==='workbench'?'#ae8c6c':o.kind==='station'?'#76a5a0':'#d9b888';c.fillRect(-46,-47,92,48);c.strokeRect(-46,-47,92,48);c.fillStyle='#765842';c.fillRect(-46,-53,92,12);c.fillStyle=o.cityDone?'#eaf4a7':'#f3de83';for(let i=0;i<3;i++)c.fillRect(-30+i*25,-40,16,20);}
    c.restore();
}
