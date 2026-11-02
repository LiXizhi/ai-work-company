import {paintHomeWorldTerrain} from './view_home_art.js';
let world=null,manifest=null,images={},patterns=new Map();
self.onmessage=({data})=>{
    if(data.type==='scene'){
        if(data.world)world=data.world;manifest=data.manifest;
        for(const atlas of new Set([...(data.removed||[]),...Object.keys(data.images)])){
            images[atlas]?.close();delete images[atlas];
            for(const [key,canvas] of patterns)if(key.startsWith(atlas+'/')){canvas.width=canvas.height=0;patterns.delete(key);}
        }
        Object.assign(images,data.images);return;
    }
    const {id,rect,pixels,scale}=data;let canvas;
    try{canvas=new OffscreenCanvas(pixels,pixels);const c=canvas.getContext('2d',{willReadFrequently:true});c.scale(scale,scale);c.translate(-rect.x,-rect.y);const atlases=new Set();
        const art={draw(c,atlas,name,x,y,w,h){atlases.add(atlas);const crop=manifest?.atlases[atlas]?.frames[name]?.rect,image=images[atlas];if(!crop||!image)return false;const ratio=Math.min(w/crop[2],h/crop[3]),dw=crop[2]*ratio,dh=crop[3]*ratio;c.drawImage(image,...crop,x+(w-dw)/2+(manifest.atlases[atlas].frames[name].offset?.[0]||0),y+h-dh+(manifest.atlases[atlas].frames[name].offset?.[1]||0),dw,dh);return true;},
            pattern(c,atlas,name){atlases.add(atlas);const frame=manifest?.atlases[atlas]?.frames[name],image=images[atlas];if(!frame?.tile||!image)return null;const key=atlas+'/'+name;let source=patterns.get(key);if(!source){const [x,y,w,h]=frame.rect;source=new OffscreenCanvas(w,h);source.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);patterns.set(key,source);}return c.createPattern(source,'repeat');}};
        const layer=prefix=>({draw:(c,atlas,...args)=>art.draw(c,prefix+atlas,...args),pattern:(c,atlas,...args)=>art.pattern(c,prefix+atlas,...args)});
        paintHomeWorldTerrain(c,world.seed,rect,layer('env/'),layer('decor/'),world.objects,world.theme);const bitmap=canvas.transferToImageBitmap();self.postMessage({id,bitmap,atlases:[...atlases]},[bitmap]);
    }catch(error){self.postMessage({id,error:String(error)});}finally{if(canvas)canvas.width=canvas.height=0;}
};
