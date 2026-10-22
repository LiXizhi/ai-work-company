import {fetchJson} from './runtime_data.js';
import {assetUrl} from './adventure_media_core.js';

// Manifest only at load; sheets download when ensure/warm/draw needs them.
export async function loadEnvironmentArt(mode,read=fetchJson,path='data/adventure/environment-art.json'){
    const manifest=await read(path),images={},pending=new Map();
    let onAtlas=null;
    function ensure(atlas){
        const row=manifest.atlases[atlas];
        if(!row)return Promise.reject(Error('缺少场景图集：'+atlas));
        if(images[atlas])return Promise.resolve(images[atlas]);
        if(!pending.has(atlas))pending.set(atlas,new Promise((resolve,reject)=>{
            if(row.size>200000){pending.delete(atlas);reject(Error('场景图集超出大小限制'));return;}
            const image=new Image();image.crossOrigin='anonymous';
            const fail=()=>{clearTimeout(timer);image.onload=image.onerror=null;pending.delete(atlas);reject(Error('场景图集加载失败'));};
            const timer=setTimeout(fail,10000);
            image.onload=()=>{
                clearTimeout(timer);image.onload=image.onerror=null;
                if(image.naturalWidth!==row.width||image.naturalHeight!==row.height){pending.delete(atlas);reject(Error('场景图集尺寸不符'));return;}
                images[atlas]=image;pending.delete(atlas);onAtlas?.(atlas);resolve(image);
            };
            image.onerror=fail;image.src=assetUrl(row,mode);
        }));
        return pending.get(atlas);
    }
    async function warm(keys){
        const list=[...new Set(keys||[])].filter(key=>manifest.atlases[key]);
        const results=await Promise.allSettled(list.map(ensure));
        for(const result of results)if(result.status==='rejected')console.warn('场景图集暂不可用：',result.reason);
    }
    const patternSources=new Map();
    return {manifest,images,ensure,warm,set onAtlas(fn){onAtlas=fn;},draw(c,atlas,name,x,y,w,h){
        const frame=manifest.atlases[atlas]?.frames[name],rect=frame?.rect;
        if(!rect)return false;
        if(!images[atlas]){ensure(atlas).catch(()=>{});return false;}
        const ratio=Math.min(w/rect[2],h/rect[3]),dw=rect[2]*ratio,dh=rect[3]*ratio;
        const offset=frame.offset||[0,0];
        c.drawImage(images[atlas],...rect,x+(w-dw)/2+offset[0],y+h-dh+offset[1],dw,dh);return true;
    },
    // Repeating world-space pattern for frames marked tile:true (seamless ground).
    pattern(c,atlas,name){
        const frame=manifest.atlases[atlas]?.frames[name];
        if(!frame?.tile)return null;
        if(!images[atlas]){ensure(atlas).catch(()=>{});return null;}
        const key=atlas+'/'+name;let source=patternSources.get(key);
        if(!source){
            const [x,y,w,h]=frame.rect;
            source=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});
            source.getContext('2d').drawImage(images[atlas],x,y,w,h,0,0,w,h);patternSources.set(key,source);
        }
        return c.createPattern(source,'repeat');
    }};
}
