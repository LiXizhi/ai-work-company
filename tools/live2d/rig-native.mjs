import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { generateMoc3 } from './vendor/moc3writer.mjs';

const folder = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node tools/live2d/rig-native.mjs OUTPUT_DIRECTORY');
const input = JSON.parse(await readFile(join(folder, 'native-input.json'), 'utf8'));
const overrides=process.argv[3]?JSON.parse(await readFile(resolve(process.argv[3]),'utf8')):{};
const [width, height] = input.canvas;
const parameters = [{id:'ParamStatic',min:0,max:1,default:0},
  {id:'ParamBreath',min:0,max:1,default:0},
  ...['ParamAngleZ','ParamArmLZ','ParamArmRZ','ParamAccessorySwing'].map(id=>({id,min:-1,max:1,default:0}))];
const nodes = [{id:'Root',type:'group',parent:null}];
const tracks = [], regions = new Map();
// One common body lattice carries every upper-body part through respiration.
// Independent chest-only translation tears open shoulder and neck overlaps.
const ppu=Math.max(width,height);
const bodyBottom=overrides.bodyBottom??height*.76;
const bodyLift=overrides.bodyLift??6;
if(!Number.isFinite(bodyBottom)||bodyBottom<=0||bodyBottom>height||!Number.isFinite(bodyLift)||Math.abs(bodyLift)>height*.02)throw Error('Invalid breathing envelope');
nodes.push({id:'BodyBreath',type:'warpDeformer',parent:'Root',col:2,row:2,
  gridX:0,gridY:0,gridW:width,gridH:bodyBottom,parameterId:'ParamBreath'});
tracks.push({nodeId:'BodyBreath',property:'mesh_verts',keyframes:[0,1].map((value,time)=>({time,
  value:Array.from({length:9},(_,i)=>({x:(i%3)*width/2,y:Math.floor(i/3)*bodyBottom/2-bodyLift*(1-Math.floor(i/3)/2)*value}))}))});
