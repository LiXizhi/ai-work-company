// Kids combat stamina (gsid -19). arena_server.lua L6035–6048, L6784–6785; Player.GetStamina.
// Arenas with stamina_cost: win with stamina>0 deducts cost and grants loot; stamina<=0 still fights but skips loot.

const assert = (ok, message) => { if (!ok) throw Error(message); };

export function staminaMax(content) {
    const max = content.fishing?.staminaMax;
    return Number.isInteger(max) && max > 0 ? max : 100;
}

export function readStamina(save, content) {
    const max = staminaMax(content);
    return Number.isInteger(save.stamina) ? Math.max(0, Math.min(max, save.stamina)) : max;
}

export function localDayKey(now = Date.now()) {
    const d = new Date(now);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local calendar-day refill to max (web stand-in for original bean.stamina daily restore). */
export function ensureDailyStamina(save, content, now = Date.now()) {
    const day = localDayKey(now);
    if (save.staminaRefillDay === day) return readStamina(save, content);
    // Preserve an in-progress depleted value when the refill day was never stamped
    // (tests / mid-session loads); only refill when crossing a known prior day.
    if (save.staminaRefillDay == null && Number.isInteger(save.stamina)) {
        save.staminaRefillDay = day;
        return readStamina(save, content);
    }
    save.stamina = staminaMax(content);
    save.staminaRefillDay = day;
    return save.stamina;
}

export function parseArenaStaminaCost(arena) {
    const raw = arena?.staminaCost ?? arena?.attributes?.stamina_cost;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function encounterStaminaCost(content, encounterId) {
    const encounter = content.encounters?.find(e => e.id === encounterId);
    if (!encounter) return 0;
    if (Number.isInteger(encounter.staminaCost)) return Math.max(0, encounter.staminaCost);
    return parseArenaStaminaCost(encounter);
}

/**
 * Original kids gate: only arenas with stamina_cost; insufficient when current <= 0
 * (not when current < cost). Deduct full cost when rewarded.
 * @returns {{ rewarded: boolean, insufficient: boolean, cost: number, stamina: number }}
 */
export function applyCombatStamina(save, content, cost, now = Date.now()) {
    assert(Number.isInteger(cost) && cost >= 0, '精力消耗无效');
    const stamina = ensureDailyStamina(save, content, now);
    if (cost <= 0) return { rewarded: true, insufficient: false, cost: 0, stamina };
    if (stamina <= 0) return { rewarded: false, insufficient: true, cost: 0, stamina: 0 };
    save.stamina = Math.max(0, stamina - cost);
    return { rewarded: true, insufficient: false, cost, stamina: save.stamina };
}

export function dungeonStaminaHint(dungeon) {
    const costs = (dungeon?.arenas || []).map(parseArenaStaminaCost).filter(c => c > 0);
    if (!costs.length) return null;
    return { max: Math.max(...costs), min: Math.min(...costs), arenas: costs.length };
}
