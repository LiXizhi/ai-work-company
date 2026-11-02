import {memoryCount,memoryParams,memoryBatch} from './hanzi_memory_core.js';
// Kids quest_list progress for every non-obsolete quest outside the 14 chapter lessons.
// QuestProvider.lua TryAccept/CanFinished and QuestHelp.lua Table_Add / Table_Add_Item.
// Story text is projected without executing source scripts or transform rewards.
import {createRng} from './rng_core.js';
import {islandFor} from './adventure_world_map_core.js';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const child = (n, tag) => n?.children?.find(c => c.tag === tag);
const children = (n, tag) => n?.children?.filter(c => c.tag === tag) || [];
const text = (n, tag) => child(n, tag)?.text || '';
const num = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const STAT_IDS = new Set([214, 79030, 79031, 79032, 79033, 79034]);
const EVENT_IDS = new Set([79016, 79017, 79019, 79025, 79026, 79037, 20046, 20048, 52212]);
const BLOCKED = {
    79035: '充值次数在单人冒险中不计数',
    79038: '给人气需要其他玩家',
    20117: '拉斐尔3v3尚未开放',
    79101: '试炼徽章需要原服竞技',
    79102: '赛场徽章需要原服竞技',
    79104: '英雄谷徽章需要原服竞技'
};

// The kids archive uses linear dialogue only. Fail export on new control flow
// instead of silently discarding choices or executing Lua actions.
function projectDialog(node, terminal, questId, names) {
    const rows = children(child(node, 'dialog') || node, 'item');
    // Original 62759 ends with two empty editor placeholders after its terminal action.
    while (rows.length && !text(rows.at(-1), 'content') && !children(child(rows.at(-1), 'buttons'), 'button').length) rows.pop();
    return rows.map((row, index) => {
        const buttons = children(child(row, 'buttons'), 'button').map(b => ({...b.attributes}));
        assert(buttons.length <= 1, `任务 ${questId} 的对白分支需要适配`);
        if (buttons.length) assert(buttons[0].action === (index === rows.length - 1 ? terminal : 'gotonext'), `任务 ${questId} 的对白动作需要适配`);
        return {npcId: num(text(row, 'id')), speakerName: names[num(text(row, 'id'))] || '', text: text(row, 'content'), buttons};
    });
}

