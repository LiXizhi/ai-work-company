import {buildingTemplateObjects,validateTemplatePlacement} from './home_building_templates_core.js';
import {isRoofDecoration,roofAt,buildingPlacement,buildingItem,replacementFor,obstruction,intersects,validBuildingProperties} from './home_building_core.js';
import {requiresReading,homeObjectInteractive,canPlace,chunkKey} from './home_core.js';
export function homeObjects(parts){return Object.entries(parts).filter(([k])=>k.startsWith('chunk:')).flatMap(([,v])=>Object.values(v));}
export function applyHomeAction(parts,action,catalog){
 const objects=homeObjects(parts),find=id=>objects.find(o=>o.id===id);
 function remove(obj){delete parts[`chunk:${chunkKey(obj.x,obj.y)}`][obj.id];}
 function put(obj){const key=`chunk:${chunkKey(obj.x,obj.y)}`;if(!parts[key])throw Error('土地尚未加载，请稍候');parts[key][obj.id]=obj;}
 function safe(obj){const b=obstruction(obj,buildingItem(obj,catalog));if(b&&(action.actors||[]).some(p=>intersects(b,{x:p.x-.18,y:p.y-.12,w:.36,h:.24})))throw Error('这里有角色，请换一个位置');}
 function replace(obj){const old=replacementFor(obj,objects,catalog);if(old)remove(old);}
 function place(obj){obj=buildingPlacement(obj,buildingItem(obj,catalog));safe(obj);const test=canPlace(obj,objects,catalog);if(!test.ok)throw Error(test.reason);replace(obj);put(obj);}
 if(action.type==='create'){
  if(requiresReading(buildingItem(action.object,catalog)))throw Error('这件物品需要先阅读');
  place(action.object);return true;
 }
 if(action.type==='template'){
  const receipt=action.receipt?parts[`receipt:${action.receipt}`]:null;
  if(!receipt)throw Error('建筑模板需要先阅读，缺少召唤回执');
  if(receipt?.completed)return false;
  const rows=buildingTemplateObjects(action.templateId,action.x,action.y,action.prefix);
  if(!validateTemplatePlacement(rows,objects,catalog,action.actors,action.seed??null))throw Error('这里无法放下完整建筑，请换一块空地');
  for(const o of rows)if(!parts[`chunk:${chunkKey(o.x,o.y)}`])throw Error('土地尚未加载，请稍候');
  if(receipt){receipt.completed=true;if(action.practice&&parts['local:practice'])parts['local:practice'][action.receipt]=action.practice;}
  for(const o of rows)put(o);return true;
 }
 if(action.type==='summon'){
  const receipt=parts[`receipt:${action.receipt}`];if(!receipt)throw Error('缺少召唤回执事务');if(receipt.completed)return false;
  if(!catalog.some(i=>i.id===action.itemId))throw Error('物品不存在');
  if(action.object){const check=canPlace(action.object,objects,catalog);if(!check.ok)throw Error(check.reason);safe(action.object);}
  if(action.practice&&parts['local:practice'])parts['local:practice'][action.receipt]=action.practice;
  Object.assign(receipt,{completed:true,input:action.input,itemId:action.itemId,color:action.color||''});
  if(action.object&&canPlace(action.object,objects,catalog).ok){safe(action.object);replace(action.object);put(action.object);}
  return true;
 }
 if(action.type==='place'){
  place(action.object);return true;
 }
 const obj=find(action.id);if(!obj)throw Error('物品已变化，请重新选择');
 if(action.type==='properties'||action.type==='door'){
  const next=action.type==='door'?{...obj,doorOpen:!obj.doorOpen}:{...obj,properties:action.properties};
  if(action.type==='door'&&buildingItem(obj,catalog)?.building?.type!=='door')throw Error('这不是门');
  if(!validBuildingProperties(next))throw Error('建筑属性无效');
  if(action.type==='properties'){
   if(isRoofDecoration(next))next.parentId=roofAt(next,objects,catalog)?.id;
   else if(isRoofDecoration(obj))delete next.parentId;
   const check=canPlace(next,objects,catalog);if(!check.ok)throw Error(check.reason);
  }
  safe(next);put(next);return true;
 }
 const children=objects.filter(o=>o.parentId===obj.id);
 if(action.type==='recall'){for(const row of [obj,...children])remove(row);return true;}
 if(action.type==='toggleInteraction'){put({...obj,interactionEnabled:!homeObjectInteractive(obj,catalog)});return true;}
 if(action.type==='resize'){
  if(action.delta!==.25&&action.delta!==-.25)throw Error('无效的尺寸调整');
  const next={...obj,sizeScale:Math.max(.5,Math.min(2,(obj.sizeScale??1)+action.delta))};
  const test=canPlace(next,objects,catalog);if(!test.ok)throw Error(test.reason);
  const resized=objects.map(o=>o.id===obj.id?next:o);
  for(const child of children){const check=canPlace(child,resized,catalog);if(!check.ok)throw Error('缩小后放不下桌面物品，请先调整它们');}
  safe(next);put(next);return true;
 }
 if(action.type==='move'){
  const next=buildingPlacement({...obj,...action.position},buildingItem(obj,catalog)),test=canPlace(next,objects,catalog);if(!test.ok)throw Error(test.reason);
  const movedChildren=children.map(child=>({...child,x:child.x+next.x-obj.x,y:child.y+next.y-obj.y}));
  const scene=objects.filter(o=>o.id!==obj.id&&!children.some(c=>c.id===o.id)).concat(next,movedChildren);
  for(const child of movedChildren){const check=canPlace(child,scene,catalog);if(!check.ok)throw Error(check.reason);safe(child);}
  for(const row of [next,...movedChildren])if(!parts[`chunk:${chunkKey(row.x,row.y)}`])throw Error('土地尚未加载，请稍候');
  safe(next);remove(obj);replace(next);put(next);for(const child of children)remove(child);for(const child of movedChildren)put(child);return true;
 }
 throw Error('不支持的家园操作');
}
