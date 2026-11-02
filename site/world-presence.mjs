// Game Server Lite presence for the owner's active Agent. Uses the shared Haqi
// session unchanged (project=awc). The server only relays appearance/movement;
// it never stores roles, credits or work state.
import {createGameServerSession,GAME_SERVER_URL,normalizeGameServerUrl} from './vendor/haqi/adventure_game_server.js';
import {roleAppearance,WORLD_ROOM} from './world-roles-core.mjs';

export {GAME_SERVER_URL};

/** Local development may point at a loopback gateway; production stays on Keepwork. */
export function gatewayFromQuery(search){
 const raw=new URLSearchParams(search).get('dev-presence');
 if(!raw)return {url:GAME_SERVER_URL,dev:false};
 const url=normalizeGameServerUrl(raw);
 const host=new URL(url).hostname;
 if(!['localhost','127.0.0.1'].includes(host))throw Error('开发模式只允许本机游戏服');
 return {url,dev:true};
}

export function createWorldPresence({gatewayUrl=GAME_SERVER_URL,getOwner,getRole,getActor,getCredentials,onStatus=()=>{},onChange=()=>{}}){
 const session=createGameServerSession({
  project:'awc',gatewayUrl,onStatus,
  getCredentials,
  getState(){
   const owner=getOwner(),role=getRole(),actor=getActor();
   if(!owner||!role||!actor)return {owner:null};
   return {owner,roleId:role.id,roomId:WORLD_ROOM,
    x:Math.round(actor.position.x),y:Math.round(actor.position.y),facing:actor.facing||0,
    name:role.name,appearance:roleAppearance(role)};
  },
 });
 session.subscribe?.(onChange);
 return {
  start:()=>session.start(),
  stop:()=>session.stop(),
  refresh:()=>session.tick(),
  reconnect:()=>session.reconnect(),
  get connected(){return session.connected;},
  remoteActors:()=>session.remoteActors(WORLD_ROOM),
  remoteCount:()=>session.remoteCount(WORLD_ROOM),
 };
}
