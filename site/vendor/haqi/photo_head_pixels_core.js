import {headAtlasColumns} from './photo_head_core.js';
// Adapted from MagicHaqi/js/petSheetWorker.js (2026-10-07).
// Only edge-connected near-background pixels are removed. Never recenter cells,
// clear border bands or transform pixels: template neck coordinates are immutable.
export function removeHeadBackground(input,width,height,{strength=1,directionCount=16}={}) {
    const columns=headAtlasColumns(directionCount);
    if(width!==height||width%columns||input.length!==width*height*4)throw Error('头部图集必须为方形等格');
    const data=new Uint8ClampedArray(input),cw=width/columns,ch=height/columns;
    const distance=(p,b)=>(data[p]-b[0])**2+(data[p+1]-b[1])**2+(data[p+2]-b[2])**2;
    for(let row=0;row<columns;row++)for(let col=0;col<columns;col++){
        const offset=(x,y)=>((row*ch+y)*width+col*cw+x)*4;
        const edge=[];
        for(let x=0;x<cw;x++)edge.push(offset(x,0),offset(x,ch-1));
        for(let y=1;y<ch-1;y++)edge.push(offset(0,y),offset(cw-1,y));
        // A transparent atlas must not be eroded a second time.
        if(edge.every(p=>data[p+3]===0)||strength===0)continue;
        const samples=edge.filter(p=>data[p+3]>=240).map(p=>[data[p],data[p+1],data[p+2]]).sort((a,b)=>a[0]+a[1]+a[2]-b[0]-b[1]-b[2]);
        if(!samples.length)continue;
        const bg=samples[Math.floor(samples.length/2)];
        // This pipeline accepts white generated backgrounds, not arbitrary photos.
        if(Math.min(...bg)<220 || Math.max(...bg)-Math.min(...bg)>20)throw Error('生成图背景不是纯白，请重新生成');
        const limit=(30*Math.max(.25,Math.min(2,strength)))**2;
        const visited=new Uint8Array(cw*ch),queue=new Int32Array(cw*ch);let start=0,end=0;
        function mark(x,y){if(x<0||x>=cw||y<0||y>=ch)return;const i=y*cw+x,p=offset(x,y);if(visited[i]||data[p+3]>0&&distance(p,bg)>limit)return;visited[i]=1;queue[end++]=i;}
        for(let x=0;x<cw;x++){mark(x,0);mark(x,ch-1);}for(let y=0;y<ch;y++){mark(0,y);mark(cw-1,y);}
        while(start<end){const i=queue[start++],x=i%cw,y=Math.floor(i/cw);mark(x-1,y);mark(x+1,y);mark(x,y-1);mark(x,y+1);}
        for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
            const i=y*cw+x,p=offset(x,y);if(visited[i]){data[p+3]=0;continue;}
            if(distance(p,bg)>limit*2)continue;
            let neighbors=0;for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<cw&&ny>=0&&ny<ch&&visited[ny*cw+nx])neighbors++;}
            if(neighbors>=2)data[p+3]=Math.round(data[p+3]*.7);
        }
    }
    return data;
}
export function checkHeadPixels(data,width,height,{directionCount=16}={}) {
    const columns=headAtlasColumns(directionCount);
    if(width!==height||width%columns||data.length!==width*height*4)throw Error('生成图不是方形等格图集');
    const cell=width/columns;
    for(let i=0;i<directionCount;i++){
        let solid=0,clear=0;
        for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
            const a=data[((Math.floor(i/columns)*cell+y)*width+i%columns*cell+x)*4+3];
            if(a>32)solid++;if(a===0)clear++;
        }
        if(solid<cell*cell*.025||clear<cell*cell*.04)throw Error('生成图有空白格或缺少透明背景，请检查图集');
    }
}
