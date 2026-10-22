// Screen-facing half of the foot ring. Draw after actors/pets so companions
// cannot cover the mana markers; this does not affect combat or targeting.
export function drawBattlePips(ctx,at,pips,{hp=1}={}) {
    if(!at)return;
    const normal=Math.max(0,Math.min(7,Math.floor(pips?.normal||0)));
    const power=Math.max(0,Math.min(7-normal,Math.floor(pips?.power||0)));
    ctx.save();
    ctx.lineWidth=1;
    const opacity=ctx.globalAlpha;
    for(let i=0;i<7;i++){
        const angle=Math.PI*(.1+i*.8/6);
        const x=at.x-Math.cos(angle)*27,y=at.y-5+Math.sin(angle)*10;
        const kind=hp<=0||i>=normal+power?'empty':i<normal?'normal':'power';
        ctx.globalAlpha=opacity*(kind==='empty'?.35:1);
        ctx.fillStyle=kind==='power'?'#ffdc69':kind==='normal'?'#99eaff':'#28474b';
        ctx.strokeStyle=kind==='empty'?'#8d9f91':'#173843';
        ctx.shadowColor=kind==='power'?'#ffd458':kind==='normal'?'#78dfff':'transparent';
        ctx.shadowBlur=kind==='empty'?0:4;
        ctx.beginPath();ctx.arc(x,y,kind==='empty'?2:2.8,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    ctx.restore();
}
