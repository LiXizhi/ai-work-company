// Account-owned cosmetic heads. Pure rules; no browser or SDK dependencies.
export const PHOTO_HEAD_BYTES = 200000;
export const PHOTO_INPUT_BYTES = 300000;
export const PHOTO_HEAD_LIMIT = 10;
export const PHOTO_HEAD_PAGE_SIZE = PHOTO_HEAD_LIMIT;
export function validatePhotoHeadPreview(value) {
    if(typeof value!=='string'||value.length>22000||!/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(value))throw Error('形象预览图无效');
    return value;
}
export const PHOTO_HEAD_ID = /^photo-[a-z0-9-]{1,48}-(boy|girl)$/;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const require = (ok, message) => { if (!ok) throw Error(message); };
// Four-frame atlas order: front, back, left, right. Legacy atlases rotate in 22.5° steps.
export function headAtlasColumns(directionCount=16) {
    require(directionCount===4||directionCount===16,'头部方向数无效');
    return directionCount===4?2:4;
}
export function validatePhotoHead(head, {id=head?.id, appearance, owner} = {}) {
    require(head?.version===1 && PHOTO_HEAD_ID.test(head.id) && head.id===id, '自定义头部编号无效');
    require(['male','female'].includes(head.gender) && head.id.endsWith(head.gender==='female'?'-girl':'-boy'), '自定义头部类型无效');
    require(!appearance || head.gender===(appearance==='girl'?'female':'male'), '头部形象和性别不一致');
    require(typeof head.owner==='string' && /^[\w-]{1,80}$/.test(head.owner) && (!owner || head.owner===owner), '自定义头部账号不符');
    require(/^https:\/\/cdn\.keepwork\.com\/[^\s?#]+\.webp$/.test(head.cdn||''), '自定义头部资源地址无效');
    require(/^[a-f0-9]{64}$/.test(head.sha256||'') && Number.isInteger(head.bytes) && head.bytes>0 && head.bytes<=PHOTO_HEAD_BYTES, '自定义头部资源大小或哈希无效');
    const columns=headAtlasColumns(head.directionCount);
    require(Number.isInteger(head.width) && head.width>=256 && head.width<=2048 && head.width%columns===0 && head.height===head.width, '自定义头部尺寸无效');
    require(Array.isArray(head.frames) && head.frames.length===head.directionCount, '自定义头部方向帧数不符');
    const cell=head.width/columns;
    for (const [i,f] of head.frames.entries()) {
        require(f.mirrorX===undefined || typeof f.mirrorX==='boolean','自定义头部镜像无效');
        require(f.offsetAdjusted===undefined || typeof f.offsetAdjusted==='boolean','自定义头部校准标记无效');
        require(Array.isArray(f.crop) && f.crop.length===4 && f.crop.every(finite) && f.crop.every((v,k)=>v===[i%columns*cell,Math.floor(i/columns)*cell,cell,cell][k]), '自定义头部裁剪无效');
        require(Array.isArray(f.neck) && f.neck.length===2 && f.neck.every(v=>finite(v)&&v>=0&&v<=cell) && finite(f.height)&&f.height>=cell*.2&&f.height<=cell, '自定义头部连接点无效');
    }
    return head;
}
export function publicPhotoHead(head, options={}) {
    validatePhotoHead(head,options);
    // Explicit allow-list: never copy input photos, generated source data or task state.
    return {version:1,id:head.id,owner:head.owner,gender:head.gender,name:'我的照片形象',cdn:head.cdn,sha256:head.sha256,bytes:head.bytes,width:head.width,height:head.height,directionCount:head.directionCount,
        frames:head.frames.map(f=>({crop:[...f.crop],neck:[...f.neck],height:f.height,...(f.mirrorX?{mirrorX:true}:{}),...(f.offsetAdjusted?{offsetAdjusted:true}:{})}))};
}
export function scaleHeadFrames(template,width,height=width) {
    const count=template?.directionCount??16,columns=headAtlasColumns(count);
    require(template?.frames?.length===count && template.width>0 && template.width===template.height && width>0 && width===height && width%columns===0, '头部布局参考无效');
    const scale=width/template.width;
    return template.frames.map(f=>({crop:f.crop.map(n=>n*scale),neck:f.neck.map(n=>n*scale),height:f.height*scale,...(f.mirrorX?{mirrorX:true}:{}),...(f.offsetAdjusted?{offsetAdjusted:true}:{})}));
}
export function photoHeadPrompt(template) {
    scaleHeadFrames(template,template.width);
    if(template.directionCount===4)return `为现有2D卡通游戏绘制同一人物的2列2行、4方向独立头部图集，每格是一枚完整的头部贴纸。
第一张图仅提供人物外貌：脸型、肤色、发色、刘海、分缝、发辫/马尾、眼镜和发饰。第二张图提供美术风格、比例、转向和布局。
【布局】严格按行排列：左上正面、右上背面、左下面朝画面左侧、右下面朝画面右侧。只有这四个方向，不画斜侧脸、不增加格子。
【逐格对齐第二张参考图】逐格保持下颌位置和头部比例，不居中或重新构图；脸型可按照片轻微调整，不能因头发宽度、长度而移动或缩放脸。普通人耳朵代替参考中的精灵耳。
【画风】Q版2D手绘卡通，圆润简化五官、清亮大眼睛、成组发束、柔和明暗；四格为同一人物与发型，不画写实皮肤、摄影发丝或写实3D。
【完整独立头部】仅头发、脸、耳朵、眼镜和发饰；面部皮肤止于下巴与下颌线，背面仅后脑与头发。不要脖子、颈根、后颈、肩膀、衣领或身体。长发自然弯曲收拢，保留完整头顶、耳朵、下巴和发尾，四周留白，不沿格边截断。
【输出】纯白背景，已有透明背景可保留；无格线、文字、水印和投影。只输出完成的2×2图集。
DO NOT INCLUDE NECK in all 4 character head directions.`;
    // Same head/body split as scripts/plan_urban_residents.mjs and docs/hero-preview.md:
    // the body supplies the neck; head-frame `neck` is an attachment anchor only.
    return `为现有2D卡通游戏绘制同一人物的4列4行、16方向独立头部图集，每格是一枚完整的头部贴纸。

【首要要求：逐格对齐第二张参考图】
以第二张图的对应格为布局底稿：脸的整体位置、大小、朝向和下巴落点保持不变；脸型可以按第一张照片轻微调整，例如脸颊丰满程度、下颌弧度和下巴圆尖，但不改变整体定位与尺度。发型、发色、五官造型、肤色、眼镜和发饰可以按第一张照片改变。发型可以改变外轮廓及遮挡，不必描摹参考的发束或逐像素保留原留白，但不能带动脸的位置或尺度变化。只替换独立头部内的外貌，不补画参考中没有的其他身体部位。

【参考与画风】
第一张图提供人物外貌：脸型、肤色、发色、刘海、分缝、发辫/马尾、眼镜和发饰。将这些特征重新绘制成Q版2D手绘卡通，采用圆润简化的五官、清亮的大眼睛、成组发束和柔和明暗。
第二张图提供美术风格、转向、比例和布局。逐格保持下颌位置和头部比例，不居中或重新构图；人物外貌来自第一张图，普通人耳朵代替参考中的精灵耳。全部16格保持同一人物、同一发型和同一画风。

【头部轮廓】
画面内容仅为头发、脸、耳朵、眼镜和发饰。面部皮肤自然止于下巴与下颌线，侧脸沿下颌收回耳根；背面呈现完整后脑和头发。轮廓外以及发束间的空隙均留背景。
保留完整头顶、下巴、耳朵和发尾。长发与双马尾采用紧凑、自然弯曲的造型，发尾圆润收拢；四周留出空白，所有发束完整放在各自格内，保持参考头部的位置和尺度。

【16方向】
逐格对应第二张图的视觉朝向和面部转向，五官随相同角度自然呈现；新发型可以改变对脸和耳朵的遮挡。按行连续旋转一周：
第1行：0°正面、22.5°向左前、45°左前、67.5°接近左侧。
第2行：90°左侧、112.5°左后侧、135°左后、157.5°接近背面。
第3行：180°背面、202.5°右后偏背、225°右后、247.5°接近右侧。
第4行：270°右侧、292.5°右前偏侧、315°右前、337.5°接近正面。
采用参考的俯视镜头，保持每格对应的位置、尺度和顺序。

【对齐参考】
按第1行第1格至第4行第4格一一对照第二张图，以脸的位置、大小和下巴落点对齐，不以头发外轮廓对齐；不能因为新发型的宽度、长度或蓬松程度而平移、重新居中或缩放脸部。

【输出】
纯白背景，已有透明背景可保留；格间留白，无格线、文字、水印或投影。逐格与第二张图核对脸的位置、大小、朝向和下巴落点；发型和五官体现第一张照片的特征，头部和发尾完整，内容仅限独立头部。只输出完成的4×4图集。
DO NOT INCLUDE NECK in all 16 character head directions.`;
}
// Adjust attachment coordinates only; never move/crop atlas pixels or flatten
// the distinct neck positions within a row. Positive delta raises the head.
export function offsetPhotoHeadRow(frames,row,dx,dy,cell,{preserveAdjusted=false}={}) {
    require(Number.isInteger(row)&&row>=0&&row<4&&finite(dx)&&finite(dy)&&finite(cell)&&cell>0&&frames?.length===16,'图集行校正无效');
    const next=frames.map(f=>({...f,crop:[...f.crop],neck:[...f.neck]}));
    const rowFrames=next.slice(row*4,row*4+4).filter((f,i)=>!preserveAdjusted||i===0||!f.offsetAdjusted);
    const limit=(v,axis)=>Math.max(-Math.min(...rowFrames.map(f=>f.neck[axis])),Math.min(cell-Math.max(...rowFrames.map(f=>f.neck[axis])),v));
    const x=limit(dx,0),y=limit(dy,1);
    for(const frame of rowFrames){frame.neck[0]+=x;frame.neck[1]+=y;}
    return next;
}
export function offsetPhotoHeadFrame(frames,index,dx,dy,cell) {
    require(Number.isInteger(index)&&index>=0&&index<frames?.length&&finite(dx)&&finite(dy)&&finite(cell)&&cell>0&&[4,16].includes(frames?.length),'图集方向校正无效');
    return frames.map((f,i)=>({...f,crop:[...f.crop],neck:i===index?[Math.max(0,Math.min(cell,f.neck[0]+dx)),Math.max(0,Math.min(cell,f.neck[1]+dy))]:[...f.neck]}));
}
// Default poses move only untouched peers; direct edits remain independent after saving.
export function offsetPhotoHeadPose(frames,index,baseIndex,dx,dy,cell) {
    if(frames?.length===4){
        const next=offsetPhotoHeadFrame(frames,index,dx,dy,cell);
        if(next[index].neck.some((v,axis)=>v!==frames[index].neck[axis]))next[index].offsetAdjusted=true;
        return next;
    }
    require([0,4,8,12].includes(baseIndex),'图集基础方向无效');
    const next=index===baseIndex
        ?offsetPhotoHeadRow(frames,baseIndex/4,dx,dy,cell,{preserveAdjusted:true})
        :offsetPhotoHeadFrame(frames,index,dx,dy,cell);
    if(next[index].neck.some((v,axis)=>v!==frames[index].neck[axis]))next[index].offsetAdjusted=true;
    return next;
}
/** Photo avatar generation is member-only; freeUsed remains in storage for older indexes. */
export function photoHeadQuota(index, vip) {
    return {allowed:!!vip, remaining:vip?null:0};
}
export function formatTransferBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1048576).toFixed(2)} MB`;
}
/** Last body gender used with a library head; falls back to the head's generation gender. */
export function photoHeadOutfitPreference(head, outfit={}) {
    const appearance=outfit?.appearance==='boy'||outfit?.appearance==='girl'?outfit.appearance:head?.gender==='female'?'girl':'boy';
    const bodyId=typeof outfit?.bodyId==='string'&&outfit.bodyId?outfit.bodyId:undefined;
    return bodyId?{appearance,bodyId}:{appearance};
}
