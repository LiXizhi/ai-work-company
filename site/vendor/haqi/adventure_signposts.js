import { tr } from './locale_runtime.js';

function polygon(c, points, color) {
    c.beginPath();
    points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));
    c.closePath();c.fillStyle=color;c.fill();
}

const SIGN_FONT='600 12px "PingFang SC", "Microsoft YaHei", sans-serif';

// Measure only when baking a sprite. Prefer word boundaries, or characters for
// CJK / unbroken names, and keep at most two balanced lines.
export function layoutSignpostLabel(c,label) {
    c.font=SIGN_FONT;c.textAlign='center';c.textBaseline='middle';
    const text=String(label).replace(/\s+/gu,' ').trim();
    const measure=line=>{
        const m=c.measureText(line);
        return Math.max(m.width,2*(m.actualBoundingBoxLeft||0),2*(m.actualBoundingBoxRight||0));
    };
    let lines=[text];
    if(measure(text)>148){
        const chars=Array.from(text),wordBreaks=[];
        for(let i=1;i<chars.length;i++)if(/\s/u.test(chars[i]))wordBreaks.push(i);
        const breaks=wordBreaks.length?wordBreaks:chars.slice(1).map((_,i)=>i+1);
        let best=Infinity;
        for(const split of breaks){
            const candidate=[chars.slice(0,split).join('').trim(),chars.slice(split).join('').trim()];
            const score=Math.max(...candidate.map(measure));
            if(candidate.every(Boolean)&&score<best){best=score;lines=candidate;}
        }
    }
    const textWidth=Math.max(...lines.map(measure)),boardWidth=Math.min(180,Math.max(92,Math.ceil(textWidth)+32));
    const extra=lines.length===2?7:0,innerWidth=boardWidth-28,innerHeight=20+extra*2;
    const lineHeight=14;
    const metrics=lines.map(line=>c.measureText(line));
    const top=Math.min(...metrics.map((m,i)=>i*lineHeight-(m.actualBoundingBoxAscent??8)));
    const bottom=Math.max(...metrics.map((m,i)=>i*lineHeight+(m.actualBoundingBoxDescent??4)));
    // Reserve space for the engraved highlight too; uniform scaling preserves glyphs.
    const scale=Math.min(1,(innerWidth-2)/Math.max(1,textWidth),(innerHeight-2)/Math.max(1,bottom-top));
    return {lines,boardWidth,extra,innerWidth,innerHeight,scale,lineHeight,baseline:-(top+bottom)/2};
}

// Small, fixed-resolution sprites: grain, lettering and shading are baked once.
// The bounded cache belongs to the renderer; no textures or network IO required.
export function createSignpostPainter() {
    const sprites=new Map(),resolution=3;
    return function drawSignpost(ctx,label,x,y) {
        const shown=tr(label);
        let sprite=sprites.get(shown);
        if(!sprite){
            const canvas=document.createElement('canvas'),c=canvas.getContext('2d');
            const layout=layoutSignpostLabel(c,shown);
            const {boardWidth,extra,innerWidth,innerHeight}=layout;
            const width=boardWidth+32,height=80+extra,half=boardWidth/2,anchor=70+extra;
            canvas.width=width*resolution;canvas.height=height*resolution;
            c.scale(resolution,resolution);c.translate(width/2,anchor);
            c.fillStyle='#30291926';c.beginPath();c.ellipse(7,1,23,5,-.12,0,Math.PI*2);c.fill();
            polygon(c,[[-3,1],[17,-3],[half+13,-10],[half+8,-14],[-4,-5]],'#30291916');
            // Tapered post, lit on the left, darkened under the plank.
            polygon(c,[[-4,1],[-5,-57],[3,-59],[4,0]],'#715035');
            polygon(c,[[-4,0],[-5,-57],[-2,-57],[-1,0]],'#b68b54');
            polygon(c,[[2,0],[1,-57],[4,-56],[4,0]],'#493924');
            c.strokeStyle='#503c2880';c.lineWidth=.7;
            c.beginPath();c.moveTo(-1,-4);c.lineTo(-2,-20);c.lineTo(0,-29);c.stroke();
            polygon(c,[[-5,-29],[4,-29],[4,-24],[-5,-26]],'#35281f66');
            c.save();c.translate(0,-46);c.rotate(-.035);
            const outline=[[-half+3,-15],[-half+24,-16],[half-5,-14],[half,-11],
                [half-1,0],[half-3,2],[half,4],[half-1,14],[half-22,15],
                [-half+2,14],[-half,10],[-half+1,1],[-half+3,-1],[-half,-3]]
                .map(([px,py])=>[px,py+Math.sign(py)*extra]);
            c.save();c.translate(2,3);polygon(c,outline,'#543b28');c.restore();
            const wood=c.createLinearGradient(0,-16-extra,0,16+extra);
            wood.addColorStop(0,'#cba36a');wood.addColorStop(.45,'#ae804b');wood.addColorStop(1,'#916337');
            polygon(c,outline,wood);
            c.save();c.clip();
            // Fixed grain paths stay deterministic without consuming gameplay RNG.
            for(let i=0;i<9;i++){
                const gy=-13-extra+i*(3.2+extra/4);
                c.strokeStyle=i%3===0?'#f2d39940':'#593b282e';c.lineWidth=i%3===0?.7:.5;
                c.beginPath();c.moveTo(-half,gy);
                c.bezierCurveTo(-half*.4,gy-2,half*.2,gy+2,half,gy-1);c.stroke();
            }
            c.strokeStyle='#61432b66';c.lineWidth=.65;
            c.beginPath();c.ellipse(-half+16,8,5,1.5,0,0,Math.PI*2);c.stroke();
            c.beginPath();c.moveTo(half,-9);c.lineTo(half-15,-7);c.lineTo(half-5,-7.5);
            c.moveTo(-half,11);c.lineTo(-half+11,10);c.stroke();
            c.restore();
            c.strokeStyle='#ebc78c99';c.lineWidth=1;
            c.beginPath();c.moveTo(-half+4,-14-extra);c.lineTo(-half+24,-15-extra);c.lineTo(half-6,-13-extra);c.stroke();
            for(const nx of [-half+8,half-8]){
                c.fillStyle='#523c2a';c.beginPath();c.arc(nx,0,1.8,0,Math.PI*2);c.fill();
                c.fillStyle='#bbb19a';c.beginPath();c.arc(nx-.4,-.5,.8,0,Math.PI*2);c.fill();
            }
            // Hard safety boundary inside the wood and clear of the nail heads.
            c.save();c.beginPath();c.rect(-innerWidth/2,-innerHeight/2,innerWidth,innerHeight);c.clip();
            c.scale(layout.scale,layout.scale);c.font=SIGN_FONT;c.textAlign='center';c.textBaseline='middle';
            layout.lines.forEach((line,i)=>{
                const baseline=layout.baseline+i*layout.lineHeight;
                c.fillStyle='#e3bb7a';c.fillText(line,.3,baseline+.7);
                c.fillStyle='#3e3022';c.fillText(line,0,baseline);
            });
            c.restore();
            c.restore();
            sprite={canvas,width,height,anchor};
            if(sprites.size>=128)sprites.delete(sprites.keys().next().value);
            sprites.set(shown,sprite);
        }
        ctx.drawImage(sprite.canvas,x-sprite.width/2,y-sprite.anchor,sprite.width,sprite.height);
    };
}
