import {createCloseButton} from './view_adventure_controls.js';
import {tr} from './locale_runtime.js';

const players=new Set();
export const hanziAnimationActive=()=>players.size>0;

// A top-layer dialog escapes modal sizing, transforms and overflow clipping.
// The iframe gets the entire viewport; host controls float above it.
export function showHanziAnimation(frame,{close,skip}={}){
    const previous=document.activeElement,dialog=document.createElement('dialog');
    dialog.setAttribute('aria-label',frame.title);
    dialog.style.cssText='position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;overflow:hidden;background:#111;';
    frame.style.cssText='position:absolute;inset:0;display:block;width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;border-radius:0;';
    const exit=createCloseButton(close,'关闭动画');
    exit.style.cssText='position:absolute;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));z-index:1;';
    dialog.append(frame,exit);
    if(skip){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=tr('跳过动画，写一次字');button.onclick=skip;button.style.cssText='position:absolute;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:1;';dialog.append(button);}
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('keydown',event=>event.stopPropagation());
    document.body.append(dialog);
    try{dialog.showModal();}catch(error){dialog.remove();throw error;}
    players.add(dialog);exit.focus({preventScroll:true});
    return ()=>{if(!players.delete(dialog))return;dialog.close();dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});};
}
