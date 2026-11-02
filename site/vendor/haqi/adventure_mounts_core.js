// Rideable mounts. Pose math matches demos/mount-lab/mount_core.js.
// Prices: paraworld.globalstore.lua o[3] count = 魔豆, o[8] ebuyprice = 奇豆.
import { defaultParams, resolveParams } from './combat_params_core.js';
import { statIdToEntry } from './combat_unit_core.js';
import { mountLayout } from './mount_layout_core.js';

export const MOUNT_DIRECTIONS = ['down', 'left', 'right', 'up'];
// Scene-only projection: retain equipped stats and the user's visibility preference.
export function sceneMountSave(save,{inParty=false}={}) {
    return save.mountHidden||inParty||save.coopRun ? {...save,mountId:null} : save;
}
// Character select starts the roaming scene on foot. mountId stays equipped for combat.
export function startWorldOnFoot(save) {
    if (!save || typeof save !== 'object') throw new Error('角色存档无效');
    save.mountHidden = true;
    return save;
}
const FACING = ['down', 'left', 'right', 'up'];
// Timed SKUs use names like “霸王虎(7天)” / “圣诞大麋鹿(31天)”; do not match 天 inside 霸天龙.
const TIMED_MOUNT_NAME = /[（(]\d+天[）)]/;

