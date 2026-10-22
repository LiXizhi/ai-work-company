import {createWorld,walkable,nearestWalkable} from './adventure_world_core.js';

// Camp has its own coordinate revision; other islands keep their existing layout
// and the global worldLayoutVersion. Version stamps travel with each position.
export function mapCoordinateVersion(zone,content){
    return content?.worldMapIndex?.islands?.[zone]?.coordinateVersion??1;
}
export function locationSnapshot(save,content){
    return {zone:save.zone,position:{...save.position},...(save.zone==='camp'?{coordinateVersion:save.positionCoordinateVersion??mapCoordinateVersion(save.zone,content)}:{})};
}
const projections=new WeakMap();
function projectCampPoint(point,content){
    const layout=content.worldMaps?.camp;
    if(!layout)return point; // Lazy maps are checked again when the scene opens.
    let row=projections.get(content);
    if(!row||row.layout!==layout){row={layout,world:createWorld('camp',content)};projections.set(content,row);}
    const world=row.world;
    return walkable(world,point.x,point.y)?point:nearestWalkable(world,point.x,point.y)||{...layout.spawn};
}
function convertCampPoint(point,version,content){
    const current=mapCoordinateVersion('camp',content),old=version??1;
    if(!Number.isInteger(old)||old<1||old>current)throw Error('营地坐标版本无效');
    if(old===current)return {point,version:current};
    if(old!==1||current!==2)throw Error('营地坐标版本不兼容');
    if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||point.x<0||point.y<0||point.x>1800||point.y>1600)throw Error('旧营地坐标无效');
    return {point:projectCampPoint({x:point.x*2,y:point.y*2},content),version:current};
}
export function migrateLocationCoordinates(location,content){
    if(location?.zone!=='camp'||!location.position)return;
    const next=convertCampPoint(location.position,location.coordinateVersion,content);
    location.position=next.point;location.coordinateVersion=next.version;
}
export function migratePetCoordinates(pet,content){
    if(pet?.birth?.zone!=='camp')return;
    const birth=pet.birth,next=convertCampPoint(birth.anchor,birth.coordinateVersion,content);
    birth.anchor=next.point;birth.coordinateVersion=next.version;
}
export function migrateSaveCoordinates(save,content){
    if(save.zone==='camp'){
        const next=convertCampPoint(save.position,save.positionCoordinateVersion,content);
        save.position=next.point;save.positionCoordinateVersion=next.version;
    }
    for(const location of [save.dungeonReturn,save.earthReturn,save.coopRun?.returnTo,...(save.cityReturnStack||[])])migrateLocationCoordinates(location,content);
    for(const group of ['pets','petWorld'])for(const pet of Object.values(save[group]||{}))migratePetCoordinates(pet,content);
    return save;
}
// Account-scoped local gathering records contain flat coordinates, not saves.
// Preserve reward receipts and depleted node IDs; never regenerate loot.
export function migrateCampDrops(record,content){
    for(const drop of record?.drops||[]){
        if(drop.zone!=='camp')continue;
        const next=convertCampPoint(drop,drop.coordinateVersion,content);
        drop.x=next.point.x;drop.y=next.point.y;drop.coordinateVersion=next.version;
    }
}
