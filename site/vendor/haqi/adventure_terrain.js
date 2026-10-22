import { createRng } from './rng_core.js';
import { onIsland } from './adventure_world_core.js';

// Presentation only: baked once into the renderer's existing 1800 × 1600 cache.
// The cache edge and the viewport use the same opaque sea color in every zone.
export const OCEAN_COLOR = '#438b9b';
const TAU = Math.PI * 2;

function oval(c, x, y, rx, ry, color) {
    c.fillStyle = color;
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
}

function coastPoint(angle, offset) {
    // Small visual variation stays outside the existing walkable ellipse.
    const ripple = 4 * Math.sin(angle * 7) + 3 * Math.sin(angle * 11 + .8);
    return { x: 900 + (800 + offset + ripple) * Math.cos(angle),
        y: 800 + (710 + offset + ripple) * Math.sin(angle) };
}

function coast(c, offset) {
    c.beginPath();
    for (let i = 0; i <= 240; i++) {
        const p = coastPoint(i / 240 * TAU, offset);
        if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
    }
    c.closePath();
}

function roadDistance(x, y, paths) {
    let nearest = Infinity;
    for (const p of paths) {
        const dx = p.b.x - p.a.x, dy = p.b.y - p.a.y;
        const t = Math.max(0, Math.min(1, ((x - p.a.x) * dx + (y - p.a.y) * dy) / (dx * dx + dy * dy || 1)));
        nearest = Math.min(nearest, Math.hypot(x - p.a.x - t * dx, y - p.a.y - t * dy) - p.width / 2);
    }
    return nearest;
}

export function paintTerrain(c, world) {
    const rng = createRng(world.zone === 'town' ? 91821 : 53021);
    c.fillStyle = OCEAN_COLOR; c.fillRect(0, 0, world.w, world.h);

    // Shallows fade back to exactly OCEAN_COLOR before the rectangular cache edge.
    const waterStops = [[48, [67, 139, 155]], [30, [98, 178, 182]], [12, [166, 215, 204]], [4, [202, 218, 202]]];
    for (let i = 1; i < waterStops.length; i++) {
        const [outer, from] = waterStops[i - 1], [inner, to] = waterStops[i];
        for (let offset = outer; offset > inner; offset--) {
            const mix = (outer - offset) / (outer - inner);
            c.fillStyle = `rgb(${from.map((v, k) => Math.round(v + (to[k] - v) * mix)).join(',')})`;
            coast(c, offset); c.fill();
        }
    }
    for (const [offset, color] of [[4, '#cadaca'], [-2, '#c5cba5'], [-8, '#e0d6af'], [-18, '#eee0b8']]) {
        coast(c, offset); c.fillStyle = color; c.fill();
    }
    // Broken foam arcs, sand flecks and beach stones are static, not particles.
    c.lineCap = 'round'; c.lineWidth = 1.6;
    for (let i = 0; i < 65; i++) {
        const start = i / 65 * TAU, length = .025 + rng.float() * .035;
        c.strokeStyle = i % 3 ? '#f2f5db99' : '#e5f4dc55'; c.beginPath();
        for (let j = 0; j <= 6; j++) {
            const p = coastPoint(start + length * j / 6, 7 + Math.sin(start * 9) * 2);
            if (j) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
        }
        c.stroke();
    }
    for (let i = 0; i < 750; i++) {
        const p = coastPoint(rng.float() * TAU, -9 - rng.float() * 21);
        oval(c, p.x, p.y, .5 + rng.float() * 1.4, .5, i % 3 ? '#a99e7333' : '#fff0cb88');
    }

    const grass = c.createRadialGradient(790, 620, 80, 900, 800, 850);
    const palette={fire:['#d7a071','#b77650','#784f49'],ice:['#e1f2ef','#b0d3de','#789eb3'],desert:['#ead198','#d8b473','#b58d54'],dark:['#aba0b9','#827998','#535671']}[world.zone]||['#abc67a','#8bb36b','#5c8c64'];
    grass.addColorStop(0,palette[0]);grass.addColorStop(.65,palette[1]);grass.addColorStop(1,palette[2]);
    coast(c, -29); c.fillStyle = '#a8b47b'; c.fill();
    coast(c, -34); c.fillStyle = grass; c.fill();
    c.save(); coast(c, -34); c.clip();

    for (let i = 0; i < 95; i++) {
        const x = rng.int(140, 1660), y = rng.int(170, 1430), radius = rng.int(28, 95);
        const wash = c.createRadialGradient(x, y, 0, x, y, radius);
        wash.addColorStop(0, i % 3 ? '#d2db8c24' : '#42785320'); wash.addColorStop(1, '#8bb36b00');
        oval(c, x, y, radius, radius, wash);
    }
    for (const d of world.decorations) if (onIsland(d.x, d.y, 48)) {
        oval(c, d.x, d.y, d.size * 2, d.size, '#ccdb9230');
        if (d.kind < 2) {
            c.strokeStyle = d.kind ? '#e0e6a478' : '#477a4844'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(d.x - 3, d.y); c.lineTo(d.x - 5, d.y - 5);
            c.moveTo(d.x, d.y); c.lineTo(d.x + 1, d.y - 7);
            c.moveTo(d.x + 3, d.y); c.lineTo(d.x + 5, d.y - 3); c.stroke();
        }
    }

    // Draw the whole network in each pass: later road borders cannot cut across junctions.
    c.lineJoin = 'round';
    for (const [extra, color] of [[10, '#7f9d64'], [5, '#b4b383'], [0, '#cebd91'], [-6, '#dfcca0'], [-15, '#e5d3aa']]) {
        c.strokeStyle = color;
        for (const p of world.paths) {
            c.lineWidth = Math.max(1, p.width + extra);
            c.beginPath(); c.moveTo(p.a.x, p.a.y); c.lineTo(p.b.x, p.b.y); c.stroke();
        }
    }
    // Sample in world space so junctions do not accumulate denser texture.
    for (let i = 0; i < 4200; i++) {
        const x = rng.int(160, 1640), y = rng.int(180, 1420);
        const edge = roadDistance(x, y, world.paths);
        if (edge < -4) {
            oval(c, x, y, .7 + rng.float() * 1.5, .5 + rng.float() * .6, i % 3 ? '#9d88562d' : '#fff0cd88');
        } else if (edge > 5 && edge < 17 && i % 3 === 0) {
            c.strokeStyle = '#5b874d77'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x - 4, y - 4);
            c.moveTo(x, y); c.lineTo(x + 2, y - 6); c.stroke();
        }
    }
    c.restore();
}