const toBody=point=>({x:width/2+point.x/width*ppu,y:height/2+point.y/bodyBottom*ppu});
for (const [order, part] of input.parts.entries()) {
  const [x,y] = part.offset, [w,h] = part.size;
  const vertices=[],uvs=[],triangles=[];
  const subdivisions=8;
  for(let row=0;row<=subdivisions;row++) for(let col=0;col<=subdivisions;col++) {
    vertices.push({x:x+w*col/subdivisions,y:y+h*row/subdivisions});
    uvs.push(col/subdivisions,row/subdivisions);
  }
  for(let row=0;row<subdivisions;row++) for(let col=0;col<subdivisions;col++) {
    const i=row*(subdivisions+1)+col;
    triangles.push([i,i+1,i+subdivisions+1],[i+1,i+subdivisions+2,i+subdivisions+1]);
  }
  let parent=/leg/.test(part.id)?'Root':'BodyBreath';
  const defaults=/torso|body/.test(part.id)?'breath':/head|bow/.test(part.id)?'head':
    /arm.*left/.test(part.id)?'leftArm':/arm.*right/.test(part.id)?'rightArm':
    /braid|accessory/.test(part.id)?'accessory':null;
  const config=overrides.parts?.[part.id]??{};
  const effect=config.effect??defaults;
  const settings={breath:['ParamBreath',0,[width/2,height*.42]],head:['ParamAngleZ',6,[width/2,height*.42]],
    leftArm:['ParamArmLZ',12,[width*.36,height*.43]],rightArm:['ParamArmRZ',12,[width*.64,height*.43]],
    accessory:['ParamAccessorySwing',5,[x+w/2,y]]};
  if(effect && effect!=='breath') {
    if(!settings[effect])throw new Error(`Unknown rig effect ${effect}`);
    const [parameterId,defaultDegrees,defaultPivot]=settings[effect];
    const degrees=config.degrees??defaultDegrees,pivot=config.pivot??defaultPivot;
    if(!Number.isFinite(degrees)||Math.abs(degrees)>45||!Array.isArray(pivot)||pivot.length!==2||!pivot.every(Number.isFinite))throw new Error('Invalid rig pivot/angle');
    parent=`Warp-${part.id}`;
    nodes.push({id:parent,type:'warpDeformer',parent:'BodyBreath',col:2,row:2,
      gridX:x,gridY:y,gridW:w,gridH:h,parameterId});
    const grids=(effect==='breath'?[0,1]:[-1,0,1]).map(value=>Array.from({length:9},(_,i)=>{
      const col=i%3,row=Math.floor(i/3),weight=1-row/2;
      if(effect==='breath')return {x:x+w*col/2+(col-1)*w*.018*weight*value,y:y+h*row/2-6*weight*value};
      const angle=value*degrees*Math.PI/180,dx=x+w*col/2-pivot[0],dy=y+h*row/2-pivot[1];
      return {x:pivot[0]+dx*Math.cos(angle)-dy*Math.sin(angle),y:pivot[1]+dx*Math.sin(angle)+dy*Math.cos(angle)};
    }));
    tracks.push({nodeId:parent,property:'mesh_verts',keyframes:grids.map((value,time)=>({time,value:value.map(toBody)}))});
    // A warp's child vertices live in lattice coordinates [0,1], while root
    // vertices use model coordinates. The writer normalizes every input point;
    // supply its inverse transform for these local coordinates.
    const ppu=Math.max(width,height);
    for(const vertex of vertices){vertex.x=width/2+(vertex.x-x)/w*ppu;vertex.y=height/2+(vertex.y-y)/h*ppu;}
  } else if(parent==='BodyBreath') {
    for(let i=0;i<vertices.length;i++)vertices[i]=toBody(vertices[i]);
  }
  nodes.push({id:part.id,type:'part',parent,visible:true,opacity:1,draw_order:order,
    mesh:{vertices,uvs,triangles}});
  regions.set(part.id,{atlasIndex:part.textureIndex,x:0,y:0,width:w,height:h,
    srcWidth:w,srcHeight:h,srcX:0,srcY:0,cropW:w,cropH:h});
}
const project={canvas:{width,height},nodes,parameters,animations:[{tracks}]};
await writeFile(join(folder,'rig-project.json'),JSON.stringify(project,null,2));
await writeFile(join(folder,'rig-overrides.json'),JSON.stringify(overrides,null,2));
await writeFile(join(folder,'character.moc3'),Buffer.from(generateMoc3({project,regions,atlasSize:2048,numAtlases:input.parts.length})));
const descriptor=JSON.parse(await readFile(join(folder,'character.model3.json'),'utf8'));
for(const [name,id] of [['Tilt','ParamAngleZ'],['Wave','ParamArmLZ'],['RightArm','ParamArmRZ'],['Sway','ParamAccessorySwing']]) {
  const motion={Version:3,Meta:{Duration:4,Fps:30,Loop:false,AreBeziersRestricted:true,CurveCount:1,TotalSegmentCount:4,TotalPointCount:5,UserDataCount:0,UserDataSize:0},
    Curves:[{Target:'Parameter',Id:id,Segments:[0,0,0,1,-.6,0,2,0,0,3,.6,0,4,0]}],UserData:[]};
  await writeFile(join(folder,'motions',`${name}.motion3.json`),JSON.stringify(motion,null,2));
  descriptor.FileReferences.Motions[name]=[{File:`motions/${name}.motion3.json`}];
}
await writeFile(join(folder,'character.model3.json'),JSON.stringify(descriptor,null,2));
await writeFile(join(folder,'rig-manifest.json'),JSON.stringify({version:1,parameters,meshOrder:[...input.parts].reverse().map(p=>p.id),
  limitations:['No native cmo3 authoring project','No independent eye/mouth binding','No physics','Humanoid name-based default rig; tune pivots for other anatomy']},null,2));
console.log(`Exported ${input.parts.length} meshes and ${parameters.length-1} bound parameters to ${folder}`);
