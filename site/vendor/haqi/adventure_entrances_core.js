// Shared entrance silhouettes; these are visual sizes, not combat balance.
export function entranceAppearance(entrance){
    if(entrance.entranceKind!=='tower')return {frame:'elite',w:124,h:64};
    const level=entrance.recommendedLevel||1;
    return {frame:level>=40?'towerAdvanced':level>=20?'towerIntermediate':'towerBasic',w:86,h:128};
}
