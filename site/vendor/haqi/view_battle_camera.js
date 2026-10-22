import {projectBattlePoint,GROUND_ASPECT} from './battle_camera_core.js';
import {battlePointerAngle} from './battle_pointer_core.js';

// Measure only when the layout or playback mode changes; never force layout per frame.
export function battleCameraViewport(canvas,active,scale){
    const root=canvas.closest?.('.battle-layer'),key=`${canvas.clientWidth}:${canvas.clientHeight}:${active}`;
    root?.classList.toggle('battle-cinematic',active);
    if(!active||!canvas.getBoundingClientRect){canvas.cameraLayoutKey=null;return undefined;}
    const header=root?.querySelector('.battle-heading-actions');
    if(canvas.cameraLayoutKey!==key||canvas.cameraHeader!==header){
        canvas.cameraHeader=header;
        canvas.cameraLayoutKey=key;
        const box=canvas.getBoundingClientRect(),margin=16;
        let top=margin,bottom=box.height-margin,left=margin,right=box.width-margin;
        for(const element of root?.querySelectorAll('.battle-heading-actions,.battle-controls>.battle-actions,.battle-hand,.prologue-hud')||[]){
            const style=getComputedStyle(element),r=element.getBoundingClientRect();
            if(style.visibility==='hidden'||style.display==='none'||!r.width||!r.height)continue;
            if(r.bottom<=box.top||r.top>=box.bottom)continue;
            if(element===header||r.width>box.width*.45){
                if(r.top<box.top+box.height*.3)top=Math.max(top,r.bottom-box.top+44);
                else if(r.bottom>box.top+box.height*.7)bottom=Math.min(bottom,r.top-box.top-8);
            }
        }
        // Reserve a single readable name/skill caption, including on very short screens.
        top=Math.max(top,48);bottom=Math.max(top+100,bottom);
        canvas.cameraSafeRect={x:left/scale,y:top/scale,width:(right-left)/scale,height:(bottom-top)/scale};
    }
    return canvas.cameraSafeRect;
}

export function drawCameraGround(c,camera,{center,radius,time,pointer,positions}){
    const point=(x,z)=>projectBattlePoint(camera,{x:center.x+x,y:center.y+z*GROUND_ASPECT});
    const path=(vertices,fill,stroke)=>{
        const projected=vertices.map(([x,z])=>point(x,z));
        if(projected.some(p=>p.visible===false))return;
        c.beginPath();projected.forEach((p,i)=>{i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);});c.closePath();
        if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}
    };
    const ring=(r,fill,stroke)=>path(Array.from({length:96},(_,i)=>{const a=i*Math.PI/48;return [Math.cos(a)*r,Math.sin(a)*r];}),fill,stroke);
    c.save();ring(radius+24,'#112f3c99');ring(radius,'#809580');ring(radius-9,'#c5c4a4');
    for(const r of [radius-18,radius*.83,radius*.62,radius*.51])ring(r,null,'#91a084');
    for(const r of [radius-18,radius*.62])path(Array.from({length:5},(_,i)=>{const a=i*Math.PI*4/5+time*.05;return [Math.cos(a)*r*.75,Math.sin(a)*r*.75];}),null,'#9da98c');
    for(const at of Object.values(positions)){
        const x=at.x-center.x,z=(at.y-center.y)/GROUND_ASPECT;
        path(Array.from({length:24},(_,i)=>[x+Math.cos(i*Math.PI/12)*19,z+Math.sin(i*Math.PI/12)*19]),null,'#ecdfb1aa');
    }
    if(positions[pointer.to]){
        const angle=battlePointerAngle(center,positions[pointer.from],positions[pointer.to],pointer.progress),length=radius*.49;
        const rotate=([x,z])=>[x*Math.cos(angle)-z*Math.sin(angle),x*Math.sin(angle)+z*Math.cos(angle)];
        path([[18,-3],[length*.68,-3],[length*.68,-20],[length,0],[length*.68,20],[length*.68,3],[18,3]].map(rotate),'#a2c9b477','#568d87');
    }
    c.restore();
}
