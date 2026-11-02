import {canPlace,inventoryKey,homeWaterAt} from './home_core.js';
import {buildingItem,obstruction,intersects,replacementFor} from './home_building_core.js';
export const BUILDING_TEMPLATES=[{id:'wood',name:'完整木屋',width:7,depth:6},{id:'stone',name:'四角石堡',width:8,depth:8}];
export function buildingTemplateObjects(style,x=0,y=0,prefix='template'){
 if(!BUILDING_TEMPLATES.some(t=>t.id===style))throw Error('建筑模板不存在');
 const cells=new Set(),rows=[];
 const rect=(x,y,w,h)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)cells.add(`${i},${j}`);};
 if(style==='wood')rect(0,0,7,6);else{rect(1,1,6,6);for(const [a,b]of [[0,0],[6,0],[0,6],[6,6]])rect(a,b,2,2);}
 const add=(type,a,b,rotation=0)=>rows.push({id:`${prefix}-${rows.length}`,itemId:`build-${style}-${type}`,x:Math.round(x)+a,y:Math.round(y)+b,rotation});
 for(const cell of cells){const [a,b]=cell.split(',').map(Number);add('floor',a,b);add('roof',a,b);
  const n=!cells.has(`${a},${b-1}`),e=!cells.has(`${a+1},${b}`),s=!cells.has(`${a},${b+1}`),w=!cells.has(`${a-1},${b}`);
  if(n||e||s||w){
   const r=(n||s)?0:1,corner=(n||s)&&(e||w);
   const type=a===3&&s&&b===(style==='wood'?5:6)?'door':!corner&&(a+b)%3===0?'window':'wall';
   add(type,a,b,r);
  }
 }return rows;
}
export function templateRequirements(style){const counts={};for(const o of buildingTemplateObjects(style)){const k=inventoryKey(o.itemId);counts[k]=(counts[k]||0)+1;}return counts;}
export function validateTemplatePlacement(rows,existing,catalog,actors=[],seed=null){
 const ids=new Set(existing.map(o=>o.id)),placed=[...existing];
 for(const o of rows){if(ids.has(o.id))return false;ids.add(o.id);if(replacementFor(o,placed,catalog)||!canPlace(o,placed,catalog).ok)return false;
  const item=buildingItem(o,catalog),b=obstruction(o,item);
  if(b&&actors.some(p=>intersects(b,{x:p.x-.18,y:p.y-.12,w:.36,h:.24})))return false;
  if(seed!==null&&item.building.type==='floor'&&homeWaterAt(seed,o.x+.5,o.y+.5).water)return false;
  placed.push(o);
 }return true;
}

export const TEMPLATE_PRACTICE=BUILDING_TEMPLATES.map(t=>({id:'template-'+t.id,templateId:t.id,zh:t.name,en:t.id==='wood'?'wooden house':'stone castle',requiresReading:true,colors:[],practiceWords:{en:[t.id==='wood'?'house':'castle'],zh:[t.id==='wood'?'房子':'城堡']}}));
