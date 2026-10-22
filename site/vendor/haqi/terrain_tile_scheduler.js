// Browser-side cooperative raster work; no drawing or image callbacks touch the live canvas.
function scheduleSlice(fn){const task={frame:null,timer:null};task.frame=requestAnimationFrame(()=>{task.timer=setTimeout(fn,0);});return task;}
function cancelSlice(task){cancelAnimationFrame(task.frame);if(task.timer!==null)clearTimeout(task.timer);}
export function createScheduledTerrainCache({paint,createCanvas,rasterize=null,schedule=scheduleSlice,cancel=cancelSlice,now=()=>performance.now(),budget=4,limit=24,maxBytes=64*1024*1024,onMetric=()=>{}}){
    const tiles=new Map(),keys=new WeakMap();let scope=null,density=0,queue=[],active=null,timer=null,previous=null,protectedKeys=new Set(),capacity=limit;
    function identity(world){if(!keys.has(world))keys.set(world,{layout:world.layout||world,geometry:JSON.stringify([world.npcs?.map(n=>[n.id,n.x,n.y]),world.encounters?.map(e=>[e.id,e.x,e.y])])});return keys.get(world);}
    function same(a,b){return a?.layout===b?.layout&&a?.geometry===b?.geometry;}
    function stop(){if(timer!==null)cancel(timer);timer=null;queue=[];if(active){if(active.tile)active.tile.width=active.tile.height=0;active=null;}}
    function discard(row){if(row.tile.close)row.tile.close();else row.tile.width=row.tile.height=0;}
    function fresh(key){const row=tiles.get(key);return row&&!row.dirty;}
    function publish(row){const old=tiles.get(row.key);tiles.set(row.key,row);if(old)discard(old);}
    function evict(reserve=0){while(tiles.size+reserve>capacity){const key=[...tiles.keys()].find(k=>!protectedKeys.has(k));if(key===undefined)return false;const row=tiles.get(key);discard(row);tiles.delete(key);}return true;}
    function work(){timer=null;const started=now();
        do{
            if(!active){const task=queue.shift();if(!task)break;if(fresh(task.key))continue;if(!evict(tiles.has(task.key)?0:1))continue;
                const pixels=512*density,scale=pixels/task.size,margin=2/scale,rect={x:task.x*task.size-margin,y:task.y*task.size-margin,w:task.size+margin*2,h:task.size+margin*2};
                if(rasterize){const row={...task,waiting:true,invalidated:new Set(),started:now()};active=row;
                    Promise.resolve().then(()=>rasterize(task.world,rect,pixels+4,scale)).then(result=>{if(active!==row){result.bitmap.close();return;}active=null;if(result.atlases.some(atlas=>row.invalidated.has(atlas))){result.bitmap.close();queue.unshift(task);}else{row.tile=result.bitmap;row.atlases=new Set(result.atlases);publish(row);onMetric('tile-worker',now()-row.started);}if(timer===null&&queue.length)timer=schedule(work);},error=>{if(active!==row)return;active=null;rasterize=null;queue.unshift(task);onMetric('tile-worker-error',String(error));if(timer===null)timer=schedule(work);});
                    break;
                }
                const tile=createCanvas();tile.width=tile.height=pixels+4;const c=tile.getContext('2d',{willReadFrequently:true});
                c.translate(2,2);c.scale(scale,scale);c.translate(-task.x*task.size,-task.y*task.size);
                const atlases=new Set();
                active={...task,tile,atlases,iterator:paint(c,task.world,rect,atlases),started:now()};
            }
            if(active.waiting)break;
            try{if(active.iterator.next().done){const row=active;active=null;publish(row);onMetric('tile',now()-row.started);
                // Immutable bitmaps avoid re-uploading a software canvas while panning.
                if(typeof createImageBitmap==='function')createImageBitmap(row.tile).then(bitmap=>{if(tiles.get(row.key)!==row){bitmap.close();return;}row.tile.width=row.tile.height=0;row.tile=bitmap;}).catch(()=>{});
            }}
            catch(error){active.tile.width=active.tile.height=0;active=null;onMetric('tile-error',String(error));}
        }while(now()-started<budget);
        onMetric('tile-slice',now()-started);if(!active?.waiting&&(active||queue.length))timer=schedule(work);
    }
    function prepare(world,rect,pixelRatio=1,path=[],{visibleOnly=false}={}){
        const next=identity(world),d=Math.min(2,Math.max(1,Math.ceil(pixelRatio*4)/4));
        if(!same(scope,next)||density!==d){stop();for(const row of tiles.values())discard(row);tiles.clear();scope=next;density=d;previous=null;}
        capacity=Math.max(1,Math.min(limit,Math.max(1,Math.floor(maxBytes/((512*d+4)**2*4))-1)));
        let size=512;while((Math.ceil(rect.w/size)+1)*(Math.ceil(rect.h/size)+1)>capacity)size*=2;
        const min=world.unbounded?-Infinity:0,maxX=world.unbounded?Infinity:Math.ceil(world.w/size)-1,maxY=world.unbounded?Infinity:Math.ceil(world.h/size)-1;
        const x0=Math.max(min,Math.floor(rect.x/size)),y0=Math.max(min,Math.floor(rect.y/size)),x1=Math.min(maxX,Math.floor((rect.x+rect.w)/size)),y1=Math.min(maxY,Math.floor((rect.y+rect.h)/size));
        const tasks=[],seen=new Set();protectedKeys=new Set();
        function add(x,y,visible=false){if(x<min||y<min||x>maxX||y>maxY)return;const key=`${size}:${x},${y}`;if(visible)protectedKeys.add(key);if(seen.has(key))return;seen.add(key);tasks.push({key,x,y,size,world});}
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)add(x,y,true);
        const target=path.find(p=>Math.hypot(p.x-(rect.x+rect.w/2),p.y-(rect.y+rect.h/2))>size/2);
        const dx=target?target.x-(rect.x+rect.w/2):previous?rect.x-previous.x:0,dy=target?target.y-(rect.y+rect.h/2):previous?rect.y-previous.y:0;
        // Leading edge first within the neighbouring ring.
        const ring=[];for(let y=y0-1;y<=y1+1;y++)for(let x=x0-1;x<=x1+1;x++)if(x<x0||x>x1||y<y0||y>y1)ring.push({x,y});
        ring.sort((a,b)=>(b.x-a.x)*dx+(b.y-a.y)*dy);for(const p of ring)add(p.x,p.y);
        for(const p of path.slice(0,4))add(Math.floor(p.x/size),Math.floor(p.y/size));
        if(active&&!seen.has(active.key)){if(active.tile)active.tile.width=active.tile.height=0;active=null;}
        // Do not cycle speculative tiles through a full visible cache.
        const extra=visibleOnly?0:Math.max(0,Math.min(4,capacity-protectedKeys.size));let extras=0;
        queue=tasks.filter(t=>protectedKeys.has(t.key)||extras++<extra).filter(t=>!fresh(t.key)&&t.key!==active?.key);
        previous={x:rect.x,y:rect.y};if(timer===null&&!active?.waiting&&(queue.length||active))timer=schedule(work);
        const visible=tasks.filter(t=>protectedKeys.has(t.key));
        return {tasks:visible,size,total:visible.length,ready:visible.filter(t=>fresh(t.key)).length};
    }
    return {
        prepare,
        draw(c,world,rect,fallback,pixelRatio=1,path=[]){const {tasks,size}=prepare(world,rect,pixelRatio,path);let missing=0;
            for(const task of tasks){const row=tiles.get(task.key);if(!row){missing++;fallback?.(c,task.x*size,task.y*size,size);continue;}tiles.delete(task.key);tiles.set(task.key,row);const pixels=512*density,overlap=size/pixels;c.drawImage(row.tile,1,1,pixels+2,pixels+2,task.x*size-overlap,task.y*size-overlap,size+overlap*2,size+overlap*2);}
            return missing;
        },
        invalidateAtlas(atlas){for(const [key,row] of tiles)if(row.atlases.has(atlas)){discard(row);tiles.delete(key);}if(active?.waiting)active.invalidated.add(atlas);else if(active?.atlases.has(atlas)){if(active.tile)active.tile.width=active.tile.height=0;active=null;}},
        invalidateRect(rect,{keepPrevious=false}={}){
            const overlaps=row=>{const margin=2*row.size/(512*density);return row.x*row.size-margin<=rect.x+rect.w&&(row.x+1)*row.size+margin>=rect.x&&row.y*row.size-margin<=rect.y+rect.h&&(row.y+1)*row.size+margin>=rect.y;};
            for(const [key,row] of tiles)if(overlaps(row)){
                // Keep the last complete image visible until its replacement is ready.
                if(keepPrevious)row.dirty=true;else{discard(row);tiles.delete(key);}
            }
            // In-flight replies are discarded by identity; next prepare supplies the new world snapshot.
            if(active&&overlaps(active)){if(active.tile)discard(active);active=null;}
        },
        clear(){stop();for(const row of tiles.values())discard(row);tiles.clear();scope=null;previous=null;},
        get size(){return tiles.size;},get pending(){return queue.length+(active?1:0);},
        stats:()=>({bytes:(tiles.size+(active?1:0))*(512*density+4)**2*4,limitBytes:maxBytes,mode:rasterize?'worker':'fallback'})
    };
}
