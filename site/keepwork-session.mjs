// Browser IO for Keepwork identity. The token lives only in this closure and in
// HTTPS Authorization headers built by callers; never in URLs, logs or saves.
export const KEEPWORK_SDK_URL='https://cdn.keepwork.com/sdk/keepworkSDK.core.iife.js?v=a8a7178e83c2';
export class KeepworkError extends Error {}

function timeout(promise,ms=25000){
 let timer;
 return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new KeepworkError('连接 Keepwork 超时，请稍后重试。')),ms);})]).finally(()=>clearTimeout(timer));
}

let loading;
export function loadKeepwork(){
 const configure=sdk=>{if(sdk?.personalPageStore)sdk.personalPageStore.disableLegacyFileFallback=true;return sdk;};
 if(globalThis.keepwork)return Promise.resolve(configure(globalThis.keepwork));
 loading??=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=KEEPWORK_SDK_URL;script.async=true;
  script.onload=()=>globalThis.keepwork?resolve(configure(globalThis.keepwork)):reject(new KeepworkError('Keepwork 暂时不可用，可以继续离线浏览小城。'));
  script.onerror=()=>{script.remove();reject(new KeepworkError('无法连接 Keepwork，请检查网络后重试。'));};
  document.head.append(script);
 }).catch(error=>{loading=null;throw error;});
 return timeout(loading);
}

export function createKeepworkSession({loadSDK=loadKeepwork}={}){
 let sdk=null,username=null,token=null,version=0,unsubscribe=null;
 const listeners=new Set();
 const emit=()=>{for(const fn of listeners)fn(snapshot());};
 const snapshot=()=>({username,signedIn:Boolean(username&&token),version});
 function clear(){version++;username=null;token=null;}
 async function adopt(){
  if(!sdk?.token){clear();emit();return snapshot();}
  const epoch=++version,pending=sdk.token;
  const profile=await timeout(sdk.getUserProfile({useCache:true}));
  if(epoch!==version||sdk.token!==pending)throw new KeepworkError('登录状态已变化，请重试。');
  if(typeof profile?.username!=='string'||!profile.username)throw new KeepworkError('登录未完成，请重新登录 Keepwork。');
  username=profile.username;token=pending;emit();
  return snapshot();
 }
 return {
  snapshot,
  onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  sdk:()=>sdk,
  /** Restores an existing login silently, or opens the Keepwork window when interactive. */
  async connect({interactive=true}={}){
   sdk=await loadSDK();
   if(!unsubscribe&&typeof sdk.onAuthStateChange==='function')unsubscribe=sdk.onAuthStateChange(()=>{clear();void adopt().catch(()=>emit());});
   if(!sdk.token){
    if(!interactive){clear();emit();return snapshot();}
    try{await sdk.showLoginWindow({title:'登录 Keepwork，进入脑内小城',lang:'zhCN'});}
    catch(error){
     if(/cancel|取消/i.test(error?.message||''))throw new KeepworkError('已取消登录，你可以继续离线浏览小城。');
     throw new KeepworkError('登录窗口暂时不可用，请刷新后重试。');
    }
    if(!sdk.token)throw new KeepworkError('已取消登录，你可以继续离线浏览小城。');
   }
   return adopt();
  },
  async logout(){
   if(sdk){try{await sdk.logout();}catch(error){if(sdk.token)throw error;}}
   clear();emit();
  },
  /** For the game-server session only. Throws when signed out. */
  credentials(){
   if(!username||!token||sdk?.token!==token)throw new KeepworkError('signed_out');
   return {username,token};
  },
 };
}
