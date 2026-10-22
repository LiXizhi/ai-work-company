import {PHOTO_INPUT_BYTES,PHOTO_HEAD_BYTES,scaleHeadFrames} from './photo_head_core.js';
export const canvasBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.type===type?resolve(blob):reject(Error('当前浏览器不支持图片编码')),type,quality));
export const blobDataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(blob);});
export async function checkHeadProcessingSupport(){
    if(typeof Worker!=='function'||typeof OffscreenCanvas!=='function'||typeof createImageBitmap!=='function')throw Error('当前浏览器不支持图集处理，请更换浏览器');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=4;await canvasBlob(canvas,'image/webp',1);
}
export async function imageBitmap(blob) {
    // createImageBitmap applies EXIF orientation; canvas re-encoding strips metadata.
    return createImageBitmap(blob,{imageOrientation:'from-image'});
}
export async function compressPhoto(canvas) {
    const output=document.createElement('canvas');output.width=output.height=Math.min(512,canvas.width);
    const ctx=output.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(canvas,0,0,output.width,output.height);
    for(const quality of [.9,.85,.8,.75,.7]) {
        const blob=await canvasBlob(output,'image/jpeg',quality);
        if(blob.size<=PHOTO_INPUT_BYTES)return blob;
    }
    throw Error('照片压缩后仍过大，请重新裁剪或选择照片');
}
// Small front-facing thumbnail embedded in the DIY index, never load all atlases to list them.
export async function headPreview(blob,frame) {
    const bitmap=await imageBitmap(blob);
    try{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
        const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';
        if(frame.mirrorX){ctx.translate(96,0);ctx.scale(-1,1);}
        ctx.drawImage(bitmap,...frame.crop,0,0,96,96);
        const output=await canvasBlob(canvas,'image/webp',.85);
        if(output.size>16000)throw Error('形象预览图过大');
        return blobDataURL(output);
    }finally{bitmap.close();}
}
export async function sha256(blob) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function fetchImage(url,{maxBytes=16000000,signal}={}) {
    if(!/^data:image\/(png|jpeg|webp);base64,/.test(url)&&!/^https:\/\//.test(url))throw Error('图片地址无效');
    const response=await fetch(url,{mode:'cors',credentials:'omit',signal});
    if(!response.ok)throw Error('图片加载失败，请重试');
    const blob=await response.blob();if(!blob.size||blob.size>maxBytes)throw Error('图片大小超限');return blob;
}
export async function verifyHeadAsset(head) {
    const blob=await fetchImage(head.cdn,{maxBytes:PHOTO_HEAD_BYTES});
    if(blob.type!=='image/webp'||blob.size!==head.bytes||await sha256(blob)!==head.sha256)throw Error('云端头部图片校验失败');
    const bitmap=await imageBitmap(blob);
    try{if(bitmap.width!==head.width||bitmap.height!==head.height)throw Error('云端头部图片尺寸不符');}finally{bitmap.close();}
    return blob;
}
export function removeBackground(blob,strength=1,directionCount=16) {
    if(typeof Worker!=='function'||typeof OffscreenCanvas!=='function')return Promise.reject(Error('当前浏览器不支持图集处理，请更换浏览器')); 
    return new Promise((resolve,reject)=>{
        const worker=new Worker(new URL('./photo_head_worker.js',import.meta.url),{type:'module'});
        const finish=(error,result)=>{clearTimeout(timer);worker.terminate();error?reject(Error(error)):resolve(result);};
        const timer=setTimeout(()=>finish('图集处理超时，请重试'),45000);
        worker.onmessage=({data})=>finish(data.error,data);worker.onerror=()=>finish('图集处理不可用，请重试');
        worker.postMessage({id:1,blob,strength,directionCount});
    });
}
export async function packHead(blob,template,{strength=1}={}) {
    const processed=await removeBackground(blob,strength,template.directionCount??16),bitmap=await imageBitmap(processed.blob);
    try{
        const initial=Math.min(1024,bitmap.width);
        for(const size of [...new Set([initial,768,576,512].filter(n=>n<=initial))]){
            const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
            const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,size,size);
            // Native canvas does not expose a lossless switch. Try its maximum
            // fidelity first; never label quality=1 as guaranteed lossless WebP.
            for(const quality of [1,.94,.88,.82,.76]){
                const result=await canvasBlob(canvas,'image/webp',quality);
                if(result.size<=PHOTO_HEAD_BYTES)return {blob:result,width:size,height:size,frames:scaleHeadFrames(template,size),bytes:result.size,sha256:await sha256(result)};
            }
        }
        throw Error('图集压缩后仍超过200KB，请重试');
    }finally{bitmap.close();}
}
