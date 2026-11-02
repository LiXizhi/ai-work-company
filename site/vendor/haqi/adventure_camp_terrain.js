import {createRng,hashSeed} from './rng_core.js';
import {campScenerySteps,islandSceneryFloorSteps} from './adventure_camp_scenery_core.js';
import {islandSceneArtSteps} from './island_scene_art_core.js';

const PLAZA_THEMES={
    camp:{curb:['#e7dec0','#d4caa8'],curbLight:'#fff9e690',grad:['#f6eed4','#e2d8b5','#c7be9b'],tiles:['#fff6dc28','#9e8e6216','#ebdfc022','#fff9e530'],joint:'#8a7f5d30',shine:'#fff8df45',ring:'#d7b25699',ringLight:'#fff3c2aa',node:'#d4ad4e',atlas:'camp',frame:'plazaMedallion'},
    town:{curb:['#ebe3c8','#d5ccb0'],curbLight:'#fffdf099',grad:['#f8f1dc','#e5dcc0','#cbc09f'],tiles:['#fff8e42c','#9c8f6818','#efe4c626','#ffffff30'],joint:'#867c5c32',shine:'#fff9e648',ring:'#d6b04c99',ringLight:'#fff4c8aa',node:'#d8ae48',atlas:'islandPlazasProps',frame:'townPlazaMedallion'},
    fire:{curb:['#5e4b44','#4a3b36'],curbLight:'#ff9d4778',grad:['#7a5b4b','#5e463c','#473530'],tiles:['#ff94421f','#2b1f1d28','#d47a421c','#ffbe6b22'],joint:'#2a1c1948',shine:'#ff9c4a42',ring:'#f08532aa',ringLight:'#ffd27daa',node:'#f58c38',atlas:'islandPlazasProps',frame:'firePlazaMedallion'},
    ice:{curb:['#d8eef5','#bddbe8'],curbLight:'#ffffffb0',grad:['#eef9fc','#d4ecf4','#b5d6e6'],tiles:['#ffffff38','#6ea4bd1c','#d8f4ff2e','#ffffff45'],joint:'#699bb335',shine:'#ffffff66',ring:'#62b8d9aa',ringLight:'#effdffbb',node:'#78cae8',atlas:'islandPlazasProps',frame:'icePlazaMedallion'},
    desert:{curb:['#ead09d','#d6b880'],curbLight:'#fff4d196',grad:['#f5e0b5','#e3c792','#cca96e'],tiles:['#fff3d12b','#9c76401c','#ebd19e26','#fff8de33'],joint:'#8f6d3d36',shine:'#fff5d64a',ring:'#cf9b3caa',ringLight:'#ffeeb5aa',node:'#2ab3a6',atlas:'islandPlazasProps',frame:'desertPlazaMedallion'},
    dark:{curb:['#564f69','#433d54'],curbLight:'#c58cff75',grad:['#69617d','#524b63','#3d374c'],tiles:['#b87aff22','#1f1a2b2e','#8a6bbd20','#d7a6ff24'],joint:'#241e3048',shine:'#c68fff45',ring:'#a864e8aa',ringLight:'#e5bfff99',node:'#b56aff',atlas:'islandPlazasProps',frame:'darkPlazaMedallion'},
};

