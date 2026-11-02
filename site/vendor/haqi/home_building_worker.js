import {drawBuilding} from './view_home_building.js';
const images=new Map();
self.onmessage=({data})=>{
 if(data.type==='image'){images.get(data.key)?.close();images.set(data.key,data.image);return;}
 const {id,rows,bounds,density}=data;
 try{const canvas=new OffscreenCanvas(Math.ceil(bounds.w*density),Math.ceil(bounds.h*density)),c=canvas.getContext('2d');c.scale(density,density);c.translate(-bounds.x,-bounds.y);for(const row of rows)drawBuilding(c,row.item,row.o,images.get(row.url),row.connections,row.ao);const bitmap=canvas.transferToImageBitmap();self.postMessage({id,bitmap},[bitmap]);}catch(e){self.postMessage({id,error:String(e)});}
};
