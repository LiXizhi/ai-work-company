import {expectedBaseDamage} from './combat_cards_core.js';
import {describeCard} from './card_description_core.js';
import { tr } from './locale_runtime.js';
import {drawSchoolAtlas,loadSchoolIcons} from './school_icons.js';
// Prepare the small shared atlas before any consumer paints a one-shot canvas.
// Node imports stay IO-free; missing art retains the existing vector fallback.
if(typeof Image!=='undefined')await loadSchoolIcons().catch(error=>console.warn(error.message));
const TAU=Math.PI*2;
const colors={ice:'#70d9ff',fire:'#ff9749',storm:'#ffdc68',life:'#8fe88c',death:'#c795fa',balance:'#e8cc84'};
function path(c,points,fill,stroke='#fcf3bf',width=2){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();c.lineWidth=width;c.strokeStyle=stroke;c.stroke();}
export function drawSchoolIcon(c,school,x,y,size,color=colors[school]){
 if(drawSchoolAtlas(c,school,x,y,size))return;
 c.save();c.translate(x,y);c.scale(size/24,size/24);c.lineJoin='round';c.lineCap='round';c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2.5;
 if(school==='ice'){for(const [dx,dy,r]of [[0,-2,10],[-8,6,4],[8,6,4]]){path(c,[[dx,dy-r],[dx+r*.6,dy],[dx,dy+r],[dx-r*.6,dy]],color,'#fff2a9',1.2);path(c,[[dx,dy-r],[dx,dy+r],[dx-r*.6,dy]],'#0874bd','#fff2a9',.5);}}
 if(school==='fire'){c.beginPath();c.moveTo(0,-12);c.bezierCurveTo(-2,-3,-11,-4,-10,4);c.bezierCurveTo(-8,15,10,13,10,3);c.bezierCurveTo(9,-2,5,-6,5,-8);c.bezierCurveTo(5,-2,0,0,0,-12);c.fill();}
 if(school==='storm')path(c,[[3,-12],[-10,2],[-1,2],[-4,12],[11,-4],[2,-4]],color,color,1);
 if(school==='life'){c.beginPath();c.moveTo(-8,9);c.bezierCurveTo(-13,-3,-3,-11,11,-10);c.bezierCurveTo(12,5,3,13,-8,9);c.fill();c.strokeStyle='#235334';c.beginPath();c.moveTo(-7,8);c.lineTo(6,-5);c.stroke();}
 if(school==='death'){c.beginPath();c.arc(0,-3,10,0,TAU);c.fill();c.fillRect(-6,3,12,8);c.fillStyle='#372442';for(const x of [-4,4]){c.beginPath();c.ellipse(x,-3,2.7,3.3,0,0,TAU);c.fill();}c.fillRect(-1,6,2,5);}
 if(school==='balance')path(c,[[0,-12],[3,-3],[12,0],[3,3],[0,12],[-3,3],[-12,0],[-3,-3]],color,'#fff2a9',1);
 c.restore();}
