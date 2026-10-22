// Canvas presentation. All card choices/timing/art references live in spell-effects.json.
import { effectParticles, spellEffect } from './spell_effects_core.js';
import {spellChoreography,subjectPose} from './spell_choreography_core.js';
import {cachedRunePath} from './spell_render_cache.js';
const TAU=Math.PI*2,clamp=v=>Math.max(0,Math.min(1,v));
function disc(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,Math.max(.1,r),0,TAU);c.fill();}
function line(c,points,color,width=2){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function rune(c,x,y,r,t,color){
    const path=cachedRunePath();
    c.save();c.translate(x,y);c.scale(1,.42);c.rotate(t*TAU*.3);c.strokeStyle=color;
    if(path){c.scale(r,r);c.lineWidth=2/r;c.stroke(path);}
    else {c.lineWidth=2;c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();c.beginPath();c.arc(0,0,r*.8,0,TAU);c.stroke();for(let i=0;i<10;i++){c.save();c.rotate(i*TAU/10);c.strokeRect(r*.87,-3,6,6);c.restore();}c.beginPath();for(let i=0;i<=5;i++){const a=i*TAU*2/5;c.lineTo(Math.cos(a)*r*.75,Math.sin(a)*r*.75);}c.stroke();}
    c.restore();
}
function shard(c,x,y,size,angle,color){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.beginPath();c.moveTo(0,-size*2.4);c.lineTo(size*.5,0);c.lineTo(0,size*.65);c.lineTo(-size*.5,0);c.closePath();c.fill();c.strokeStyle='#ffffffb0';c.lineWidth=.8;c.stroke();c.restore();}
// Faceted masses and blades are silhouettes, not oversized arrow-shaped particles.
function rock(c,x,y,r,rotation,palette) {
    const [primary,light,dark]=palette;c.save();c.translate(x,y);c.rotate(rotation);
    const points=Array.from({length:9},(_,i)=>{const a=i*TAU/9,rr=r*(.82+.16*Math.sin(i*9+1));return [Math.cos(a)*rr,Math.sin(a)*rr];});
    for(let i=0;i<points.length;i++){c.fillStyle=[dark,primary,light,primary,dark][i%5];c.beginPath();c.moveTo(-r*.18,-r*.22);c.lineTo(...points[i]);c.lineTo(...points[(i+1)%points.length]);c.closePath();c.fill();}
    c.shadowBlur=0;line(c,[...points,points[0]],light,1.2);line(c,[points[6],[-r*.18,-r*.22],points[2]],light+'aa',1);c.restore();
}
function sword(c,x,y,size,angle,palette) {
    const [primary,light,dark]=palette;c.save();c.translate(x,y);c.rotate(angle);
    c.fillStyle=primary;c.beginPath();c.moveTo(size*1.6,0);c.lineTo(size*.65,-size*.20);c.lineTo(-size*.7,-size*.17);c.lineTo(-size*.7,size*.17);c.lineTo(size*.65,size*.20);c.closePath();c.fill();
    c.fillStyle=light;c.beginPath();c.moveTo(size*1.6,0);c.lineTo(-size*.7,0);c.lineTo(-size*.7,-size*.17);c.lineTo(size*.65,-size*.20);c.closePath();c.fill();
    line(c,[[-size*.8,-size*.42],[-size*.68,0],[-size*.8,size*.42]],light,2);
    line(c,[[-size*.7,0],[-size*1.1,0]],dark,4);disc(c,-size*1.15,0,2,light);c.restore();
}
function mist(c,x,y,r,color,alpha) {
    c.save();c.globalAlpha*=alpha;c.shadowBlur=0;
    const g=c.createRadialGradient(x,y,0,x,y,Math.max(1,r));g.addColorStop(0,color);g.addColorStop(1,color+'00');disc(c,x,y,r,g);c.restore();
}
// One persistent arena-sized ring; drawn behind actors so hits never change its depth.
export function drawArenaEnvironment(c,{palette,center,radius,aspect=.54,time=0,reducedMotion=false,strength=1}){
    if(!center||!(radius>0)||strength<=0)return;
    const [primary,light]=palette,rotation=reducedMotion?0:time*.22;
    c.save();c.translate(center.x,center.y);c.scale(1,aspect);c.rotate(rotation);
    c.globalAlpha*=strength;c.shadowColor=primary;c.shadowBlur=12;
    c.strokeStyle=primary;c.lineWidth=8;c.beginPath();c.arc(0,0,radius,0,TAU);c.stroke();
    c.shadowBlur=0;c.strokeStyle=light;c.lineWidth=1.5;
    for(const factor of [.96,1.035]){c.beginPath();c.arc(0,0,radius*factor,0,TAU);c.stroke();}
    for(let i=0;i<20;i++){
        const a=i*TAU/20;c.save();c.rotate(a);c.strokeStyle=i%2?primary:light;
        c.beginPath();c.moveTo(radius*.985,-4);c.lineTo(radius*1.065,0);c.lineTo(radius*.985,4);c.stroke();
        c.beginPath();c.arc(0,0,radius*1.065,.035,.20);c.stroke();c.restore();
    }
    c.restore();
}
function discs(c,color,items){
    c.fillStyle=color;c.beginPath();
    for(const [x,y,r] of items){const rr=Math.max(.1,r);c.moveTo(x+rr,y);c.arc(x,y,rr,0,TAU);}
    c.fill();
}
function supportEffect(c,kind,{a,b,to,center,radius,scale,p,palette,particles,assets}) {
    const [primary,light,dark]=palette,r=radius,fade=Math.sin(p*Math.PI),ground=to.y;
    c.save();c.globalAlpha*=fade;
    if(['absorb','reflect'].includes(kind)) {
        c.fillStyle=primary+'18';c.strokeStyle=light;c.lineWidth=2*scale;
        c.beginPath();c.ellipse(b.x,b.y,r*.75,r,0,0,TAU);c.fill();c.stroke();
        for(let i=0;i<6;i++){const ang=p*2+i*TAU/6,px=b.x+Math.cos(ang)*r*.65,py=b.y+Math.sin(ang)*r*.8;c.strokeStyle=primary;c.beginPath();for(let j=0;j<=6;j++)c.lineTo(px+Math.cos(j*TAU/6)*r*.18,py+Math.sin(j*TAU/6)*r*.18);c.stroke();}
        if(kind==='reflect'){const q=(p*2)%1;line(c,[[b.x+r*1.3*(1-q),b.y-r*.8],[b.x+r*.5,b.y],[b.x+r*1.3*q,b.y+r*.8]],light,3*scale);}
    } else if(['aura','enrage'].includes(kind)) {
        const at=kind==='aura'?(center||b):b;rune(c,at.x,at.y,r*1.65,p,primary);rune(c,at.x,at.y,r*1.3,-p,light);
        discs(c,primary,particles.groups[40].map(v=>{const q=(v.phase+p)%1,ang=v.angle+p*3;return [at.x+Math.cos(ang)*r*1.45,at.y+Math.sin(ang)*r*.4-q*r*1.6,v.size*scale];}));
    } else if(['cleanse','steal'].includes(kind)) {
        const q=clamp(p*1.3),cx=kind==='steal'?b.x+(a.x-b.x)*q:b.x,cy=kind==='steal'?b.y+(a.y-b.y)*q:b.y;
        for(let i=0;i<3;i++){c.strokeStyle=i%2?light:primary;c.lineWidth=2*scale;c.beginPath();c.arc(cx,cy,r*(.3+p*.8),p*8+i*TAU/3,p*8+i*TAU/3+1.3);c.stroke();}
        discs(c,light,particles.groups[24].map(v=>[cx+Math.cos(v.angle+p*5)*r*(1-q),cy+Math.sin(v.angle+p*5)*r*(1-q),v.size*scale]));
    } else if(kind==='stun') {
        for(let i=0;i<5;i++){const ang=i*TAU/5+p*6,x=b.x+Math.cos(ang)*r*.7,y=b.y-r*.75+Math.sin(ang)*r*.22;c.fillStyle=light;c.beginPath();for(let j=0;j<10;j++){const rr=(j%2?3:8)*scale;c.lineTo(x+Math.cos(j*Math.PI/5)*rr,y+Math.sin(j*Math.PI/5)*rr);}c.closePath();c.fill();}
        rune(c,b.x,ground,r*.6,p,primary);
    } else if(kind==='freeze') {
        for(let i=0;i<7;i++){const ang=i*TAU/7;shard(c,b.x+Math.cos(ang)*r*.65,ground+Math.sin(ang)*r*.2-r*.55,25*scale*(.3+fade),Math.cos(ang)*.3,primary);}
        line(c,[[b.x-r*.6,b.y-r*.5],[b.x+r*.6,b.y+r*.3]],light,2*scale);
    } else if(kind==='stealth') {
        for(let i=0;i<6;i++){c.strokeStyle=primary;c.lineWidth=3*scale;c.beginPath();c.ellipse(b.x,b.y+i*9*scale-r*.3,r*(.3+i*.08),r*.17,p*.3,0,Math.PI*1.6);c.stroke();}
    } else if(kind==='pips') {
        for(let i=0;i<7;i++){const ang=i*TAU/7,q=clamp(p*1.4-i*.035),x=b.x+Math.cos(ang)*r*(1-q),y=b.y-r+q*r;mist(c,x,y,10*scale,'#ffdb70',.7);disc(c,x,y,4*scale,'#fff1a0');}
    } else if(['capture','pet'].includes(kind)) {
        rune(c,b.x,ground,r,p,primary);
        if(kind==='pet')assets.tile?.(c,'creatures',6,b.x-r*.5,ground-r,r,r);
        else {c.strokeStyle=light;c.lineWidth=2*scale;for(let i=0;i<5;i++){c.beginPath();c.ellipse(b.x,b.y,r*(1-p*.4),r*(.4+i*.15),i*.4,0,TAU);c.stroke();}}
    } else if(kind==='dissolve') {
        discs(c,primary,particles.groups[32].map(v=>[b.x+Math.cos(v.angle)*r*p,b.y+Math.sin(v.angle)*r*p-p*r,v.size*scale*(1-p)]));
    } else if(kind==='pass') {
        c.strokeStyle=primary;c.lineWidth=2*scale;c.beginPath();c.arc(b.x,b.y,r*.4,p*TAU,p*TAU+Math.PI*1.5);c.stroke();
    }
    c.restore();
}
// Seeded elemental accents: gathering at the caster, then dispersal at the target.
function elementalParticles(c,school,{a,b,radius:r,scale,p,flight,hit,particles,palette:[primary,light],friendly,echo}) {
    const gather=clamp(p/.3),at=p<.3?a:b;
    c.save();c.globalCompositeOperation='lighter';c.shadowBlur=0;
    for(const v of particles.groups[echo?24:48]) {
        const q=(v.phase+p*1.3)%1,angle=v.angle+p*(school==='storm'?9:3);
        const spread=r*(p<.3?1.4-gather: .45+q*.9),x=at.x+Math.cos(angle)*spread*v.speed,y=at.y+Math.sin(angle)*spread*.55-q*r*.6;
        c.save();c.globalAlpha*=Math.sin(q*Math.PI)*.7;const size=(v.size+1)*scale;
        if(school==='ice') {shard(c,x,y,size,angle,light);if(v.phase<.18)mist(c,x,y,14*scale,primary,.12);}
        else if(school==='fire') {line(c,[[x,y+size*4],[x+Math.sin(angle)*size,y]],primary,size);disc(c,x,y,size*.7,light);}
        else if(school==='storm') {line(c,[[x-size*2,y+size],[x,y-size],[x+size,y+size*.5],[x+size*3,y-size*2]],v.phase>.5?light:primary,1.2*scale);}
        else if(school==='life') {c.translate(x,y);c.rotate(angle);c.fillStyle=v.phase>.5?light:primary;c.beginPath();c.ellipse(0,0,size*2,size*.65,0,0,TAU);c.fill();}
        else if(school==='death') {c.strokeStyle=primary;c.lineWidth=size;c.beginPath();c.arc(x,y,size*2,angle,angle+Math.PI*1.4);c.stroke();disc(c,x,y,size*.6,light);}
        else {shard(c,x,y,size,angle,light);}
        c.restore();
    }
    // Arc-shaped charge filaments keep the image connected to the spell's source.
    if(p<.32)for(let i=0;i<3;i++){c.strokeStyle=i%2?light:primary;c.lineWidth=1.2*scale;c.beginPath();c.ellipse(a.x,a.y,r*(1.3-gather*.5),r*.5,i*.7,p*12+i*2,p*12+i*2+1.7);c.stroke();}
    if(hit>0&&!friendly){c.globalAlpha*=1-hit;for(let i=0;i<8;i++){const angle=i*TAU/8,inner=r*(.2+hit),outer=inner+r*.32*(1-hit);line(c,[[b.x+Math.cos(angle)*inner,b.y+Math.sin(angle)*inner*.6],[b.x+Math.cos(angle)*outer,b.y+Math.sin(angle)*outer*.6]],light,2*scale);}}
    c.restore();
}
export function createSpellEffects(assets) {
    const config=assets.effects,cache=new Map(),specs=new Map();
    function resolve(card){
        if(!card)return null;
        if(!specs.has(card.key)){const spec=spellEffect(config,card);spec.choreography??=spellChoreography(spec,card);specs.set(card.key,spec);}
        return specs.get(card.key);
    }
    function atlasEffect(c,spec,{a,b,origin,to,center,radius,scale,p,flight,hit,particles,centered,echo}) {
        const art=assets.skillArt,entry=art?.manifest.bases[spec.base];if(!entry)return false;
        const color=spec.palette[0];
        let x=b.x,y=b.y,size=radius*2.9,angle=0;
        if(centered){
            if(echo)return true; // One summon, even when its attack hits several targets.
            x=origin.x;y=origin.y-radius*.8;
            size=radius*3.6*(.8+.2*clamp(p/.2));
        }
        const pose=subjectPose(spec.choreography,{p,flight,hit,radius,a,b,center:{x:origin.x,y:origin.y-radius*.8},ground:to.y});
        x=pose.x;y=pose.y;angle=pose.angle;
        c.save();c.shadowBlur=0;c.globalAlpha*=pose.alpha;c.translate(x,y);c.rotate(angle);c.scale(pose.sx,pose.sy);
        const drawn=art.drawSubject(c,spec.base,-size/2,-size/2,size,size,p);
        c.restore();if(!drawn)return false;
        const groundY=centered?origin.y:to.y;
        rune(c,centered?origin.x:b.x,groundY,radius*(.7+hit*.4),p,color);
        if(spec.variantAura.color){c.save();c.globalAlpha*=.5;for(let i=0;i<spec.variantAura.rings;i++)rune(c,x,groundY,radius*(1+i*.15),p,spec.variantAura.color);c.restore();}
        discs(c,color,particles.groups[24].map(v=>{
            const q=(p+v.phase)%1,spread=radius*(.5+q*.8);
            return [x+Math.cos(v.angle+p)*spread,y+Math.sin(v.angle+p)*spread*.5-q*radius*.4,v.size*scale*(1-q)];
        }));
        if(hit>0&&!spec.friendly){c.save();c.globalAlpha*=1-hit;c.strokeStyle=spec.palette[1];c.lineWidth=3*scale;c.beginPath();c.ellipse(b.x,to.y,radius*(.5+hit*1.5),radius*(.2+hit*.4),0,0,TAU);c.stroke();c.restore();}
        return true;
    }
    function draw(c,{card,spec,progress,from,to,center,width,height,seed=0,reducedMotion=false,failed=false,echo=false,reflection=false,environmentManaged=false,arenaRadius,arenaAspect,visualScale=1}) {
        if(!spec||!from||!to)return;
        const p=clamp(progress),col=spec.palette,[primary,light,dark]=col;
        if(spec.choreography.placement==='field'&&!failed){
            if(echo)return;
            if(p<config.timeline.impact){c.save();c.globalAlpha*=Math.sin(p/config.timeline.impact*Math.PI)*.8;rune(c,from.x,from.y,Math.min(width,height)*.12,reducedMotion?0:p,primary);c.restore();}
            else if(!environmentManaged)drawArenaEnvironment(c,{palette:col,center,radius:arenaRadius??Math.min(width*.4,height*.62),aspect:arenaAspect??.54,time:p*spec.duration/1000,reducedMotion,strength:clamp((p-config.timeline.impact)/.1)});
            return;
        }
        const scale=Math.min(1,width/650,height/330)*visualScale,radius=70*scale*spec.scale;
        const centered=['center','field'].includes(spec.choreography.placement);
        const origin=centered&&!failed?(center||{x:(from.x+to.x)/2,y:(from.y+to.y)/2}):from;
        const a={x:origin.x,y:origin.y-52*(origin.scale??visualScale)*Math.min(1,width/650,height/330)},b={x:to.x,y:to.y-52*(to.scale??visualScale)*Math.min(1,width/650,height/330)},caster={x:from.x,y:from.y-52*(from.scale??visualScale)*Math.min(1,width/650,height/330)};
        const cacheKey=spec.base+':'+seed;
        if(!cache.has(cacheKey)){if(cache.size>=128)cache.delete(cache.keys().next().value);const values=effectParticles(spec.base,spec.count,seed);values.groups={};for(const n of [20,22,24,30,32,38,40,48])values.groups[n]=values.slice(0,n);cache.set(cacheKey,values);}
        const particles=cache.get(cacheKey);
        c.save();c.lineCap='round';
        if(spec.quickAttack){
            const impact=config.timeline.impact,flight=clamp(p/impact),hit=clamp((p-impact)/(1-impact));
            c.globalAlpha=Math.min(1,p*12,(1-p)*8);c.shadowBlur=0;
            for(const particle of particles.groups[20]){
                let point;
                if(failed)point={x:caster.x+Math.cos(particle.angle)*18*scale*p,y:caster.y+Math.sin(particle.angle)*18*scale*p};
                else if(reducedMotion)point={x:b.x+Math.cos(particle.angle)*10*scale,y:b.y+Math.sin(particle.angle)*10*scale};
                else if(p<impact){
                    const travel=clamp(flight-particle.phase*.12),spread=4*scale*Math.sin(travel*Math.PI);
                    point={x:caster.x+(b.x-caster.x)*travel+Math.cos(particle.angle)*spread,y:caster.y+(b.y-caster.y)*travel+Math.sin(particle.angle)*spread};
                }else {
                    const spread=24*scale*hit*particle.speed;
                    point={x:b.x+Math.cos(particle.angle)*spread,y:b.y+Math.sin(particle.angle)*spread};
                }
                disc(c,point.x,point.y,particle.size*scale*(1-hit*.7),failed?'#9aa1af':particle.phase>.5?primary:light);
            }
            c.restore();return;
        }
        if(reducedMotion){const at=centered?a:b;c.globalAlpha=Math.sin(p*Math.PI)*.65;if(!centered||!echo){rune(c,at.x,at.y+40*scale,radius,0,primary);if(!failed)assets.skillArt?.drawSubject(c,spec.base,at.x-radius,at.y-radius,radius*2,radius*2);}c.restore();return;}
        // A soft darkening gives particles contrast without white screen flashes.
        if(!echo){c.fillStyle=`rgba(10,14,35,${Math.sin(p*Math.PI)*.22})`;c.fillRect(0,0,width,height);}
        c.shadowColor=primary;c.shadowBlur=12*scale;c.globalAlpha=Math.min(1,p*8,(1-p)*7);
        if(!echo)rune(c,a.x,origin.y+4,radius*(.65+Math.sin(p*Math.PI)*.15),p,primary);
        c.shadowBlur=0;
        const summon=spec.kind==='summon',attackStart=summon?config.timeline.summonAttack:config.timeline.attack,impact=summon?config.timeline.summonImpact:config.timeline.impact;
        const flight=clamp((p-attackStart)/(impact-attackStart)),hit=clamp((p-impact)/(1-impact));
        if(failed){c.globalAlpha*=1-p;discs(c,'#9aa1af',particles.groups[20].map(v=>[a.x+Math.cos(v.angle)*radius*p,a.y-Math.sin(v.angle)*radius*p,2*scale]));c.restore();return;}
        // The atlas is one layer, never a replacement for semantic spell choreography.
        const hasSubject=atlasEffect(c,spec,{a,b,origin,to,center,radius,scale,p,flight,hit,particles,centered,echo});
        if(!echo||p>=attackStart)elementalParticles(c,card.spellSchool,{a,b,radius,scale,p,flight,hit,particles,palette:col,friendly:spec.friendly,echo});
        // Original illustration manifests above the arena as a magical projection.
        // It is deliberately a card-art apparition, not a fabricated animated NPC.
        const illustration=assets.images?.get('spell:'+spec.base);
        if(!hasSubject&&!summon&&!echo&&illustration&&p<.72) {
            const at=center||{x:(from.x+to.x)/2,y:(from.y+to.y)/2};
            const grow=clamp(p/.18),fade=clamp((.72-p)/.18),orb=radius*.92;
            c.save();c.globalAlpha*=grow*fade*.85;
            rune(c,at.x,at.y,radius*1.18,p,primary);
            c.translate(at.x,at.y-orb*(.7+grow*.25));
            c.scale(.7+.3*grow,.7+.3*grow);
            c.save();c.beginPath();c.arc(0,0,orb,0,TAU);c.clip();
            c.drawImage(illustration,illustration.width*.16,illustration.height*.24,illustration.width*.68,illustration.height*.32,-orb,-orb,orb*2,orb*2);c.restore();
            c.strokeStyle=light;c.lineWidth=2*scale;c.beginPath();c.arc(0,0,orb,0,TAU);c.stroke();
            for(let i=0;i<8;i++){const angle=i*TAU/8+p*3;shard(c,Math.cos(angle)*orb*1.13,Math.sin(angle)*orb*1.13,3*scale,angle,primary);}
            c.restore();
        }
        if(!hasSubject&&summon&&!echo) {
            const def=spec.summonDef,emerge=clamp(p/.26),fade=clamp((1-p)/.15),dir=b.x>=a.x?1:-1;
            const sx=a.x,sy=origin.y;
            c.save();c.globalAlpha*=emerge*fade;rune(c,sx,sy,radius*1.1,p,light);
            discs(c,primary,particles.groups[24].map(v=>{const phase=(p*1.4+v.phase)%1;return [sx+Math.cos(v.angle+p*5)*radius*(1-phase),sy-phase*170*scale,v.size*scale];}));
            c.shadowBlur=0;c.translate(sx,sy);c.scale(dir,1);c.rotate(Math.sin(flight*TAU)*.065);
            const size=def.size*scale*(.75+.25*emerge),tile=flight>.05?(def.attackTile??def.tile):def.tile;
            assets.draw(c,{id:def.asset,crop:config.frames[tile].map((v,i)=>v*(i%2?assets.media.entries[def.asset].height/config.atlasSize[1]:assets.media.entries[def.asset].width/config.atlasSize[0]))},-size/2,-size*emerge,size,size*emerge);c.restore();
        }
        const kind=spec.choreography.attack;
        // Variants add a shared halo; they never clone the base choreography.
        if(!echo&&!failed&&(spec.variantAura.rings||spec.variant.level>0)){
            c.save();c.globalAlpha*=.45;const ac=spec.variantAura.color||primary;
            for(let i=0;i<Math.max(1,spec.variantAura.rings);i++)rune(c,a.x,origin.y+4,radius*(.9+i*.13+Math.min(10,spec.variant.level)*.018),p*(i%2?-1:1),ac);
            if(spec.variant.rank==='gold')for(let i=0;i<12;i++){const ang=i*TAU/12+p*2;shard(c,a.x+Math.cos(ang)*radius*1.3,origin.y+Math.sin(ang)*radius*.5,3*scale,ang,ac);}
            c.restore();
        }
        if(!reflection&&spec.secondary&&p>impact&&(!echo||spec.choreography.secondaryTarget!=='caster'))supportEffect(c,spec.secondary==='dot'?'enrage':spec.secondary,{a:caster,b:spec.choreography.secondaryTarget==='caster'?caster:b,to:spec.choreography.secondaryTarget==='caster'?from:to,center,radius:radius*.6,scale,p:hit,palette:col,particles,assets});
        if(['absorb','reflect','aura','cleanse','steal','stun','freeze','stealth','enrage','pips','capture','pet','dissolve','pass'].includes(kind)){
            supportEffect(c,kind,{a:caster,b,to,center:spec.choreography.placement==='field'?center:b,radius,scale,p,palette:col,particles,assets});c.restore();return;
        }

        const x=a.x+(b.x-a.x)*flight,y=a.y+(b.y-a.y)*flight-Math.sin(flight*Math.PI)*55*scale;
        if(['shield','blade','trap','heal'].includes(kind)) {
            const r=radius*(.4+.6*Math.sin(p*Math.PI/2));
            rune(c,b.x,to.y,r,p,primary);
            if(kind==='shield') {
                c.save();c.translate(b.x,b.y);c.scale(scale,scale);const grow=Math.min(1,p*5);c.scale(grow,grow);c.fillStyle=primary+'44';c.strokeStyle=light;c.lineWidth=3;c.beginPath();c.moveTo(-49,-54);c.lineTo(0,-72);c.lineTo(49,-54);c.lineTo(41,12);c.quadraticCurveTo(24,43,0,59);c.quadraticCurveTo(-24,43,-41,12);c.closePath();c.fill();c.stroke();line(c,[[0,-47],[0,29]],light,4);line(c,[[-24,-10],[24,-10]],light,4);c.restore();
            } else if(kind==='blade') {
                for(let i=0;i<3;i++){const ang=p*TAU+i*TAU/3;shard(c,b.x+Math.cos(ang)*r,b.y+Math.sin(ang)*r*.4,15*scale,ang+.8,light);}
            } else if(kind==='trap') {
                for(let i=0;i<8;i++){const ang=i*TAU/8;shard(c,b.x+Math.cos(ang)*r,to.y+Math.sin(ang)*r*.4-18*scale,17*scale,0,primary);}
            }
            for(const v of particles.groups[echo?20:32]){const q=(v.phase+p*.8)%1;c.globalAlpha= Math.sin(p*Math.PI)*Math.sin(q*Math.PI);const px=b.x+Math.cos(v.angle)*r*v.speed,py=to.y-q*145*scale;if(kind==='heal'){line(c,[[px-3*scale,py],[px+3*scale,py]],light,2);line(c,[[px,py-3*scale],[px,py+3*scale]],light,2);}else disc(c,px,py,v.size*scale,primary);}
        } else {
            if(p>=attackStart&&flight<1) {
                if(kind==='burst') {
                    // Explosions and ground spikes form at the victim, never fly as a generic orb.
                    const grow=clamp(flight*1.8),spread=radius*(.3+grow*.6);
                    rune(c,b.x,to.y,spread,p,primary);
                    for(let i=0;i<9;i++){
                        const ang=i*TAU/9,px=b.x+Math.cos(ang)*spread*.8,py=to.y+Math.sin(ang)*spread*.28;
                        if(card.spellSchool==='ice')shard(c,px,py-radius*.45*grow,radius*.28*grow,(i-4)*.07,light);
                        else {mist(c,px,py-radius*grow*(.4+.3*Math.sin(i*2)),radius*.28,primary,.4);line(c,[[px,py],[px+Math.sin(i*3+p*8)*radius*.1,py-radius*grow]],light,2*scale);}
                    }
                } else if(kind==='lightning') {
                    for(let branch=0;branch<3;branch++){const pts=[];for(let i=0;i<=12;i++){const v=i/12;pts.push([a.x+(b.x-a.x)*v,a.y+(b.y-a.y)*v+Math.sin(i*17+Math.floor(p*24)+branch*7)*(i===0||i===12?0:23)*scale]);}line(c,pts,primary,7*scale);line(c,pts,light,2*scale);}
                } else if(kind==='meteor') {
                    const q=flight*flight,dir=b.x>=a.x?1:-1;
                    const point=v=>({x:b.x-dir*130*scale*(1-v),y:b.y-190*scale*(1-v)});
                    const head=point(q);
                    // Tapered vapor/embers follow the falling mass rather than a solid beam.
                    for(let i=17;i>=0;i--){const v=Math.max(0,q-i*.014),at=point(v);c.save();c.globalAlpha*=1-i/19;mist(c,at.x,at.y,(24-i*.8)*scale,primary,.42);c.restore();}
                    for(const v of particles.groups[echo?20:38]){
                        const tail=point(Math.max(0,q-v.phase*.25)),spread=(1+v.phase*22)*scale;
                        c.save();c.globalAlpha*=1-v.phase;
                        const px=tail.x+Math.cos(v.angle)*spread,py=tail.y+Math.sin(v.angle)*spread;
                        if(card.spellSchool==='ice')rock(c,px,py,(2+v.size)*scale,v.spin+p*3,col);else disc(c,px,py,v.size*scale,light);c.restore();
                    }
                    c.save();c.globalAlpha*=.18+q*.35;c.strokeStyle=primary;c.lineWidth=2*scale;c.beginPath();c.ellipse(b.x,to.y,radius*(.35+q*.3),radius*(.12+q*.1),0,0,TAU);c.stroke();c.restore();
                    rock(c,head.x,head.y,27*scale*spec.scale,p*3,col);
                } else if(kind==='swords') {
                    for(let i=0;i<5;i++){
                        const q=clamp(flight*1.45-i*.10),point=v=>({x:a.x+(b.x-a.x)*v,y:a.y+(b.y-a.y)*v+(i-2)*21*scale*(1-v)-Math.sin(v*Math.PI)*70*scale});
                        const head=point(q),prev=point(Math.max(0,q-.025));
                        for(let j=1;j<=8;j++){const at=point(Math.max(0,q-j*.012));c.save();c.globalAlpha*=(1-j/9)*.5;disc(c,at.x,at.y,(4-j*.32)*scale,primary);c.restore();}
                        sword(c,head.x,head.y,17*scale,Math.atan2(head.y-prev.y,head.x-prev.x),col);
                    }
                } else if(kind==='vines') {
                    for(let i=0;i<7;i++){const vx=b.x+(i-3)*17*scale;c.strokeStyle=i%2?light:primary;c.lineWidth=5*scale;c.beginPath();c.moveTo(vx,to.y);c.bezierCurveTo(vx-35*scale,to.y-40*scale*flight,vx+40*scale,to.y-80*scale*flight,vx,to.y-150*scale*flight);c.stroke();shard(c,vx,to.y-110*scale*flight,10*scale,.7,primary);}
                } else if(kind==='vortex') {
                    // Helical ribbons widen toward the top of a visible cyclone.
                    const grow=Math.sin(flight*Math.PI)*.35+.65;
                    for(let band=0;band<4;band++){
                        const pts=[];for(let j=0;j<=40;j++){const v=j/40,ang=v*TAU*2.5+p*18+band*TAU/4,rr=radius*(.2+v*.8)*grow;pts.push([b.x+Math.cos(ang)*rr,to.y-v*150*scale+Math.sin(ang)*rr*.28]);}
                        c.save();c.globalAlpha*=.28;line(c,pts,primary,7*scale);c.globalAlpha*=2;line(c,pts,light,1.4*scale);c.restore();
                    }
                    for(const v of particles.groups[echo?20:32]){const lift=(p*1.7+v.phase)%1,ang=lift*12+p*15+v.angle,rr=radius*(.2+lift*.85);shard(c,b.x+Math.cos(ang)*rr,to.y-lift*150*scale+Math.sin(ang)*rr*.25,v.size*scale,ang,primary);}
                } else {
                    const point=v=>({x:a.x+(b.x-a.x)*v,y:a.y+(b.y-a.y)*v-Math.sin(v*Math.PI)*55*scale});
                    for(let j=16;j>=1;j--){const at=point(Math.max(0,flight-j*.014));c.save();c.globalAlpha*=(1-j/17)*.55;disc(c,at.x,at.y,(10-j*.45)*scale,primary);c.restore();}
                    mist(c,x,y,30*scale,primary,.7);disc(c,x,y,9*scale,primary);disc(c,x,y,4*scale,light);
                }
                if(!['meteor','vortex','vines','burst'].includes(kind))
                discs(c,primary,particles.groups[echo?20:30].map(v=>{const q=clamp(flight-v.phase*.2);return [a.x+(b.x-a.x)*q+Math.cos(v.angle)*12*scale,a.y+(b.y-a.y)*q-Math.sin(q*Math.PI)*55*scale+Math.sin(v.angle)*12*scale,v.size*scale];}));
            }
            if(hit>0) {
                c.globalAlpha=1-hit;c.strokeStyle=light;c.lineWidth=(1-hit)*5*scale;c.beginPath();c.ellipse(b.x,b.y,radius*hit*1.5,radius*hit,0,0,TAU);c.stroke();
                if(kind==='meteor') {
                    const spread=Math.sqrt(hit)*radius*1.35;
                    for(let ring=0;ring<3;ring++){c.save();c.globalAlpha*=(1-hit)*(.65-ring*.16);c.strokeStyle=ring%2?primary:light;c.lineWidth=(3-ring*.6)*scale;c.beginPath();c.ellipse(b.x,to.y,spread*(1-ring*.2),spread*(.36-ring*.06),0,0,TAU);c.stroke();c.restore();}
                    for(const v of particles.groups[22]){
                        const px=b.x+Math.cos(v.angle)*spread*v.speed,py=to.y+Math.sin(v.angle)*spread*.3-Math.sin(hit*Math.PI)*(18+v.speed*60)*scale;
                        rock(c,px,py,(2+v.size*1.6)*(1-hit*.7)*scale,v.spin+hit*6,col);
                    }
                    for(let i=0;i<7;i++)mist(c,b.x+Math.cos(i*2.4)*spread*.7,to.y+Math.sin(i*2.4)*spread*.2,25*scale*(1+hit),primary,(1-hit)*.18);
                }
                for(const v of particles.groups[echo?20:32]){const travel=radius*(.2+hit*1.6)*v.speed,px=b.x+Math.cos(v.angle)*travel,py=b.y+Math.sin(v.angle)*travel+hit*hit*35*scale;
                    if(card.spellSchool==='ice')shard(c,px,py,v.size*scale*2,v.spin+hit*2,hit<.3?light:primary);else disc(c,px,py,v.size*scale*(1-hit*.6),v.phase>.5?primary:light);
                }
                if(kind==='drain'&&!reflection)discs(c,primary,particles.groups[20].map(v=>{const q=clamp(hit*1.4-v.phase*.3);return [b.x+(caster.x-b.x)*q,b.y+(caster.y-b.y)*q+Math.sin(q*TAU+v.angle)*20*scale,3*scale];}));
            }
        }
        c.restore();
    }
    return {drawEnvironment(c,{card,...options}){
        const spec=resolve(card);if(spec?.choreography.placement==='field')drawArenaEnvironment(c,{...options,palette:spec.palette});
    },draw(c,options){
        if(options.progress<=0||options.progress>=1)return;
        const spec=resolve(options.card),targets=spec?.area&&options.targets?.length?options.targets:[options.to];
        const center=options.center||(options.from&&options.to?{x:(options.from.x+options.to.x)/2,y:(options.from.y+options.to.y)/2}:undefined);
        for(let i=0;i<targets.length;i++)draw(c,{...options,spec,center,to:targets[i],echo:i>0});
    }};
}
