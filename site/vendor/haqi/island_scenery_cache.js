// Bounded world-space batches; actors and faded trees retain their Y order.
export function createIslandSceneryCache({paint,createCanvas=()=>document.createElement('canvas'),schedule=fn=>setTimeout(fn,0),cancel=clearTimeout,now=()=>performance.now(),limit=24*1024*1024,budget=2}={}){
    const entries=new Map(),ids=new WeakMap();let nextId=0,scope=null,source=null,density=0,bytes=0,queue=[],timer=null,protectedKeys=new Set(),draws=0,batchedTrees=0,fallbackTrees=0;
    const id=o=>{if(!ids.has(o))ids.set(o,++nextId);return ids.get(o);};
    function discard(row){if(row.canvas?.close)row.canvas.close();else if(row.canvas)row.canvas.width=row.canvas.height=0;}
    function clear(){if(timer!==null)cancel(timer);timer=null;queue=[];for(const row of entries.values())discard(row);entries.clear();bytes=0;scope=null;source=null;density=0;draws=batchedTrees=fallbackTrees=0;protectedKeys.clear();}
    function work(){timer=null;const start=now();while(queue.length){const row=queue.shift();if(entries.get(row.key)!==row)continue;
        while(bytes+row.bytes>limit&&entries.size){const key=[...entries.keys()].find(key=>key!==row.key&&!protectedKeys.has(key)&&entries.get(key).canvas);if(key===undefined)break;const old=entries.get(key);bytes-=old.bytes;discard(old);entries.delete(key);}
        if(bytes+row.bytes>limit){entries.delete(row.key);continue;}
        const canvas=createCanvas();canvas.width=row.width;canvas.height=row.height;const c=canvas.getContext('2d',{willReadFrequently:true});c.scale(density,density);c.translate(-row.x,-row.y);
        try{for(const o of row.objects)paint(c,o,scope);row.canvas=canvas;bytes+=row.bytes;}catch(error){canvas.width=canvas.height=0;entries.delete(row.key);throw error;}
        if(now()-start>=budget)break;
    }if(queue.length)timer=schedule(work);}
    return {begin(world,images,pixelRatio){const d=Math.min(2,Math.max(.5,pixelRatio));if(scope!==world||source!==images||density!==d){clear();scope=world;source=images;density=d;}protectedKeys=new Set();draws=batchedTrees=fallbackTrees=0;},
        draw(c,objects,index,hero,rect){const rows=[];let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
            const band=Math.floor(objects[index].y/96);
            for(let i=index;i<objects.length&&rows.length<8;i++){const o=objects[i];if(o.kind!=='tree'||Math.floor(o.y/96)!==band||o.hidden||Math.abs(hero.x-o.x)<o.size*.4&&hero.y<o.y&&hero.y>o.y-o.size*.85)break;
                if(o.x<rect.x-200||o.x>rect.x+rect.w+200||o.y<rect.y-50||o.y>rect.y+rect.h+230)break;
                const left=o.x-o.size/2,top=o.y-o.size+10,r=o.x+o.size*.54,b=o.y+14;
                if(rows.length&&(Math.max(right,r)-Math.min(x,left)>640||Math.max(bottom,b)-Math.min(y,top)>480))break;
                x=Math.min(x,left);y=Math.min(y,top);right=Math.max(right,r);bottom=Math.max(bottom,b);rows.push(o);
            }
            if(rows.length<2){fallbackTrees++;return index;}
            const key=rows.map(id).join(','),existing=entries.get(key);protectedKeys.add(key);
            if(existing?.canvas){entries.delete(key);entries.set(key,existing);c.drawImage(existing.canvas,existing.x,existing.y,existing.width/density,existing.height/density);draws++;batchedTrees+=rows.length;return index+rows.length;}
            if(!existing&&queue.length<16){x=Math.floor(x*density)/density-1/density;y=Math.floor(y*density)/density-1/density;const width=Math.ceil((right-x)*density)+2,height=Math.ceil((bottom-y)*density)+2,size=width*height*4;
                if(size<=limit){const row={key,x,y,width,height,bytes:size,objects:rows,canvas:null};entries.set(key,row);queue.push(row);if(timer===null)timer=schedule(work);}
            }fallbackTrees++;return index;
        },clear,stats:()=>({bytes,entries:entries.size,pending:queue.length,density,draws,batchedTrees,fallbackTrees})};
}
