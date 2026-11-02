// Ground tint only: authored territory and perception distances still govern gameplay.
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

export function drawMonsterTerritory(ctx,encounter,hero,params,time,reducedMotion=false) {
    const radius=params.territoryRadius;
    if(!(radius>0))return;
    const distance=Math.hypot(hero.x-encounter.x,hero.y-encounter.y);
    const band=Math.max(1,radius*(params.perceptionMultiplier-1));
    // Finish fading in during the outer third of the perception band. Applying
    // the full distance fade on top of spatial feathering made nearby hints vanish.
    const proximity=smooth((radius+band-distance)/(band*.35));
    if(!proximity)return;
    // Continuous across the warning boundary: no sudden green/red colour switch.
    const inside=smooth((radius-distance)/(radius*.3));
    const phase=encounter.x*.031+encounter.y*.017;
    const breath=reducedMotion?1:.97+.03*Math.sin(time*1.3+phase);
    const opacity=proximity*(.24+.13*inside)*breath;
    ctx.save();ctx.translate(encounter.x,encounter.y);
    const mist=(x,y,size,alpha)=>{
        const gradient=ctx.createRadialGradient(x,y,0,x,y,size);
        gradient.addColorStop(0,`rgba(143,65,49,${alpha})`);
        gradient.addColorStop(.42,`rgba(143,65,49,${alpha*.95})`);
        gradient.addColorStop(.72,`rgba(143,65,49,${alpha*.65})`);
        gradient.addColorStop(1,'rgba(143,65,49,0)');
        ctx.fillStyle=gradient;ctx.fillRect(x-size,y-size,size*2,size*2);
    };
    mist(0,0,radius,opacity);
    // Unequal, fixed patches break the perfect disc without animated smoke or hard edges.
    for(let i=0;i<3;i++){
        const angle=phase+i*Math.PI*2/3;
        mist(Math.cos(angle)*radius*.36,Math.sin(angle)*radius*.36,
            radius*(.48+i*.045),opacity*.24);
    }
    ctx.restore();
}
