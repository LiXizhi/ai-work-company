import { createRng, hashSeed } from './rng_core.js';

function stroke(c, points, color, width=1) {
    c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));
    c.strokeStyle=color;c.lineWidth=width;c.stroke();
}

// Baked with the terrain tiles. A private seed keeps grain identical across
// tile boundaries and never consumes gameplay RNG. Local X runs across water.
export function paintBridge(c, bridge, palette, overview=false, pass='all') {
    const manual=bridge.angle==null;
    const length=manual?bridge.h:bridge.w, width=manual?bridge.w:bridge.h;
    const left=-length/2, top=-width/2;
    const rng=createRng(hashSeed(`bridge:${bridge.x}:${bridge.y}:${bridge.w}:${bridge.h}`));
    c.save();
    if(bridge.polygon){
        const path=()=>{
            c.beginPath();bridge.polygon.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();
        };
        if(pass==='shadow'){
            c.translate(3,5);path();c.fillStyle='#20332a22';c.fill();
            for(let width=10;width>=2;width-=2){c.lineWidth=width;c.strokeStyle='#20332a08';c.stroke();}
            c.restore();return;
        }
        path();c.clip();
    }
    c.translate(bridge.x,bridge.y);c.rotate(manual?Math.PI/2:bridge.angle);
    // Soft layered shade avoids Canvas shadowBlur seams when baking tiles.
    if(pass!=='deck')for(let spread=12;spread>=0;spread-=3){
        c.fillStyle='#20332a09';
        c.fillRect(left-spread/2+4,top-spread/2+7,length+spread,width+spread);
    }
    if(pass==='shadow'){c.restore();return;}
    c.fillStyle=palette.edge;c.fillRect(left,top,length,width);
    const count=Math.max(3,Math.round(length/19)), pitch=length/count;
    for(let i=0;i<count;i++){
        const x=left+i*pitch+.7, w=pitch-1.4;
        const inset=rng.float()*1.8, y=top+5+inset, h=width-10-inset*2;
        const base=rng.pick(['#a18a60','#ae956b','#b69e73','#a99065','#baa579']);
        const face=c.createLinearGradient(x,y,x+w,y);
        face.addColorStop(0,'#d0ba8b');face.addColorStop(.12,base);
        face.addColorStop(.78,base);face.addColorStop(1,'#796342');
        c.fillStyle=face;c.fillRect(x,y,w,h);
        stroke(c,[[x+1,y+1],[x+w-1,y+1]],'#e2cea066');
        stroke(c,[[x+1,y+h],[x+w-1,y+h]],'#51412d99',1.3);
        if(overview)continue;
        // Broken, slightly wandering grain runs along each individual board.
        for(let g=0;g<8;g++){
            const gx=x+2+rng.float()*(w-4), gy=y+3+rng.float()*(h-15);
            const end=Math.min(y+h-3,gy+12+rng.float()*65);
            stroke(c,[[gx,gy],[gx+Math.sin(g+i)*.8,(gy+end)/2],[gx+.3,end]],
                g%3?'#58432a30':'#f5dfac45',g%3?.65:.8);
        }
        if(i%3===1){
            const ky=y+h*(.25+rng.float()*.5), kx=x+w*.52;
            for(let ring=3;ring>=1;ring--){
                c.beginPath();c.ellipse(kx,ky,ring*.85,ring*2.8,0,0,Math.PI*2);
                c.strokeStyle='#5c442d50';c.lineWidth=.7;c.stroke();
            }
            stroke(c,[[kx,ky-2],[kx+.3,ky+3]],'#59412d99');
        }
        // Recessed iron fasteners, with a tiny reflected highlight.
        for(const ny of [y+10,y+h-10]){
            c.beginPath();c.arc(x+w/2,ny,1.6,0,Math.PI*2);c.fillStyle='#504733';c.fill();
            c.fillStyle='#e4cfa17a';c.fillRect(x+w/2-.7,ny-1,.9,.7);
        }
    }
    // Low longitudinal edge beams: open bridge ends, no picture-frame border.
    if(!bridge.edges)for(const y of [top,top+width-7]){
        c.fillStyle='#493b2990';c.fillRect(left,y+5,length,5);
        const beam=c.createLinearGradient(0,y,0,y+7);
        beam.addColorStop(0,'#d0b78a');beam.addColorStop(.25,'#aa9063');beam.addColorStop(1,'#695334');
        c.fillStyle=beam;c.fillRect(left-2,y,length+4,7);
        if(!overview){
            stroke(c,[[left+5,y+3],[0,y+2.5],[length/2-5,y+3.5]],'#59422b55',.7);
            for(const x of [left+7,length/2-7]){
                c.fillStyle='#514633';c.fillRect(x,y+2,2,2);
            }
        }
    }
    // Gentle end weathering blends the timber into the sandy approaches.
    for(const end of [-1,1]){
        const x=end<0?left:left+length;
        const fade=c.createLinearGradient(x,0,x-end*14,0);
        fade.addColorStop(0,'#c7b38938');fade.addColorStop(1,'#c7b38900');
        c.fillStyle=fade;c.fillRect(end<0?x:x-14,top+7,14,width-14);
    }
    c.restore();
}

export function paintBridges(c,bridges,palette,overview=false,rect=null){
    if(rect)bridges=bridges.filter(bridge=>{
        const angle=bridge.angle??Math.PI/2,length=bridge.angle==null?bridge.h:bridge.w,width=bridge.angle==null?bridge.w:bridge.h;
        const dx=(Math.abs(Math.cos(angle))*length+Math.abs(Math.sin(angle))*width)/2+24,dy=(Math.abs(Math.sin(angle))*length+Math.abs(Math.cos(angle))*width)/2+24;
        return bridge.x+dx>=rect.x&&bridge.x-dx<=rect.x+rect.w&&bridge.y+dy>=rect.y&&bridge.y-dy<=rect.y+rect.h;
    });
    // Shade first, all decks next, exposed edges last: connected branches
    // cannot cast shadows or run their edge beams across another walkway.
    for(const b of bridges)paintBridge(c,b,palette,overview,'shadow');
    for(const b of bridges)paintBridge(c,b,palette,overview,'deck');
    c.save();c.lineCap='butt';
    for(const b of bridges)for(const edge of b.edges||[]){
        const {a,b:p}=edge;
        const length=Math.hypot(p.x-a.x,p.y-a.y);
        const nx=-(p.y-a.y)/length,ny=(p.x-a.x)/length;
        if(!edge.side){
            stroke(c,[[a.x,a.y],[p.x,p.y]],'#735b3c88',1.5);
            continue;
        }
        const points=offset=>[[a.x+nx*offset,a.y+ny*offset],[p.x+nx*offset,p.y+ny*offset]];
        stroke(c,points(.5),'#4c3a28',3);
        stroke(c,points(3.5),'#927449',6);
        stroke(c,points(5),'#ccb083',1.3);
        if(!overview&&length>18){
            for(const t of [.08,.92]){
                const x=a.x+(p.x-a.x)*t+nx*3,y=a.y+(p.y-a.y)*t+ny*3;
                c.fillStyle='#514633';c.beginPath();c.arc(x,y,1.3,0,Math.PI*2);c.fill();
            }
        }
    }
    c.restore();
}
