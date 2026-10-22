// Visual companion motion only. World coordinates let the star lag behind its owner.
export function createStarFollower() {
    let previous=null,phase=0;
    const state={x:0,y:0,vx:0,vy:0,roll:0,scale:1,front:true,visible:false};
    function step(anchor,time,{enabled=true,reducedMotion=false,scope=null}={}) {
        if(!enabled){previous=null;state.visible=false;return state;}
        const dt=previous?(time-previous.time)/1000:0;
        const reset=!previous||previous.scope!==scope||dt<=0||dt>.25||Math.hypot(anchor.x-previous.x,anchor.y-previous.y)>240;
        if(reset)phase=0;
        if(!reducedMotion&&!reset)phase+=dt*(1.1+4.2*Math.max(0,Math.sin(time/1250))**12);
        const radius=34+Math.sin(phase*.5)**2*10;
        const target={x:anchor.x+Math.cos(phase)*radius,y:anchor.y+Math.sin(phase)*14-8+(reducedMotion?0:Math.sin(phase*2)*4)};
        if(reset||reducedMotion){state.x=target.x;state.y=target.y;state.vx=state.vy=0;}
        else {
            // Substeps keep the spring stable on slow frames; larger gaps catch up faster.
            const count=Math.ceil(dt/(1/120)),h=dt/count;
            for(let i=0;i<count;i++){
                const gap=Math.hypot(target.x-state.x,target.y-state.y),k=gap>70?130:70;
                state.vx+=(k*(target.x-state.x)-17*state.vx)*h;
                state.vy+=(k*(target.y-state.y)-17*state.vy)*h;
                state.x+=state.vx*h;state.y+=state.vy*h;
            }
        }
        state.visible=true;state.front=state.y>=anchor.y-8;
        state.roll=reducedMotion?0:Math.sin(phase*2.3)*.09+Math.max(-.18,Math.min(.18,state.vx/1500));
        state.scale=reducedMotion?1:1+Math.sin(phase*2)*.045;
        previous={...anchor,time,scope};return state;
    }
    return {state,step};
}
