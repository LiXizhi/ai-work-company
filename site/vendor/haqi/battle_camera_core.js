// Presentation only. Camera grammar: CombatCameraView.lua PlayMotion and
// config/Aries/Cameras/Cameras.xml caster / target / ground shots (kids).
// The original 3D distances are deliberately not battle balance parameters.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
const mix=(a,b,t)=>a+(b-a)*t;
export const GROUND_ASPECT=.39/.76;

export function cinematicCast(event,card,reducedMotion=false){
    if(reducedMotion)return false;
    if(['pass','fizzle'].includes(event?.type))return true;
    return event?.type==='cast'&&event.label!=='reflection'&&event.sourceType!=='reflection'
        &&typeof card?.pipcost==='number'&&Number.isFinite(card.pipcost)&&card.pipcost>=1;
}
export function battleCameraTemplate(card,spec={}){
    if(spec.friendly||/Heal|Shield|Ward|Absorb|Guardian|Cleanse|Revive|Pip|Blade|Aura/.test(card?.type||'')&&!/Attack|LifeTap/.test(card?.type||''))return 'support';
    if(spec.kind==='summon'||['center','field'].includes(spec.choreography?.placement))return 'summon';
    if(spec.area||/^Area/.test(card?.type||'')||['meteor','vines','vortex'].includes(spec.kind))return 'area';
    return 'strike';
}

export function sampleBattleCamera({event,card,spec={},progress=0,positions={},targets=[],bounds={},center,width,height,safeRect,reducedMotion=false,timeline={}}){
    const caster=positions[event?.caster],target=positions[event?.target]||caster;
    const base={active:false,blend:0,center,width,height};
    if(!cinematicCast(event,card,reducedMotion)||!caster||!target||(event.target&&!positions[event.target]))return base;
    const p=clamp(progress),blend=ease(p/.055)*(1-ease((p-.87)/.13));
    if(blend===0)return base;
    const rect=safeRect||{x:16,y:40,width:width-32,height:height-72};
    const template=battleCameraTemplate(card,spec),summon=spec.kind==='summon';
    const attack=timeline[summon?'summonAttack':'attack']??.35,impact=timeline[summon?'summonImpact':'impact']??.7;
    const reveal=clamp((p-attack)/Math.max(.06,impact-attack));
    const close=event.type!=='cast'||p<attack,hit=event.type==='cast'&&p>=impact;
    const middle=template==='summon'?center:{x:mix(caster.x,target.x,.5),y:mix(caster.y,target.y,.5)};
    const focus=close?caster:template==='support'?target:hit&&template==='strike'?target:middle;
    const focusId=close?event.caster:template==='support'||hit&&template==='strike'?(event.target||event.caster):null;
    // Camera stands on the arena side of the subject, looking outward at its face.
    const aim=close?caster:hit&&template==='strike'?target:caster;
    const yaw=clamp(Math.atan2(aim.x-center.x,-(aim.y-center.y)/GROUND_ASPECT),-.75,.75)+(close?Math.sin(p*7)*.025:0);
    const actorHeight=Math.max(85,-(bounds[focusId]?.hitTop??-100));
    const actorWidth=Math.max(80,(bounds[focusId]?.right??52)-(bounds[focusId]?.left??-52));
    const desired=clamp(Math.min(rect.height*.51/actorHeight,rect.width*.82/actorWidth),.5,3.7);
    const zoom=focusId?desired:Math.min(desired,1.8);
    const pitch=close?.32:template==='summon'?.36:.44;
    const distance=Math.max(width,height)*2.4;
    const camera={...base,active:true,blend,template,focusId,focus,rect,yaw,pitch,distance,
        zoom,focusHeight:close||template==='support'?actorHeight*.48:55,
        screenX:rect.x+rect.width/2,screenY:rect.y+rect.height*.52,
        shakeX:0,shakeY:0,
        close,impact,attack,reveal};
    if(!focusId){
        // Frame the full affected group, including sprites above their ground anchors.
        const subjects=[caster,...(targets.length?targets:[target])].map(at=>({at,half:52,height:110}));
        if(template==='summon')subjects.push({at:center,half:110,height:220});
        let fit=1;
        for(const {at,half,height:actorHeight} of subjects){
            const foot=projectBattlePoint({...camera,blend:1},at),head=projectBattlePoint({...camera,blend:1},at,actorHeight);
            for(const x of [foot.x-half*foot.scale,foot.x+half*foot.scale]){
                const dx=x-camera.screenX;fit=Math.min(fit,(dx<0?camera.screenX-rect.x:rect.x+rect.width-camera.screenX)/Math.max(1,Math.abs(dx)));
            }
            for(const y of [foot.y+20*foot.scale,head.y]){
                const dy=y-camera.screenY;fit=Math.min(fit,(dy<0?camera.screenY-rect.y:rect.y+rect.height-camera.screenY)/Math.max(1,Math.abs(dy)));
            }
        }
        camera.zoom*=fit*.94;
    }
    return camera;
}

// Input coordinates retain the existing arena ellipse. Height is above its floor.
export function projectBattlePoint(camera,point,height=0){
    if(!camera.active)return {x:point.x,y:point.y-height,scale:1,depth:point.y};
    // A single view/projection transform, not a blend of projected pixels.
    // All floor points share one homogeneous denominator: straight lines stay straight.
    const t=camera.blend,focusX=mix(camera.center.x,camera.focus.x,t),focusY=mix(camera.center.y,camera.focus.y,t);
    const yaw=camera.yaw*t,pitch=mix(Math.asin(GROUND_ASPECT),camera.pitch,t);
    const dx=point.x-focusX,dz=(point.y-focusY)/GROUND_ASPECT;
    const lateral=dx*Math.cos(yaw)+dz*Math.sin(yaw);
    const forward=dx*Math.sin(yaw)-dz*Math.cos(yaw);
    const vertical=height-camera.focusHeight*t;
    const depth=forward*Math.cos(pitch)-vertical*Math.sin(pitch);
    const denominator=1+t*depth/camera.distance;
    // Keep geometry behind the near plane out of the draw path; never clamp each
    // vertex to an arbitrary depth (which folds circles into non-conic shapes).
    if(denominator<=.05)return {x:0,y:0,scale:0,depth,visible:false};
    const k=mix(1,camera.zoom,t)/denominator;
    return {x:mix(camera.center.x,camera.screenX,t)+lateral*k,
        y:mix(camera.center.y,camera.screenY,t)-(forward*Math.sin(pitch)+vertical*Math.cos(pitch))*k,
        scale:k,depth,visible:true};
}

export function cameraActorFacing(camera,id,position,standardFacing){
    if(!camera.active||camera.blend<.5)return standardFacing;
    if(id===camera.focusId)return 0; // Existing down/front body and head frames.
    const x=position.x-camera.center.x,z=(position.y-camera.center.y)/GROUND_ASPECT;
    const horizontal=-x*Math.cos(camera.yaw)-z*Math.sin(camera.yaw);
    const towardCamera=x*Math.sin(camera.yaw)-z*Math.cos(camera.yaw);
    return Math.abs(towardCamera)>Math.abs(horizontal)?(towardCamera>0?0:3):(horizontal>0?2:1);
}
