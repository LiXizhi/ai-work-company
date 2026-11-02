// Shared GUI controls. Views supply intent callbacks; no gameplay state here.
import {tr,setText} from './locale_runtime.js';
// Tests inject a shared document on globalThis; browsers use the real one.
const doc=()=>globalThis.document;
// A modal may remove its opener or repaint its toolbar while it is open.
export function restoreVisibleFocus(...candidates){
    for(const node of candidates){
        if(!node?.isConnected||node.disabled||!node.getClientRects?.().length)continue;
        node.focus({preventScroll:true});return node;
    }
    return null;
}
export function createWorldMapSwitch(active,onSelect,haqiLabel='哈奇世界'){
    const group=doc().createElement('div');group.className='parallel-world-buttons';group.setAttribute('role','group');group.setAttribute('aria-label',tr('切换世界地图'));
    for(const [id,label] of [['haqi',haqiLabel],['earth','现实世界']]){
        const button=doc().createElement('button');button.type='button';
        button.className='primary world-switch-button';button.setAttribute('data-world',id);button.setAttribute('aria-label',tr(label));
        const emblem=doc().createElement('span');emblem.className='world-switch-emblem';emblem.setAttribute('aria-hidden','true');
        // Project-native decorative vectors: no image requests or atlas dependency.
        emblem.innerHTML=id==='haqi'?'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 27V14l4-5 4 5v13M19 27V14l4-5 4 5v13M12 27V15l4-7 4 7v12M4 27h24M7 16h4M21 16h4M14 27v-5a2 2 0 0 1 4 0v5M16 8V3l6 2-6 2"/><path d="M8 19h2m12 0h2M15 16h2"/></svg>':'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="16" cy="16" r="11"/><ellipse cx="16" cy="16" rx="5" ry="11"/><path d="M5 16h22M7 10c5 2 13 2 18 0M7 22c5-2 13-2 18 0"/><path d="m25 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="currentColor" stroke="none"/></svg>';
        const text=doc().createElement('span');text.className='world-switch-label';setText(text,label);button.append(emblem,text);
        button.setAttribute('aria-pressed',String(id===active));button.onclick=()=>onSelect(id);group.append(button);
    }
    return group;
}
export function createCloseButton(onClose,label='关闭',extraClass=''){
    const document=doc();
    const button=document.createElement('button');button.type='button';
    button.className=['close-button',extraClass].filter(Boolean).join(' ');
    button.setAttribute('aria-label',label);button.title=label;button.onclick=onClose;
    const icon=document.createElement('span');icon.className='icon';icon.dataset.uiIcon='close';
    icon.setAttribute('aria-hidden','true');
    // The storybook atlas replaces this vector when available. Keep a clear
    // fallback while the cosmetic asset loads or if its download fails.
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
    svg.setAttribute('stroke-width','2.5');svg.setAttribute('stroke-linecap','round');
    path.setAttribute('d','M6 6l12 12M18 6L6 18');svg.append(path);icon.append(svg);button.append(icon);
    return button;
}
