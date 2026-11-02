// item.addonlevel.lua L130–188: GSID-specific, cumulative target-level values and next-level cost.
export function upgradeLevels(content, itemId) {
    return content.upgradeGroups?.find(group=>group.gsids.includes(Number(itemId)))?.levels || (Number(itemId) === 1912 ? content.upgrade : []) || [];
}
export function upgradeAt(content, itemId, level) {
    return upgradeLevels(content,itemId).find(row=>row.level===level);
}
// player_server.lua GetStatsSum L3434–3474: six additive equipment contributions.
export const UPGRADE_STATS = [
    ['attack_percentage','damagePct','全系攻击','%'],
    ['attack_absolute','damageAbs','全系固定攻击',''],
    ['resist_absolute','resistAbs','全系固定防御',''],
    ['hp','hpFlat','生命',''],
    ['critical_strike_percent','critPct','全系暴击','%'],
    ['resilience_percentage','resiliencePct','全系韧性','%'],
];
export function upgradeAttributes(row) {
    return UPGRADE_STATS.filter(([field])=>row?.[field]).map(([field,stat,label,unit])=>({stat,label,value:row[field],unit}));
}
export function applyUpgradeStats(stats,row) {
    for(const {stat,value} of upgradeAttributes(row)) {
        if(typeof stats[stat]==='object')stats[stat].all=(stats[stat].all||0)+value;
        else stats[stat]+=value;
    }
}
