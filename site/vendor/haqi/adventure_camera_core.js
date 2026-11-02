// Temporary fishing close-up never overwrites the player's exploration zoom.
export const FISHING_CAMERA_ZOOM=1.4;
export const FISHING_CAMERA_MS=620;

// Keep the sampling phase of static scenery constant while the camera pans.
// Only the rendered origin is snapped; gameplay positions retain full precision.
export function alignCameraOrigin(x,y,scale,pixelRatio){
    const pixelsPerUnit=scale*pixelRatio;
    return {x:Math.round(x*pixelsPerUnit)/pixelsPerUnit,y:Math.round(y*pixelsPerUnit)/pixelsPerUnit};
}

// Bounded city scenes keep the viewport inside their finite map. Preserve the
// pixel sampling lattice when clamping, including fractional zoom and DPR.
export function clampCameraToWorld(origin,world,viewport,scale,pixelRatio){
    const pixelsPerUnit=scale*pixelRatio;
    const axis=(value,size,view)=>{const maximum=size-view;if(maximum<0)return Math.round(maximum*.5*pixelsPerUnit)/pixelsPerUnit;return Math.max(0,Math.min(Math.floor(maximum*pixelsPerUnit)/pixelsPerUnit,value));};
    return{x:axis(origin.x,world.w,viewport.w),y:axis(origin.y,world.h,viewport.h)};
}

function clampZoom(value){return Math.max(.75,Math.min(FISHING_CAMERA_ZOOM,value));}
function easeInOut(t){return t<.5?4*t*t*t:1-((-2*t+2)**3)/2;}

export function createCameraZoom(){
    let exploration=1,fishing=false,shown=1,armed=false;
    let from=1,to=1,started=null,duration=0;
    const goal=()=>fishing?FISHING_CAMERA_ZOOM:exploration;
    return {
        get value(){return shown;},
        get active(){return armed||started!==null;},
        reset(){exploration=1;if(!fishing){shown=1;started=null;armed=false;}else to=goal();},
        zoomBy(factor){
            if(!fishing&&Number.isFinite(factor)&&factor>0){
                exploration=clampZoom(exploration*factor);
                if(started==null&&!armed)shown=exploration;
                else to=exploration;
            }
            return shown;
        },
        setFishing(active){
            const next=!!active;
            if(next!==fishing){fishing=next;armed=true;}
            return goal();
        },
        tick(now,reducedMotion=false){
            if(armed){
                from=shown;to=goal();
                started=Number.isFinite(now)?now:0;
                duration=reducedMotion||from===to?0:FISHING_CAMERA_MS;
                armed=false;
            }else if(started!=null&&reducedMotion)duration=0;
            if(started==null){
                shown=goal();
                return shown;
            }
            const span=Math.max(0,duration);
            const t=span===0?1:Math.min(1,(now-started)/span);
            shown=t>=1?to:from+(to-from)*easeInOut(t);
            if(t>=1)started=null;
            return shown;
        },
    };
}
