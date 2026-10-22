import {createRng} from './rng_core.js';
import {streetWalkable,polygonBounds} from './adventure_city_street_core.js';
export const rectangle=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
export function emptyStreet(){return{version:1,ground:'#c9cfb6',surfaces:[],roads:[],colliders:[],objects:[],routes:[],signals:[],crossings:[]};}
export function streetObject(s,id,art,x,y,w,h,{solid=false,label='',type='prop'}={}){
    const object={id,art,type,x,y,w,h,label,provenance:'artistic'};s.objects.push(object);
    if(solid){object.footprint=rectangle(x-w*.38,y-h*.20,w*.76,h*.20);s.colliders.push({id:id+':collision',points:object.footprint});}
    return object;
}
// A continuous irregular street, side lanes, courtyards and a corner park. No parcel tiles.
export function generateStreetLayout(seed,{size=2400,style='modern'}={}){
    const rng=createRng(seed),s=emptyStreet(),cx=size*.5,roadY=size*.72;
    s.surfaces.push({id:'park',kind:'grass',color:'#99b184',points:rectangle(size*.67,size*.12,size*.27,size*.48)});
    s.surfaces.push({id:'plaza',kind:'paving',color:'#d5c7ac',points:[{x:cx-240,y:size*.5},{x:cx+260,y:size*.49},{x:cx+300,y:roadY-120},{x:cx-270,y:roadY-120}]});
    s.roads.push({id:'avenue',kind:'road',width:150,points:[{x:0,y:roadY},{x:size*.35,y:roadY-25},{x:size*.7,y:roadY+35},{x:size,y:roadY+35}]});
    s.roads.push({id:'market-lane',kind:'walk',width:120,points:[{x:cx-90,y:70},{x:cx-40,y:size*.3},{x:cx+10,y:size*.53},{x:cx,y:roadY-110}]});
    s.roads.push({id:'south-walk',kind:'walk',width:100,points:[{x:cx,y:roadY+110},{x:cx,y:size-40}]});
    for(let i=0;i<3;i++){const y=250+i*350;s.roads.push({id:'lane-'+i,kind:'walk',width:65,points:[{x:110,y},{x:cx-80+i*20,y:y+30},{x:size*.78,y:y+100}]});}
    let n=0;
    for(let side of [-1,1])for(let i=0;i<9;i++){
        const y=230+i*140,w=rng.int(190,270),x=cx+side*(170+rng.int(0,35));
        if(y>size*.50&&side===1)continue;
        streetObject(s,'shop-'+n++,rng.pick(style==='old'?['shophouse','lingnan-house','corner-shop']:['corner-shop','apartment','cafe']),x,y,w,rng.int(165,215),{solid:true,type:'building',label:['街角杂货','小食铺','花店','修理铺','茶饮'][i%5]});
    }
    for(let i=0;i<7;i++){const x=160+i*320;if(Math.abs(x-cx)<180)continue;streetObject(s,'south-shop-'+i,rng.pick(['corner-shop','apartment','cafe']),x,size-150,260,230,{solid:true,type:'building'});}
    for(let i=0;i<22;i++){const x=i<12?size*.76+rng.int(-120,220):rng.int(100,size-100),y=i<12?180+i*80:roadY-140;streetObject(s,'tree-'+i,i%4?'banyan':'palm',x,y,110+rng.int(0,35),150,{type:'tree'});}
    streetObject(s,'food','food-stall',cx-185,size*.56,100,110,{solid:true});
    streetObject(s,'fruit','fruit-stall',cx+185,size*.60,110,105,{solid:true});
    streetObject(s,'kiosk','shelter',cx+250,size*.48,150,100);
    for(let i=0;i<10;i++)streetObject(s,'flowers-'+i,'flowers',cx+(i%2?110:-110),200+i*130,50,55);
    for(let i=0;i<5;i++){streetObject(s,'bench-'+i,'bench',size*.70+i%2*200,300+i*170,90,55);}
    streetObject(s,'bikes','bicycles',cx+200,roadY-125,100,70);
    s.crossings.push({x:cx,y:roadY+15,w:100,h:150});
    s.signals.push({id:'crossing-light',x:cx+80,y:roadY-90,period:14,green:8,offset:0});
    const route={id:'traffic',kind:'vehicle',points:[{x:60,y:roadY+40},{x:cx,y:roadY+40},{x:size-60,y:roadY+40}],speed:85,count:3,art:'car',stops:[{signal:'crossing-light',distance:cx-140}]};s.routes.push(route);
    s.routes.push({id:'residents',kind:'pedestrian',points:[{x:cx-70,y:100},{x:cx-20,y:size*.4},{x:cx+10,y:size*.52},{x:cx-20,y:size*.4},{x:cx-70,y:100}],speed:25,count:5});
    return s;
}
// Resolve an authored point to a nearby free location without changing its durable identity.
export function placeStreetPoint(scene,point){
    const inside={x:Math.min(scene.map.w-60,Math.max(60,point.x)),y:Math.min(scene.map.h-60,Math.max(60,point.y))};
    if(streetWalkable(scene,inside.x,inside.y,16))return inside;
    for(let r=20;r<500;r+=20)for(let i=0;i<32;i++){const p={x:inside.x+Math.cos(i*Math.PI/16)*r,y:inside.y+Math.sin(i*Math.PI/16)*r};if(streetWalkable(scene,p.x,p.y,16))return p;}
    throw Error('无法放置可达的街景交互点');
}
