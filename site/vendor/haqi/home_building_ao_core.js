import {buildingBounds,buildingItem,buildingConnectionMask,buildingWallFeet,isEdge,isRoofDecoration,intersects} from './home_building_core.js';
// Scene-change-only spatial lookup. Geometry uses visual wall feet, never collision overrides.
export const WALL_AO_RADIUS=.32;
export function buildingFloorAO(objects,catalog,exclude=''){
 const buckets=new Map(),result=new Map(),radius=WALL_AO_RADIUS;
 const cells=(b,visit)=>{for(let y=Math.floor(b.y/2);y<=Math.floor((b.y+b.h)/2);y++)for(let x=Math.floor(b.x/2);x<=Math.floor((b.x+b.w)/2);x++)visit(`${x},${y}`);};
 for(const o of objects){const item=buildingItem(o,catalog);if(o.id===exclude||!isEdge(item)||isRoofDecoration(o)||(item.building.type==='door'&&o.doorOpen))continue;
  for(const row of buildingWallFeet(o,buildingConnectionMask(o,objects,catalog))){
  const b=row,extent={x:b.x-radius,y:b.y-radius,w:b.w+2*radius,h:b.h+2*radius};
  cells(extent,key=>{if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(row);});
  }
 }
 for(const o of objects){const item=buildingItem(o,catalog);if(item?.building?.type!=='floor'||isRoofDecoration(o))continue;const b=buildingBounds(o,item),near=new Set();
  cells(b,key=>{for(const wall of buckets.get(key)||[])if(intersects(b,{x:wall.x-radius,y:wall.y-radius,w:wall.w+2*radius,h:wall.h+2*radius}))near.add(wall);});
  result.set(o.id,[...near]);
 }
 return result;
}
