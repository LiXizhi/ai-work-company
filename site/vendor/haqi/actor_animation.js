import { actorPose } from './actor_animation_core.js';
export function drawAnimatedActor(ctx,at,action,progress,direction,reduced,draw) {
    const pose=actorPose(action,progress,direction,reduced);
    ctx.save();
    try {
        ctx.translate(at.x+pose.x,at.y+pose.y);ctx.rotate(pose.rotation);ctx.scale(pose.sx,pose.sy);
        ctx.globalAlpha*=pose.alpha;
        if(pose.brightness!==1&&!(typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches)){
            ctx.filter=`brightness(${Math.round(pose.brightness*10)/10})`;
        }
        draw();
    } finally {ctx.restore();}
}
