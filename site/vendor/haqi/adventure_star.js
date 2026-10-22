// Shared atlas selection for the world companion and membership UI.
export function drawMagicStarIcon(c,assets,level,x,y,size,repaint=true) {
    const art=assets.content.magicStarArt;if(!art)return false;
    const columns=art.columns,cellWidth=art.width/columns,cellHeight=art.height/art.rows;
    const index=Math.max(0,Math.min(art.frameCount-1,Math.floor(Number(level)||1)-1));
    return assets.draw(c,{id:'magic-star-companion',crop:[index%columns*cellWidth,Math.floor(index/columns)*cellHeight,cellWidth,cellHeight]},x,y,size,size,true,repaint);
}

export function drawMagicStar(c,state,assets,level=1) {
    if(!state.visible)return;
    c.save();c.translate(state.x,state.y);c.rotate(state.roll);c.scale(state.scale,state.scale);
    drawMagicStarIcon(c,assets,level,-15,-15,30,false);
    c.restore();
}

// The member companion only exists while the entitlement is live and the hero keeps "跟随主角" on.
export function starCompanionVisible(save,style,{title=false,motionHidden=false,fishingPose=false,teleportEffect=false}={}) {
    return !!style?.vip && save?.magicStarFollow !== false && !title && !motionHidden && !fishingPose && !teleportEffect;
}