function badge(c,x,y,r,value){const g=c.createRadialGradient(x-4,y-5,2,x,y,r);g.addColorStop(0,'#fbffdc');g.addColorStop(.8,'#d9fca7');g.addColorStop(1,'#82cd3d');c.fillStyle=g;c.strokeStyle='#e3ef8c';c.lineWidth=2;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.stroke();if(value!==null){c.fillStyle='#254a29';c.font='bold 23px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(value,x,y+1);}}

// All card chrome, corner graphics, numbers and layout are owned here.
export class CardRenderer {
    drawSchoolIcon(c,school,x,y,size,color=colors[school]){drawSchoolIcon(c,school,x,y,size,color);}
    constructor({images,effects,drawSubject}){this.images=images;this.effects=effects;this.drawSubject=drawSubject;}
    draw(c,card,{name,description,cooldown=0,details=true,width=302,height=460,backgroundOnly=false,golden=false,subject=null,wordCard=false}={}){
        const {effects,images,drawSubject}=this;
        const reference=effects.cards[card.key],base=reference?.base;if(!base)return false;
        const school=card.spellSchool,background=images.get(wordCard?'frame:wordInk':'frame:'+(school==='balance'?'storm':school))||images.get('frame:'+(school==='balance'?'storm':school));
        if(!background)return false;
        c.save();c.scale(width/302,height/460);c.clearRect(0,0,302,460);c.drawImage(background,0,0,302,460);
        if(backgroundOnly){c.restore();return true;}
        c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';c.lineWidth=5;c.strokeStyle='#172431';
        c.font='900 27px "Microsoft YaHei",sans-serif';const title=tr(name||reference.name);
        if(!wordCard)c.strokeText(title,151,52,218);c.fillStyle=wordCard?'#244a40':'#fffde5';c.fillText(title,151,52,218);
        drawSchoolIcon(c,school,27,28,40);
        c.save();c.beginPath();c.rect(22,87,258,180);c.clip();if(subject)subject(c);else drawSubject(c,base,42,68,218,218);c.restore();
        badge(c,267,276,16,null);this.drawTypeIcon(c,card,267,276);
        if(details){
            badge(c,277,28,15,card.pipcost<0||card.pipcost===114||card.pipcost==='X'?'X':String(card.pipcost));badge(c,36,276,19,String(cooldown));
            const text=tr(description||cardDescription(card)),lines=[];let line='';
            c.fillStyle='#173b4b';c.font='bold 18px "Microsoft YaHei",sans-serif';
            for(const ch of text){if(c.measureText(line+ch).width>218){lines.push(line);line=ch;}else line+=ch;}if(line)lines.push(line);
            c.textAlign='left';c.textBaseline='top';lines.slice(0,5).forEach((value,i)=>c.fillText(value,41,307+i*23));
        }
        const aura=effects.variantAuras[reference.variant.rank];
        if(golden||aura?.color){
            // Broad quality strip at the foot of the card, independent of selection chrome.
            c.fillStyle='#19303d';c.fillRect(5,439,292,19);
            c.fillStyle=golden?'#ffe69a':aura.color;c.fillRect(7,441,288,15);
            c.fillStyle='#ffffff66';c.fillRect(7,441,288,3);
        }
        c.restore();return true;
    }
    drawTypeIcon(c,card,x,y){
        c.save();c.translate(x,y);c.strokeStyle='#19374d';c.fillStyle='#19374d';c.lineWidth=3;c.lineCap='round';
        if(card.params?.heal_min!==undefined||card.params?.hots!==undefined){c.fillRect(-3,-10,6,20);c.fillRect(-10,-3,20,6);}
        else if(expectedBaseDamage(card)){
            // Closed fist: four knuckles, folded thumb and a short wrist.
            path(c,[[-8,-3],[-8,-8],[-5,-10],[-2,-10],[0,-9],[3,-10],[6,-9],[9,-7],[10,-2],[9,3],[5,7],[5,11],[-5,11],[-6,6],[-11,1],[-11,-3],[-9,-5],[-6,-3],[-3,1]],'#19374d','#e9db83',1.2);
            c.strokeStyle='#e9db83';c.lineWidth=1.2;c.beginPath();
            for(const x of [-4,0,4]){c.moveTo(x,-7);c.lineTo(x,-3);}
            c.moveTo(-6,-1);c.lineTo(-2,3);c.lineTo(4,3);c.moveTo(-4,8);c.lineTo(4,8);c.stroke();
        }
        else if(/Ward|Shield|Absorb|Guardian/.test(card.type)){path(c,[[0,-10],[11,-6],[8,6],[0,11],[-8,6],[-11,-6]],'#19374d','#e9db83',1.5);}
        else path(c,[[0,-11],[3,-3],[11,0],[3,3],[0,11],[-3,3],[-11,0],[-3,-3]],'#19374d','#e9db83',1);
        c.restore();
    }
}
export function cardDescription(card){
    return describeCard(card,{translate:tr}).summary;
}
