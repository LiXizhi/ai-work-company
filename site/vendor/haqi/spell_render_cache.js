// Reuse canonical rune geometry without baking gradients into GPU textures.
const runes=new Map();
export function cachedRunePath(){
    if(typeof Path2D==='undefined')return null;
    // Canonical geometry is transformed by the caller; no size-dependent allocation.
    if(runes.size)return runes.get('rune');
    const path=new Path2D(),tau=Math.PI*2;
    for(const r of [1,.8]){path.moveTo(r,0);path.arc(0,0,r,0,tau);}
    for(let i=0;i<10;i++){
        const a=i*tau/10,cs=Math.cos(a),sn=Math.sin(a);
        const corners=[[.87,-.035],[.94,-.035],[.94,.035],[.87,.035]];
        corners.forEach(([x,y],j)=>path[j?'lineTo':'moveTo'](x*cs-y*sn,x*sn+y*cs));path.closePath();
    }
    for(let i=0;i<=5;i++){const a=i*tau*2/5;path[i?'lineTo':'moveTo'](Math.cos(a)*.75,Math.sin(a)*.75);}
    runes.set('rune',path);return path;
}
