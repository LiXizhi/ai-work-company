// Item_CombatDeck.lua L89-124: decks use 168/169, apparel uses 138/137.
export function equipmentRequirements(item) {
    const bag=item?.slot===24,stats=item?.stats||{};
    return {level:Math.max(1,Number(stats[bag?168:138]||1)),school:Number(stats[bag?169:137]||0)};
}
