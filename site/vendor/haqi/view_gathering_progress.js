// Shared screen-space collection UI for plants and ancestral memories.
export function drawGatheringProgress(ctx,point,progress,label,owner=0){
    ctx.save();ctx.strokeStyle='#173b3680';ctx.lineWidth=5;ctx.beginPath();ctx.arc(point.x,point.y-18,19,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle=owner?'#91d8ff':'#ffe8a0';ctx.beginPath();ctx.arc(point.x,point.y-18,19,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();
    ctx.fillStyle='#fff8d0';ctx.font='12px sans-serif';ctx.textAlign='center';
    ctx.shadowColor='#10251f';ctx.shadowBlur=4;ctx.shadowOffsetX=0;ctx.shadowOffsetY=2;
    ctx.fillText(label,point.x,point.y-45);ctx.restore();
}
