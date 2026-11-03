// Local-only verification with a separately supplied Cubism Core JS file.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const [coreFile,modelFile]=process.argv.slice(2);
if(!coreFile||!modelFile)throw Error('Usage: node verify-core.cjs CORE_JS MODEL_MOC3');
const context={console,ArrayBuffer,Uint8Array,Float32Array,Int32Array,Uint16Array,DataView,
  setTimeout,clearTimeout,TextDecoder,TextEncoder,process,require,__dirname:path.dirname(path.resolve(coreFile)),Buffer};
context.global=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(coreFile,'utf8'),context,{filename:coreFile});
setTimeout(()=>{
  try{
    const core=context.Live2DCubismCore;
    console.log('Core version',core.Version.csmGetVersion());
    const file=fs.readFileSync(modelFile),buffer=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength);
    const moc=core.Moc.fromArrayBuffer(buffer);if(!moc)throw Error('Cubism Core rejected MOC3');
    const model=core.Model.fromMoc(moc);if(!model)throw Error('Cubism Core rejected model');
    const index=model.parameters.ids.indexOf('ParamBreath');if(index<0)throw Error('Missing ParamBreath');
    model.parameters.values[index]=0;model.update();
    const before=model.drawables.vertexPositions.map(a=>Array.from(a));
    model.parameters.values[index]=1;model.update();
    const changes=model.drawables.vertexPositions.map((a,i)=>Math.max(...Array.from(a,(v,j)=>Math.abs(v-before[i][j]))));
    const report={core_version:core.Version.csmGetVersion(),parameters:model.parameters.ids,
      drawable_count:model.drawables.count,vertex_deltas:changes,
      core_model_loaded:true,breath_changes_geometry:changes.some(v=>v>1e-6),
      finite_vertices:model.drawables.vertexPositions.every(a=>Array.from(a).every(Number.isFinite))};
    const manifest=JSON.parse(fs.readFileSync(path.join(path.dirname(modelFile),'rig-manifest.json'),'utf8'));
    const input=JSON.parse(fs.readFileSync(path.join(path.dirname(modelFile),'native-input.json'),'utf8'));
    const ppu=Math.max(...input.canvas);
    report.neutral_max_error=0;
    for(let i=0;i<manifest.meshOrder.length;i++){
      const part=input.parts.find(p=>p.id===manifest.meshOrder[i]);
      for(let j=0;j<before[i].length/2;j++){
        const col=j%9,row=Math.floor(j/9);
        const expected=[(part.offset[0]+part.size[0]*col/8-input.canvas[0]/2)/ppu,
          (input.canvas[1]/2-part.offset[1]-part.size[1]*row/8)/ppu];
        report.neutral_max_error=Math.max(report.neutral_max_error,Math.abs(before[i][j*2]-expected[0]),Math.abs(before[i][j*2+1]-expected[1]));
      }
    }
    report.mesh_order=manifest.meshOrder;
    report.parameter_tests={};
    for(let p=1;p<model.parameters.ids.length;p++){
      model.parameters.values.fill(0);model.update();
      const neutral=model.drawables.vertexPositions.map(a=>Array.from(a));
      model.parameters.values[p]=1;model.update();
      const deltas=model.drawables.vertexPositions.map((a,i)=>Math.max(...Array.from(a,(v,j)=>Math.abs(v-neutral[i][j]))));
      report.parameter_tests[model.parameters.ids[p]]={changed_meshes:manifest.meshOrder.filter((id,i)=>deltas[i]>1e-6),
        feet_fixed:manifest.meshOrder.every((id,i)=>!id.includes('leg')||deltas[i]<1e-7),
        finite:model.drawables.vertexPositions.every(a=>Array.from(a).every(Number.isFinite))};
    }
    report.combined_cycle={samples:121,finite:true,feet_fixed:true};
    for(let sample=0;sample<=120;sample++){
      model.parameters.values[1]=(1-Math.cos(sample/120*Math.PI*2))/2;
      for(let p=2;p<model.parameters.values.length;p++)model.parameters.values[p]=Math.sin(sample/120*Math.PI*2);
      model.update();
      report.combined_cycle.finite &&= model.drawables.vertexPositions.every(a=>Array.from(a).every(Number.isFinite));
      report.combined_cycle.feet_fixed &&= model.drawables.vertexPositions.every((a,i)=>!manifest.meshOrder[i].includes('leg')||Array.from(a).every((v,j)=>Math.abs(v-before[i][j])<1e-7));
    }
    // A synchronized sine misses opposing parameter combinations. Exercise all
    // min/max corners as well, comparing signed triangle areas to neutral.
    const rig=JSON.parse(fs.readFileSync(path.join(path.dirname(modelFile),'rig-project.json'),'utf8'));
    const meshes=manifest.meshOrder.map(id=>rig.nodes.find(n=>n.id===id).mesh);
    const area=(xy,[a,b,c])=>(xy[b*2]-xy[a*2])*(xy[c*2+1]-xy[a*2+1])-(xy[b*2+1]-xy[a*2+1])*(xy[c*2]-xy[a*2]);
    const count=model.parameters.ids.length-1;
    if(count>12)throw Error('Exhaustive pose test limited to 12 parameters');
    report.extreme_combinations={samples:2**count,finite:true,feet_fixed:true,flipped_or_collapsed:0,min_area_ratio:Infinity};
    // Interpolate a source-canvas attachment point on the exported 8x8 mesh.
    // Every joint is evaluated independently on its parent and child surface.
    function attachmentPosition(id,anchor){
      const i=manifest.meshOrder.indexOf(id),part=input.parts.find(p=>p.id===id);
      if(i<0||!part)throw Error(`Joint references missing drawable ${id}`);
      const u=(anchor[0]-part.offset[0])/part.size[0]*8,v=(anchor[1]-part.offset[1])/part.size[1]*8;
      if(u<0||u>8||v<0||v>8)throw Error(`Joint outside ${id}`);
      const col=Math.min(7,Math.floor(u)),row=Math.min(7,Math.floor(v)),a=u-col,b=v-row;
      const xy=model.drawables.vertexPositions[i],out=[0,0];
      for(const [dx,dy,w] of [[0,0,(1-a)*(1-b)],[1,0,a*(1-b)],[0,1,(1-a)*b],[1,1,a*b]])
        for(let axis=0;axis<2;axis++)out[axis]+=xy[((row+dy)*9+col+dx)*2+axis]*w;
      return out;
    }
    report.attachment_tests={count:(input.joints??[]).length,pose_samples:2**count,max_separation_pixels:0};
    for(let pose=0;pose<2**count;pose++){
      model.parameters.values.fill(0);
      for(let p=1;p<=count;p++)model.parameters.values[p]=pose&(1<<(p-1))?model.parameters.maximumValues[p]:model.parameters.minimumValues[p];
      model.update();
      for(const joint of input.joints??[]){
        const parent=attachmentPosition(joint.parent,joint.anchor),child=attachmentPosition(joint.child,joint.anchor);
        report.attachment_tests.max_separation_pixels=Math.max(report.attachment_tests.max_separation_pixels,
          Math.hypot(parent[0]-child[0],parent[1]-child[1])*ppu);
      }
      model.drawables.vertexPositions.forEach((xy,i)=>{
        report.extreme_combinations.finite &&= Array.from(xy).every(Number.isFinite);
        if(manifest.meshOrder[i].includes('leg'))report.extreme_combinations.feet_fixed &&= Array.from(xy).every((v,j)=>Math.abs(v-before[i][j])<1e-7);
        for(const triangle of meshes[i].triangles){
          const ratio=area(xy,triangle)/area(before[i],triangle);
          report.extreme_combinations.min_area_ratio=Math.min(report.extreme_combinations.min_area_ratio,ratio);
          if(!Number.isFinite(ratio)||ratio<=.01)report.extreme_combinations.flipped_or_collapsed++;
        }
      });
    }
    fs.writeFileSync(path.join(path.dirname(modelFile),'core-verification.json'),JSON.stringify(report,null,2));
    if(report.attachment_tests.max_separation_pixels>.25)process.exitCode=1;
    console.log(JSON.stringify(report,null,2));
    if(!report.extreme_combinations.finite||!report.extreme_combinations.feet_fixed||report.extreme_combinations.flipped_or_collapsed||!report.combined_cycle.finite||!report.combined_cycle.feet_fixed||report.neutral_max_error>1e-4||!report.breath_changes_geometry||!report.finite_vertices||Object.values(report.parameter_tests).some(t=>!t.changed_meshes.length||!t.feet_fixed||!t.finite))process.exitCode=1;
    model.release();moc._release();
  }catch(e){console.error(e);process.exitCode=1;}
},1000);
