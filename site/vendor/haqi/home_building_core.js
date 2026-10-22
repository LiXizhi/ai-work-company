// Pure geometry shared by editing, walking and rendering. Units are home world cells.
const catalogs=new WeakMap();
export function buildingItem(obj,catalog){let map=catalogs.get(catalog);if(!map){map=new Map(catalog.map(i=>[i.id,i]));catalogs.set(catalog,map);}return map.get(obj?.itemId);}
export const isEdge=item=>['wall','fence','window','door'].includes(item?.building?.type);
export const isStructural=item=>['floor','wall','fence','window','door','roof'].includes(item?.building?.type);
export const isEdgeLike=item=>['wall','fence','window','door'].includes(item?.building?.type);
export function buildingSlotKind(item){const type=item?.building?.type;if(type==='floor')return 'floor';if(type==='roof')return 'roof';if(type==='stairs')return 'stairs';if(['pillar','beam','arch','slab'].includes(type))return 'structure';if(isEdgeLike(item))return 'edge';return null;}
// Placement is always a one-cell operation. Visual wall geometry is derived from neighbouring cells.
export function buildingGridBounds(obj,item){const s=obj.sizeScale??1;return {x:Math.floor(obj.x),y:Math.floor(obj.y),w:s,h:s};}
export function buildingPlacement(obj,item){if(!(obj.properties?.snap??item?.building?.snap??false))return obj;return {...obj,x:Math.floor(obj.x),y:Math.floor(obj.y)};}
export function buildingBounds(obj,item){const s=obj.sizeScale??1,vertical=(obj.rotation||0)%2;return isEdge(item)?{x:obj.x,y:obj.y,w:vertical?.18*s:s,h:vertical?s:.18*s}:{x:obj.x,y:obj.y,w:(item.size?.[vertical?1:0]||1)*s,h:(item.size?.[vertical?0:1]||1)*s};}
export function buildingConnectionMask(obj,objects,catalog){
 const item=buildingItem(obj,catalog),type=item?.building?.type;
 if(!isEdgeLike(item)&&type!=='floor')return 0;
 const x=Math.floor(obj.x),y=Math.floor(obj.y);
 let wallMask=0,floorMask=0,hasFloorSelf=false;
 for(const other of objects){
  if(other.id===obj.id||isRoofDecoration(other))continue;
  const oi=buildingItem(other,catalog),ot=oi?.building?.type;
  if(!ot)continue;
  const ox=Math.floor(other.x),oy=Math.floor(other.y);
  if(ox===x&&oy===y&&ot==='floor')hasFloorSelf=true;
  for(const [bit,dx,dy] of [[1,0,-1],[2,1,0],[4,0,1],[8,-1,0]]){
   if(ox===x+dx&&oy===y+dy){
    if(isEdgeLike(oi))wallMask|=bit;
    if(ot==='floor')floorMask|=bit;
   }
  }
 }
 if(type==='floor')return floorMask;
 const corners=[6,12,9,3];
 let armMask=0;
 if((wallMask&(wallMask-1))!==0)armMask=wallMask;
 else if(wallMask){
  armMask=hasFloorSelf&&corners.includes(floorMask)&&(floorMask&wallMask)?floorMask:(wallMask&5)?5:10;
 }else if(corners.includes(floorMask)){
  armMask=floorMask;
 }else if(hasFloorSelf){
  const openNS=!(floorMask&1)||!(floorMask&4),openEW=!(floorMask&2)||!(floorMask&8);
  armMask=openNS&&(floorMask&10)?10:openEW&&(floorMask&5)?5:(obj.rotation||0)%2?5:10;
 }else if(floorMask){
  armMask=(floorMask&5)&&!(floorMask&10)?10:(floorMask&10)&&!(floorMask&5)?5:(obj.rotation||0)%2?5:10;
 }else armMask=(obj.rotation||0)%2?5:10;
 return armMask|(floorMask<<4)|(hasFloorSelf?256:0);
}
// Wall feet sit inside the exposed floor boundary, or against an adjacent floor.
// Keep this visual geometry independent of the user's editable obstruction box.
export function buildingWallFeet(obj,connections=0){
 const s=obj.sizeScale??1,t=.18*s,x=obj.x,y=obj.y;
 const mask=(connections&15)||((obj.rotation||0)%2?5:10),floors=(connections>>4)&15;
 const horizontal=fy=>({x,y:fy,w:s,h:t,vertical:false});
 const vertical=fx=>({x:fx,y,w:t,h:s,vertical:true});
 // Legacy free-positioned/enlarged pieces do not describe a single grid cell.
 if(s!==1||!Number.isInteger(x)||!Number.isInteger(y)||obj.properties?.snap===false)return [(obj.rotation||0)%2?vertical(x):horizontal(y)];
 if((connections&256)&&floors&&floors!==15){
  const edges=[];
  if(!(floors&1))edges.push(horizontal(y));
  if(!(floors&8))edges.push(vertical(x));
  if(!(floors&2))edges.push(vertical(x+s-t));
  if(!(floors&4))edges.push(horizontal(y+s-t));
  return edges;
 }
 const cx=x+((floors&2)&&!(floors&8)?s-t:(floors&8)&&!(floors&2)?0:(s-t)/2);
 const cy=y+((floors&4)&&!(floors&1)?s-t:(floors&1)&&!(floors&4)?0:(s-t)/2);
 if(mask===5)return [vertical(cx)];
 if(mask===10)return [horizontal(cy)];
 const feet=[];
 if(mask&1)feet.push({x:cx,y,w:t,h:cy-y+t,vertical:true});
 if(mask&8)feet.push({x,y:cy,w:cx-x+t,h:t,vertical:false});
 if(mask&2)feet.push({x:cx,y:cy,w:x+s-cx,h:t,vertical:false});
 if(mask&4)feet.push({x:cx,y:cy,w:t,h:y+s-cy,vertical:true});
 return feet;
}
export const isRoofDecoration=obj=>obj.properties?.surface==='roof';
// Use the painted feet for default walls; explicit collision boxes remain editable.
export function walkingObstructions(obj,item,objects,catalog,point=null){
 if(item.building?.type==='door')return [];
 const block=obstruction(obj,item);
 if(!block)return [];
 if(isEdge(item)&&!['width','depth','offsetX','offsetY'].some(k=>obj.properties?.[k]!==undefined)){
  // Distant cells cannot touch this actor; avoid neighbour scans on every step.
  const s=obj.sizeScale??1;
  if(point&&(point.x+.18<=obj.x||point.x-.18>=obj.x+s||point.y+.12<=obj.y||point.y-.12>=obj.y+s))return [];
  return buildingWallFeet(obj,buildingConnectionMask(obj,objects,catalog));
 }
 return [block];
}
// Presentation only: never write the temporary opening into the home object.
export function homeDoorIsOpen(obj,actors,connections=0){
 return !!obj.doorOpen||buildingWallFeet(obj,connections).some(b=>actors.some(p=>p&&p.x>b.x-.4&&p.x<b.x+b.w+.4&&p.y>b.y-.55&&p.y<b.y+b.h+.55));
}
export function roofAt(obj,objects,catalog){return objects.find(r=>{if(buildingItem(r,catalog)?.building?.type!=='roof')return false;const b=buildingGridBounds(r,buildingItem(r,catalog));return obj.x>=b.x&&obj.x<b.x+b.w&&obj.y>=b.y&&obj.y<b.y+b.h;});}
export function obstruction(obj,item){if(isRoofDecoration(obj))return null;const defaults=item.building?.obstruction||{enabled:item.layer==='solid',width:item.size[0],depth:item.size[1],offsetX:0,offsetY:0};const p={...defaults,...obj.properties};if(!p.enabled||(item.building?.type==='door'&&obj.doorOpen))return null;const s=obj.sizeScale??1,b={x:p.offsetX||0,y:p.offsetY||0,w:p.width,h:p.depth};if((obj.rotation||0)%2)[b.x,b.y,b.w,b.h]=[b.y,b.x,b.h,b.w];return {x:obj.x+b.x*s,y:obj.y+b.y*s,w:b.w*s,h:b.h*s};}
export const intersects=(a,b)=>a.x<b.x+b.w-1e-7&&a.x+a.w>b.x+1e-7&&a.y<b.y+b.h-1e-7&&a.y+a.h>b.y+1e-7;
export function validBuildingProperties(obj){if(obj.rotation!==undefined&&(!Number.isInteger(obj.rotation)||obj.rotation<0||obj.rotation>3))return false;if(obj.doorOpen!==undefined&&typeof obj.doorOpen!=='boolean')return false;if(obj.properties===undefined)return true;const p=obj.properties;if(!p||typeof p!=='object'||Array.isArray(p))return false;return Object.entries(p).every(([k,v])=>k==='surface'?['ground','roof'].includes(v):['snap','enabled'].includes(k)?typeof v==='boolean':['width','depth'].includes(k)?Number.isFinite(v)&&v>=.05&&v<=8:['offsetX','offsetY'].includes(k)?Number.isFinite(v)&&Math.abs(v)<=8:false);}
export function buildingSlot(obj,item){const kind=buildingSlotKind(item);if(kind)return `${kind}:${Math.floor(obj.x)}:${Math.floor(obj.y)}:${obj.sizeScale??1}`;const b=buildingBounds(obj,item);return `${item?.building?.type||'object'}:${b.x}:${b.y}:${obj.sizeScale??1}`;}
export function buildingConflict(obj,other,catalog){const item=buildingItem(obj,catalog),otherItem=buildingItem(other,catalog);if(!item?.building&&!otherItem?.building)return null;if(!item?.building||!otherItem?.building)return false;if(buildingSlotKind(item)!==buildingSlotKind(otherItem))return false;return buildingSlot(obj,item)===buildingSlot(other,otherItem);}
export function replacementFor(obj,objects,catalog){const item=buildingItem(obj,catalog),kind=buildingSlotKind(item);if(!kind)return null;return objects.find(o=>o.id!==obj.id&&buildingSlotKind(buildingItem(o,catalog))===kind&&buildingSlot(o,buildingItem(o,catalog))===buildingSlot(obj,item));}
export function buildingConnections(objects,catalog){const endpoints=new Map(),result=new Map();for(const o of objects){const item=buildingItem(o,catalog);if(!isEdge(item))continue;const s=o.sizeScale??1,v=(o.rotation||0)%2,ends=[[o.x,o.y],[o.x+(v?0:s),o.y+(v?s:0)]];result.set(o.id,ends);for(const p of ends){const key=p.join(',');endpoints.set(key,(endpoints.get(key)||0)+1);}}return new Map([...result].map(([id,ends])=>[id,ends.map(p=>endpoints.get(p.join(',')))]));}
export function roofSections(objects,catalog){const roofs=objects.filter(o=>buildingItem(o,catalog)?.building?.type==='roof'),cells=new Map(roofs.map(o=>[`${Math.floor(o.x)},${Math.floor(o.y)},${o.sizeScale??1}`,o])),sections=new Map();for(const start of roofs){if(sections.has(start.id))continue;const group=[],queue=[start];sections.set(start.id,group);while(queue.length){const o=queue.pop();group.push(o);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const next=cells.get(`${Math.floor(o.x)+dx*(o.sizeScale??1)},${Math.floor(o.y)+dy*(o.sizeScale??1)},${o.sizeScale??1}`);if(next&&!sections.has(next.id)){sections.set(next.id,group);queue.push(next);}}}}return sections;}
