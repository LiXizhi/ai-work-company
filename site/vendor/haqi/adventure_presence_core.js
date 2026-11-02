import {facingToward} from './hero_pose_core.js';

export const REAL_PLAYER_CROWD_THRESHOLD = 8;
export function presenceLanguageLabel(value) {
    const code = typeof value === 'string' ? value.toLowerCase().split(/[-_]/)[0] : '';
    return ({zh:'中文', en:'英语', ja:'日语', ko:'韩语'})[code] || '语言未设置';
}
export function visibleSocialActors(actors, remoteCount, team = []) {
    return remoteCount >= REAL_PLAYER_CROWD_THRESHOLD
        ? actors.filter(actor => actor.profile.kind !== 'companion' || team.includes(actor.profile.id)) : actors;
}

// Ephemeral remote avatars only; never merge server presence into player saves.
export function presenceAppearance(save = {}) {
    const result = {};
    for (const key of ['name', 'appearance', 'school', 'headId', 'bodyId']) {
        if (typeof save[key] === 'string') result[key] = save[key].slice(0, 80);
    }
    const native = save.languageLearning?.native ?? save.native;
    if (typeof native === 'string') result.native = native.slice(0, 32);
    result.level = Math.max(1, Math.min(100, Number(save.level) || 1));
    return result;
}

export function createRemotePresence() {
    const peers = new Map();
    let room = '', self = '', ready = false;
    function reset(roomId = '', selfId = self) { peers.clear(); room = roomId; self = selfId; ready = false; }
    function update(row, at) {
        if (!row || typeof row.id !== 'string' || row.id === self) return;
        let peer = peers.get(row.id);
        if (!peer) { if (peers.size >= 500) return; peer = {id: row.id, profile: {}, position: null}; peers.set(row.id, peer); }
        if (typeof row.name === 'string') peer.profile.name = row.name.slice(0, 80);
        if (row.appearance && typeof row.appearance === 'object') Object.assign(peer.profile, presenceAppearance(row.appearance));
        // Stationary heartbeats (including facing-only changes) must not restart
        // the interpolation clock and keep a nearly settled avatar walking forever.
        if (Number.isFinite(row.x) && Number.isFinite(row.y)
            && (!peer.position || row.x !== peer.position.x || row.y !== peer.position.y)) {
            const old = sample(peer, at);
            peer.from = old?.position || {x: row.x, y: row.y};
            peer.position = {x: row.x, y: row.y}; peer.at = at;
        }
        if (Number.isInteger(row.facing) && row.facing >= 0 && row.facing <= 3) peer.facing = row.facing;
    }
    function sample(peer, at) {
        if (!peer.position) return null;
        const fraction = Math.max(0, Math.min(1, (at - peer.at) / 1000));
        const position = {x: peer.from.x + (peer.position.x - peer.from.x) * fraction,
            y: peer.from.y + (peer.position.y - peer.from.y) * fraction};
        const dx = peer.position.x - peer.from.x, dy = peer.position.y - peer.from.y;
        const moving = fraction < 1 && Math.hypot(dx, dy) > 0;
        return {id: peer.id, profile: peer.profile, position,
            facing: moving ? facingToward(dx, dy) : peer.facing || 0, moving};
    }
    return {reset,
        receive(message, at) {
            if (message.roomId && message.roomId !== room) return;
            if (message.type === 'entered' || message.type === 'welcome') { ready = true; return; }
            if (!ready) return;
            if (message.type === 'roster') {
                const rows = Array.isArray(message.players) ? message.players : [];
                const ids = new Set(rows.map(row => row?.id));
                for (const id of peers.keys()) if (!ids.has(id)) peers.delete(id);
                for (const row of rows) update(row, at);
            } else if (message.type === 'joined' || message.type === 'appear') update(message, at);
            else if (message.type === 'relay') { for (const row of message.players || []) if (peers.has(row?.id)) update(row, at); }
            else if (message.type === 'left') peers.delete(message.id);
            else if (message.type === 'room' && !message.live) peers.clear();
        },
        count(roomId) {
            if (roomId !== room || !ready) return 0;
            let count = 0;
            for (const peer of peers.values()) if (peer.position) count++;
            return count;
        },
        actors(roomId, at) { return roomId === room && ready ? [...peers.values()].map(peer => sample(peer, at)).filter(Boolean) : []; },
    };
}
