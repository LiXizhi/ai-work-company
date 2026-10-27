// Company-authored placements; all geometry, collisions and rendering are Haqi home objects.
export const CITY_PLACEMENTS=[
 {id:'observatory',name:'观星台',x:-11,y:-5},
 {id:'memory',name:'记忆花园',x:-2,y:-8},
 {id:'library',name:'知识图书馆',x:7,y:-5},
 {id:'welcome',name:'入职小站',x:-17,y:7},
 {id:'workshop',name:'灵感工坊',x:15,y:7},
];
export function installCityLandmarks(world,items){
 for(const p of CITY_PLACEMENTS){
  const item=items.find(i=>i.id==='neural-'+p.id);if(!item)continue;
  const object={id:'city-'+p.id,itemId:item.id,x:p.x,y:p.y,rotation:0};
  world.objects.push(object);
  const landmark={id:p.id,name:p.name,cellX:p.x+item.size[0]/2,cellY:p.y+item.size[1]+.8,x:(p.x+item.size[0]/2)*40,y:(p.y+item.size[1]+.8)*40};
  const old=world.landmarks.find(m=>m.id===p.id);if(old)Object.assign(old,landmark);else world.landmarks.push(landmark);
 }
}

// Street furniture from the shared home catalogue (lamps, benches, beds of flowers).
// Positions were chosen to keep every home reachable; see test/world-roles.test.mjs.
export const CITY_DECORATIONS=[
 ['street-lamp',-10,1,.48],['street-lamp',10,1,.48],
 ['flower-bed',-10,6,.38],['flower-bed',10,6,.38],
 ['garden-bench',-7,-1,.55],['garden-bench',5,-1,.55],
 ['flower-bed',-4,-2,.38],['flower-bed',4,-2,.38],
 ['street-lamp',-10,13,.48],['street-lamp',10,13,.48],
 ['garden-bench',-7,15,.55],['garden-bench',5,15,.55],
 ['rose-bush',-10,16,.4],['rose-bush',10,16,.4],
];
export function installCityDecorations(world){
 CITY_DECORATIONS.forEach(([itemId,x,y,sizeScale],i)=>{
  if(world.catalog.some(item=>item.id===itemId))world.objects.push({id:`city-deco-${i}`,itemId,x,y,rotation:0,sizeScale});
 });
}
