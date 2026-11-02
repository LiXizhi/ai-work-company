// Road-aligned bridge footprints, shared by offline layout and collision.
const EPS=1e-6;
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function distance(p,a,b){
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
// pad expands the deck so a resident sprite is not left standing on the planks.
export function onAnyBridge(world,x,y,pad=0){
    return (world.layout?.bridges||[]).some(b=>{
        const a=b.angle||0,dx=x-b.x,dy=y-b.y;
        return Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<b.w/2+pad&&Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<b.h/2+pad;
    });
}
export function onBridge(b,x,y,inset=0){
    if(b.polygon){
        if(!inside(b.polygon,{x,y}))return false;
        return !inset||!(b.edges||[]).some(e=>e.side&&distance({x,y},e.a,e.b)<inset-EPS);
    }
    const a=b.angle||0,dx=x-b.x,dy=y-b.y;
    return Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<=b.w/2+EPS&&
        Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<=b.h/2-inset+EPS;
}
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
function inside(points,p){
    return points.length>=3&&points.every((a,i)=>cross(sub(points[(i+1)%points.length],a),sub(p,a))>=-EPS);
}
function halfPlane(points,node,normal){
    const value=p=>(p.x-node.x)*normal.x+(p.y-node.y)*normal.y;
    const out=[];
    points.forEach((a,i)=>{
        const b=points[(i+1)%points.length],da=value(a),db=value(b);
        if(da>=-EPS)out.push(a);
        if((da>EPS&&db<-EPS)||(da<-EPS&&db>EPS))out.push(lerp(a,b,da/(da-db)));
    });
    return out;
}
function corners(b){
    const co=Math.cos(b.angle),si=Math.sin(b.angle);
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:b.x+x*b.w/2*co-y*b.h/2*si,y:b.y+x*b.w/2*si+y*b.h/2*co}));
}
// Clip an edge to a convex deck polygon. Collinear overlaps are
// included, so duplicate/reversed routes never leave an internal railing.
function clip(a,b,rect){
    const points=rect.polygon||corners(rect);let lo=0,hi=1;
    for(let i=0;i<points.length;i++){
        const p=points[i],edge=sub(points[(i+1)%points.length],p);
        const start=cross(edge,sub(a,p)),delta=cross(edge,sub(b,a));
        if(Math.abs(delta)<EPS){if(start<-EPS)return null;continue;}
        const t=-start/delta;
        if(delta>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
        if(hi<lo-EPS)return null;
    }
    return [lo,hi];
}
export function bridgeEdges(bridges){
    const seen=new Set();
    return bridges.map((bridge,index)=>{
        const points=bridge.polygon||corners(bridge),edges=[];
        points.forEach((a,i)=>{
            const b=points[(i+1)%points.length],cuts=[0,1];
            if(Math.hypot(b.x-a.x,b.y-a.y)<EPS)return;
            bridges.forEach((other,j)=>{if(j!==index){const interval=clip(a,b,other);if(interval)cuts.push(...interval);}});
            cuts.sort((x,y)=>x-y);
            for(let k=1;k<cuts.length;k++){
                if(cuts[k]-cuts[k-1]<EPS)continue;
                const p=lerp(a,b,cuts[k-1]),q=lerp(a,b,cuts[k]),m=lerp(p,q,.5);
                // Probe just outside this clockwise polygon; if another span
                // occupies that side, this edge lies inside the fork.
                const len=Math.hypot(b.x-a.x,b.y-a.y),out={x:m.x+(b.y-a.y)/len*.01,y:m.y-(b.x-a.x)/len*.01};
                if(bridges.some((other,j)=>j!==index&&onBridge(other,out.x,out.y)))continue;
                const key=[p,q].map(v=>`${v.x.toFixed(4)},${v.y.toFixed(4)}`).sort().join(':');
                if(seen.has(key))continue;seen.add(key);
                const along=v=>(v.x-bridge.x)*Math.cos(bridge.angle)+(v.y-bridge.y)*Math.sin(bridge.angle);
                const isEnd=Math.abs(Math.abs(along(p))-bridge.w/2)<EPS&&Math.abs(along(p)-along(q))<EPS;
                edges.push({a:p,b:q,side:!isEnd});
            }
        });
        return edges;
    });
}

export function generateRoadBridges(roads,rivers,rules){
    const spans=[],seen=new Set();
    for(const road of roads){
        const key=[road.a,road.b].map(p=>`${p.x},${p.y}`).sort().join(':')+`:${road.width}`;
        if(seen.has(key))continue;seen.add(key);
        const length=Math.hypot(road.b.x-road.a.x,road.b.y-road.a.y);
        if(length<EPS)continue;
        const width=road.width+rules.sideMargin*2,angle=Math.atan2(road.b.y-road.a.y,road.b.x-road.a.x);
        const wet=t=>{
            const p=lerp(road.a,road.b,t);
            // Include the whole road cross-section, riverbank collision margin
            // and a short dry landing, not just a centreline intersection.
            return rivers.some(r=>r.points.slice(1).some((v,i)=>distance(p,
                {x:r.points[i][0],y:r.points[i][1]},{x:v[0],y:v[1]})<r.width/2+12+width/2+rules.landing));
        };
        const steps=Math.max(1,Math.ceil(length/4));let start=null;
        const add=end=>{
            let from=start,to=end;
            // Overlap at wet road nodes joins bends and Y/T branches into a
            // single walkable deck; the union outline removes crossing beams.
            if(from===0)from=-width/2/length;
            if(to===1)to=1+width/2/length;
            const a=lerp(road.a,road.b,from),b=lerp(road.a,road.b,to);
            const joints=[];
            if(start===0)joints.push({...road.a,ux:Math.cos(angle),uy:Math.sin(angle)});
            if(end===1)joints.push({...road.b,ux:-Math.cos(angle),uy:-Math.sin(angle)});
            spans.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,w:(to-from)*length,h:width,angle,generated:true,joints});
        };
        for(let i=0;i<=steps;i++){
            const inside=wet(i/steps);
            if(inside&&start===null)start=Math.max(0,(i-1)/steps);
            if(!inside&&start!==null){add(i/steps);start=null;}
        }
        if(start!==null)add(1);
    }
    // Mitred joints partition the deck along angle bisectors. Boards from
    // adjoining arms meet cleanly instead of looking like stacked rectangles.
    for(const span of spans){
        let polygon=corners(span);
        for(const joint of span.joints)for(const other of spans){
            if(other===span)continue;
            for(const peer of other.joints){
                if(Math.hypot(peer.x-joint.x,peer.y-joint.y)>EPS)continue;
                polygon=halfPlane(polygon,joint,{x:joint.ux-peer.ux,y:joint.uy-peer.uy});
            }
        }
        span.polygon=polygon;
    }
    const edges=bridgeEdges(spans);
    return spans.map(({joints,...b},i)=>({...b,edges:edges[i]}));
}