export function projectQuestRuntime(catalog, chapterIds = []) {
    assert(catalog?.version === 1 && Array.isArray(catalog.quests), '任务目录无效');
    const skip = new Set(chapterIds.map(Number));
    const tables = catalog.tables;
    const named = file => Object.fromEntries((tables[file]?.data.children || []).map(n => [text(n, 'id'), text(n, 'label') || text(n, 'name') || text(n, 'desc')]));
    const npc = named('npc_list.xml'), items = named('reward_list.xml');
    for (const n of catalog.worldNpcs || []) if (n.data?.attributes?.name) npc[n.id] = n.data.attributes.name;
    const goals = Object.fromEntries(tables['goal_list_excel.xml'].goals.map(g => [g.id, g.name]));
    const names = { Goal: goals, GoalItem: named('quest_item_list.xml'), ClientDialogNPC: npc, CustomGoal: { ...items, ...named('custom_goal_list.xml') } };
    const obsolete = new Set(catalog.quests.filter(q => q.obsolete).map(q => q.id));
    const paths = {};
    for (const goal of tables['goal_list_excel.xml'].goals) if (goal.path) paths[goal.path.toLowerCase()] = Number(goal.id);
    const quests = catalog.quests.filter(q => !q.obsolete && !skip.has(q.id)).map(q => {
        const groups = [];
        const push = (tag, kind, mapItem) => {
            const node = child(q.data, tag);
            const rows = children(node, 'item').map(mapItem).filter(Boolean);
            if (rows.length) groups.push({ kind, condition: num(node.attributes?.condition, 0), mode: num(node.attributes?.mode, 0), items: rows });
        };
        push('Goal', 'kill', i => ({ id: num(i.attributes.id), name: names.Goal[i.attributes.id] || `目标 ${i.attributes.id}`, count: num(i.attributes.value, 1) }));
        push('GoalItem', 'loot', i => ({
            id: num(i.attributes.id), name: names.GoalItem[i.attributes.id] || `物品 ${i.attributes.id}`, count: num(i.attributes.value, 1),
            producers: [num(i.attributes.producer_id), ...(i.attributes.append_producer_id_list || '').split('#').map(Number)].filter(id => id > 0),
            odds: num(i.attributes.producer_odds, 1), unit: Math.max(1, num(i.attributes.producer_num, 1)), amount: num(i.attributes.producer_value, 1),
            destroy: i.attributes.need_destroy === '1'
        }));
        push('ClientDialogNPC', 'talk', i => ({ id: num(i.attributes.id), name: names.ClientDialogNPC[i.attributes.id] || `居民 ${i.attributes.id}`, count: num(i.attributes.value, 1) }));
        push('CustomGoal', 'custom', i => ({ id: num(i.attributes.id), name: names.CustomGoal[i.attributes.id] || `目标 ${i.attributes.id}`, count: num(i.attributes.value, 1), destroy: i.attributes.need_destroy === '1' }));
        return {
            id: q.id, title: q.title, region: q.island || q.group[1], startNpc: num(q.startNpc), endNpc: num(q.endNpc), repeat: text(q.data, 'QuestRepeat') === '1',
            startDialog: projectDialog(child(q.data, 'StartDialog'), 'doaccept', q.id, npc),
            endDialog: projectDialog(child(q.data, 'EndDialog'), 'dofinished', q.id, npc),
            talks: children(child(q.data, 'ClientDialogNPC'), 'item').map(n => ({npcId: num(n.attributes.id), label: n.attributes.label || '', dialog: projectDialog(n, 'donpcdialoged', q.id, npc)})),
            prerequisites: q.requires.map(r => ({ id: num(r.id), value: num(r.value, 1) })).filter(r => !obsolete.has(r.id)),
            requirements: children(child(q.data, 'RequestAttr'), 'item').map(i => ({ id: num(i.attributes.id), name: i.attributes.id, min: num(i.attributes.value, 0), max: i.attributes.topvalue === undefined || i.attributes.topvalue === '' ? null : num(i.attributes.topvalue) })),
            groups,
            rewards: children(child(q.data, 'Reward'), 'items').map(g => ({ choice: num(g.attributes.choice, -1), schoolFilter: g.attributes.schoolfilter === '1', items: children(g, 'item').map(i => ({ id: num(i.attributes.id), name: items[i.attributes.id] || `物品 ${i.attributes.id}`, count: num(i.attributes.value, 1) })) }))
        };
    });
    return { version: 1, paths, quests };
}

export function installCatalogQuests(content, runtime) {
    assert(runtime?.version === 1 && Array.isArray(runtime.quests) && runtime.paths, '全岛任务数据无效');
    content.catalogQuests = { paths: runtime.paths, quests: runtime.quests, byId: Object.fromEntries(runtime.quests.map(q => [q.id, q])) };
    for (const quest of runtime.quests) for (const group of quest.rewards) for (const item of group.items) {
        if (item.id !== 113 && !content.items[item.id]) content.items[item.id] = { id: item.id, name: item.name, description: '任务奖励', stats: {}, kind: 0 };
    }
}

