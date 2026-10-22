// Fishing rewards follow Database/extendedcost.db.mem bundles exported in fishing.json.
// Pipe-separated otos groups are alternative outcomes (ItemManager.GetExtendedCostTemplateOtosInMemory).
// Each kept row is granted when rng.int(1,1000) <= p. A miss before ExtendedCost does not spend the net.
import { onLargeIsland } from './adventure_island_layout_core.js';
import { onIsland } from './adventure_world_core.js';
import { recordFishingCatch, fishingQuality, fishingSpecies, fishingTuning } from './adventure_fishing_records_core.js';
import {createRng,hashSeed} from './rng_core.js';
import { readStamina as readSharedStamina, ensureDailyStamina, staminaMax } from './adventure_stamina_core.js';

export const SHADOW_COUNT = 5;
const LANES = [0.28, 0.42, 0.55, 0.68, 0.8];
const SPEEDS = [54, 72, 46, 84, 63];
const PHASES = [0.2, 1.1, 2.4, 3.3, 4.6];

export function installFishing(content, catalog) {
    content.fishing = catalog;
    for (const item of Object.values(catalog.items)) {
        content.items[item.id] ??= { id: item.id, name: item.name, description: item.description, kind: item.kind, sourceIcon: item.sourceIcon, stats: {}, slot: 0 };
    }
}
export function isOcean(world, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    // This predicate identifies fishing water: the activity is exclusive to Haqi.
    if (world.isEarth || world.zone === 'earth') return false;
    return world.layout ? !onLargeIsland(world, x, y, 0) : !onIsland(x, y, 0);
}
export function readStamina(save, content) {
    return readSharedStamina(save, content);
}
export function shadowPosition(index, elapsedMs, width, height) {
    const phase = PHASES[index];
    const travel = width + 90;
    return {
        x: ((elapsedMs / 1000) * SPEEDS[index] + phase * 70) % travel - 40,
        y: height * LANES[index] + Math.sin(elapsedMs / 420 + phase) * 12,
        r: 20,
    };
}
export function markerPosition(elapsedMs, width, height) {
    return { x: width * (0.5 + 0.38 * Math.sin(elapsedMs / 700)), y: height * (0.5 + 0.22 * Math.cos(elapsedMs / 900)) };
}
export function castLandsOnShadow(point, elapsedMs, width, height, radius = 28) {
    for (let index = 0; index < SHADOW_COUNT; index++) {
        const shadow = shadowPosition(index, elapsedMs, width, height);
        if (Math.hypot(shadow.x - point.x, shadow.y - point.y) <= radius + shadow.r) return true;
    }
    return false;
}
function netById(content, id) {
    return content.fishing?.nets.find(net => net.id === Number(id));
}
function grantBranch(save, content, branch, rng) {
    const items = [];
    let staminaDelta = 0;
    let missed = false;
    for (const row of branch) {
        if (rng.int(1, 1000) > row.p) continue;
        if (row.gsid === content.fishing.staminaGsid) staminaDelta += row.count;
        else if (row.gsid === 50401) missed = true;
        else if (row.gsid >= 50000) {
            save.fishingMarks ??= {};
            save.fishingMarks[row.gsid] = (save.fishingMarks[row.gsid] || 0) + row.count;
        } else {
            save.inventory[row.gsid] = (save.inventory[row.gsid] || 0) + row.count;
            items.push({ id: row.gsid, count: row.count, name: content.items[row.gsid]?.name || '海产' });
        }
    }
    return { items, staminaDelta, missed };
}
export function castFishing(save, content, action, rng) {
    if (save.zone === 'earth') throw Error('现实世界不能钓鱼，请前往哈奇世界的水域。');
    const net = netById(content, action.netId);
    if (!net) throw Error('没有这种渔网');
    const quality=fishingQuality(action.fishingPerformance);
    if (save.pendingEncounter) throw Error('请先完成当前战斗');
    const owned = save.inventory[net.id] || 0;
    if (owned < 1) throw Error(`没有${content.items[net.id]?.name || '渔网'}`);
    const now = Number.isFinite(action.now) ? action.now : Date.now();
    const stamina = ensureDailyStamina(save, content, now);
    if (stamina < net.staminaRequired) throw Error(`精力值低于${net.staminaRequired}，现在不能捕鱼`);
    const contacted = (quality===null?action.hit===true:action.fishingPerformance.hits>0) || net.absolutelyHit;
    if (!contacted) return { caught: false, message: '鱼影躲开了，渔网还在。' };
    let branch = net.branches[rng.int(1, net.branches.length) - 1];
    // Scene fishing: a landed manual pull guarantees a catch. Automatic apparatus
    // keeps only a 1% escape chance, independently of the legacy reward stream.
    if(quality!==null){
        const hasFish=b=>b.some(row=>fishingSpecies.includes(row.gsid)&&row.p===1000&&row.count>0);
        const successful=net.branches.filter(hasFish);
        if(!hasFish(branch)&&successful.length){
            const rescue=createRng(hashSeed(`${save.seed}:${save.revision}:${net.id}:fish-rescue`));
            if(!net.absolutelyHit||rescue.float()>=fishingTuning.fishingAutoEscapeChance)branch=successful[rescue.int(0,successful.length-1)];
        }
    }
    save.inventory[net.id] = owned - 1;
    const grant = grantBranch(save, content, branch, rng);
    save.stamina = Math.max(0, stamina + grant.staminaDelta);
    if (!grant.items.length) return { caught: false, spent: true, stamina: save.stamina, message: '鱼儿跑掉了。' };
    const summary = grant.items.map(item => `${item.name}×${item.count}`).join('、');
    const catches=recordFishingCatch(save,grant.items,action.fishingPerformance);
    return { caught: true, spent: true, items: grant.items, catches, stamina: save.stamina, message: `捕到了${summary}。` };
}
export function useStaminaPotion(save, content, itemId) {
    const potion = content.fishing?.potions.find(row => row.id === Number(itemId));
    if (!potion) throw Error('这不是精力药剂');
    if (potion.blocked) throw Error(potion.blocked);
    if ((save.inventory[potion.id] || 0) < 1) throw Error(`没有${content.items[potion.id]?.name || '药剂'}`);
    save.inventory[potion.id] -= 1;
    save.stamina = Math.min(staminaMax(content), readStamina(save, content) + potion.restore);
    return { message: `精力恢复到${save.stamina}。`, stamina: save.stamina };
}
