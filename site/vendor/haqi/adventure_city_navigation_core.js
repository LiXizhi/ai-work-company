import {streetWalkable,streetSegmentWalkable} from './adventure_city_street_core.js';
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function clearStreetSegment(scene,a,b){if(scene.streetscape?.movementStep!=null)return streetSegmentWalkable(scene,a,b);const n=Math.max(1,Math.ceil(length(a,b)/2));for(let i=0;i<=n;i++)if(!streetWalkable(scene,a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n))return false;return true;}
// 12-unit grid resolves narrow alleys; heap A* avoids repeatedly sorting a city-wide queue.
export function streetFindPath(scene,start,target){
    if(!streetWalkable(scene,start.x,start.y)||!streetWalkable(scene,target.x,target.y))return [];
    if(clearStreetSegment(scene,start,target))return [{...target}];
    const step=12,cols=Math.ceil(scene.map.w/step),rows=Math.ceil(scene.map.h/step),point=k=>({x:(k%cols)*step+step/2,y:Math.floor(k/cols)*step+step/2}),key=(x,y)=>y*cols+x;
    const heap=[],cost=new Map(),parent=new Map(),closed=new Set(),walkCache=new Map();
    const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=n.f)break;heap[i]=heap[p];i=p;}heap[i]=n;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
    const walk=k=>{if(!walkCache.has(k)){const p=point(k);walkCache.set(k,streetWalkable(scene,p.x,p.y));}return walkCache.get(k);};
    const near=p=>{const out=[],x=Math.floor(p.x/step),y=Math.floor(p.y/step);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;const k=key(nx,ny);if(walk(k)&&clearStreetSegment(scene,p,point(k)))out.push(k);}return out;};
    const goals=new Set(near(target));if(!goals.size)return [];
    for(const k of near(start)){const g=length(start,point(k));cost.set(k,g);push({k,g,f:g+length(point(k),target)});}
    const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    while(heap.length&&closed.size<50000){
        const n=pop(),k=n.k;if(closed.has(k)||n.g!==cost.get(k))continue;closed.add(k);
        if(goals.has(k)){const raw=[{...target}];let cursor=k;while(cursor!==undefined){raw.unshift(point(cursor));cursor=parent.get(cursor);}const out=[];let previous=start,i=0;while(i<raw.length){let end=i;for(let j=raw.length-1;j>i;j--)if(clearStreetSegment(scene,previous,raw[j])){end=j;break;}out.push(raw[end]);previous=raw[end];i=end+1;}return out;}
        const p=point(k),x=k%cols,y=Math.floor(k/cols);
        for(const [dx,dy]of directions){
            const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;
            const nk=key(nx,ny),g=n.g+step*Math.hypot(dx,dy);
            // Reject non-improving arrivals before the expensive foot sweep.
            if(closed.has(nk)||g>=(cost.get(nk)??Infinity)||!walk(nk)||dx&&dy&&(!walk(key(nx,y))||!walk(key(x,ny)))||!clearStreetSegment(scene,p,point(nk)))continue;
            cost.set(nk,g);parent.set(nk,k);push({k:nk,g,f:g+length(point(nk),target)});
        }
    }
    return [];
}
