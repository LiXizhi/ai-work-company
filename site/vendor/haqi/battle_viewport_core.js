// All arena artwork uses design coordinates; DPR only controls raster sharpness.
export const BATTLE_DESIGN_WIDTH=1024;
export const BATTLE_DESIGN_HEIGHT=640;

export function battleViewport(pixelWidth,pixelHeight){
    // Preserve the compact phone layout; enlarge the whole scene on larger displays.
    const compactScale=Math.min(1,pixelHeight/270);
    const designScale=Math.min(pixelWidth/BATTLE_DESIGN_WIDTH,pixelHeight/BATTLE_DESIGN_HEIGHT);
    const scale=Math.max(compactScale,designScale);
    return {scale,w:pixelWidth/scale,h:pixelHeight/scale};
}
