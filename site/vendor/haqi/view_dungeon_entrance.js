import {entranceAppearance} from './adventure_entrances_core.js';
import {cityEntranceAppearance} from './adventure_city_dungeons_core.js';
// Bake once (64 KiB RGBA), then share across all entrances and islands.
// No particle updates, filters, extra animation loop or per-frame gradients.
let blueGlow=null;
function entranceGlow(){
    if(blueGlow)return blueGlow;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d');
    const glow=ctx.createRadialGradient(64,72,6,64,64,62);
    glow.addColorStop(0,'rgba(135,238,255,.72)');
    glow.addColorStop(.38,'rgba(52,189,255,.48)');
    glow.addColorStop(.7,'rgba(27,137,255,.22)');
    glow.addColorStop(1,'rgba(20,112,255,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,128,128);
    blueGlow=canvas;return blueGlow;
}
// Every island shares one cached WebP and one small glow bitmap.
export function drawDungeonEntrance(c,o,time=0,reduced=false,entranceArt=null){
    if(o.cityDungeon){
        const {w,h}=cityEntranceAppearance(o.cityLevel,o.cityNodeEntrance);
        // Shared generated WebP, fixed to the ground without pulsing or vector rings.
        if(!entranceArt?.draw(c,'shared','elite',o.x-w/2,o.y-h/2,w,h)){
            c.save();c.fillStyle='#658d98';c.beginPath();c.ellipse(o.x,o.y,w/2,h/2,0,0,Math.PI*2);c.fill();c.restore();
        }
        return;
    }
    const tower=o.entranceKind==='tower',{frame,w,h}=entranceAppearance(o);
    c.save();c.translate(o.x,o.y);
    const pulse=reduced?0:Math.sin(time*1.7);
    c.save();c.globalAlpha*=.72+pulse*.12;
    c.drawImage(entranceGlow(),tower?-58:-76,tower?-144-pulse*2:-61-pulse*2,tower?116:152,tower?168:96);
    c.restore();
    if(!entranceArt?.draw(c,'shared',frame,-w/2,tower?-h+10:-h/2,w,h)){
        c.fillStyle='#526a7b';c.beginPath();c.ellipse(0,0,48,21,0,0,Math.PI*2);c.fill();
        c.fillStyle='#65dfff';c.beginPath();c.ellipse(0,-3,36,14,0,0,Math.PI*2);c.fill();
        if(tower){c.fillStyle='#869aa8';c.fillRect(-22,-88,44,88);c.fillStyle='#315571';c.beginPath();c.moveTo(-29,-88);c.lineTo(0,-120);c.lineTo(29,-88);c.fill();}
    }
    c.restore();
}
