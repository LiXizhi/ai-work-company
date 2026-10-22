import { resolveMountDrawPose, MOUNT_DIRECTIONS } from './adventure_mounts_core.js';
import { createHeroActor, updateHeroActor, BODY_TO_HEAD, headBreath, walkFrameIndex, headFrameIndex } from './hero_pose_core.js';
import {publicPhotoHead} from './photo_head_core.js';
import {verifyHeadAsset} from './photo_head_images.js';
import {createPortraitScheduler} from './portrait_scheduler.js';

// One UI scheduler; detached portraits release their actor state automatically.
let views;
function scheduleView(view){(views??=createPortraitScheduler()).add(view);}

/** Shared world/battle/UI library. Original source crops/layout bounds are immutable.
 * Hosts own placement, time, scene ordering and animation. UI and world use draw().
 */
export class HeroRenderer {
    constructor(manifest, catalog, { local = false, baseURL = new URL('../', String(import.meta.url)),prepareBounds=null } = {}) {
        this.manifest = manifest; this.catalog = catalog; this.local = local; this.baseURL = baseURL;
        this.images = new Map(); this.pending = new Map(); this.sourceBounds = new Map();
        this.prepared=new Map();
        this.prepareBounds=prepareBounds;
        this.customHeads=new Map();this.failedHeads=new Set();this.customVersions=new Map();this.headReferences=new WeakMap();
    }
    headArt(id){return this.customHeads.get(id)||this.manifest.heads[id];}
    registerHead(value,alias=true){
        if(!alias&&this.headReferences.has(value))return this.headReferences.get(value);
        const head=publicPhotoHead(value),previous=this.customHeads.get(head.id);
        const signature=JSON.stringify(head);let key=this.customVersions.get(signature);
        if(!key){key=head.id+'@'+this.customVersions.size;this.customVersions.set(signature,key);this.customHeads.set(key,head);}
        this.headReferences.set(value,key);
        if(alias&&this.failedHeads.delete(key))this.prepared.clear();
        // A role's immutable descriptor selects its own renderer key: tuning one
        // head must not overwrite another role's previously saved connection points.
        if(alias||!previous){
            this.customHeads.set(head.id,head);
            if(previous?.sha256!==head.sha256){this.failedHeads.delete(head.id);this.images.delete('head:'+head.id);this.pending.delete('head:'+head.id);}
            if(JSON.stringify(previous)!==signature)this.prepared.clear();
        }
        return key;
    }
    createActor(seed) { return createHeroActor(seed); }
    headId(gender,id){return !this.failedHeads.has(id)&&this.headArt(id)?.gender===gender?id:gender==='female'?'elf-girl':'elf-boy';}
    bodyVariant(gender,id){const variant=this.manifest.bodyVariants?.[id];return variant?.gender===gender?variant:null;}
    // Variants may own frame geometry as well as textures. Classic recolors
    // inherit the base geometry; shared persona sheets carry their own anchors.
    bodyArt(key,{gender='male',bodyId}={}){
        const base=this.manifest.bodies[key],variant=this.bodyVariant(gender,bodyId);
        if(key!==gender+'-walk'||!variant?.geometry)return base;
        return {...base,...variant.geometry,...variant,walk:{...base.walk,...variant,...variant.geometry.walk}};
    }
    walkKey(gender,id){return 'walk:'+(this.bodyVariant(gender,id)?.id||gender);}
    updateActor(actor, input) { return updateHeroActor(actor, input); }
    async image(id, art, mountAsset = false) {
        if (this.images.has(id)) return this.images.get(id);
        if (!this.pending.has(id)) {
            const local = mountAsset && art.local?.startsWith('assets/') ? 'demos/mount-lab/'+art.local : art.local;
            const useLocal=this.local&&!this.customHeads.has(art.id);
            const localURL=useLocal?new URL(local,this.baseURL):null;
            const targetUrl = useLocal ? localURL.href : art.cdn;
            const assetKey = targetUrl ? `${targetUrl}#${art.sha256||''}` : null;
            this.assetPending ??= new Map();
            let promise = assetKey ? this.assetPending.get(assetKey) : null;
            if (!promise) {
                promise = (async()=>{
                    // Personal art uses its validated CDN even in the explicit offline-art mode.
                    const verified = this.customHeads.has(art.id) ? await verifyHeadAsset(art) : null;
                    const blobUrl = verified instanceof Blob && typeof URL?.createObjectURL === 'function' ? URL.createObjectURL(verified) : null;
                    return new Promise((resolve, reject) => {
                        const image = new Image(); image.crossOrigin = 'anonymous';
                        const url = blobUrl || targetUrl;
                        if (!url) { if (blobUrl) URL.revokeObjectURL(blobUrl); reject(new Error(`资源尚未登记 CDN：${id}`)); return; }
                        image.onload = async () => {
                            if (blobUrl) URL.revokeObjectURL(blobUrl);
                            if (art.width && (image.width !== art.width || image.height !== art.height)) { reject(new Error(`资源尺寸不符：${id}`)); return; }
                            // Decode before publishing to world/UI drawing, including newly streamed peers.
                            if(image.decode)try{await image.decode();}catch{/* Preserve the original drawing fallback. */}
                            resolve(image);
                        };
                        image.onerror = () => { if (blobUrl) URL.revokeObjectURL(blobUrl); reject(new Error(`资源加载失败：${id}`)); }; image.src = url;
                    });
                })();
                if (assetKey) {
                    this.assetPending.set(assetKey, promise);
                    promise.catch(() => { if (this.assetPending.get(assetKey) === promise) this.assetPending.delete(assetKey); });
                }
            }
            const tracked = promise.then(image => { this.images.set(id, image); return image; });
            this.pending.set(id, tracked);
            tracked.catch(() => this.pending.delete(id));
        }
        return this.pending.get(id);
    }
    appearance(save,{mounted=true}={}) {
        let resolvedHead=save.headId;
        if(save.customHead)try{if(save.customHead.id===save.headId&&save.customHead.gender===(save.appearance==='girl'?'female':'male'))resolvedHead=this.registerHead(save.customHead,false);}catch{/* Invalid cosmetics never prevent play. */}
        const mountId=this.catalog.mountByItem?.[save.mountId]?.mountId;
        const mount=mounted&&save.mountId?this.catalog.mounts.find(m=>m.id===mountId||Object.hasOwn(m.commerce||{},save.mountId)):null;
        return {gender:save.appearance==='girl'?'female':'male',mount:mount||null,headId:resolvedHead,bodyId:save.bodyId};
    }
    ensure(appearance){
        appearance={...appearance,headId:this.headId(appearance.gender||'male',appearance.headId)};
        const key=[appearance.gender,appearance.mount?.id,appearance.headId,appearance.bodyId,appearance.standing].join(':');
        if(!this.prepared.has(key))this.prepared.set(key,this.prepare(appearance).catch(()=>({fallback:true})));
        return this.prepared.get(key);
    }
    async prepare({ gender = 'male', mount = null, standing = false, bodyId, headId = gender==='female'?'elf-girl':'elf-boy' } = {}) {
        headId=this.headId(gender,headId);
        const keys = mount ? [...new Set([0,1,2,3].map(facing=>this.layout({gender,mount},{facing}).key))]
            : [standing?(gender==='female'?'female-standing':'standing'):gender+'-walk'];
        const originals = keys.filter(key=>!this.bodyArt(key,{gender,bodyId}).selfContained).map(key => this.image('original:'+key,this.bodyArt(key,{gender,bodyId}).source));
        if (mount) originals.push(this.image('mount:'+mount.id,mount.art,true));
        await Promise.all(originals);
        if(this.prepareBounds)for(const key of keys){const body=this.bodyArt(key,{gender,bodyId});if(body.selfContained)continue;
            for(const [cell,frame] of body.frames.entries()){const id=key+':'+cell;if(this.sourceBounds.has(id))continue;
                const prepared=await this.prepareBounds(this.images.get('original:'+key),frame.crop);
                if(prepared)this.sourceBounds.set(id,prepared);else this.originalBounds(key,cell);
            }
        }
        const results = await Promise.allSettled(keys.map(async key => {
            const body=this.bodyArt(key,{gender,bodyId});
            if(this.headArt(headId))await Promise.all([
                body.walk?.idleFrames ? this.image(this.walkKey(gender,bodyId),this.bodyVariant(gender,bodyId)||body.walk) : this.image('body:'+(body.atlas||key),body),
                this.image('head:'+headId,this.headArt(headId)).catch(async error=>{
                    if(!this.customHeads.has(headId))throw error;
                    this.failedHeads.add(headId);const fallback=gender==='female'?'elf-girl':'elf-boy';
                    await this.image('head:'+fallback,this.manifest.heads[fallback]);
                })]);
        }));
        const walk=this.manifest.bodies[gender+'-walk'].walk;
        if(walk&&!walk.idleFrames)await this.image('walk:'+gender,walk).catch(()=>null);
        return { fallback:results.some(r => r.status==='rejected'), errors:results.filter(r=>r.status==='rejected').map(r=>r.reason.message) };
    }
    originalBounds(key, cell) {
        const body=this.manifest.bodies[key];
        if(body.selfContained)return body.frames[cell].layoutBounds||body.frames[cell].crop;
        const id=key+':'+cell;
        if(!this.sourceBounds.has(id)&&key.endsWith('-walk')&&this.getWalkingBounds)this.sourceBounds.set(id,this.getWalkingBounds('sprites',this.manifest.bodies[key].frames[cell].crop));
        if (!this.sourceBounds.has(id)) {
            const image=this.images.get('original:'+key),crop=this.manifest.bodies[key].frames[cell].crop;
            const c=document.createElement('canvas');c.width=Math.ceil(crop[2]);c.height=Math.ceil(crop[3]);
            const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,...crop,0,0,c.width,c.height);
            const data=ctx.getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=0,b=0;
            for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(data[(y*c.width+x)*4+3]>20){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
            this.sourceBounds.set(id,[crop[0]+l,crop[1]+t,r-l+1,b-t+1]);
        }
        return this.sourceBounds.get(id);
    }
    layout({gender='male',mount=null},{facing=0,size=78,time=0,moving=false,standing=false,bodyRect,reducedMotion=false}={}) {
        if(bodyRect)return {key:gender+'-walk',rider:{cell:facing,...bodyRect},foreground:[]};
        if (mount && !standing) {
            const pose=resolveMountDrawPose(mount,facing,{size,time,moving,gender});
            const config=mount.directions[MOUNT_DIRECTIONS[facing]],p={...config,...config.characters?.[gender]};
            return {...pose,key:pose.rider.art,seat:[pose.rider.x+p.anchor[0]*pose.rider.w,pose.rider.y+p.anchor[1]*pose.rider.h]};
        }
        if (standing) {
            return {key:(gender==='female'?'female-':'')+'standing',rider:{cell:facing,x:-size/2,y:-size*.96,w:size,h:size},foreground:[]};
        }
        const bob=reducedMotion||moving?0:Math.sin(time*2)*size/78;
        return {key:gender+'-walk',rider:{cell:facing,x:-34*size/78,y:-size+bob,w:68*size/78,h:size},foreground:[]};
    }
    draw(ctx, appearance, options={}) {
        const {x=0,y=0,original=false,debug=false,overlay=false,head=BODY_TO_HEAD[options.facing??0]}=options;
        const pose=options.pose||this.layout(appearance,options),body=this.bodyArt(pose.key,appearance);
        let frame=body.frames[pose.rider.cell];
        const source=this.images.get('original:'+pose.key);
        if(!body.selfContained&&!source)return {ready:false};
        const headId=this.headId(appearance.gender||'male',appearance.headId||body.defaultHead);
        const heads=this.headArt(headId),headImage=this.images.get('head:'+headId);
        const combined=!!body.walk?.idleFrames;
        const walkKey=this.walkKey(appearance.gender||'male',appearance.bodyId);
        let bodyImage=this.images.get(combined?walkKey:'body:'+(body.atlas||pose.key));
        if(body.selfContained&&(!bodyImage||(!headImage&&!options.bodyOnly)))return {ready:false};
        const split=(body.selfContained||!original)&&!!bodyImage&&(!!headImage||!!options.bodyOnly);
        const step=walkFrameIndex(body.walk,options),walkImage=this.images.get(walkKey);
        const walking=split&&step!==null&&!!walkImage;
        if(walking){frame=body.walk.frames[pose.rider.cell*body.walk.framesPerDirection+step];bodyImage=walkImage;}
        const r=pose.rider;
        let crop=walking?frame.crop:frame.renderCrop|| (body.trimOriginal?this.originalBounds(pose.key,r.cell):frame.crop);
        if(split&&combined&&!walking&&!body.selfContained){
            const idle=body.walk.idleFrames[r.cell];
            crop=[crop[0]+idle.crop[0]-frame.crop[0],crop[1]+idle.crop[1]-frame.crop[1],crop[2],crop[3]];
            frame=idle;
        }
        // Same aspect-fit and original alpha trimming as the existing game renderer.
        const ratio=Math.min(r.w/crop[2],r.h/crop[3]);
        const rect={x:r.x+(r.w-crop[2]*ratio)/2,y:r.y+(r.h-crop[3]*ratio)/2,w:crop[2]*ratio,h:crop[3]*ratio};
        // Ground self-contained sheets by their measured sole, not transparent
        // cell padding. Mounted/custom placements retain their supplied pose.
        if(Number.isFinite(frame.footY)&&!appearance.mount&&!options.bodyRect&&!options.pose)
            rect.y=-frame.footY*ratio;
        const neck=[rect.x+(frame.crop[0]+frame.neck[0]-crop[0])*ratio,rect.y+(frame.crop[1]+frame.neck[1]-crop[1])*ratio];
        // Move the walking body toward its head without moving the head attachment.
        const bodyRect=walking?{...rect,y:rect.y+(frame.bodyOffsetY||0)*ratio}:rect;
        const sheet=(image,crop,rect)=>ctx.drawImage(image,...crop,rect.x,rect.y,rect.w,rect.h);
        const mountImage=appearance.mount&&this.images.get('mount:'+appearance.mount.id);
        if(pose.mount&&!mountImage)return {ready:false};
        const drawMount=()=>{const m=pose.mount;const art=appearance.mount.art||mountImage,cw=art.width/(art.columns||2),ch=art.height/(art.rows||2);sheet(mountImage,[m.cell%2*cw,Math.floor(m.cell/2)*ch,cw,ch],m);};
        ctx.save();ctx.translate(x,y);
        if(pose.mount&&mountImage)drawMount();
        sheet(split?bodyImage:source,crop,bodyRect);
        let headRect=null;
        if(split&&!options.bodyOnly){
            const h=heads.frames[headFrameIndex(heads.directionCount,pose.rider.cell,head)],s=frame.headHeight*ratio/h.height;
            // Side-facing profiles can refine the shared relative-turn compensation.
            // Values are body-atlas pixels, scaled with the body rather than the head art.
            const turn=heads.directionCount===4?0:Math.abs(((head-BODY_TO_HEAD[pose.rider.cell])%16+24)%16-8);
            const side=pose.rider.cell===1||pose.rider.cell===2;
            const drop=(side&&this.manifest.sideHeadTurnDrop?.[appearance.gender])||this.manifest.headTurnDrop||[0,0,0];
            const turnDrop=heads.directionCount===4?0:drop[Math.min(turn,drop.length-1)]||0;
            headRect={x:neck[0]-h.neck[0]*s,y:neck[1]-h.neck[1]*s+turnDrop*ratio,w:h.crop[2]*s,h:h.crop[3]*s};
            const breath=options.breath||headBreath(options.time||0,options.phase||0,options.reducedMotion||original);
            // Pivot at the attachment point; sub-pixel breathing stays inside neck overlap.
            ctx.save();ctx.translate(neck[0]+breath.x*r.w/78,neck[1]+breath.y*r.w/78);if(breath.angle)ctx.rotate(breath.angle);
            const headDest={...headRect,x:headRect.x-neck[0],y:headRect.y-neck[1]};
            if(h.mirrorX){ctx.translate(2*headDest.x+headDest.w,0);ctx.scale(-1,1);}
            sheet(headImage,h.crop,headDest);ctx.restore();
        }
        if(pose.mount&&mountImage&&pose.foreground.length){
            ctx.save();ctx.beginPath();
            // Match original polygon path behavior exactly.
            for(const polygon of pose.foreground)polygon.forEach(([u,v],i)=>ctx[i?'lineTo':'moveTo'](pose.mount.x+u*pose.mount.w,pose.mount.y+v*pose.mount.h));
            ctx.closePath();ctx.clip();drawMount();ctx.restore();
        }
        if(overlay&&source&&!body.selfContained){ctx.save();ctx.globalAlpha=.35;sheet(source,body.trimOriginal?this.originalBounds(pose.key,r.cell):body.frames[r.cell].crop,rect);ctx.restore();}
        if(debug){
            ctx.lineWidth=1;ctx.strokeStyle='#40dccc';ctx.strokeRect(r.x,r.y,r.w,r.h);
            const cross=(p,color)=>{ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(p[0]-5,p[1]);ctx.lineTo(p[0]+5,p[1]);ctx.moveTo(p[0],p[1]-5);ctx.lineTo(p[0],p[1]+5);ctx.stroke();};
            cross(neck,'#ffcc73');if(pose.seat)cross(pose.seat,'#ff6687');
        }
        ctx.restore();return {ready:true,split,walkFrame:walking?step:null,pose,bodyRect,headRect,neck,seat:pose.seat};
    }
    drawSave(ctx,save,x,y,time=0,moving=false,scale=1,options={}) {
        const appearance=this.appearance(save,options);this.ensure(appearance);
        const result=this.draw(ctx,appearance,{x,y,time,moving,size:78*scale,facing:save.facing||0,...options});
        let bottom=0;
        if(result.ready&&appearance.mount&&options.nameBounds!==false){
            const pose=this.layout(appearance,{facing:save.facing||0,size:78*scale,time:0});
            const art=appearance.mount.art,cols=art.columns||2,rows=art.rows||2;
            const key='mount:'+appearance.mount.id+':'+pose.mount.cell;
            // Keep label geometry from original alpha, never from detached head bounds.
            if(!this.sourceBounds.has(key)){
                const image=this.images.get('mount:'+appearance.mount.id),c=document.createElement('canvas');c.width=art.width/cols;c.height=art.height/rows;
                const cc=c.getContext('2d',{willReadFrequently:true});cc.drawImage(image,pose.mount.cell%cols*c.width,Math.floor(pose.mount.cell/cols)*c.height,c.width,c.height,0,0,c.width,c.height);
                const data=cc.getImageData(0,0,c.width,c.height).data;let b=c.height;
                outer:for(let yy=c.height-1;yy>=0;yy--)for(let xx=0;xx<c.width;xx++)if(data[(yy*c.width+xx)*4+3]>20){b=yy+1;break outer;}
                this.sourceBounds.set(key,b/c.height);
            }
            const bounds=this.originalBounds(pose.key,pose.rider.cell),frame=this.manifest.bodies[pose.key].frames[pose.rider.cell];
            bottom=Math.max(pose.mount.y+pose.mount.h*this.sourceBounds.get(key),pose.rider.y+(bounds[1]-frame.crop[1]+bounds[3])/frame.crop[3]*pose.rider.h);
        }
        return { ...result, nameY:y+bottom };
    }
    drawTile(ctx,index,x,y,w,h,options={}) {
        const appearance={gender:index>=12?'female':'male',headId:options.headId,bodyId:options.bodyId},facing=index%4;
        this.ensure(appearance);return this.draw(ctx,appearance,{facing,bodyRect:{x,y,w,h},...options});
    }
    createView(appearance,options={}) {
        const canvas=document.createElement('canvas');canvas.width=options.width||180;canvas.height=options.height||180;
        canvas.setAttribute('role','img');canvas.setAttribute('aria-label',options.label||'主角分层预览');
        let disposed=false,current=appearance,settings=options,revision=0;const actor=this.createActor(options.seed||7419);
        const reduced=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
        const paint=(time=0)=>{if(disposed)return;const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);
            const facing=settings.facing||0,lockHead=settings.lookAround===false;
            const pose=this.updateActor(actor,{time,facing,reducedMotion:reduced?.matches,lookAround:!lockHead});
            // Social UI portraits face forward only: no idle glance, no lateral breath tilt.
            const head=lockHead?BODY_TO_HEAD[facing]:pose.head;
            const breath=lockHead?{x:0,y:pose.breath.y,angle:0}:pose.breath;
            this.draw(c,current,{x:canvas.width/2,y:canvas.height*.88,size:78,time,head,breath,reducedMotion:reduced?.matches,...settings});};
        const view={node:canvas,paint,connected:false};
        const update=async(a=current,o=settings)=>{current=a;settings=o;const rev=++revision;await this.ensure({...a,standing:o.standing});if(rev===revision&&!disposed){paint();if(settings.animate&&canvas.isConnected)scheduleView(view);else views?.delete(view);}};
        return {node:canvas,update,dispose(){disposed=true;revision++;views?.delete(view);},ready:update()};
    }
}

