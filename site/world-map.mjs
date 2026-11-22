import {DetailDialog} from './vendor/haqi/view_detail_dialog.js';
import {applyUiIcon} from './vendor/haqi/adventure_ui_art.js';

const el=(tag,cls,...children)=>{const n=document.createElement(tag);n.className=cls;n.append(...children);return n;};
// Illustrated overview: authored landmark anchors, not a claim of pixel-exact terrain.
const pins=[['memory',50,25],['observatory',26,34],['library',74,36],['welcome',23,57],['plaza',50,55],['workshop',78,61],['home',83,20]];
export function createWorldMap(trigger,getScene,{preferCdn=false}={}){
 const dialog=new DetailDialog(document.body,{el,title:'脑内小城 · 世界地图',className:'world-map-dialog'});
 if(dialog.closeButton&&!dialog.closeButton.textContent.trim()){
  const closeGlyph=dialog.closeButton.querySelector('[data-ui-icon]');
  if(closeGlyph)closeGlyph.textContent='×';
 }
 const chart=el('div','world-map-chart'),picture=el('img','world-map-picture');
 picture.alt='象牙白浮岛、记忆树、观星台、图书馆与珊瑚色屋顶围绕中央广场的世界地图';
 chart.append(picture);dialog.body.append(chart);
 const homeLinks=el('nav','world-map-homes');homeLinks.setAttribute('aria-label','居民家园');
 dialog.footer.append(el('p','','选择地点移动观察视角 · 居民自主行动 · 地图打开时暂停'),homeLinks);
 let ready=null,iconsLoaded=false;
 async function load(){
  const r=await fetch('vendor/haqi-data/data/adventure/neural-city-art.json');if(!r.ok)throw Error('地图加载失败');
  const manifest=await r.json();
  const primary=preferCdn&&manifest.map?.cdn?manifest.map.cdn:manifest.map.local;
  picture.onerror=()=>{if(picture.src!==manifest.map.local){picture.onerror=null;picture.src=manifest.map.local;}};
  picture.src=primary;
  await picture.decode().catch(()=>{});
 }
 async function loadIcons(){
  if(iconsLoaded)return;iconsLoaded=true;
  const response=await fetch('vendor/haqi-data/data/adventure/ui-art.json');if(!response.ok)throw Error('图标加载失败');
  const manifest=await response.json(),image=new Image();
  const mode=preferCdn&&manifest.cdn?'cdn':'local';
  image.src=mode==='cdn'?manifest.cdn:manifest.local;
  await image.decode();
  for(const icon of [trigger?.querySelector('[data-ui-icon]'),dialog.closeButton?.querySelector('[data-ui-icon]')]){
   if(icon){icon.textContent='';applyUiIcon(icon,manifest,icon.dataset.uiIcon,mode);}
  }
 }
 // Defer secondary map dialog icon sprites until after critical scene startup.
 setTimeout(()=>{loadIcons().catch(()=>{iconsLoaded=false;});},1200);
 trigger.addEventListener('click',async()=>{
  loadIcons().catch(()=>{});
  dialog.open(trigger);
  chart.querySelectorAll('button').forEach(n=>n.remove());
  const scene=getScene();
  homeLinks.replaceChildren();
  for(const home of Object.values(scene?.world.homes||{})){const b=el('button','',home.name);b.type='button';b.onclick=()=>{scene.focusHome(home.id);dialog.close();};homeLinks.append(b);}
  if(scene)for(const [id,x,y]of pins){
   const mark=scene.world.landmarks.find(m=>m.id===id);if(!mark)continue;
   const button=el('button','world-map-pin',mark.name);button.type='button';button.style.left=x+'%';button.style.top=y+'%';button.setAttribute('aria-label','查看'+mark.name);
   button.onclick=()=>{if(scene.focusScene)scene.focusScene(id);else scene.focus(mark);dialog.close();scene.render(performance.now()/1000,{paused:true});};chart.append(button);
  }
  try{ready??=load().catch(error=>{ready=null;throw error;});await ready;dialog.footer.firstChild.textContent='选择地点移动观察视角 · 居民自主行动 · 地图打开时暂停';}
  catch{dialog.footer.firstChild.textContent='地图插画暂时无法加载，请关闭后重试。地点导航仍可使用。';}
 });
 return dialog;
}