function finite(value, name) {
    if (!Number.isFinite(value)) throw new Error(`${name} 必须是有限数值`);
}
function isTimedMountRow(row) {
    return !!(row && (row.expireTime || row.expireType || TIMED_MOUNT_NAME.test(row.name || '')));
}
function mallDisplayName(row, mount) {
    const name = row?.name || '';
    if (/变身药丸$/.test(name)) return mount.name || name;
    return name || mount.name;
}
export function validateMountCatalog(catalog) {
    if (catalog?.version !== 1 || !Array.isArray(catalog.mounts) || !catalog.mounts.length) throw new Error('坐骑配置版本或列表无效');
    const ids = new Set();
    for (const key of ['rider', 'standing', 'female-rider', 'female-standing']) if (!catalog.sheets?.[key]?.cdn) throw new Error(`坐骑缺少角色图集 ${key}`);
    for (const mount of catalog.mounts) {
        if (!mount.id || ids.has(mount.id)) throw new Error('坐骑编号重复或缺失');
        ids.add(mount.id);
        for (const key of ['ground', 'lift', 'bob']) finite(Number(mount[key]), key);
        if (mount.rideable) {
            if (!mount.art?.cdn || !(mount.art.width > 0) || !(mount.art.height > 0)) throw new Error(`坐骑 ${mount.id} 缺少图集`);
            if (!mount.stats || !Object.entries(mount.stats).every(([id, value]) => statIdToEntry(id) && Number.isFinite(Number(value)))) throw new Error(`坐骑 ${mount.id} 的战斗属性无效`);
            if (!Object.keys(mount.commerce || {}).length) throw new Error(`坐骑 ${mount.id} 缺少物品`);
        }
        for (const direction of MOUNT_DIRECTIONS) {
            const pose = mount.directions?.[direction];
            if (!pose) throw new Error(`${mount.id} 缺少 ${direction}`);
            for (const key of ['seat', 'anchor']) {
                if (!Array.isArray(pose[key]) || pose[key].length !== 2) throw new Error(`${mount.id} 的 ${key} 需要二维坐标`);
                pose[key].forEach(value => finite(Number(value), key));
            }
            finite(Number(pose.scale), 'scale');
            if (!(pose.scale > 0 && pose.scale <= 2)) throw new Error(`${mount.id} 的角色缩放超出范围`);
            if (!Number.isInteger(pose.cell) || pose.cell < 0 || pose.cell > 3) throw new Error(`${mount.id} 的图集格号无效`);
        }
    }
    return catalog;
}
export function resolveMountDrawPose(mount, facing, { size = 78, time = 0, moving = false, gender = 'male' } = {}) {
    const direction = FACING[Number(facing)] || 'down';
    if (!MOUNT_DIRECTIONS.includes(direction)) throw new Error('朝向无效');
    if (!['male', 'female'].includes(gender)) throw new Error('角色类型无效');
    finite(size, 'size');
    const source = mount.directions[direction];
    const pose = { ...source, ...source.characters?.[gender] };
    const bob = Math.sin(time * (moving ? 9 : 2)) * (moving ? mount.bob : mount.bob * .25);
    const layout = mountLayout(mount, pose, size, bob, {gender});
    return {
        mount: { art: mount.id, cell: pose.cell, ...layout.mount },
        rider: { art: (gender === 'female' ? 'female-' : '') + (pose.riderArt || 'rider'), cell: pose.riderCell ?? pose.cell, ...layout.rider },
        foreground: pose.foreground || [],
    };
}
export function mountShopPrice(row) {
    // expiretime/expiretype are globalstore template t[27]/t[30].
    // Names like “（7天）” keep their 魔豆 price for NPC direct sale; the mall skips those SKUs separately.
    if (!row || row.expireTime || row.expireType) return null;
    if (row.qidou > 0) return { currency: 100, amount: row.qidou };
    if (row.modou > 0) return { currency: 984, amount: row.modou };
    return null;
}
/** Mall price: original globalstore price, or BalanceParams default for permanent unpriced mounts. */
export function mountMallPrice(row, content) {
    if (!row || isTimedMountRow(row)) return null;
    const priced = mountShopPrice(row);
    if (priced) return priced;
    const amount = resolveParams({ cards: {} }, content?.balanceParams || defaultParams('kids')).adventure.mountUnpricedDefault;
    if (!(amount > 0)) return null;
    return { currency: 984, amount };
}
/** UI icons always show the right-facing side cell from the 2×2 atlas (never front). */
export function mountIconCrop(mount) {
    const cols = mount.art.columns || 2;
    const rows = mount.art.rows || 2;
    const cw = mount.art.width / cols;
    const ch = mount.art.height / rows;
    const cell = mount.directions.right.cell;
    return [cell % cols * cw, Math.floor(cell / cols) * ch, cw, ch];
}
export function installMountCatalog(content, catalog) {
    validateMountCatalog(catalog);
    content.mountCatalog = catalog;
    content.mountByItem = {};
    for (const mount of catalog.mounts) {
        if (!mount.rideable) continue;
        const permanent = [];
        for (const [id, row] of Object.entries(mount.commerce || {})) {
            if (!((row.kind === 2 && row.subtype === 6) || (row.kind === 10 && row.subtype === 1))) continue;
            const itemId = Number(id);
            content.items[itemId] ??= { id: itemId, name: row.name, description: '', stats: {}, slot: 0, kind: row.kind, subtype: row.subtype };
            const item = content.items[itemId];
            item.mountId = mount.id;
            if (mount.art?.cdn) item.art = { id: `mount:${mount.id}`, crop: mountIconCrop(mount) };
            content.mountByItem[itemId] = { ...row, itemId, mountId: mount.id, stats: mount.stats, art: mount.art };
            // Mall lists one permanent SKU. NPC shops still sell timed rows via mountShopPrice.
            if (!isTimedMountRow(row)) permanent.push([itemId, row]);
        }
        const pick = permanent.find(([, row]) => mountShopPrice(row)) || permanent.find(([, row]) => mountMallPrice(row, content));
        if (!pick) continue;
        const [itemId, row] = pick;
        const price = mountMallPrice(row, content);
        content.shop?.push({ id: `mount:${itemId}`, kind: 'mount', itemId, name: mallDisplayName(row, mount), level: 1, vipOnly: row.vip === true, currency: price.currency, price: price.amount, school: 'all' });
    }
    return content;
}
export function mountDirectSale(content, offer) {
    if (offer?.kind !== 'shop' || Number(offer.exchangeId)) return null;
    if (offer.npcId <= 0 || offer.platform || offer.timeRange || offer.dailyLimit >= 0) return null;
    const row = content.mountByItem?.[offer.itemId];
    const price = mountShopPrice(row);
    return row && price ? { row, price } : null;
}
export function applyMountStats(stats, save, content) {
    const row = content.mountByItem?.[save.mountId];
    if (!row) return;
    for (const [id, value] of Object.entries(row.stats || {})) {
        const entry = statIdToEntry(id);
        if (!entry) continue;
        if (typeof stats[entry.stat] === 'object') stats[entry.stat][entry.school] = (stats[entry.stat][entry.school] || 0) + Number(value);
        else stats[entry.stat] = (stats[entry.stat] || 0) + Number(value);
    }
}
