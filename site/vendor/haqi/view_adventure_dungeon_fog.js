// View-only mist. Walked trails remain revealed through device-local exploration.
export function createDungeonFog(){
    let canvas=null;
    return function paint(c,world,position,rect,scale=1,explored=0){
        if(!world.layout?.route)return;
        const width=Math.max(1,Math.ceil(rect.w*scale)),height=Math.max(1,Math.ceil(rect.h*scale));
        canvas??=document.createElement('canvas');
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        const g=canvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,width,height);
        const color=world.layout.baseBiome==='snow'?'#899eaf':'#263b46';
        g.fillStyle=color;g.globalAlpha=1;g.fillRect(0,0,width,height);g.globalAlpha=1;
        g.setTransform(scale,0,0,scale,-rect.x*scale,-rect.y*scale);
        g.save();g.beginPath();g.rect(100,100,world.w-200,world.h-200);g.clip();
        g.globalCompositeOperation='destination-out';
        const reveal=(x,y,r)=>{
            if(x+r<rect.x||x-r>rect.x+rect.w||y+r<rect.y||y-r>rect.y+rect.h)return;
            const glow=g.createRadialGradient(x,y,r*.48,x,y,r);
            glow.addColorStop(0,'#000');glow.addColorStop(.7,'#000d');glow.addColorStop(1,'#0000');
            g.fillStyle=glow;g.fillRect(x-r,y-r,r*2,r*2);
        };
        const next=world.encounters[0];
        const end=next?world.layout.route.findIndex(p=>p.x===next.x&&p.y===next.y):world.layout.route.length;
        const camps=Object.values(world.layout.encounterPositions);
        let exploredEnd=next?1:world.layout.route.length-1;
        if(next)for(let i=2;i<end;i++){
            const p=world.layout.route[i];
            if(camps.some(([x,y])=>x===p.x&&y===p.y))exploredEnd=i;
        }
        let remaining=Number.isFinite(explored)?Math.max(0,explored):0;
        // Legacy saves still reveal cleared sections; current saves also remember walking.
        const clearedDistance=world.paths.slice(0,exploredEnd).reduce((sum,p)=>sum+Math.hypot(p.b.x-p.a.x,p.b.y-p.a.y),0);
        remaining=Math.max(remaining,clearedDistance);
        for(const {a,b} of world.paths){
            const length=Math.hypot(b.x-a.x,b.y-a.y),reach=Math.min(length,remaining);
            const steps=Math.ceil(reach/45);
            for(let j=0;j<=steps;j++){
                const t=length?reach*(steps?j/steps:0)/length:0;
                reveal(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,390);
            }
            remaining-=length;if(remaining<=0)break;
        }
        reveal(position.x,position.y,390);
        g.restore();g.globalCompositeOperation='source-over';
        // Keep the map perimeter concealed even when the spawn reveal reaches it.
        // The opaque outer 100 units also cover beach strokes on the square coast.
        const edge=220,opaque=100;
        for(const [x0,y0,x1,y1,x,y,w,h] of [
            [opaque,0,edge,0,0,0,edge,world.h],
            [world.w-opaque,0,world.w-edge,0,world.w-edge,0,edge,world.h],
            [0,opaque,0,edge,0,0,world.w,edge],
            [0,world.h-opaque,0,world.h-edge,0,world.h-edge,world.w,edge]]){
            const fade=g.createLinearGradient(x0,y0,x1,y1);fade.addColorStop(0,color);fade.addColorStop(1,color+'00');
            g.fillStyle=fade;g.fillRect(x,y,w,h);
        }
        c.drawImage(canvas,rect.x,rect.y,rect.w,rect.h);
    };
}
