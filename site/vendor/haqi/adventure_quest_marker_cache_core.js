// Presentation cache only: authoritative actions still validate live quest rules.
// Saves mutate in place, so revision/object identity alone cannot detect changes.
// Compare quest/stat inputs once per draw, excluding movement, health and clocks.
function markerInputs(save) {
    const pending=save.pendingEncounter;
    return JSON.stringify([
        save.zone,save.dungeonReturn?.zone,save.quests,save.trackedQuestIds,save.trackedQuestId,
        save.level,save.school,save.inventory,save.equipment,save.equipmentGuids,
        save.equipmentInstances,save.nextEquipmentGuid,save.upgrades,save.mountId,
        save.bagRulesVersion,!!pending,pending?.equipmentStatsVersion,
        pending?.progressionRulesVersion,pending?.magicStarLevel,
    ]);
}

export function createQuestMarkerCache(evaluate,readStats) {
    let owner,contentOwner,scopeOwner,key,contentRefs=[],markers=new Map(),stats;
    function invalidate(){key=undefined;markers.clear();stats=undefined;}
    return {
        invalidate,
        forState(save,content,scope) {
            const next=markerInputs(save),refs=Object.values(content);
            if(owner!==save||contentOwner!==content||scopeOwner!==scope||key!==next
                ||refs.length!==contentRefs.length||refs.some((value,i)=>value!==contentRefs[i])) {
                invalidate();owner=save;contentOwner=content;scopeOwner=scope;key=next;contentRefs=refs;
            }
            return npcId=>{
                // Cache null as well: an absent marker must not repeat the checks.
                if(!markers.has(npcId))markers.set(npcId,evaluate(save,content,npcId,()=>stats??=readStats(save,content)));
                return markers.get(npcId);
            };
        },
    };
}