export function heroPortrait(assets,save,w=90,h=95,{facing=0,mounted=false,...options}={}){
    if(!assets.hero){const canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=h*2;assets.tile?.(canvas.getContext('2d'),'sprites',(save.appearance==='girl'?12:8)+facing,0,0,w*2,h*2);return canvas;}
    const appearance=assets.hero.appearance(save,{mounted});
    const framing=appearance.mount?{x:w,y:h*1.65,size:w}:{x:0,y:0,bodyRect:{x:0,y:0,w:w*2,h:h*2}};
    const view=assets.hero.createView(appearance,{width:w*2,height:h*2,...framing,facing,animate:true,...options});
    view.node.className='art';view.node.style.width=w+'px';view.node.style.height=h+'px';view.ready.catch(()=>{});return view.node;
}

export async function loadHeroLibrary(readJson,catalog,{local=false,sprites,sourceImages,getBounds,prepareBounds=null}={}){
    let manifest;
    try{manifest=await readJson('data/adventure/hero-art.json');}
    catch{
        // Missing cosmetic manifest must not make existing saves unplayable.
        manifest={bodies:{},heads:{}};
        for(const [key,source] of Object.entries(catalog.sheets))manifest.bodies[key]={source:{...source,local:source.local.startsWith('assets/')?'demos/mount-lab/'+source.local:source.local},frames:Array.from({length:4},(_,i)=>({crop:[i%2*source.width/2,Math.floor(i/2)*source.height/2,source.width/2,source.height/2],neck:[0,0]}))};
        for(const [gender,row] of [['male',2],['female',3]]){const cuts=[0,323,650,929,1254].map(v=>v*sprites.height/1254);manifest.bodies[gender+'-walk']={source:sprites,trimOriginal:true,frames:Array.from({length:4},(_,i)=>({crop:[i*sprites.width/4,cuts[row],sprites.width/4,cuts[row+1]-cuts[row]],neck:[0,0]}))};}
    }
    const hero=new HeroRenderer(manifest,catalog,{local,prepareBounds});
    hero.getWalkingBounds=getBounds;
    if(sourceImages?.has('sprites'))for(const gender of ['male','female']){
        const key=gender+'-walk';if(!manifest.bodies[key].selfContained)hero.images.set('original:'+key,sourceImages.get('sprites'));
    }
    await Promise.allSettled(['male','female'].map(gender=>hero.ensure({gender})));
    return hero;
}

