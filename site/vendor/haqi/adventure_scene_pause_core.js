// All opaque/fullscreen layers and modal conversations share the same scene gate.
// Keep the last map frame; UI, battle and persistence have independent lifetimes.
export function pauseBackgroundScene({stage,hidden=false,panel=null,dialog=null,learning=false,conversation=false,fullscreen=false}={}){
    return hidden||fullscreen||['battle','title','loading','error'].includes(stage)||!!panel||!!dialog||learning||conversation;
}
