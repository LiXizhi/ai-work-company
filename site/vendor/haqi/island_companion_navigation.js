import {clearSegment,distance} from './adventure_world_core.js';
// Share one lazy path worker across the hero's and social actors' island pets.
// Paths are ephemeral, use the original algorithm and never change player saves.
export function createIslandCompanionNavigation({workerFactory=typeof Worker==='undefined'?null:()=>new Worker(new URL('./island_path_worker.js',import.meta.url),{type:'module'}),setTimer=setTimeout,clearTimer=clearTimeout}={}){
    const pending=new WeakMap(),requests=new Map();let worker=null,scope=null,geometry=null,sequence=0,failed=false;
    function fail(){failed=true;worker?.terminate();worker=null;scope=null;geometry=null;for(const row of requests.values()){clearTimer(row.timer);if(row.resolve)row.resolve(null);else if(pending.get(row.actor)===row)pending.delete(row.actor);}requests.clear();}
    function ensure(world){
        if(!worker){worker=workerFactory();if(!worker){failed=true;return false;}worker.onerror=fail;worker.onmessage=({data})=>{const row=requests.get(data.id);if(!row)return;requests.delete(data.id);clearTimer(row.timer);if(row.resolve){row.resolve(!data.error&&row.valid()?data.anchor:null);return;}if(pending.get(row.actor)!==row)return;pending.delete(row.actor);
            if(!data.error&&row.valid()&&distance(row.actor.position,row.from)<24){row.actor.path=data.path;row.actor.repath=.45;}
        };}
        if(scope!==world||geometry.paths!==world.paths||geometry.buildings!==world.buildings||geometry.trees!==world.trees){
            scope=world;geometry={paths:world.paths,buildings:world.buildings,trees:world.trees};
            const snapshot={zone:world.zone,w:world.w,h:world.h,layout:world.layout,center:world.center,paths:world.paths,trees:world.trees,buildings:world.buildings,npcs:world.npcs,encounters:world.encounters,portal:world.portal};
            worker.postMessage({type:'scene',world:snapshot});
        }return true;
    }
    const supported=world=>workerFactory&&!failed&&!world.isEarth&&!world.isDungeon&&!world.isCityDungeon&&world.layout;
    return {findMeeting(world,participants,owners,content,isLive=()=>true){
        if(!supported(world))return null;
        try{if(!ensure(world))return null;const paths=world.paths,buildings=world.buildings,trees=world.trees,id=++sequence;
            return new Promise(resolve=>{requests.set(id,{resolve,valid:()=>isLive()&&world.paths===paths&&world.buildings===buildings&&world.trees===trees,timer:setTimer(fail,15000)});try{worker.postMessage({id,type:'meeting',participants,owners,content:{balanceParams:content.balanceParams}});}catch{fail();}});
        }catch{fail();return null;}
    },options(actor,world,isLive=()=>true,meetingPath=false){
        if(!workerFactory||failed||world.isEarth||world.isDungeon||world.isCityDungeon||!world.layout)return {};
        return {requestPath(from,to){
            if(clearSegment(world,from,to)){pending.delete(actor);return [{...to}];}
            const previous=pending.get(actor);if(previous&&previous.meetingPath===meetingPath&&distance(previous.to,to)<24)return null;
            try{if(!ensure(world))return null;const paths=world.paths,buildings=world.buildings,trees=world.trees,id=++sequence;
                const row={actor,meetingPath,from:{...from},to:{...to},valid:()=>isLive()&&world.paths===paths&&world.buildings===buildings&&world.trees===trees,timer:setTimer(fail,15000)};
                pending.set(actor,row);requests.set(id,row);worker.postMessage({id,type:meetingPath?'meeting-path':'path',from:row.from,to:row.to});
            }catch{fail();}return null;
        }};
    },dispose(){fail();},stats:()=>({pending:requests.size,failed})};
}
export const islandCompanionNavigation=createIslandCompanionNavigation();
