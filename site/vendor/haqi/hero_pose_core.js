import { createRng } from './rng_core.js';
import { WALK_SPEED } from './adventure_world_core.js';

export const HEAD_DIRECTIONS = Array.from({length:16},(_,i)=>i*22.5);
export const BODY_TO_HEAD = [0, 4, 12, 8];
export const BODY_TO_SIMPLE_HEAD = [0, 2, 3, 1];
export function headFrameIndex(directionCount, facing, head=BODY_TO_HEAD[facing]) {
    return directionCount===4?BODY_TO_SIMPLE_HEAD[facing]??0:((head%16)+16)%16;
}
// One walkTime second per WALK_SPEED world units so on-foot playback matches wall-clock AI actors.
export const WALK_CYCLE_DISTANCE = WALK_SPEED;
export const GAZE_RADIUS = 90;
export const GAZE_SWITCH_SEC = 1.8;
const wrap = n => (n % 16 + 16) % 16;
const delta = (a, b) => (a - b + 24) % 16 - 8;
export function direction16(dx, dy) { return wrap(Math.round(Math.atan2(-dx, dy) / (Math.PI / 8))); }
export function facingToward(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 1 : 2;
    return dy < 0 ? 3 : 0;
}
export function clampHead(head, facing) {
    const body = BODY_TO_HEAD[facing] ?? 0;
    return wrap(body + Math.max(-2, Math.min(2, delta(head, body))));
}
export function createHeroActor(seed = 7419) {
    return { rng: createRng(seed), head: 0, facing: 0, stoppedAt: null, nextLook: null, lookUntil: 0, lookOffset: 0, lastTurn: -Infinity, targetId: null,phase:(Number(seed)%31)/31*Math.PI*2,lastTime:null };
}
export function headBreath(time=0,phase=0,reducedMotion=false) {
    if(reducedMotion)return {x:0,y:0,angle:0};
    return {x:Math.sin(time*1.13+phase)*.22,y:Math.sin(time*1.9+phase)*.55,angle:Math.sin(time*.83+phase)*.012};
}
// Sprite playback is cosmetic; a stopped/blocked actor always uses its idle body.
export function walkFrameIndex(animation, {moving=false, reducedMotion=false, time=0, walkTime=time}={}) {
    if (!animation || !moving || reducedMotion) return null;
    const count=animation.framesPerDirection, fps=animation.fps;
    if (!(count>0 && fps>0) || !Number.isFinite(walkTime)) return null;
    return ((Math.floor(walkTime*fps)%count)+count)%count;
}
// Up to two nearby head-turnable peers (pair or triangle). Callers omit non-turnable NPCs, or mark canTurn:false.
export function lookPeersAround(self, candidates, radius = GAZE_RADIUS) {
    const near = (candidates || []).filter(c => c && c.id !== self.id && c.canTurn !== false && Math.hypot(c.x - self.x, c.y - self.y) < radius)
        .sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y));
    if (near.length <= 1) return near.slice(0, 1);
    const a = near[0], b = near[1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < radius) return [a, b];
    return [a];
}
// Pair: stare at the other. Trio: alternate between the other two.
export function selectGazeTarget(self, peers, time = 0, { switchSec = GAZE_SWITCH_SEC, seed = 0 } = {}) {
    if (!peers?.length) return null;
    if (peers.length === 1) return peers[0];
    const phase = (Math.abs(Number(seed) || 0) % 1000) / 1000 * switchSec;
    return peers[Math.floor((time + phase) / switchSec) % peers.length];
}
// Seconds, world coordinates, and actual displacement after collisions. No saved state.
// lookPeers: head-turnable characters (hero + social AI). npcs: one-way fallback (static world NPCs).
export function updateHeroActor(actor, { dx = 0, dy = 0, x = 0, y = 0, time = 0, id = 'self', npcs = [], lookPeers = null, reducedMotion = false, lookAround = true, facing } = {}) {
    if(facing!==undefined)actor.facing=facing;
    if(actor.lastTime!==null&&(time<actor.lastTime||time-actor.lastTime>1)){actor.stoppedAt=time;actor.nextLook=null;actor.lookUntil=0;}
    actor.lastTime=time;
    const moving = Math.hypot(dx, dy) > .01;
    actor.walkDistance = moving ? (actor.walkDistance || 0) + Math.hypot(dx,dy) : 0;
    let wanted = BODY_TO_HEAD[actor.facing];
    if (moving) {
        if(facing===undefined)actor.facing = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 1 : 2 : dy < 0 ? 3 : 0;
        wanted = direction16(dx, dy); actor.stoppedAt = null; actor.nextLook = null; actor.targetId = null;
    } else {
        actor.stoppedAt ??= time;
        const self = { id, x, y };
        const mutual = lookPeersAround(self, lookPeers);
        let target = selectGazeTarget(self, mutual, time, { seed: actor.rng.seed });
        if (!target) {
            const candidates = npcs.filter(n => !n.hidden).map(n => ({ ...n, distance: Math.hypot(n.x-x, n.y-y) })).filter(n => n.distance < GAZE_RADIUS).sort((a,b) => a.distance-b.distance);
            const previous = candidates.find(n => n.id === actor.targetId);
            target = previous && previous.distance <= (candidates[0]?.distance ?? 0)+12 ? previous : candidates[0];
        }
        actor.targetId = target?.id ?? null;
        if (target) {
            const tdx = target.x - x, tdy = target.y - y;
            wanted = direction16(tdx, tdy);
            actor.facing = facingToward(tdx, tdy);
            actor.nextLook = null;
        } else if (!reducedMotion && lookAround && time-actor.stoppedAt >= .8) {
            actor.nextLook ??= time + .5 + actor.rng.float()*1.3;
            if (time >= actor.nextLook) {
                const sign=actor.lookOffset ? -Math.sign(actor.lookOffset) : actor.rng.int(0,1)?1:-1;
                actor.lookOffset = sign*actor.rng.int(1,2);
                actor.lookUntil = time + .7 + actor.rng.float()*1.1;
                actor.nextLook = actor.lookUntil + 1.1 + actor.rng.float()*2.1;
            }
            wanted = wrap(BODY_TO_HEAD[actor.facing] + (time < actor.lookUntil ? actor.lookOffset : 0));
        }
    }
    wanted = clampHead(wanted, actor.facing);
    // A body turn must not leave a transient backwards neck pose.
    actor.head = clampHead(actor.head, actor.facing);
    if (actor.head !== wanted && time-actor.lastTurn >= .12) {
        actor.head = wrap(actor.head + Math.sign(delta(wanted, actor.head))); actor.lastTurn = time;
    }
    return { facing: actor.facing, head: actor.head, moving, walkTime:actor.walkDistance/WALK_CYCLE_DISTANCE, targetId: actor.targetId,breath:headBreath(time,actor.phase,reducedMotion) };
}
