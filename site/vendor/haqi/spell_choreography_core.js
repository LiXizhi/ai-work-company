// Visual choreography only. Source card types describe mechanics; names identify motifs.
export const SUBJECT_MOTIONS = ['pulse','orbit','rise','fall','fly','hover','lunge','spiral','return','dissolve'];
export const SUBJECT_PLACEMENTS = ['center','target','projectile','caster','field'];
export function spellChoreography(base, card) {
    const kind=base.kind,type=card.type,name=base.name;
    let placement=['bolt','swords','drain','steal'].includes(kind)?'projectile':'target';
    let motion={bolt:'fly',swords:'fly',meteor:'fall',vines:'rise',vortex:'spiral',blade:'orbit',steal:'return',dissolve:'dissolve',heal:'rise'}[kind]||'pulse';
    let attack=kind==='summon'?base.attack:kind;
    if(base.subjectPlacement==='center'||kind==='summon'){placement='center';motion='lunge';}
    if(kind==='aura'){placement=type==='Global'?'field':'target';motion='orbit';}
    if(kind==='pass'||type==='Fizzle'){placement='caster';motion='dissolve';}
    // Named motifs override school-wide recipes, while retaining secondary mechanics.
    if(/凤|风鹰|蝠王|精灵|神兔|圣灵复活|重生|幽灵|幽魂|恶灵|章鱼|蛇女/.test(name)&&placement==='center')motion='hover';
    if(/火凤|凤凰|风鹰/.test(name)){placement='center';motion='fly';}
    if(/冰剑|冰锥/.test(name))attack='swords';
    if(/陨落|冰雹|火神天罚/.test(name)){placement='target';motion='fall';attack='meteor';}
    if(/破地冰钻|冰魄神柱|冰刺魂体|荆棘|灵木/.test(name)){placement='target';motion='rise';attack=card.spellSchool==='ice'?'burst':'vines';}
    if(/旋风|狂风暴击/.test(name)){placement='target';motion='spiral';attack='vortex';}
    if(/连环闪电|雷神电轮/.test(name))attack='lightning';
    if(kind==='meteor'){placement='target';motion='fall';}
    if(type==='DOTAttackWithHOT'){placement='target';motion='pulse';attack='drain';}
    if(/LifeTap/.test(type))attack='drain';
    return {placement,motion,attack,returnToCaster:/LifeTap/.test(type)||type==='DOTAttackWithHOT',secondaryTarget:/SelfStun/.test(type)?'caster':'target'};
}
const clamp=v=>Math.max(0,Math.min(1,v));
export function subjectPose(choreography,{p,flight,hit,radius:r,a,b,center}) {
    const {placement,motion}=choreography;
    const at=placement==='center'||placement==='field'?center:placement==='caster'?a:b;
    const pose={x:at.x,y:at.y,angle:0,sx:1,sy:1,alpha:clamp(p/.16)*clamp((1-p)/.16)};
    const beat=Math.sin(flight*Math.PI),breath=Math.sin(p*Math.PI*4),dir=b.x>=a.x?1:-1;
    if(placement==='projectile'){
        const q=motion==='return'?1-flight:flight;
        pose.x=a.x+(b.x-a.x)*q;pose.y=a.y+(b.y-a.y)*q-Math.sin(q*Math.PI)*r*.65;
        pose.alpha*=clamp((1-hit)/.25);
    }
    if(motion==='lunge'){pose.x+=dir*r*.42*beat;pose.y-=r*.1*beat;pose.angle=dir*(-.08*Math.sin(p*Math.PI)+beat*.16);pose.sx=1+beat*.08;pose.sy=1-beat*.06;}
    if(motion==='hover'||motion==='fly'&&placement==='center'){pose.y-=r*(.12+Math.sin(p*Math.PI*3)*.14);pose.x+=dir*r*.2*beat;pose.angle=dir*breath*.055;pose.sx=1+breath*.045;pose.sy=1-breath*.025;}
    if(motion==='fall'){const q=flight*flight;pose.x-=dir*r*1.85*(1-q);pose.y-=r*2.7*(1-q);pose.angle=dir*flight*.35;pose.alpha*=1-hit;}
    if(motion==='rise'){const q=clamp(p/.38);pose.y+=(1-q)*r*.8;pose.sy=.3+.7*q;pose.sx=1+(1-q)*.15;}
    if(motion==='spiral'){pose.angle=Math.sin(p*Math.PI*6)*.13;pose.sx=.85+.15*Math.sin(p*Math.PI);pose.sy=1+breath*.06;}
    if(motion==='orbit'){pose.x+=Math.cos(p*Math.PI*2)*r*.12;pose.y+=Math.sin(p*Math.PI*2)*r*.08;pose.angle=breath*.07;}
    if(motion==='pulse'){pose.sx=pose.sy=.86+.14*Math.sin(p*Math.PI)+.035*breath;}
    if(motion==='dissolve'){pose.y-=p*r*.6;pose.sx=pose.sy=1+p*.15;pose.alpha*=1-p;}
    if(placement==='center')pose.sx*=dir;
    return pose;
}
