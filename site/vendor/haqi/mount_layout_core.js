// size is the character sheet size in scene pixels. The authored scale is a
// rider-to-mount ratio. Limit the visible composite HEIGHT, not square atlas size.
export const MAX_MOUNT_SIZE_RATIO = 2;

export function mountLayout(mount, pose, size, bob = 0, {gender = 'male', limitSize = true} = {}) {
    if (!Number.isFinite(size) || size <= 0) throw new Error('角色尺寸必须大于零');
    if (!Number.isFinite(pose.scale) || pose.scale <= 0) throw new Error('人物与坐骑比例必须大于零');
    // Use alpha bounds prepared from the source WebP. Transparent margins and
    // wide, flat mounts must not trigger the height limit.
    let fit = 1;
    const bounds = mount.layoutBounds;
    const prefix = gender === 'female' ? 'female-' : '';
    if (limitSize && bounds) {
        const standing = bounds.riders[prefix + 'standing'];
        const originalHeight = size * Math.max(...standing.map(b => b[3] - b[1]));
        for (const source of Object.values(mount.directions)) {
            const p = {...source, ...source.characters?.[gender]};
            if (!Number.isFinite(p.scale) || p.scale <= 0) throw new Error('人物与坐骑比例必须大于零');
            const m = bounds.mount[p.cell];
            const r = bounds.riders[prefix + (p.riderArt || 'rider')][p.riderCell ?? p.cell];
            const mountHeight = size / p.scale;
            const riderY = p.seat[1] * mountHeight - p.anchor[1] * size;
            const top = Math.min(m[1] * mountHeight, riderY + r[1] * size);
            const bottom = Math.max(m[3] * mountHeight, riderY + r[3] * size);
            // A single worst-facing fit preserves rider size through every turn.
            fit = Math.min(fit, MAX_MOUNT_SIZE_RATIO * originalHeight / (bottom - top));
        }
    }
    const riderSize = size * fit;
    const mountSize = riderSize / pose.scale;
    const x = -mountSize / 2;
    const y = -mountSize * mount.ground + (bob - Number(mount.lift || 0)) * fit;
    const seat = [x + pose.seat[0] * mountSize, y + pose.seat[1] * mountSize];
    return {
        mount: {x, y, w: mountSize, h: mountSize},
        rider: {x: seat[0] - pose.anchor[0] * riderSize, y: seat[1] - pose.anchor[1] * riderSize, w: riderSize, h: riderSize},
        seat,
    };
}
