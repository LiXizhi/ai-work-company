import {earthEnvironment} from './adventure_earth_environment_core.js';
import {earthGeo} from './adventure_earth_core.js';
import {createRng} from './rng_core.js';
const rng=createRng(819071),specks=Array.from({length:48},()=>({u:rng.float(),v:rng.float(),depth:rng.float()}));
const wrap=(v,n)=>((v%n)+n)%n;
// One pool for both fading fields; no DOM particles, blur, pixel readback,
// terrain rebaking or separate animation loop. All lists have fixed budgets.
export function createEarthEnvironmentPainter({makeCanvas=()=>document.createElement('canvas')}={}){
    let scope=null,state=null,target=null,key='',last=null,refresh=-Infinity,waterKey='',water=[],waterRevision=-1,waterQueries=0;
    let previous='clear',blend=1;
    let lightSprite=null,lightKey='',lights=[],lightObjects=null;
    function update(world,position,time,{light='day',weather='clear',at=Date.now(),reducedMotion=false}={}){
        if(!world.isEarth&&!world.isCityDungeon){if(scope){scope=null;state=null;target=null;lightObjects=null;lights=[];water=[];}return null;}
        const geo=world.isEarth?earthGeo(position,world.earthRules):world.city?.entrance||{lon:0,lat:0};
        const nextKey=`${light}:${weather}:${Math.floor(geo.lon/2)}:${Math.floor(geo.lat/2)}`;
        if(scope!==world){scope=world;state=null;target=null;refresh=-Infinity;key='';waterKey='';water=[];last=null;previous='clear';blend=1;lightKey='';lights=[];lightObjects=null;}
        if(time>=refresh||key!==nextKey){
            const biome=world.isEarth?world.terrainAt(position.x,position.y)||'grass':'urban';
            const next=earthEnvironment({at,...geo,biome,light,weather});
            if(target&&next.kind!==target.kind){previous=target.kind;blend=0;}
            target=next;refresh=time+1000;key=nextKey;
        }
        const dt=last===null?0:Math.max(0,Math.min(100,time-last));last=time;
        if(!state)state={...target};
        else{const mix=reducedMotion?1:1-Math.exp(-dt/650);state.night+=(target.night-state.night)*mix;state.warm+=(target.warm-state.warm)*mix;state.kind=target.kind;}
        blend=reducedMotion?1:Math.min(1,blend+dt/1200);
        return state;
    }
    function ground(c,world,cam,w,h,time,{enabled=true,reducedMotion=false}={}){
        if(!state||!world.isEarth||!enabled||reducedMotion)return;
        // Fixed world lattice: waves do not follow the player or cross land.
        const step=128,west=Math.floor(cam.x/step),north=Math.floor(cam.y/step),cols=Math.min(10,Math.ceil(w/cam.scale/step)+2),rows=Math.min(8,Math.ceil(h/cam.scale/step)+2);
        const nextKey=`${west}:${north}:${cols}:${rows}`;
        if(nextKey!==waterKey||waterRevision!==world.revision){
            waterKey=nextKey;waterRevision=world.revision;water=[];
            for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
                const px=(west+x+.35)*step,py=(north+y+.55)*step;waterQueries++;
                if(['water','ocean'].includes(world.terrainAt(px,py))){waterQueries++;if(['water','ocean'].includes(world.terrainAt(px+25,py)))water.push({x:px,y:py,phase:x*1.7+y*2.3});}
            }
        }
        c.save();c.strokeStyle='#c8eeed';c.lineWidth=1/cam.scale;c.beginPath();
        c.globalAlpha=(.10+.07*Math.sin(time/1800))*(1-state.night*.6);
        for(const p of water){const drift=Math.sin(time/1200+p.phase)*3;c.moveTo(p.x,p.y+drift);c.quadraticCurveTo(p.x+12,p.y-2+drift,p.x+25,p.y+drift);}
        c.stroke();c.restore();
    }
    function tint(c,w,h){
        if(!state)return;
        c.save();
        if(state.night>.005){c.fillStyle='#232742';c.globalAlpha=state.night*.28;c.fillRect(0,0,w,h);}
        if(state.warm>.005){c.fillStyle='#ffc27a';c.globalAlpha=state.warm*.13;c.fillRect(0,0,w,h);}
        c.restore();
    }
    function nightLights(c,world,cam,w,h,{enabled=true}={}){
        if(!state||state.night<.03||!enabled)return;
        const objects=world.dungeon?.scene.streetscape?.objects||world.buildings||[];
        const nextKey=`${Math.floor(cam.x/128)}:${Math.floor(cam.y/128)}:${Math.ceil(w/cam.scale)}:${Math.ceil(h/cam.scale)}`;
        if(nextKey!==lightKey||objects!==lightObjects){
            lightKey=nextKey;lightObjects=objects;lights=[];
            // Warm doorway accents on visible building sprites; artistic light,
            // not fabricated geometry, windows or geographic street lamps.
            for(const o of objects){
                if(o.type&&o.type!=='building'||o.x<cam.x||o.y<cam.y||o.x>cam.x+w/cam.scale||o.y>cam.y+h/cam.scale)continue;
                lights.push({x:o.x,y:o.y-8});if(lights.length===12)break;
            }
        }
        if(!lights.length)return;
        if(!lightSprite){lightSprite=makeCanvas();lightSprite.width=lightSprite.height=64;const g=lightSprite.getContext('2d'),glow=g.createRadialGradient(32,32,1,32,32,31);glow.addColorStop(0,'#ffe7a1cc');glow.addColorStop(.22,'#ffcf7777');glow.addColorStop(1,'#ffbc6500');g.fillStyle=glow;g.fillRect(0,0,64,64);}
        c.save();c.globalAlpha=state.night*.75;
        for(const p of lights){const x=(p.x-cam.x)*cam.scale,y=(p.y-cam.y)*cam.scale;c.drawImage(lightSprite,x-26*cam.scale,y-18*cam.scale,52*cam.scale,36*cam.scale);}
        c.restore();
    }
    function field(c,kind,weight,start,count,cam,w,h,time){
        if(kind==='clear'||weight<.01||!count)return;
        c.globalAlpha=weight*(kind==='sand'?.30:kind==='snow'?.7:.35);
        if(kind==='fog'){c.fillStyle='#d9e4df';c.globalAlpha=weight*.12;c.fillRect(0,0,w,h);return;}
        c.strokeStyle=kind==='sand'?'#ecd7a4':kind==='snow'?'#f4f8ff':'#c3ddec';
        c.lineWidth=kind==='snow'?2:1;c.lineCap=kind==='snow'?'round':'butt';c.beginPath();
        const t=time/1000,sx=cam.x*cam.scale,sy=cam.y*cam.scale;
        for(let i=start;i<start+count;i++){
            const p=specks[i],speed=kind==='rain'?300:kind==='sand'?14:26;
            const wind=kind==='sand'?95:kind==='rain'?-65:12;
            const x=wrap(p.u*(w+80)+t*wind-sx,w+80)-40,y=wrap(p.v*(h+80)+t*speed*(.6+p.depth)-sy,h+80)-40;
            c.moveTo(x,y);c.lineTo(x+(kind==='rain'?-3:kind==='sand'?16:1),y+(kind==='rain'?10+p.depth*7:kind==='snow'?2:0));
        }
        c.stroke();
    }
    function weather(c,cam,w,h,time,{enabled=true,reducedMotion=false,low=false}={}){
        if(!state||!enabled||reducedMotion)return;
        const count=low?24:48,old=blend>=1?0:Math.round(count*(1-blend));
        c.save();field(c,previous,1-blend,0,old,cam,w,h,time);field(c,state.kind,blend,old,count-old,cam,w,h,time);c.restore();
    }
    return {update,ground,tint,nightLights,weather,get stats(){return {active:!!state,kind:state?.kind,night:state?.night,particles:48,lights:lights.length,water:water.length,waterQueries};}};
}