// Called only while baking terrain tiles, on both Worker and fallback paths.
export function* paintCampFloorSteps(c,world,rect,art){
    const stream=world.zone==='camp'?campScenerySteps(world,rect):islandSceneryFloorSteps(world,rect);
    for(const d of stream){
        if(d.atlas!=='meadow'){
            c.fillStyle='#1d331f29';c.beginPath();c.ellipse(d.x,d.y-d.size*.05,d.size*.42,d.size*.15,0,0,Math.PI*2);c.fill();
        }
        c.save();c.translate(d.x,d.y);if(d.flip)c.scale(-1,1);
        const hRatio=d.atlas==='islandLandmarks'?.96:d.atlas!=='meadow'?.88:.75;
        const yOff=d.atlas==='islandLandmarks'?.88:d.atlas!=='meadow'?.78:.65;
        art?.draw(c,d.atlas,d.frame,-d.size/2,-d.size*yOff,d.size,d.size*hRatio);c.restore();yield;
    }
    const flat=new Set(world.layout?.sceneArt?.flat||[]);
    for(const d of islandSceneArtSteps(world,rect)){
        if(!d){yield;continue;}
        if(!flat.has(d.frame)){
            c.fillStyle='#1b1d1a2e';c.beginPath();c.ellipse(d.x,d.y-d.size*.04,d.size*.38,d.size*.12,0,0,Math.PI*2);c.fill();
        }
        c.save();c.translate(d.x,d.y);if(d.flip)c.scale(-1,1);
        art?.draw(c,d.atlas,d.frame,-d.size/2,-d.size*.96,d.size,d.size);c.restore();yield;
    }
}
export function* paintCampPlazaSteps(c,world,rect,art){
    const {x,y}=world.center,{radiusX:rx,radiusY:ry}=world.layout.rules.plaza;
    const t=PLAZA_THEMES[world.zone]||PLAZA_THEMES.camp;
    // Outer shadow and carved stone rim segments.
    c.save();
    c.strokeStyle='#1f2c2238';c.lineWidth=10;c.beginPath();c.ellipse(x,y+4,rx+2,ry+2,0,0,Math.PI*2);c.stroke();
    for(let i=0;i<36;i++){
        const a0=i*Math.PI/18,a1=a0+Math.PI/18-.018;
        c.strokeStyle=t.curb[i%2];c.lineWidth=12;
        c.beginPath();c.ellipse(x,y,rx-6,ry-5,0,a0,a1);c.stroke();
        c.strokeStyle=t.curbLight;c.lineWidth=2.5;
        c.beginPath();c.ellipse(x,y,rx-10,ry-8,0,a0,a1);c.stroke();
    }
    c.beginPath();c.ellipse(x,y,rx-12,ry-10,0,0,Math.PI*2);c.clip();
    // Radial base wash.
    const baseGrad=c.createRadialGradient(x,y-18,20,x,y,rx);
    baseGrad.addColorStop(0,t.grad[0]);baseGrad.addColorStop(.68,t.grad[1]);baseGrad.addColorStop(1,t.grad[2]);
    c.fillStyle=baseGrad;c.fillRect(x-rx,y-ry,rx*2,ry*2);
    // Soft stone variation and staggered joints.
    const cw=64,ch=32;
    for(let row=Math.floor((rect.y-y)/ch)-1;row<=Math.ceil((rect.y+rect.h-y)/ch);row++){
        for(let col=Math.floor((rect.x-x)/cw)-1;col<=Math.ceil((rect.x+rect.w-x)/cw);col++){
            const rng=createRng(hashSeed(`${world.zone}:paving:${row}:${col}`));
            const px=x+col*cw+(row%2)*cw/2,py=y+row*ch;
            if(Math.abs(px-x)>rx+cw||Math.abs(py-y)>ry+ch)continue;
            c.fillStyle=rng.pick(t.tiles);
            c.fillRect(px+2,py+2,cw-4,ch-4);
            c.strokeStyle=t.joint;c.lineWidth=1;c.beginPath();c.moveTo(px+cw,py);c.lineTo(px,py);c.lineTo(px,py+ch);c.stroke();
            c.strokeStyle=t.shine;c.beginPath();c.moveTo(px+2,py+ch-2);c.lineTo(px+cw-2,py+ch-2);c.stroke();yield;
        }
    }
    // Radial mason joints and inlaid magic rings.
    c.strokeStyle=t.joint;c.lineWidth=1.4;
    for(let i=0;i<12;i++){
        const a=i*Math.PI/6;
        c.beginPath();c.moveTo(x+Math.cos(a)*rx*.34,y+Math.sin(a)*ry*.34);
        c.lineTo(x+Math.cos(a)*(rx-16),y+Math.sin(a)*(ry-12));c.stroke();
    }
    const wash=c.createRadialGradient(x,y,10,x,y,Math.min(rx,145));wash.addColorStop(0,t.grad[0]+'e8');wash.addColorStop(.6,t.grad[1]+'88');wash.addColorStop(1,t.grad[1]+'00');
    c.fillStyle=wash;c.fillRect(x-160,y-160,320,320);
    c.strokeStyle=t.joint;c.lineWidth=3.2;c.beginPath();c.ellipse(x,y,rx-20,ry-15,0,0,Math.PI*2);c.stroke();
    c.strokeStyle=t.ring;c.lineWidth=2.4;c.beginPath();c.ellipse(x,y,rx*.68,ry*.68,0,0,Math.PI*2);c.stroke();
    c.strokeStyle=t.ringLight;c.lineWidth=1.2;c.beginPath();c.ellipse(x,y,rx*.68-3,ry*.68-2,0,0,Math.PI*2);c.stroke();
    for(let i=0;i<8;i++){
        const a=i*Math.PI/4,nx=x+Math.cos(a)*rx*.68,ny=y+Math.sin(a)*ry*.68;
        c.fillStyle=t.node;c.beginPath();c.ellipse(nx,ny,5.2,3.6,0,0,Math.PI*2);c.fill();
        c.fillStyle='#ffffffcc';c.beginPath();c.ellipse(nx-.8,ny-.6,2.2,1.5,0,0,Math.PI*2);c.fill();
    }
    // Central AI hand-painted compass/elemental medallion (scaled to plaza size).
    const mw=Math.min(216,rx*1.04),mh=mw*(144/216);
    c.strokeStyle=t.ring;c.lineWidth=2;c.beginPath();c.ellipse(x,y,mw*.41,mh*.41,0,0,Math.PI*2);c.stroke();
    art?.draw(c,t.atlas,t.frame,x-mw/2,y-mh/2,mw,mh);
    c.restore();
}
