// Account-owned Agent roles for the world view. Pure functions: clocks, ids and
// persistence are supplied by IO. Personas are cosmetic and never certify a model.
import {cleanName} from './world-state.mjs';

export const PERSONAS=Object.freeze(['astra','claude','deepseek','gemini']);
export const MAX_ROLES=5;
export const ROLES_SCHEMA=1;
export const WORLD_ROOM='awc:city';
const ROLE_ID=/^[a-f0-9-]{16,64}$/;

export const roleIdValid=id=>typeof id==='string'&&ROLE_ID.test(id);
export const personaValid=id=>PERSONAS.includes(id);
export function emptyRoles(){return {schemaVersion:ROLES_SCHEMA,activeId:null,roles:[]};}

export function validateRoles(value){
 if(!value||typeof value!=='object'||value.schemaVersion!==ROLES_SCHEMA||!Array.isArray(value.roles)||value.roles.length>MAX_ROLES)throw Error('invalid_roles');
 const ids=new Set();
 const roles=value.roles.map(row=>{
  if(!row||!roleIdValid(row.id)||ids.has(row.id)||!personaValid(row.persona))throw Error('invalid_role');
  const name=cleanName(row.name);
  if(!name)throw Error('invalid_role_name');
  for(const key of ['createdAt','lastActiveAt'])if(!Number.isSafeInteger(row[key])||row[key]<0)throw Error('invalid_role_time');
  ids.add(row.id);
  return {id:row.id,persona:row.persona,name,createdAt:row.createdAt,lastActiveAt:row.lastActiveAt};
 });
 const activeId=value.activeId===null||value.activeId===undefined?null:value.activeId;
 if(activeId!==null&&!ids.has(activeId))throw Error('invalid_active_role');
 return {schemaVersion:ROLES_SCHEMA,activeId,roles};
}

export function createRole(catalog,{persona,name},{uuid,now}){
 const current=validateRoles(catalog);
 if(current.roles.length>=MAX_ROLES)throw Error('role_limit');
 if(!personaValid(persona))throw Error('invalid_persona');
 const clean=cleanName(name);
 if(!clean)throw Error('invalid_role_name');
 const id=uuid();
 if(!roleIdValid(id)||current.roles.some(r=>r.id===id))throw Error('invalid_role_id');
 const at=now();
 const role={id,persona,name:clean,createdAt:at,lastActiveAt:at};
 return {catalog:validateRoles({...current,activeId:id,roles:[...current.roles,role]}),role};
}

export function renameRole(catalog,id,name){
 const current=validateRoles(catalog);
 const clean=cleanName(name);
 if(!clean)throw Error('invalid_role_name');
 if(!current.roles.some(r=>r.id===id))throw Error('unknown_role');
 return validateRoles({...current,roles:current.roles.map(r=>r.id===id?{...r,name:clean}:r)});
}

export function deleteRole(catalog,id){
 const current=validateRoles(catalog);
 if(!current.roles.some(r=>r.id===id))throw Error('unknown_role');
 const roles=current.roles.filter(r=>r.id!==id);
 const fallback=[...roles].sort((a,b)=>b.lastActiveAt-a.lastActiveAt)[0]?.id??null;
 return validateRoles({...current,roles,activeId:current.activeId===id?fallback:current.activeId});
}

export function activateRole(catalog,id,now){
 const current=validateRoles(catalog);
 if(!current.roles.some(r=>r.id===id))throw Error('unknown_role');
 const at=now();
 return validateRoles({...current,activeId:id,roles:current.roles.map(r=>r.id===id?{...r,lastActiveAt:Math.max(r.lastActiveAt,at)}:r)});
}

export function activeRole(catalog){
 return catalog?.roles?.find(r=>r.id===catalog.activeId)||null;
}

/** Presence advertisement; only fields the shared game-server whitelist keeps. */
export function roleAppearance(role){
 return {name:role.name,headId:role.persona,bodyId:`female-ai-${role.persona}`,appearance:'girl'};
}

/** Remote rows from the game server are untrusted: bound count, names and personas. */
export function remoteCast(rows,{limit=60}={}){
 const out=[];
 for(const row of Array.isArray(rows)?rows:[]){
  if(out.length>=limit)break;
  if(!row||typeof row.id!=='string'||!row.position||!Number.isFinite(row.position.x)||!Number.isFinite(row.position.y))continue;
  const persona=personaValid(row.profile?.headId)?row.profile.headId:PERSONAS[hash(row.id)%PERSONAS.length];
  const name=cleanName(typeof row.profile?.name==='string'?row.profile.name.slice(0,80):'')||'访客 Agent';
  out.push({id:`remote:${row.id}`,persona,name,position:{x:row.position.x,y:row.position.y},
   facing:Number.isInteger(row.facing)&&row.facing>=0&&row.facing<=3?row.facing:0,moving:row.moving===true});
 }
 return out;
}
function hash(text){let h=0;for(const ch of text)h=(h*31+ch.codePointAt(0))>>>0;return h;}
