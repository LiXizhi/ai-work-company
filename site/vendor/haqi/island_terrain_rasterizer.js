// Lazy worker preparation; tile scheduler discards old-world replies.
export function createIslandTerrainRasterizer(art,{workerUrl=new URL('./island_terrain_worker.js',import.meta.url),snapshotWorld=world=>({zone:world.zone,w:world.w,h:world.h,layout:world.layout,center:world.center,paths:world.paths,trees:world.trees,buildings:world.buildings,npcs:world.npcs,encounters:world.encounters,landmarks:world.landmarks,portal:world.portal})}={}){
    if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap!=='function')return null;
    let worker=null,scope=null,sources=[],sequence=0,ready=Promise.resolve(),failed=false;const pending=new Map();
    function fail(error){failed=true;worker?.terminate();worker=null;for(const row of pending.values()){clearTimeout(row.timer);row.reject(error);}pending.clear();}
    const rasterize=async(world,rect,pixels,scale)=>{
        if(failed)throw Error('岛屿地表后台准备不可用');
        if(!worker){worker=new Worker(workerUrl,{type:'module'});worker.onerror=()=>fail(Error('岛屿地表后台准备失败'));worker.onmessage=({data})=>{const row=pending.get(data.id);if(!row){data.bitmap?.close();return;}pending.delete(data.id);clearTimeout(row.timer);if(data.error)row.reject(Error(data.error));else row.resolve(data);};}
        const next=Object.entries(art?.images||{});
        if(scope!==world||next.length!==sources.length||next.some(([key,image],i)=>sources[i]?.[0]!==key||sources[i]?.[1]!==image)){
            const previous=new Map(sources),changed=next.filter(([key,image])=>previous.get(key)!==image),removed=sources.filter(([key])=>!next.some(([name])=>name===key)).map(([key])=>key);
            const snapshot=scope===world?null:snapshotWorld(world);
            scope=world;sources=next;
            // Transfer each atlas once, including across islands. Sequential copies
            // avoid a burst of simultaneous decodes when the initial assets arrive.
            ready=ready.then(async()=>{const images={};try{for(const [key,image] of changed)images[key]=await createImageBitmap(image);if(!worker)throw Error('岛屿地表后台准备已结束');worker.postMessage({type:'scene',world:snapshot,manifest:art?.manifest,images,removed},Object.values(images));}catch(error){for(const image of Object.values(images))image.close();throw error;}}).catch(error=>{fail(error);throw error;});
        }
        await ready;if(!worker)throw Error('岛屿地表后台准备已结束');const id=++sequence;
        return new Promise((resolve,reject)=>{const timer=setTimeout(()=>fail(Error('岛屿地表后台准备超时')),15000);pending.set(id,{resolve,reject,timer});try{worker.postMessage({id,rect,pixels,scale});}catch(error){fail(error);}});
    };
    rasterize.dispose=()=>fail(Error('地表后台准备已结束'));
    return rasterize;
}