const progressKey = (kind, id) => `${kind}:${id}`;
function questRecord(save, id) { return save.quests[id] || { accepted: false, claimed: false, progress: {} }; }
function customLive(save, content, id, stats) {
    if (STAT_IDS.has(id)) return { support: 'stat', value: stats?.[id] ?? (id === 214 || id === 79031 ? save.level : 0) };
    if ([20046, 20048, 52212].includes(id)) return { support: 'event', value: null };
    if (content.items?.[id]) return { support: 'item', value: save.inventory[id] || 0 };
    if (EVENT_IDS.has(id)) return { support: 'event', value: null };
    return { support: 'unsupported', value: 0 };
}
export function catalogGoalRows(save, content, quest, stats = {}) {
    const state = questRecord(save, quest.id);
    return quest.groups.flatMap((group, groupIndex) => group.items.map(item => {
        const live = group.kind === 'hanzi' ? {support:'practice',value:state.claimed?item.count:state.wordPracticeVersion===1?(state.progress[progressKey(group.kind,item.id)]||0):0} : group.kind === 'custom' ? customLive(save, content, item.id, stats) : null;
        const stored = state.progress[progressKey(group.kind, item.id)] || 0;
        const value = Math.min(item.count, live && live.support !== 'event' ? live.value : stored);
        const blocked = live?.support === 'unsupported';
        return { ...item, kind: group.kind, condition: group.condition, groupIndex, value, blocked, blockReason: blocked ? (BLOCKED[item.id] || `${item.name}需要原服功能，单人冒险无法推进`) : '' };
    }));
}
// Presentation only: completion/rewards must still inspect every authored goal.
export function catalogVisibleGoalRows(save,content,quest,stats={}){
    const rows=catalogGoalRows(save,content,quest,stats),words=rows.filter(r=>r.kind==='hanzi').map(r=>r.id);
    if(!words.length)return rows;
    const active=new Set(rows.filter(row=>row.kind==='hanzi'&&row.value<row.count).slice(0,2).map(row=>row.id));
    return rows.filter(row=>row.kind!=='hanzi'||active.has(row.id));
}
function groupDone(group, rows) {
    const items = rows.filter(row => row.kind === group.kind && group.items.some(item => item.id === row.id));
    if (!items.length) return true;
    return group.condition === 1 ? items.some(row => row.value >= row.count) : items.every(row => row.value >= row.count);
}
export function catalogQuestReady(save, content, quest, stats = {}) {
    const state = questRecord(save, quest.id);
    if (!state.accepted || state.claimed) return false;
    const rows = catalogGoalRows(save, content, quest, stats);
    return quest.groups.every(group => groupDone(group, rows));
}
export function requirementValue(save, content, id, stats = {}) {
    if (stats && Object.hasOwn(stats, id)) return stats[id];
    if (id === 214 || id === 79031) return save.level;
    if (content.items?.[id]) return save.inventory[id] || 0;
    return null;
}
export function catalogAcceptBlock(save, content, quest, stats = {}) {
    const state = questRecord(save, quest.id);
    if (quest.retired) return '请寻找新的祖先记忆任务';
    if (state.accepted && !state.claimed) return '已经接取';
    if (state.claimed && !quest.repeat) return '已经完成';
    for (const prerequisite of quest.prerequisites) if (prerequisite.value === 1 && !save.quests[prerequisite.id]?.claimed) return '请先完成前置任务';
    for (const requirement of quest.requirements) {
        const value = requirementValue(save, content, requirement.id, stats);
        if (value === null) return requirement.id === 965 ? `需要魔法战斗力 ${requirement.min}` : `条件 ${requirement.id} 尚未接入`;
        // Web quests keep the minimum (including the existing level-cap adaptation), but ignore level maxima.
        const isLevel = requirement.id === 214 || requirement.id === 79031;
        const cap = content.progression?.levelCap;
        const min = isLevel && Number.isInteger(cap) && requirement.min > cap ? cap : requirement.min;
        if (value < min || (!isLevel && requirement.max !== null && value > requirement.max)) return isLevel ? `需要等级 ${min}` : `条件不足：${requirement.id}`;
    }
    return '';
}
export function catalogQuestStatus(save, content, quest, stats = {}) {
    const state = questRecord(save, quest.id);
    if (state.claimed && !quest.repeat) return '已完成';
    if (state.claimed && quest.repeat) return catalogAcceptBlock(save, content, quest, stats) ? '未开启' : '可接取';
    if (state.accepted && catalogQuestReady(save, content, quest, stats)) return '可交付';
    if (state.accepted) {
        const rows = catalogGoalRows(save, content, quest, stats);
        const supported = rows.filter(row => !row.blocked);
        if (rows.some(row => row.blocked) && supported.every(row => row.value >= row.count)) return '无法推进';
        return '进行中';
    }
    return catalogAcceptBlock(save, content, quest, stats) ? '未开启' : '可接取';
}
export function catalogObjectiveLabel(goal) {
    const name = goal.kind === 'kill' ? `击败${goal.name}` : goal.kind === 'loot' ? `收集${goal.name}` : goal.kind === 'talk' ? `与${goal.name}交谈` : goal.name;
    return goal.blocked ? `${name}（${goal.blockReason}）` : name;
}
export function catalogQuestsForNpc(save, content, npcId, stats = {}) {
    const quests = content.catalogQuests?.quests || [];
    return {
        accept: quests.filter(q => q.startNpc === npcId && !catalogAcceptBlock(save, content, q, stats)).slice(0, 4),
        claim: quests.filter(q => q.endNpc === npcId && catalogQuestReady(save, content, q, stats))
    };
}

