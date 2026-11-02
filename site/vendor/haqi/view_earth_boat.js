import {earthBoatAt,earthBoatDrawPosition} from './adventure_earth_boat_core.js';

const directions=['Down','Left','Right','Up'];
function sprite(ctx,assets,world,kind,facing,x,y,size){
    const frame=world.boatArt?.frames?.[kind+directions[facing] ];if(!frame)return false;
    return assets.draw(ctx,{id:'earth-boat',crop:frame.rect},x-size/2,y-size/2,size,size,false,false);
}
export function drawEarthDocks(ctx,assets,world,view){
    const size=world.earthRules?.dockSize||112;
    for(const dock of world.docks||[]){
        if(dock.x<view.x-size||dock.x>view.x+view.w+size||dock.y<view.y-size||dock.y>view.y+view.h+size)continue;
        sprite(ctx,assets,world,'dock',dock.facing,dock.x,dock.y,size);
    }
}
// Hide the rider's legs inside the hull; do not alter equipped mounts or save data.
export function drawEarthBoatRider(ctx,assets,world,position,facing,drawRider){
    if(!earthBoatAt(world,position.x,position.y))return false;
    const size=world.earthRules?.boatSize||100,{x,y}=earthBoatDrawPosition(position,ctx.getTransform?.());
    sprite(ctx,assets,world,'boat',facing,x,y,size);
    ctx.save();ctx.beginPath();ctx.rect(x-size,y-160,size*2,152);ctx.clip();
    drawRider(x,y+10);ctx.restore();
    return true;
}
