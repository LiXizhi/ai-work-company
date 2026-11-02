import {bridgeEdges} from './adventure_bridge_core.js';

export function earthBridgeContains(road,x,y){
    const dx=road.b.x-road.a.x,dy=road.b.y-road.a.y,length=Math.hypot(dx,dy);
    if(!road.bridge||!length)return false;
    const along=((x-road.a.x)*dx+(y-road.a.y)*dy)/length;
    return along>=0&&along<=length&&Math.abs((x-road.a.x)*dy-(y-road.a.y)*dx)/length<=road.width/2;
}

// Inspect the complete city route before viewport clipping: a short wet run
// may cross several curve segments. Both full-width banks must be loaded land.
export function earthRoadCrossings(roads,sample,rules){
    const steps=earthRoadCrossingSteps(roads,sample,rules);let result;do{result=steps.next();}while(!result.done);return result.value;
}
export function* earthRoadCrossingSteps(roads,sample,rules){
    const points=[];
    for(const road of roads){
        const length=Math.hypot(road.b.x-road.a.x,road.b.y-road.a.y),count=Math.max(1,Math.ceil(length/rules.roadSampleStep));
        if(!length)continue;
        const nx=-(road.b.y-road.a.y)/length,ny=(road.b.x-road.a.x)/length;
        for(let i=0;i<=count;i++){
            yield;
            if(i===0&&points.length)continue;
            const p={x:road.a.x+(road.b.x-road.a.x)*i/count,y:road.a.y+(road.b.y-road.a.y)*i/count};
            const types=[-1,0,1].map(side=>sample(p.x+nx*side*road.width/2,p.y+ny*side*road.width/2));
            const kind=types.some(t=>!t)?'blocked':types.includes('ocean')?'sea':types.includes('water')?'water':'land';
            points.push({p,kind,road});
        }
    }
    const bridge=new Set();
    for(let i=0;i<points.length;i++){
        yield;
        if(points[i].kind!=='water')continue;
        const start=i;while(i+1<points.length&&points[i+1].kind==='water')i++;
        const end=i;
        if(points[start-1]?.kind!=='land'||points[end+1]?.kind!=='land')continue;
        let length=0;for(let j=start;j<=end+1;j++)length+=Math.hypot(points[j].p.x-points[j-1].p.x,points[j].p.y-points[j-1].p.y);
        if(length<=rules.cityBridgeMaxSpan)for(let j=start-1;j<=end+1;j++)bridge.add(j);
    }
    const docks=[];
    for(let i=0;i<points.length;i++){
        yield;
        if(!['water','sea'].includes(points[i].kind))continue;
        const start=i;while(i+1<points.length&&['water','sea'].includes(points[i+1].kind))i++;
        const end=i;
        if(bridge.has(start))continue;
        // Only known, full-width land banks gain docks; unknown terrain is not water.
        for(const [bank,wet] of [[points[start-1],points[start]],[points[end+1],points[end]]]){
            if(bank?.kind!=='land')continue;
            const dx=wet.p.x-bank.p.x,dy=wet.p.y-bank.p.y;
            docks.push({...bank.p,facing:Math.abs(dx)>Math.abs(dy)?dx<0?1:2:dy<0?3:0});
        }
    }
    const out=[];
    for(let i=1;i<points.length;i++){
        yield;
        const a=points[i-1],b=points[i],isBridge=bridge.has(i-1)&&bridge.has(i);
        if(isBridge||a.kind==='land'&&b.kind==='land'){
            const last=out.at(-1);
            if(last&&last.id===b.road.id&&last.bridge===isBridge&&last.b===a.p)last.b=b.p;
            else out.push({...b.road,a:a.p,b:b.p,bridge:isBridge});
        }
    }
    for(const dock of docks){
        yield;
        const road=out.find(r=>Math.hypot(r.a.x-dock.x,r.a.y-dock.y)<.01||Math.hypot(r.b.x-dock.x,r.b.y-dock.y)<.01);
        if(road)(road.docks??=[]).push(dock);
    }
    return out;
}

export function earthRoadBridges(roads){
    const spans=roads.filter(r=>r.bridge).map(r=>({x:(r.a.x+r.b.x)/2,y:(r.a.y+r.b.y)/2,w:Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y),h:r.width,angle:Math.atan2(r.b.y-r.a.y,r.b.x-r.a.x)}));
    const edges=bridgeEdges(spans);return spans.map((b,i)=>({...b,edges:edges[i]}));
}
