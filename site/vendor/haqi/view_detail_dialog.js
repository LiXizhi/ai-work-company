import {fill} from './locale_runtime.js';
import {createCloseButton} from './view_adventure_controls.js';

// Shared nested detail window. Keep the parent page, selection and scroll intact.
export class DetailDialog {
    constructor(parent,{el,title='物品详情',className='equipment-item-dialog'}={}) {
        this.dialog=el('dialog',className);
        this.dialog.setAttribute('aria-label',title);
        this.closeButton=createCloseButton(()=>this.close(),fill(`关闭{v0}`,{v0:String(title)}).text);
        this.body=el('section','equipment-detail');
        this.footer=el('div','equipment-detail-footer');
        this.dialog.append(el('header','equipment-dialog-header',el('strong','',title),this.closeButton),this.body,this.footer);
        this.localRoot=parent.closest?.('.local-personal');
        (this.localRoot||parent).append(this.dialog);
        if(this.localRoot)this.dialog.classList.add('local-detail');
        this.dialog.addEventListener('keydown',event=>{
            if(!this.localRoot)event.stopPropagation();
            if(event.key==='Escape'){event.preventDefault();this.close();}
        });
        this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
        this.dialog.addEventListener('click',event=>{
            if(event.target!==this.dialog)return;
            const r=this.dialog.getBoundingClientRect();
            if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.close();
        });
        this.dialog.addEventListener('close',()=>{if(this.trigger?.isConnected)this.trigger.focus({preventScroll:true});});
    }
    open(trigger=document.activeElement){
        if(this.dialog.open)return;
        this.trigger=trigger;if(this.localRoot)this.dialog.show();else this.dialog.showModal();this.closeButton.focus({preventScroll:true});
    }
    close(){if(this.dialog.open)this.dialog.close();}
    destroy(){this.close();this.dialog.remove();}
}
