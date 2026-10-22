// Browser-only shared portrait animation. IntersectionObserver includes scroll clipping.
export function createPortraitScheduler({document:doc=globalThis.document,
    requestFrame=cb=>requestAnimationFrame(cb),cancelFrame=id=>cancelAnimationFrame(id),
    Observer=globalThis.IntersectionObserver}={}) {
    const views=new Map();let frame=null,last=-Infinity;
    const observer=Observer?new Observer(entries=>{
        for(const entry of entries){const row=views.get(entry.target);if(row)row.visible=entry.isIntersecting;}
        sync();
    }):null;
    function remove(view){views.delete(view.node);observer?.unobserve(view.node);}
    function active(){
        let visible=false;
        for(const row of views.values()){
            if(!row.view.node.isConnected){remove(row.view);continue;}
            if(row.visible)visible=true;
        }
        return visible&&!doc.hidden;
    }
    function sync(){
        if(active()){if(frame===null)frame=requestFrame(tick);}
        else if(frame!==null){cancelFrame(frame);frame=null;last=-Infinity;}
    }
    function tick(time){
        frame=null;
        if(active()&&(time<last||time-last>=46)){
            last=time;
            for(const row of views.values())if(row.visible)row.view.paint(time/1000);
        }
        sync();
    }
    doc.addEventListener('visibilitychange',sync);
    return {
        add(view){if(!views.has(view.node)){views.set(view.node,{view,visible:!observer});observer?.observe(view.node);}sync();},
        delete(view){remove(view);sync();},
        dispose(){if(frame!==null)cancelFrame(frame);frame=null;observer?.disconnect();views.clear();doc.removeEventListener('visibilitychange',sync);},
    };
}
