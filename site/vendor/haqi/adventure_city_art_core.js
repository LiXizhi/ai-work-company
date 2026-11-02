// Several frame references share one image resource.
export const streetArtResource=(art,key)=>{
    const entry=art?.entries?.[key];return entry?.atlas?art.atlases?.[entry.atlas]:entry;
};
export function streetArtKeys(street){
    const keys=new Set([street.groundArt]);
    for(const row of [...street.surfaces,...street.roads,...(street.transitions?.aprons||[])])keys.add(row.material);
    if(street.transitions?.landings?.length)keys.add('living:pavers');
    for(const o of street.objects){keys.add(o.art);for(const part of o.components||[])keys.add(part.art);}
    for(const route of street.routes)if(route.kind==='vehicle')keys.add(route.art||'car');
    keys.delete(undefined);return [...keys];
}
export function streetArtResources(art,street){
    const resources=new Map();for(const key of streetArtKeys(street)){const entry=streetArtResource(art,key);if(entry)resources.set(entry.id,entry);}return [...resources.values()];
}
export function validateStreetArtFrames(art){
    for(const [key,entry] of Object.entries(art.entries||{})){
        if(!entry.atlas)continue;
        const resource=art.atlases?.[entry.atlas],crop=entry.crop;
        if(!resource||!Array.isArray(crop)||crop.length!==4||!crop.every(Number.isFinite)||crop[0]<0||crop[1]<0||crop[2]<=0||crop[3]<=0||crop[0]+crop[2]>resource.width||crop[1]+crop[3]>resource.height||entry.width!==crop[2]||entry.height!==crop[3])throw Error('街景图集裁剪无效：'+key);
        for(const slot of entry.signSlots||[])if(![slot.x,slot.y,slot.w,slot.h].every(Number.isFinite)||slot.x<0||slot.x>1||slot.y<0||slot.y>1||slot.w<=0||slot.w>1||slot.h<=0||slot.h>1||!Number.isFinite(slot.angle||0))throw Error('街景招牌挂点无效：'+key);
    }
    return art;
}
