import {battlePointerAngle} from './battle_pointer_core.js';

// Native Canvas artwork, flattened onto the arena floor below all combatants.
export function drawBattlePointer(c,{center,radius,from,to,progress=1,reduced=false}) {
    if(!to)return;
    const angle=battlePointerAngle(center,from,to,progress,reduced);
    c.save();c.translate(center.x,center.y);c.scale(1,(.39/.76));c.rotate(angle);
    const length=radius*.49,neck=length*.68;
    // Muted jade ink and translucent rune light, rather than a solid metal hand.
    c.globalAlpha=.55;c.lineJoin='round';c.lineCap='round';c.lineWidth=3;
    c.shadowColor='#c6e4d8';c.shadowBlur=3;c.strokeStyle='#568d87';
    c.beginPath();c.moveTo(neck,-20);c.lineTo(length,0);c.lineTo(neck,20);
    c.lineTo(neck+10,0);c.closePath();c.fillStyle='#a2c9b744';c.fill();c.stroke();
    const trail=c.createLinearGradient(18,0,neck+10,0);
    trail.addColorStop(0,'#568d8700');trail.addColorStop(1,'#568d87');c.strokeStyle=trail;
    c.beginPath();c.moveTo(18,0);c.lineTo(neck+10,0);c.stroke();
    c.strokeStyle='#65978c';c.lineWidth=2;
    for(const x of [length*.38,length*.54]){
        c.beginPath();c.moveTo(x-6,0);c.lineTo(x,6);c.lineTo(x+6,0);c.lineTo(x,-6);c.closePath();c.stroke();
    }
    c.beginPath();c.arc(0,0,12,.3,Math.PI-.3);c.stroke();
    c.beginPath();c.arc(0,0,12,Math.PI+.3,Math.PI*2-.3);c.stroke();
    c.beginPath();c.moveTo(-4,0);c.lineTo(0,-4);c.lineTo(4,0);c.lineTo(0,4);c.closePath();c.stroke();
    // Sparse gold inlay keeps jade dominant: inside the tip and along the central rune.
    c.shadowBlur=0;c.strokeStyle='#c7ae72';c.lineWidth=1.25;
    c.beginPath();c.moveTo(neck+6,-12);c.lineTo(length-11,0);c.lineTo(neck+6,12);c.stroke();
    c.beginPath();c.moveTo(length*.43,0);c.lineTo(length*.59,0);c.stroke();
    c.beginPath();c.arc(0,0,8,-.65,.65);c.stroke();
    c.restore();
}
