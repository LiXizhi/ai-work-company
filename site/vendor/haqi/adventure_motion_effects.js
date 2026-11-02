import { createRng } from './rng_core.js';

// Presentation tuning only; these values never modify combat stats or saves.
export const MOTION_PALETTES = {
    fire: ['#ff963b', '#ffe5a0'], ice: ['#67d8ee', '#e0fbff'],
    storm: ['#b397ff', '#f1e7ff'], life: ['#78c855', '#d9f6a5'],
    death: ['#9572cc', '#d4baff'],
};
const clamp = (value, max = 1) => Math.max(0, Math.min(max, Number(value) || 0));

export function motionStyle(save, membership = {}, now = Date.now()) {
    const equipped = new Set(Object.values(save.equipmentGuids || {}));
    const rows = (save.equipmentInstances || []).filter(row => equipped.has(row.guid));
    const upgrades = rows.reduce((sum, row) => sum + clamp(row.serverdata?.addlel, 20), 0);
    const gems = rows.reduce((sum, row) => sum + (row.serverdata?.gem?.ins || []).filter(id => Number(id) > 0).length, 0);
    const strength = clamp((clamp(save.level, 50) - 1) / 49 * .5 + upgrades / 80 * .3 + gems / 12 * .2);
    const vip = membership.status === 'ready' && membership.isVip === true &&
        (!membership.expiresAt || Date.parse(membership.expiresAt) > now);
    return { school: MOTION_PALETTES[save.school] ? save.school : 'fire', strength, vip, mounted: !!save.mountId,
        pose: { mountId: save.mountId, appearance: save.appearance, headId:save.headId,bodyId:save.bodyId, facing: save.facing } };
}

// Uses actual world displacement after collision resolution, independent of four-way facing.
// Distance-based emission keeps paths consistent across refresh rates; RNG is visual-only.
export function createMotionTrail(seed = 7319) {
    const rng = createRng(seed);
    let previous = null, remainder = 0, stride = 0, serial = 0, footstep = 0;
    const state = { particles: [], angle: Math.PI / 2, moving: false, style: null };
    function reset() { previous = null; remainder = 0; stride = 0; state.particles.length = 0; state.moving = false; }
    function step(position, time, style, { moving = false, reducedMotion = false, scope = null, hidden = false } = {}) {
        state.style = style;
        if (hidden || reducedMotion) { reset(); return state; }
        state.particles = state.particles.filter(p => time - p.born < p.life && (!p.star || style.vip));
        const next = { ...position, time, scope, mounted: style.mounted };
        const old = previous; previous = next; state.moving = false;
        if (hidden || reducedMotion) { reset(); return state; }
        if (!old || old.scope !== scope || old.mounted !== style.mounted || time <= old.time || time - old.time > 250) {
            state.particles.length = 0; remainder = 0; stride = 0; return state;
        }
        const dx = position.x - old.x, dy = position.y - old.y, distance = Math.hypot(dx, dy);
        if (distance > 100) { state.particles.length = 0; remainder = 0; stride = 0; return state; }
        if (!moving || distance < .001) return state;
        state.angle = Math.atan2(dy, dx); state.moving = true;
        const ux = dx / distance, uy = dy / distance;
        const spacing = 8 - style.strength * 3;
        for (let along = spacing - remainder; along <= distance; along += spacing) {
            const x = old.x + ux * along, y = old.y + uy * along;
            const born = old.time + (time - old.time) * along / distance;
            const side = (rng.float() - .5) * (style.mounted ? 25 : 16);
            state.particles.push({ x: x - uy * side, y: y + ux * side, born,
                life: 600 + style.strength * 400 + rng.float() * 180,
                angle: state.angle, size: 3 + rng.float() * 2 + style.strength * 3,
                drift: rng.float() * 12, school: style.school, kind: 'element', star: style.vip && serial++ % 3 === 0 });
        }
        remainder = (remainder + distance) % spacing;
        const stepSize = style.mounted ? 23 : 17;
        for (let along = stepSize - stride; along <= distance; along += stepSize) {
            const side = footstep++ % 2 ? 1 : -1;
            const x = old.x + ux * along - uy * side * (style.mounted ? 11 : 6);
            const y = old.y + uy * along + ux * side * (style.mounted ? 11 : 6);
            state.particles.push({ x, y, born: old.time + (time-old.time)*along/distance,
                life: 3500, angle: state.angle, size: style.mounted ? 4 : 2.6, kind: 'foot', school: style.school });
            state.particles.push({ x, y, born: time, life: 420, angle: state.angle, size: 4, kind: 'dust', school: style.school });
            if(style.strength >= .3)state.particles.push({x:old.x+ux*along,y:old.y+uy*along,born:time,life:220,kind:'echo',pose:style.pose});
        }
        stride = (stride + distance) % stepSize;
        if (state.particles.length > 160) state.particles.splice(0, state.particles.length - 160);
        return state;
    }
    return { state, step, reset };
}

