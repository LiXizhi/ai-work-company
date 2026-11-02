// Rendered-frame cadence, bounded counters only; paused scenes start a fresh window.
export function createFrameMeter(){
    let previous=null,start=null,frames=0,value=null;
    return {sample(time,active=true){
        if(!active||!Number.isFinite(time)){previous=null;start=null;frames=0;value=null;return value;}
        if(previous===null||time<=previous||time-previous>1000){start=time;frames=0;value=null;}
        else frames++;
        previous=time;
        if(time-start>=500){const ms=(time-start)/frames;value={fps:Math.round(1000/ms),ms:Math.round(ms*10)/10};start=time;frames=0;}
        return value;
    },get value(){return value;}};
}
export function createFramePacer({activeFps=60,idleFps=60,holdMs=300,toleranceMs=4}={}){
    const activeInterval=1000/activeFps,idleInterval=1000/idleFps;
    let lastRender=null,activeUntil=-Infinity,wasBusy=false,wakeNext=false;
    return {
        wake(now){
            if(Number.isFinite(now))activeUntil=Math.max(activeUntil,now+holdMs);
            else wakeNext=true;
            if(!wasBusy)lastRender=null;
        },
        reset(){lastRender=null;activeUntil=-Infinity;wasBusy=false;wakeNext=false;},
        shouldRender(now,active=false){
            if(!Number.isFinite(now))return false;
            if(active||wakeNext){activeUntil=Math.max(activeUntil,now+holdMs);wakeNext=false;}
            const busy=active||now<activeUntil;
            const woke=busy&&!wasBusy;
            wasBusy=busy;
            const interval=busy?activeInterval:idleInterval;
            if(woke||lastRender===null||now<lastRender||now-lastRender>=interval-toleranceMs){
                lastRender=now;
                return true;
            }
            return false;
        },
        isActive(now){return wakeNext||(Number.isFinite(now)&&now<activeUntil);}
    };
}
