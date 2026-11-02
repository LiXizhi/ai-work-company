// Shared world/home idle lift in world pixels; callers keep ground shadows fixed.
export function petIdleLift(time,reduced=false){return reduced?0:Math.sin(time/1000*2)*1.5;}

// Sleep uses the atlas fourth column at its original aspect ratio.
export function drawPetMood(ctx,mood,time,reduced,size,draw){
    const t=time/1000;
    ctx.save();
    if(mood==='sad'){ctx.scale(1,.9);ctx.rotate(reduced?.04:.04+Math.sin(t*2)*.025);}
    const result=draw(mood==='sleeping'?3:0);ctx.restore();
    ctx.save();ctx.lineWidth=1.5;ctx.lineCap='round';
    if(mood==='sad'){
        const x=size*.3,y=-size*.65+(reduced?0:(t%1)*7);ctx.fillStyle='#8fc8e0';ctx.beginPath();ctx.moveTo(x,y-5);ctx.quadraticCurveTo(x-6,y+3,x,y+4);ctx.quadraticCurveTo(x+6,y+3,x,y-5);ctx.fill();
    }else if(mood==='happy'){
        ctx.strokeStyle='#e6bc66';for(const side of [-1,1]){const x=side*size*.42,y=-size*.65-(reduced?0:Math.sin(t*5)*3);ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x+3,y);ctx.moveTo(x,y-3);ctx.lineTo(x,y+3);ctx.stroke();}
    }
    ctx.restore();return result;
}
