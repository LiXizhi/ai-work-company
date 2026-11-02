import {showHanziAnimation} from './view_hanzi_animation.js';
import {createCloseButton} from './view_adventure_controls.js';
import {createHanziWriting} from './view_hanzi_writing.js';
import {tr} from './locale_runtime.js';
const el=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=tr(text);return n;};
const button=(text,fn)=>{const b=el('button','secondary',text);b.type='button';b.onclick=fn;return b;};
export function createMemoryView(root,cb){
    let dismissPlayer=()=>{},writing,cleanup=()=>{},notice,body,shell,earned=false;
    function finish(){const card=earned?body?.querySelector('.memory-card'):null;const copy=card?.cloneNode(true),rect=card?.getBoundingClientRect();earned=false;cb.close();if(copy&&rect)flyMemoryToDictionary(copy,rect);}
    function clear(){dismissPlayer();dismissPlayer=()=>{};writing?.dispose();writing=null;cleanup();cleanup=()=>{};}
    function base(title){clear();earned=false;root.className='overlay visible memory-overlay';shell=el('section','modal memory-shell');shell.setAttribute('role','dialog');shell.setAttribute('aria-modal','true');shell.tabIndex=-1;
        const h=el('header','modal-header');h.append(el('h2','',title),createCloseButton(finish,'关闭文字记忆'));body=el('div','modal-body memory-body');notice=el('p','memory-notice');notice.setAttribute('role','status');shell.append(h,body,notice);root.replaceChildren(shell);shell.focus();
        shell.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();finish();}if(e.key==='Tab'){const nodes=[...shell.querySelectorAll('button,canvas,iframe')].filter(n=>!n.disabled&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===shell)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    }
    function card(entry,count,required){
        const c=el('div',`memory-card ${count>=required?'is-complete':''}`);c.dataset.count=count;
        if(entry.pronunciation)c.append(el('small','memory-pronunciation',entry.pronunciation));
        c.append(el('strong','memory-glyph',entry.text));
        if(entry.meaning)c.append(el('em','memory-meaning',entry.meaning));
        c.append(el('span','',`${count} / ${required}`));
        const pieces=el('div','memory-pieces');for(let i=0;i<required;i++)pieces.append(el('i',i<count?'filled':''));c.append(pieces);body.append(c);
    }
    function practice({entry,count,required,glimpse}){
        base('找回文字记忆');card(entry,count,required);
        if(glimpse)body.append(el('p','memory-glimpse',glimpse));
        if(entry.coaching?.tip)body.append(el('p','memory-tip','✦ '+entry.coaching.tip));
        const host=el('div','memory-practice');body.append(host);
        function write(){dismissPlayer();dismissPlayer=()=>{};cleanup();cleanup=()=>{};host.replaceChildren();const canvas=el('canvas','memory-writing');canvas.tabIndex=0;canvas.setAttribute('aria-label','按笔顺写汉字');host.append(canvas);writing=createHanziWriting(canvas,entry.strokes,{keyboard:true,preserveOnDemo:true});
            const tools=el('div','memory-tools');tools.append(button('笔顺示范',()=>writing.demonstrate()),button('撤销一笔',()=>writing.undo()),button('清空',()=>writing.clear()),button('写好了',()=>cb.write(writing.strokes)));host.append(tools);
        }
        if(entry.animation){const frame=el('iframe','memory-animation');frame.title=entry.text+'的汉字动画';frame.src=entry.animation;frame.allow='autoplay';host.append(frame,button('跳过动画，写一次字',write));cleanup=cb.animation(frame,entry);dismissPlayer=showHanziAnimation(frame,{close:finish,skip:write});}
        else write();
    }
    return {practice,book({entries,stories,counts,required,pending}){
        base('字源岛 · 文字记忆');
        if(pending)body.append(button('继续上次的文字记忆',cb.resume));
        for(const story of stories){
            const section=el('section','memory-story'),head=el('div','memory-story-head');
            head.append(el('h3','',story.title),el('p','',story.problem),button('追踪这段故事',()=>cb.track(story.questId)));
            const grid=el('div','memory-grid');
            for(const id of story.words){
                const e=entries.find(e=>e.id===id);if(!e)continue;
                const count=counts[id]||0,b=button('',()=>cb.dictionary(id));
                b.classList.add('memory-word-card');b.classList.toggle('is-collected',count>=required);
                const pips=el('small','memory-word-pips');for(let i=0;i<required;i++)pips.append(el('i',i<count?'filled':'',i<count?'◆':'◇'));
                b.append(pips,el('strong','',e.text),el('small','',e.pronunciation||''),el('span','',e.meaning||''),el('em','',`${count} / ${required}`));
                grid.append(b);
            }
            section.append(head,grid);body.append(section);
        }
        body.append(button('原有字卡与魔法外观',cb.legacy));
    },
        success({entry,count,required,text,collected}){base(collected?'字卡完整了':'找回一片记忆');earned=true;card(entry,count,required);body.classList.add('memory-collected');body.append(el('p','memory-glimpse',text),button('回到岛上',finish));},message(text){if(notice)notice.textContent=tr(text);},retry(fn){body.append(button('重试保存',fn));},close:clear};
}
// The fragment is fixed ground scenery; collection feedback uses the shared HUD.
export function drawMemoryNode(ctx,node,time,art){
    ctx.save();
    if(art){const frame=art.frames[node.slot%art.frames.length];ctx.drawImage(art.image,...frame,node.x-30,node.y-36,60,72);}
    ctx.restore();
}
export function flyMemoryToDictionary(copy,rect){
    const target=document.querySelector('.dictionary-launch'),dest=target?.getBoundingClientRect();
    if(!dest?.width||!dest.height)return;
    copy.classList.add('memory-flight');copy.setAttribute('aria-hidden','true');
    Object.assign(copy.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',minWidth:'0',margin:'0',boxSizing:'border-box',pointerEvents:'none',zIndex:'1000',transformOrigin:'center'});
    document.body.append(copy);
    const dx=dest.left+dest.width/2-rect.left-rect.width/2,dy=dest.top+dest.height/2-rect.top-rect.height/2;
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:720;
    const animation=copy.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx*.45}px,${dy*.65-40}px) scale(.65)`,opacity:1,offset:.5},{transform:`translate(${dx}px,${dy}px) scale(.08)`,opacity:.2}],{duration,easing:'ease-in-out'});
    animation.finished.catch(()=>{}).finally(()=>{copy.remove();if(target.isConnected)target.animate([{filter:'brightness(1)'},{filter:'brightness(1.8)'},{filter:'brightness(1)'}],{duration:duration?350:0});});
}
