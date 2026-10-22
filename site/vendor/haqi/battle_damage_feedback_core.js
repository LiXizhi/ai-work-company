// Driven by confirmed damage, including zero-pip attacks, reflection and DoT.
// A group hit shares one camera impulse instead of adding N screen shakes.
export function battleDamageFeedback(event,progress=0,reactions=[],reduced=false){
    const hits=['damage','dot'].includes(event?.type)&&event.amount>0
        ?[{target:event.target,progress,settled:!!event.recoilPlayed}]
        :event?.type==='cast'?reactions:[];
    let x=0,y=0,strongest=0;
    for(const hit of hits){
        const p=Math.max(0,Math.min(1,hit.progress)),envelope=Math.min(1,p/.045)*Math.max(0,1-p/.62);
        const strength=envelope*(hit.settled?.55:1);
        if(strength>strongest){strongest=strength;x=Math.sin(p*53)*4*strength;y=Math.cos(p*41)*2.5*strength;}
    }
    return {hits,shakeX:reduced?0:x,shakeY:reduced?0:y};
}