export function catalogTalksForNpc(save, content, npcId, stats = {}) {
    return (content.catalogQuests?.quests || []).flatMap(quest => {
        const state = questRecord(save, quest.id);
        if (!state.accepted || state.claimed) return [];
        if (!catalogGoalRows(save, content, quest, stats).some(g => g.kind === 'talk' && g.id === npcId && g.value < g.count)) return [];
        return (quest.talks || []).filter(t => t.npcId === npcId).map(talk => ({quest, talk}));
    });
}
// QuestTrackerPage.lua max_size: the kids tracker keeps at most three quests.
export const MAX_TRACKED_QUESTS = 3;
const MARK_RANK = { '?': 3, '!': 2, '…': 1 };
export function trackedQuestIds(save, content) {
    const source = Array.isArray(save?.trackedQuestIds) ? save.trackedQuestIds : Number.isInteger(save?.trackedQuestId) && save.trackedQuestId > 0 ? [save.trackedQuestId] : [];
    const pinned = source.filter(id => Number.isInteger(id) && id > 0 && !save.quests?.[id]?.claimed).slice(0, MAX_TRACKED_QUESTS);
    if (!content) return pinned; // Raw saved pins for migration and manual editing.
    const zone = islandFor(save.zone)?.id || islandFor(save.dungeonReturn?.zone)?.id;
    const local = id => {
        const quest = knownQuest(content, id);
        return quest && (quest.region || content.npcs?.[quest.startNpc]?.zone) === zone;
    };
    const active = Object.entries(save.quests || {}).filter(([id, state]) => state.accepted && !state.claimed && knownQuest(content, Number(id)));
    // Old saves have no acceptance order; use their most recently pinned active quest as a fallback.
    active.sort(([a, x], [b, y]) => (y.acceptedOrder || 0) - (x.acceptedOrder || 0) || pinned.indexOf(Number(b)) - pinned.indexOf(Number(a)) || Number(b) - Number(a));
    const latest = active.length ? Number(active[0][0]) : null;
    const ids = pinned.filter(local);
    if (!ids.length) {
        const chapter = content.quests?.find(quest => !save.quests?.[quest.id]?.claimed);
        if (chapter && local(chapter.id)) ids.push(chapter.id);
    }
    if (!ids.length) {
        const ongoing = active.find(([id]) => local(Number(id)));
        const available = ongoing ? null : content.catalogQuests?.quests.find(quest => local(quest.id) && !save.quests?.[quest.id]?.claimed && !catalogAcceptBlock(save, content, quest));
        if (ongoing || available) ids.push(ongoing ? Number(ongoing[0]) : available.id);
    }
    // Keep a local quest first; older accepted quests follow without duplicating it.
    // Reserve a slot for the latest acceptance when manual local pins fill the tracker.
    const first = ids[0];
    const remaining = [...ids.slice(1), ...active.map(([id]) => Number(id))];
    const result = first === undefined ? [] : [first];
    const reserveLatest = latest !== null && latest !== first;
    for (const id of remaining) {
        if (result.includes(id) || (reserveLatest && id === latest)) continue;
        if (result.length >= MAX_TRACKED_QUESTS - (reserveLatest ? 1 : 0)) break;
        result.push(id);
    }
    if (reserveLatest) result.push(latest);
    return result;
}
export function noteQuestAccepted(save, questId) {
    save.quests[questId].acceptedOrder = Math.max(0, ...Object.values(save.quests).map(state => state.acceptedOrder || 0)) + 1;
}
function knownQuest(content, id) {
    return content.quests?.find(quest => quest.id === id) || content.catalogQuests?.byId[id] || null;
}
export function pinTrackedQuest(save, content, questId) {
    const id = Number(questId);
    assert(knownQuest(content, id), '找不到这个任务');
    const current = trackedQuestIds(save, content);
    if (current.includes(id)) return { already: true };
    if (current.length >= MAX_TRACKED_QUESTS) return { full: true };
    const next = [...current];
    if (!next.length) {
        const chapter = content.quests?.find(quest => !save.quests[quest.id]?.claimed);
        if (chapter && chapter.id !== id && content.npcs?.[chapter.startNpc]?.zone === save.zone) next.push(chapter.id);
    }
    next.push(id);
    save.trackedQuestIds = next.slice(0, MAX_TRACKED_QUESTS);
    delete save.trackedQuestId;
    return { added: true };
}
export function unpinTrackedQuest(save, questId) {
    delete save.trackedQuestId;
    if (questId == null) { delete save.trackedQuestIds; return; }
    const ids = trackedQuestIds(save).filter(id => id !== Number(questId));
    if (ids.length) save.trackedQuestIds = ids;
    else delete save.trackedQuestIds;
}
export function supplementIslandTrack(save, content, zone, stats = {}) {
    const tracked = trackedQuestIds(save, content);
    save.trackedQuestIds = tracked;
    delete save.trackedQuestId;
    if (!zone || tracked.length >= MAX_TRACKED_QUESTS) return null;
    const taken = new Set(tracked);
    let best = null;
    for (const quest of content.catalogQuests?.quests || []) {
        if (quest.region !== zone || taken.has(quest.id)) continue;
        const status = catalogQuestStatus(save, content, quest, stats);
        const rank = status === '进行中' ? 0 : status === '可接取' ? 1 : 2;
        if (rank === 2) continue;
        if (!best || rank < best.rank || (rank === best.rank && quest.id < best.id)) best = { id: quest.id, rank };
    }
    if (!best) return null;
    save.trackedQuestIds = [...tracked, best.id];
    return best.id;
}
export function showCurrentChapter(save, content) {
    const chapter = content.quests?.find(quest => !save.quests[quest.id]?.claimed);
    const ids = trackedQuestIds(save);
    if (!chapter || content.npcs?.[chapter.startNpc]?.zone !== save.zone || !ids.length || ids.includes(chapter.id) || ids.length >= MAX_TRACKED_QUESTS) return;
    save.trackedQuestIds = [...ids, chapter.id];
    delete save.trackedQuestId;
}
function catalogMark(save, content, quest, npcId, stats) {
    if (!quest || questRecord(save, quest.id).claimed) return null;
    const state = questRecord(save, quest.id);
    if (!state.accepted && quest.startNpc === npcId && !catalogAcceptBlock(save, content, quest, stats)) return '!';
    if (state.accepted && catalogQuestReady(save, content, quest, stats) && quest.endNpc === npcId) return '?';
    if (state.accepted && catalogGoalRows(save, content, quest, stats).some(g => g.kind === 'talk' && g.id === npcId && g.value < g.count)) return '…';
    return null;
}
export function catalogNpcMarker(save, content, npcId, stats = {}) {
    let best = null;
    for (const id of trackedQuestIds(save, content)) {
        const mark = catalogMark(save, content, content.catalogQuests?.byId[id], npcId, stats);
        if ((MARK_RANK[mark] || 0) > (MARK_RANK[best] || 0)) best = mark;
    }
    return best;
}
export function catalogTracksMonster(save, content, monster) {
    const goalId = content.catalogQuests?.paths[String(monster?.source || monster?.id || '').toLowerCase()];
    if (!goalId) return false;
    return trackedQuestIds(save, content).some(id => {
        const quest = content.catalogQuests?.byId[id];
        const state = quest && questRecord(save, quest.id);
        if (!state?.accepted || state.claimed) return false;
        return catalogGoalRows(save, content, quest).some(goal => goal.value < goal.count && (goal.kind === 'kill' && goal.id === goalId || goal.kind === 'loot' && goal.producers?.includes(goalId)));
    });
}

