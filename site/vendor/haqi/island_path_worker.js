import {findPath,findPathSteps} from './adventure_world_core.js';
import {findPetMeeting,petMeetingPath} from './adventure_pet_meeting_core.js';
let world=null,sceneVersion=0;
const heroJobs=new Map();
function cancelHero(id){const job=heroJobs.get(id);if(job){clearTimeout(job.timer);heroJobs.delete(id);}}
self.onmessage=({data})=>{
    if(data.type==='scene'){for(const id of heroJobs.keys())cancelHero(id);world=data.world;sceneVersion=data.sceneVersion??0;return;}
    if(data.type==='cancel'){cancelHero(data.id);return;}
    if(data.type==='hero-path'){
        if(data.sceneVersion!==sceneVersion)return;
        const job={iterator:findPathSteps(world,data.from,data.to),timer:null};heroJobs.set(data.id,job);
        const work=()=>{
            if(heroJobs.get(data.id)!==job)return;
            const start=performance.now();
            try{do{const next=job.iterator.next();if(next.done){heroJobs.delete(data.id);self.postMessage({id:data.id,sceneVersion:data.sceneVersion,roleId:data.roleId,path:next.value});return;}}while(performance.now()-start<4);job.timer=setTimeout(work,0);}
            catch(error){heroJobs.delete(data.id);self.postMessage({id:data.id,sceneVersion:data.sceneVersion,error:String(error)});}
        };
        work();return;
    }
    try{if(data.type==='meeting')self.postMessage({id:data.id,anchor:findPetMeeting(world,data.participants,data.owners,data.content)});
        else self.postMessage({id:data.id,path:data.type==='meeting-path'?petMeetingPath(world,data.from,data.to):findPath(world,data.from,data.to)});}
    catch(error){self.postMessage({id:data.id,error:String(error)});}
};
