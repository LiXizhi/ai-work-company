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
