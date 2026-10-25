// Keepwork persistence for Agent roles in the separate `AIWorkCompany` workspace.
// Never reads or writes Haqi game workspaces. Network failure is never treated as
// an empty catalogue; only an explicit missing page means a new account.
import {validateRoles,emptyRoles} from './world-roles-core.mjs';

export const ROLES_WORKSPACE='AIWorkCompany';
export const ROLES_PATH='world/roles.json';
const MAX_BYTES=64*1024;

export function createRoleStore({sdk,owner}){
 if(!sdk?.personalPageStore||typeof owner!=='string'||!owner)throw Error('Keepwork 存储接口暂时不可用。');
 const store=sdk.personalPageStore.withWorkspace(ROLES_WORKSPACE);
 store.disableLegacyFileFallback=true;
 function fullPath(){
  const full=store.getRemotePagePath(ROLES_PATH);
  if(typeof full!=='string'||!full.startsWith(`${owner}/`))throw Error('云端账号不一致，请重新登录。');
  return full;
 }
 return {
  async load(){
   const full=fullPath(),parts=full.split('/');
   let result;
   try{result=await sdk.loadPage({sitePath:parts.slice(0,2).join('/'),pagePath:parts.slice(2).join('/'),useCache:false,useServerCache:true});}
   catch(error){
    if(error?.message===`Page not found: ${full}`)return emptyRoles();
    throw Error('角色列表读取失败，请稍后重试。');
   }
   if(result?.success===false&&result.fromServerCache===true&&result.content==='')return emptyRoles();
   if(result?.success!==true||typeof result.content!=='string'||result.content.length>MAX_BYTES)throw Error('角色列表读取失败，请稍后重试。');
   const value=JSON.parse(result.content);
   if(value?.owner!==owner)throw Error('角色列表账号不一致。');
   return validateRoles(value.catalog);
  },
  async save(catalog){
   const clean=validateRoles(catalog);
   fullPath();
   const text=JSON.stringify({owner,catalog:clean});
   if(text.length>MAX_BYTES)throw Error('角色列表过大。');
   if(typeof store.savePageData!=='function')throw Error('Keepwork 云端写入接口暂时不可用。');
   if(store.supportsDirectCacheWrite===true){
    await store.savePageData(ROLES_PATH,'content',text,true,true,{directWrite:true});
   }else{
    await store.savePageData(ROLES_PATH,'content',text,false,true);
    if(typeof store.syncToGit!=='function'||!await store.syncToGit(ROLES_PATH,true))throw Error('云端尚未确认保存，请稍后重试。');
   }
   return clean;
  },
 };
}
