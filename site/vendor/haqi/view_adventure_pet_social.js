import {socialActions} from './adventure_social_actions_core.js';
import {petAppearanceStage} from './adventure_pets_core.js';
import {petInteractionParams} from './adventure_pet_interactions_core.js';
import {drawPetMood,petIdleLift} from './view_adventure_pet_mood.js';
// Called in depth order by the world renderer. Uses existing pet sheets only.
export function drawSocialPet(ctx,assets,row,effects,time,reduced,at=Date.now()){
    const {pet,position}=row;if(!pet)return;
    const effect=effects.findLast(e=>e.ids.includes(pet.id)&&e.until>at);
    const phase=(time/1000),turn=effect?.ids.indexOf(pet.id)||0;
    const scale=row.scale||1,size=64*scale;
    const playing=!!effect,mood=playing?'happy':row.mood||'idle';
    const hop=reduced||mood==='sleeping'?0:playing?Math.max(0,Math.sin(phase*5+turn*Math.PI))*14:row.moving?Math.abs(Math.sin(row.phase))*5:petIdleLift(time,reduced);
    ctx.save();ctx.translate(position.x,position.y);
    ctx.fillStyle='#294c3733';ctx.beginPath();ctx.ellipse(0,0,18*scale,5*scale,0,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(reduced||!playing?0:Math.sin(phase*4+turn*Math.PI)*6,-hop);ctx.scale(row.facing||1,1);
    drawPetMood(ctx,mood,time,reduced,size,column=>{
        const drawn=assets.drawPet(ctx,pet.speciesId,petAppearanceStage(pet,assets.content),-size/2,-size+4,size,size,column);
        if(!drawn){ctx.fillStyle='#bbd5a1';ctx.beginPath();ctx.ellipse(0,-size*.4,size*.22,size*.32,0,0,Math.PI*2);ctx.fill();}
    });
    ctx.restore();
    ctx.restore();
}

function drawPinkMark(ctx,x,y,time,reduced){
    ctx.save();ctx.translate(x,y-(reduced?0:Math.sin(time/300)*2));ctx.fillStyle='#f48cb0';ctx.beginPath();ctx.arc(0,0,5.5,0,Math.PI*2);ctx.fill();ctx.restore();
}
// No overhead social text. Both pets briefly show marks/hearts while together.
// Pets already in the player's affinity memory also keep a pink mark while close.
export function drawPetSocialEffects(ctx,assets,rows,effects,time,reduced,at){
    const byId=new Map(rows.map(row=>[row.pet.id,row])),used=new Set(),p=petInteractionParams(assets.content);
    ctx.save();ctx.textAlign='center';ctx.font='12px "Microsoft YaHei",sans-serif';
    const bubble=(x,y,w,line)=>{ctx.fillStyle='#fff9ed';ctx.strokeStyle='#bca47d';ctx.beginPath();ctx.roundRect(x-w/2,y,w,27,7);ctx.fill();ctx.stroke();ctx.fillStyle='#66432d';ctx.fillText(line,x,y+18);};
    for(const row of rows)if(row.pet.ownerId===null)bubble(row.position.x,row.position.y+5,58,'待领养');
    for(const effect of [...effects].reverse()){
        const key=[...effect.ids].sort().join('|');if(effect.until<=at||used.has(key))continue;used.add(key);
        const pets=effect.ids.map(id=>byId.get(id)).filter(Boolean);if(!pets.length)continue;
        if(pets.length!==2||Math.hypot(pets[0].position.x-pets[1].position.x,pets[0].position.y-pets[1].position.y)>p.interactionDistance)continue;
        const action=socialActions.find(a=>a.id===effect.action);
        if(action)for(const row of pets){ctx.save();ctx.font='24px sans-serif';ctx.fillText(action.icon,row.position.x,row.position.y-64*(row.scale||1)-60);ctx.restore();}
        // Tiny alternating scribbles: pet chatter without any human words or glyphs.
        for(const [index,row]of pets.entries()){
            if(!reduced&&Math.floor((at-effect.at)/650)%2!==index)continue;
            const x=row.position.x+(index?18:-18),y=row.position.y-64*(row.scale||1)-39;
            ctx.save();ctx.globalAlpha=.8;ctx.fillStyle='#fff9ed';ctx.strokeStyle='#b9a68a';ctx.lineWidth=1.2;
            ctx.beginPath();ctx.roundRect(x-14,y-10,28,18,7);ctx.fill();ctx.stroke();
            ctx.beginPath();ctx.moveTo(x-3,y+8);ctx.lineTo(x,y+12);ctx.lineTo(x+3,y+8);ctx.stroke();
            ctx.strokeStyle='#8b9b8c';ctx.beginPath();ctx.moveTo(x-9,y);ctx.quadraticCurveTo(x-6,y-7,x-3,y);ctx.quadraticCurveTo(x,y+6,x+3,y-2);ctx.stroke();
            ctx.beginPath();ctx.arc(x+8,y-1,1.3,0,Math.PI*2);ctx.fillStyle='#c7a478';ctx.fill();ctx.restore();
        }
        if(['dialogue','meal-arrival'].includes(effect.kind)||effect.babyId)for(const row of pets){
            if(used.has(row.pet.id))continue;used.add(row.pet.id);
            const y=row.position.y-64*(row.scale||1)-14,x=row.position.x,count=Math.min(p.marksRequired,effect.status?.available||0);
            for(let i=0;i<p.marksRequired;i++){ctx.fillStyle=i<count?'#e5839b':'#fff4da';ctx.fillRect(x-p.marksRequired*9+i*18,y,15,6);}
            ctx.save();ctx.translate(x,y-15-(reduced?0:Math.sin(time/300)*3));ctx.scale(9,9);ctx.fillStyle='#e9859a';ctx.beginPath();ctx.moveTo(0,.7);ctx.bezierCurveTo(-1.6,-.2,-.7,-1.4,0,-.6);ctx.bezierCurveTo(.7,-1.4,1.6,-.2,0,.7);ctx.fill();ctx.restore();
        }
    }
    const marked=new Set();
    for(const row of rows){
        const friends=new Set((row.pet?.memories||[]).filter(memory=>memory.total>0).sort((a,b)=>b.lastAt-a.lastAt||String(a.otherId).localeCompare(String(b.otherId))).slice(0,p.memoryCapacity).map(memory=>memory.otherId));
        if(!friends.size)continue;
        for(const other of rows)if(other!==row&&friends.has(other.pet?.id)&&Math.hypot(row.position.x-other.position.x,row.position.y-other.position.y)<=p.interactionDistance){marked.add(row);marked.add(other);}
    }
    for(const row of marked)drawPinkMark(ctx,row.position.x,row.position.y-64*(row.scale||1)-8,time,reduced);
    ctx.restore();
}
