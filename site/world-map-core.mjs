// Company-authored placements; all geometry, collisions and rendering are Haqi home objects.
export const CITY_PLACEMENTS=[
 {id:'observatory',name:'观星台',x:-10,y:-4.6},
 {id:'memory',name:'记忆花园',x:-2,y:-4.6},
 {id:'library',name:'知识图书馆',x:5,y:-4.6},
 {id:'welcome',name:'入职小站',x:-15,y:3},
 {id:'workshop',name:'灵感工坊',x:15,y:5},
 {id:'fountain',name:'晶体喷泉',x:-1,y:-1.5},
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
 ['street-lamp',-20,-2.9],
 ['rose-bush',-20,8],
 ['garden-bench',-20,11.6],
 ['flower-bed',-17,11.6],
 ['flower-bed',-14,8],
 ['rose-bush',-14,11.6],
 ['street-lamp',-11,11.6],
 ['street-lamp',13,8],
 ['flower-bed',13,11.6],
 ['garden-bench',16,1.4],
 ['street-lamp',19,-2.9],
 ['flower-bed',19,11.6],
 ['street-lamp',-17,-10],
 ['flower-bed',17,-10],
 ['flower-bed',-17,14],
 ['street-lamp',17,14],
 ['flower-bed',-17,17],
 ['rose-bush',17,17],
 ['street-lamp',17,20]
];
export function installCityDecorations(world){
 CITY_DECORATIONS.forEach(([itemId,x,y],i)=>{
  if(world.catalog.some(item=>item.id===itemId))world.objects.push({id:`city-deco-${i}`,itemId,x,y,rotation:0,sizeScale:.7});
 });
}
