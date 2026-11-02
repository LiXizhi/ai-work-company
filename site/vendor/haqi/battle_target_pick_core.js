// Hit testing uses CSS canvas coordinates, independent of DPR and page zoom.
export function battleTargetRects(positions,bounds,scale=1){
    return Object.entries(positions).map(([id,at])=>{
        const b=bounds[id]||{},left=Math.min(-46,b.left??-46),right=Math.max(46,b.right??46),top=Math.min(-90,b.hitTop??-90),bottom=Math.max(50,b.bottom??0);
        return {id,x:(at.x+left-8)*scale,y:(at.y+top-8)*scale,width:(right-left+16)*scale,height:(bottom-top+16)*scale};
    });
}
export function pickBattleTarget(rects,positions,point){
    const hits=rects.filter(r=>point.x>=r.x&&point.x<=r.x+r.width&&point.y>=r.y&&point.y<=r.y+r.height);
    const distance=r=>Math.hypot(point.x-(r.x+r.width/2),point.y-(r.y+r.height/2));
    if(hits.length)return hits.sort((a,b)=>distance(a)-distance(b))[0].id;
    return Object.entries(positions).sort((a,b)=>Math.hypot(a[1].x-point.x,a[1].y-point.y)-Math.hypot(b[1].x-point.x,b[1].y-point.y))[0]?.[0]??null;
}