// Static UI avatar: draw the selected head atlas directly, without body or animation.
export function heroHeadPortrait(assets,save,size=52){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size*2;
    canvas.style.width=canvas.style.height=size+'px';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',save.name||'我');
    const hero=assets.hero;if(!hero)return canvas;
    const appearance=hero.appearance(save,{mounted:false}),id=hero.headId(appearance.gender,appearance.headId),sheet=hero.headArt(id);
    if(!sheet)return canvas;
    const paint=(image,art)=>{
        const frame=art.frames[BODY_TO_HEAD[0]],crop=frame.crop,scale=Math.min(canvas.width/crop[2],canvas.height/crop[3]);
        const ctx=canvas.getContext('2d');ctx.save();if(frame.mirrorX){ctx.translate(canvas.width,0);ctx.scale(-1,1);}ctx.drawImage(image,...crop,(canvas.width-crop[2]*scale)/2,(canvas.height-crop[3]*scale)/2,crop[2]*scale,crop[3]*scale);ctx.restore();
    };
    void hero.image('head:'+id,sheet).then(image=>paint(image,sheet)).catch(async()=>{
        if(!hero.customHeads.has(id))return;hero.failedHeads.add(id);
        const fallback=appearance.gender==='female'?'elf-girl':'elf-boy',art=hero.headArt(fallback);
        if(art)await hero.image('head:'+fallback,art).then(image=>paint(image,art)).catch(()=>{});
    });
    return canvas;
}
