// Transient arrival feedback; never written to the character save.
export const TELEPORT_EFFECT_MS=1000;

export function drawTeleportEffect(ctx,effect,time,reducedMotion=false){
    if(!effect)return;
    const progress=(time-effect.started)/TELEPORT_EFFECT_MS;
    if(progress<0||progress>=1)return;
    const alpha=Math.sin(Math.PI*progress);
    ctx.save();
    ctx.translate(effect.x,effect.y);
    ctx.globalAlpha=alpha;
    ctx.strokeStyle='#fff0b0';ctx.lineWidth=3;
    ctx.fillStyle='#77dce955';
    ctx.beginPath();ctx.ellipse(0,0,48,20,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(!reducedMotion){
        const beam=ctx.createLinearGradient(0,-155,0,0);
        beam.addColorStop(0,'#b4f6ff00');beam.addColorStop(1,'#a4efff99');
        ctx.fillStyle=beam;ctx.fillRect(-32,-155,64,155);
        ctx.strokeStyle='#a9f5ff';ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(0,0,32+progress*36,13+progress*15,0,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle='#fff5bf';
        for(let i=0;i<12;i++){
            const angle=i*Math.PI/6+progress*2;
            const x=Math.cos(angle)*39,y=Math.sin(angle)*15-((progress*110+i*11)%130);
            ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();
        }
    }
    ctx.restore();
}
