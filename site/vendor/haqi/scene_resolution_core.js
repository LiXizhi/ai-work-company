// Scene pixels only: DOM text and input coordinates remain in CSS pixels.
export function sceneResolution(deviceRatio=1,{coarse=false,low=false}={}){
    const ratio=Number.isFinite(deviceRatio)&&deviceRatio>0?deviceRatio:1;
    return {display:Math.min(ratio,coarse||low?1.25:2),terrain:Math.min(ratio,coarse?1:2)};
}
