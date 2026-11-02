import {assetMode, assetUrl} from './adventure_media_core.js';
import {fetchJson} from './runtime_data.js';

let atlas=null, pending=null;
// All UI consumers share one decoded image. Loading failure remains retryable.
export function loadSchoolIcons(mode=assetMode(globalThis.location?.hostname,globalThis.location?.search),read=fetchJson){
    if(atlas)return Promise.resolve(atlas);
    if(pending)return pending;
    let manifestTimer;
    const manifestReady=Promise.race([
        read('data/adventure/school-icons.json'),
        new Promise((_,reject)=>{manifestTimer=setTimeout(()=>reject(new Error('系别图集配置加载超时')),8000);}),
    ]).finally(()=>clearTimeout(manifestTimer));
    pending=manifestReady.then(manifest=>new Promise((resolve,reject)=>{
        const image=new Image();image.crossOrigin='anonymous';
        const timer=setTimeout(()=>finish(new Error('系别图标加载超时')),8000);
        function finish(error){
            clearTimeout(timer);image.onload=image.onerror=null;
            if(error){reject(error);return;}
            atlas={image,manifest};resolve(atlas);
        }
        image.onload=()=>finish(image.naturalWidth===manifest.width&&image.naturalHeight===manifest.height?null:new Error('系别图集尺寸不符'));
        image.onerror=()=>finish(new Error('系别图标加载失败'));
        image.src=assetUrl(manifest,mode);
    })).catch(error=>{pending=null;throw error;});
    return pending;
}

export function drawSchoolAtlas(c,school,x,y,size){
    if(!atlas)return false;
    const frame=atlas.manifest.frames[school]||atlas.manifest.frames.balance;
    c.drawImage(atlas.image,...frame.rect,x-size/2,y-size/2,size,size);
    return true;
}
