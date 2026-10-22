// Fixed viewport budget. Subtracting the camera plants each particle in the world,
// so walking scrolls the field instead of dragging it with the character.
import { regionAt } from './adventure_island_layout_core.js';
function fract(n){return n-Math.floor(n);}
function hash(i){return fract(Math.sin(i*127.1+311.7)*43758.5453);}
const SPECKS=Array.from({length:64},(_,i)=>({
    x:i*173.31,y:i*97.73,sway:i,alpha:.35+(i%4)*.13,size:12+i%3*3,
    u:hash(i+1),v:hash(i+17),depth:hash(i+41),spin:hash(i+63),
}));
function drawSnowflake(c,x,y,arm,turn){
    c.save();c.translate(x,y);c.rotate(turn);c.lineWidth=1.25;c.lineCap='round';
    for(let i=0;i<6;i++){c.rotate(Math.PI/3);c.beginPath();c.moveTo(0,0);c.lineTo(arm,0);c.stroke();}
    c.restore();
}
const FADE_MS=900;
function shownWeather(weather,allowMotes){
    if(!weather||weather.kind==='none'||!allowMotes&&weather.kind==='motes')return null;
    return weather;
}
// Crossfades the particle field when the player enters or leaves a weather region.
export function stepWeatherFade(state,weather,time,allowMotes=false){
    const shown=shownWeather(weather,allowMotes),key=shown?.kind||null;
    if(!state)return {key,weather:shown,weight:1,previous:null,previousWeight:0,at:time};
    const dt=Math.max(0,time-state.at);
    let {key:currentKey,weather:currentWeather,weight,previous,previousWeight}=state;
    if(currentKey!==key){
        if(currentKey&&weight>0.02){previous=currentWeather;previousWeight=weight;}
        currentKey=key;currentWeather=shown;weight=0;
    }
    weight=Math.min(1,weight+dt/FADE_MS);
    if(previous){previousWeight=Math.max(0,previousWeight-dt/FADE_MS);if(previousWeight<=0){previous=null;previousWeight=0;}}
    return {key:currentKey,weather:currentWeather,weight,previous,previousWeight,at:time};
}
export function drawIslandWeather(c,world,position,time,w,h,reducedMotion=false,art=null,override=null,camera=null,opacity=1){
    const weather=override||(world.layout&&regionAt(world,position)?.weather);
    if(!weather||weather.kind==='none'||reducedMotion||opacity<=0.01)return;
    if(!override&&weather.kind==='motes')return;
    const {kind,color,speed,wind}=weather,count=Math.min(64,weather.count);
    const wrap=(n,max)=>((n%max)+max)%max;
    const scale=camera?.scale>0?camera.scale:1;
    const scrollX=(camera?.x||0)*scale,scrollY=(camera?.y||0)*scale;
    const speckSize=kind==='mist'?180:18;
    const alphaScale=kind==='mist'?.08:1;
    c.save();c.fillStyle=kind==='snow'?'#f7fbff':color;c.strokeStyle=kind==='snow'?'#f7fbff':color;c.lineWidth=1;
    for(let i=0;i<count;i++){
        const speck=SPECKS[i];
        if(kind==='snow'){
            const depth=speck.depth,spanX=w+40,spanY=h+40;
            const fall=speed*(.28+speck.v*1.35),drift=wind*(.25+speck.u*1.5);
            const sway=Math.sin(time*(.28+speck.spin*.85)+speck.u*6.28)*(8+depth*34);
            const x=wrap(speck.u*spanX+time*drift+sway-scrollX,spanX)-20;
            const y=wrap(speck.v*spanY+time*fall-scrollY,spanY)-20;
            const near=depth>.45;
            c.globalAlpha=(near?.9:.5+.35*depth)*opacity;
            if(near){
                const arm=11+depth*16;
                c.globalAlpha*=.35;c.beginPath();c.ellipse(x,y,arm*.42,arm*.42,0,0,Math.PI*2);c.fill();
                c.globalAlpha=Math.min(1,c.globalAlpha/.35);
                drawSnowflake(c,x,y,arm,time*(.15+speck.spin*.35)+speck.spin*6);
                c.beginPath();c.ellipse(x,y,2.2,2.2,0,0,Math.PI*2);c.fill();
            }else{
                const r=2.6+depth*4;
                c.beginPath();c.ellipse(x,y,r,r,0,0,Math.PI*2);c.fill();
            }
            continue;
        }
        if(kind==='sand'){
            // Screen-sized ribbons, like snowflakes, remain legible over pale terrain.
            // Integrating the gust keeps motion continuous while its speed rises/falls.
            const depth=speck.depth,direction=wind<0?-1:1;
            const gust=time+.24*Math.sin(time*1.15+speck.sway)/1.15;
            const spanX=w+360,spanY=h+100;
            const x=wrap(speck.u*spanX+gust*wind*(1.5+depth*2)-scrollX,spanX)-180;
            const y=wrap(speck.v*spanY+time*speed*.18+Math.sin(time*.8+speck.sway)*(5+depth*10)-scrollY,spanY)-50;
            const length=48+depth*100,bend=8+speck.v*14;
            const alpha=(.28+depth*.3)*(.7+.3*Math.sin(time*1.15+speck.sway)**2)*opacity;
            c.save();c.translate(x,y);c.scale(direction,1);c.lineCap='round';
            c.beginPath();c.moveTo(-length/2,bend*.3);
            c.bezierCurveTo(-length*.15,-bend,length*.18,bend,length/2,-bend*.4);
            c.globalAlpha=alpha*.6;c.strokeStyle='#805126';c.lineWidth=3+depth*2;c.stroke();
            c.globalAlpha=alpha;c.strokeStyle='#fff1bf';c.lineWidth=1.3+depth;c.stroke();
            // Separate grains trail the ribbon; dark and light stay visible on roads/trees.
            for(let j=0;j<3;j++){
                const px=-length*.45+j*length*.28,py=10+Math.sin(speck.sway+j+time*1.8)*5;
                c.globalAlpha=alpha*(j===1?.85:1);c.fillStyle=j===1?'#fff0bb':'#94602d';
                c.beginPath();c.ellipse(px,py,1.5+depth*1.8,.8+depth*.8,-.15,0,Math.PI*2);c.fill();
            }
            c.restore();continue;
        }
        const x=wrap(speck.x+time*wind+Math.sin(time*.6+speck.sway)*9-scrollX,w+40)-20;
        const y=wrap(speck.y+time*speed-scrollY,h+40)-20;
        c.globalAlpha=(kind==='mist'?alphaScale:speck.alpha)*opacity;
        if(kind==='ash'){
            // Fire-island ash used to be a faint smoke sprite. Crisp tumbling
            // flakes retain a visible silhouette against both roads and lava rock.
            const size=7+speck.depth*10;
            c.globalAlpha=(.55+speck.depth*.3)*opacity;
            c.fillStyle='#51474b';
            c.beginPath();c.ellipse(x,y,size*.8,size*.45,0,0,Math.PI*2);c.fill();
            c.save();c.translate(x,y);c.rotate(time*(.35+speck.spin*.6)+speck.spin*6);
            c.scale(.55+.45*Math.abs(Math.sin(time*.9+speck.sway)),1);
            c.beginPath();c.moveTo(-size*.8,-size*.2);c.lineTo(-size*.3,-size*.6);
            c.lineTo(size*.65,-size*.35);c.lineTo(size*.8,size*.15);
            c.lineTo(size*.1,size*.5);c.lineTo(-size*.65,size*.3);c.closePath();
            c.fillStyle='#e4d7c9';c.fill();c.strokeStyle='#695652';c.lineWidth=1.3;c.stroke();
            c.beginPath();c.moveTo(-size*.45,-size*.1);c.lineTo(size*.4,size*.1);
            c.strokeStyle='#fff0d9';c.lineWidth=1.5;c.stroke();
            c.restore();continue;
        }
        if(art){
            const size=speckSize||speck.size;
            c.globalAlpha*=kind==='mist'?.8:.85;
            if(art.draw(c,'weather',kind,x-size/2,y-size/2,size,size))continue;
        }
        c.beginPath();
        const r=kind==='mist'?45:1.3;c.ellipse(x,y,r,kind==='mist'?r*.25:r,0,0,Math.PI*2);c.fill();
    }
    c.restore();
}
