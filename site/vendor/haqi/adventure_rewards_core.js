// ItemManager.lua L1186–1204: class 2/6 = PetTransform, 10/1 = MountPet.
// Quest rewards grant the mount item. They are no longer replaced by a combat pet.
export function isPetRewardItem(item) {
    return item && ((item.kind === 2 && item.subtype === 6) || (item.kind === 10 && item.subtype === 1));
}
export function resolvePetReward(content, reward) {
    return reward;
}
export function rewardLabel(content, reward) {
    return `${reward.kind === 'pet' ? `宠物·${content.pets[reward.petId].name}` : content.items[reward.id].name} ×${reward.count}`;
}
// Only exchange retained items that were actually awarded by completed quests.
// A ledger prevents remaining non-quest inventory being exchanged on later loads.
function questMountCounts(content) {
    const counts = new Map();
    for (const quest of content.quests || []) for (const group of quest.rewards || []) for (const item of group.items || []) {
        if (!isPetRewardItem(content.items[item.id])) continue;
        counts.set(item.id, (counts.get(item.id) || 0) + item.count);
    }
    return counts;
}
export function migrateQuestPetRewards(save, content) {
    if (save.pendingEncounter) return;
    const ledger = save.questPetConversions || {};
    if (typeof ledger !== 'object' || Array.isArray(ledger)) throw Error('任务宠物兑换记录无效');
    const counts = questMountCounts(content);
    for (const [id, count] of Object.entries(ledger)) {
        const max = counts.get(Number(id));
        if (!isPetRewardItem(content.items[id]) || !Number.isSafeInteger(count) || count < 0 || max == null || count > max) throw Error('任务宠物兑换记录无效');
    }
    if (save.mountRewardRestored || !Object.keys(ledger).length) return;
    for (const [id, count] of Object.entries(ledger)) if ((save.inventory[id] || 0) < count) save.inventory[id] = count;
    save.mountRewardRestored = true;
}