function star(c, radius) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2, r = radius * (i % 2 ? .42 : 1);
        c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath(); c.fill();
}

export function drawMotionTrail(c, state, time, drawEcho) {
    for (const p of state.particles) {
        const age = Math.max(0, (time - p.born) / p.life);
        if(p.kind==='echo') { if(drawEcho){c.save();c.globalAlpha=(1-age)*.12;drawEcho(c,p);c.restore();} continue; }
        const [color, light] = MOTION_PALETTES[p.school];
        c.save(); c.translate(p.x, p.y); c.rotate(p.angle);
        // Keep footprints legible until the longest elemental trail has dispersed.
        c.globalAlpha = p.kind === 'foot' ? .28 * (1 - clamp((time - p.born - 1200) / (p.life - 1200))) : (1 - age) * .85;
        c.fillStyle = color; c.strokeStyle = light; c.lineWidth = 1.3;
        const s = p.size * (1 - age * .45);
        if (p.kind === 'foot') {
            c.fillStyle = '#514d44'; c.beginPath(); c.ellipse(0, 0, p.size * 1.65, p.size, 0, 0, Math.PI * 2); c.fill();
        } else if (p.kind === 'dust') {
            c.fillStyle = '#d9cba5'; c.globalAlpha *= .38;
            c.beginPath(); c.ellipse(-age * 12, 0, s + age * 9, s * .6 + age * 4, 0, 0, Math.PI * 2); c.fill();
        } else {
            c.translate(-age * p.drift, 0);
            if (p.star) { c.fillStyle = '#ffe5a0'; c.rotate(-p.angle + age); star(c, s * 1.5); }
            else if (p.school === 'fire') {
                c.beginPath(); c.moveTo(s, 0); c.quadraticCurveTo(-s, -s, -s * 2.8, 0); c.quadraticCurveTo(-s, s, s, 0); c.fill();
                c.fillStyle = light; c.fillRect(-s*.5, -s*.25, s, s*.5);
            } else if (p.school === 'ice') {
                c.beginPath(); c.moveTo(s*1.8, 0); c.lineTo(0, -s); c.lineTo(-s*1.8, 0); c.lineTo(0, s); c.closePath(); c.fill(); c.stroke();
            } else if (p.school === 'storm') {
                c.beginPath(); c.moveTo(s*2, -s*.5); c.lineTo(0, s*.6); c.lineTo(0, -s*.6); c.lineTo(-s*2, s*.5);
                c.strokeStyle=color;c.lineWidth=3.5;c.stroke();c.strokeStyle=light;c.lineWidth=1;c.stroke();
            } else if (p.school === 'life') {
                c.beginPath(); c.moveTo(s*1.8, 0); c.quadraticCurveTo(0, -s*1.6, -s*1.8, 0); c.quadraticCurveTo(0, s*1.6, s*1.8, 0); c.fill();
                c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.stroke();
            } else {
                c.beginPath(); c.arc(0, 0, s, .4, Math.PI*1.8); c.stroke();
                c.globalAlpha *= .35; c.beginPath(); c.ellipse(-s, 0, s*2.5, s, 0, 0, Math.PI*2); c.fill();
            }
        }
        c.restore();
    }
}

// A free-angle magical ribbon and star accessory; body sprite remains upright.
export function drawMotionAccessory(c, state, position, time, reducedMotion = false, foreground = false) {
    if (!state.style || reducedMotion) return;
    const { school, strength, vip, mounted } = state.style;
    if (!state.moving && !vip) return;
    c.save(); c.translate(position.x, position.y - (mounted ? 39 : 35)); c.rotate(state.angle);
    const [color, light] = MOTION_PALETTES[school];
    if (state.moving && !foreground) {
        const length = 18 + strength * 20, wave = Math.sin(time / 120) * 3;
        c.globalAlpha = .65; c.strokeStyle = color; c.lineWidth = 3 + strength * 2;
        c.beginPath(); c.moveTo(-8, 0); c.quadraticCurveTo(-length, wave, -length-16, -wave); c.stroke();
        c.strokeStyle = light; c.lineWidth = 1; c.stroke();
    }
    c.restore();
}