function bump(save, quest, kind, id, amount, max) {
    const state = save.quests[quest.id];
    if (!state?.accepted || state.claimed || amount <= 0) return;
    const key = progressKey(kind, id);
    state.progress[key] = Math.min(max, (state.progress[key] || 0) + amount);
}
function orderedOpen(group, itemIndex, state, kind) {
    if (group.condition !== 2 || itemIndex === 0) return true;
    return group.items.slice(0, itemIndex).every(item => (state.progress[progressKey(kind, item.id)] || 0) >= item.count);
}
export function noteCatalogSignal(save, content, kind, id, count = 1) {
    const index = content.catalogQuests;
    if (!index || !count) return;
    const target = Number(id);
    for (const quest of index.quests) {
        const state = save.quests[quest.id];
        if (!state?.accepted || state.claimed) continue;
        for (const group of quest.groups) if (group.kind === kind) group.items.forEach((item, itemIndex) => {
            if (item.id !== target || !orderedOpen(group, itemIndex, state, kind)) return;
            if (kind === 'custom' && customLive(save, content, item.id).support !== 'event') return;
            bump(save, quest, kind, item.id, count, item.count);
        });
    }
}
// QuestServerLogics.Kill_Handler L275–288: web fights have no difficulty picker, so they count as hard (mode 2).
export function noteCatalogKills(save, content, monsters, rng = createRng(1)) {
    const index = content.catalogQuests;
    if (!index) return;
    const counts = new Map();
    for (const monster of monsters || []) {
        const goalId = index.paths[String(monster?.source || monster?.id || '').toLowerCase()];
        if (goalId) counts.set(goalId, (counts.get(goalId) || 0) + 1);
    }
    if (!counts.size) return;
    const sourceMode = 2;
    for (const quest of index.quests) {
        const state = save.quests[quest.id];
        if (!state?.accepted || state.claimed) continue;
        for (const group of quest.groups) {
            if (sourceMode < group.mode) continue;
            if (group.kind === 'kill') group.items.forEach((item, itemIndex) => {
                const killed = counts.get(item.id) || 0;
                if (killed && orderedOpen(group, itemIndex, state, 'kill')) bump(save, quest, 'kill', item.id, killed, item.count);
            });
            if (group.kind === 'loot') group.items.forEach((item, itemIndex) => {
                const killed = item.producers.reduce((sum, id) => sum + (counts.get(id) || 0), 0);
                if (!killed || !orderedOpen(group, itemIndex, state, 'loot')) return;
                // QuestHelp.Table_Add_Item L490–495: one math.random(100) against floor(odds * 100).
                if (rng.int(1, 100) > Math.floor(item.odds * 100)) return;
                bump(save, quest, 'loot', item.id, Math.floor(killed / item.unit) * item.amount, item.count);
            });
        }
    }
}
export function acceptCatalogQuest(save, content, questId, npcId, stats = {}) {
    const quest = content.catalogQuests?.byId[Number(questId)];
    assert(quest && (quest.startNpc === Number(npcId) || quest.startNpc === -1), '当前没有可接取的任务');
    const block = catalogAcceptBlock(save, content, quest, stats);
    assert(!block, block || '当前没有可接取的任务');
    save.quests[quest.id] = { accepted: true, claimed: false, progress: {} };
    noteQuestAccepted(save, quest.id);
    save.trackedQuestIds = trackedQuestIds(save, content);
    delete save.trackedQuestId;
    return { added: true };
}
export function claimCatalogQuest(save, content, questId, npcId, stats = {}) {
    const quest = content.catalogQuests?.byId[Number(questId)];
    const state = quest && questRecord(save, quest.id);
    if (state?.claimed && !quest.repeat) return false;
    assert(quest && state?.accepted && catalogQuestReady(save, content, quest, stats) && (quest.endNpc === Number(npcId) || quest.endNpc === -1), '任务尚未完成');
    for (const goal of catalogGoalRows(save, content, quest, stats)) if (goal.destroy && content.items[goal.id]) {
        assert((save.inventory[goal.id] || 0) >= goal.count, '任务所需物品不足');
        save.inventory[goal.id] -= goal.count;
        if (!save.inventory[goal.id]) delete save.inventory[goal.id];
    }
    return quest.legacyRewardQuestId && save.quests[quest.legacyRewardQuestId]?.claimed ? {...quest,rewards:[]} : quest;
}
export function validateCatalogQuests(save, content) {
    if (!Array.isArray(save.trackedQuestIds) && save.trackedQuestId !== undefined) {
        assert(Number.isInteger(save.trackedQuestId) && save.trackedQuestId > 0, '追踪任务无效');
        save.trackedQuestIds = [save.trackedQuestId];
    }
    delete save.trackedQuestId;
    if (save.trackedQuestIds !== undefined) {
        assert(Array.isArray(save.trackedQuestIds), '追踪任务无效');
        save.trackedQuestIds = save.trackedQuestIds.filter(id => !save.quests[id]?.claimed);
        assert(save.trackedQuestIds.length <= MAX_TRACKED_QUESTS && new Set(save.trackedQuestIds).size === save.trackedQuestIds.length, '追踪任务无效');
        for (const id of save.trackedQuestIds) {
            assert(Number.isInteger(id) && id > 0, '追踪任务无效');
            if (content.catalogQuests) assert(knownQuest(content, id), '追踪任务无效');
        }
        if (!save.trackedQuestIds.length) delete save.trackedQuestIds;
    }
    if (!content.catalogQuests) return;
    const chapter = new Set(content.quests.map(q => String(q.id)));
    for (const [id, state] of Object.entries(save.quests)) {
        if (chapter.has(id)) continue;
        assert(content.catalogQuests.byId[id], '存档任务无效');
        assert(state?.accepted === true && typeof state.claimed === 'boolean' && state.progress && typeof state.progress === 'object' && !Array.isArray(state.progress), '存档任务无效');
        if (state.acceptedOrder !== undefined) assert(Number.isSafeInteger(state.acceptedOrder) && state.acceptedOrder > 0, '任务接取顺序无效');
        for (const value of Object.values(state.progress)) assert(Number.isInteger(value) && value >= 0, '存档任务进度无效');
    }
}
