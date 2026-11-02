// Presentation-only ground shade. World-space gradients keep the same soft
// fringe on both sides of terrain tile boundaries without a blur/filter pass.
export function paintSoftShadow(c,x,y,rx,ry,opacity=.24) {
    c.save();c.translate(x,y);c.scale(rx,ry);
    const shade=c.createRadialGradient(0,0,0,0,0,1);
    for(const [offset,alpha] of [[0,1],[.3,.85],[.65,.35],[1,0]])
        shade.addColorStop(offset,`rgba(23,49,39,${opacity*alpha})`);
    c.fillStyle=shade;c.beginPath();c.arc(0,0,1,0,Math.PI*2);c.fill();c.restore();
}

export function paintStaticShadows(c,world,rect={x:0,y:0,w:world.w,h:world.h}) {
    function shade(x,y,rx,ry,opacity) {
        if(x+rx<rect.x||x-rx>rect.x+rect.w||y+ry<rect.y||y-ry>rect.y+rect.h)return;
        paintSoftShadow(c,x,y,rx,ry,opacity);
    }
    for(const t of world.trees||[]) {
        shade(t.x-t.size*.08,t.y+t.size*.025,t.size*.48,t.size*.20,.30);
        shade(t.x,t.y+2,t.size*.22,t.size*.075,.28);
    }
    for(const b of world.buildings||[]) {
        shade(b.x-b.w*.06,b.y+3,b.w*.57,b.w*.19,.26);
        shade(b.x,b.y,b.w*.4,b.w*.07,.22);
    }
}
