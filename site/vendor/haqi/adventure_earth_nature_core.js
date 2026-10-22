// Shared with Haqi's adventure_earth_nature_core.js. Artistic climate proxies,
// not surveyed vegetation or a historical crop calendar. No wall clock in core.
export const NATURE_SEASONS=['spring','summer','autumn','winter'];
const longitude=lon=>((lon+180)%360+360)%360-180;
export function earthNatureMonth(at,lon=0){
  const date=new Date(at+longitude(lon)*240000);
  return `${date.getUTCFullYear()}-${date.getUTCMonth()+1}`;
}
export function earthSeasonAt(at,lon=0,lat=0){
  const month=new Date(at+longitude(lon)*240000).getUTCMonth();
  const northern=Math.floor(((month+10)%12)/3);
  return NATURE_SEASONS[(northern+(lat<0?2:0))%4];
}
export const earthDecorationIsTree=frame=>Number.isInteger(frame)&&(frame>=0&&frame<4||[16,17,22,23].includes(frame));
export function earthDecorationSize(frame,variation=0){
  const range=earthDecorationIsTree(frame)?[64,90]:frame===20?[18,26]:[6,15,21].includes(frame)?[18,28]:[8,10,11,19].includes(frame)?[12,22]:frame===9?[9,16]:[12,20];
  return range[0]+Math.max(0,Math.min(1,variation))*(range[1]-range[0]);
}
export function earthDecorationFrames(type,latitude,lon=0,season='summer'){
  const lat=Math.abs(latitude);lon=longitude(lon);
  season=NATURE_SEASONS.includes(season)?season:'summer';
  if(!type||['water','ocean'].includes(type))return [];
  if(type==='snow')return [16,17,18,19,11];
  const tropical=lat<23.5,humidSubtropical=lat<28&&lon>=100&&lon<=145;
  const warm=tropical||humidSubtropical;
  const continental=lat>=40&&(lon>=45&&lon<=135||lon>=-125&&lon<=-65);
  const snowy=season==='winter'&&(lat>=58||continental);
  const cactus=lat<38&&lat>12&&lon>=-120&&lon<=-65;
  if(type==='barren')return cactus?[9,10,13,21]:[9,10,13];
  if(type==='scrub')return cactus?[8,10,13,21]:season==='spring'?[7,8,12]:[8,10,13];
  const trees=warm?[0,1]:snowy?[16,17]:lat>=55?[2]:season==='autumn'?[3,2]:season==='winter'?[2]:[22,2];
  const small=warm?[4,5,7,12,15]:snowy?[18,19,11]:season==='spring'?[4,7,12]:season==='summer'?[5,7,12]:season==='autumn'?[13,14,8]:[13,8,9];
  if(type==='wetland')return warm?[6,7,15,23]:snowy?[16,18,19]:season==='winter'?[13,8,2]:season==='autumn'?[6,13,3]:[6,7,22];
  if(type==='crops')return snowy?[19,13,9]:!warm&&season==='winter'?[13,9]:season==='spring'?[7,7,7,12]:[20,20,20,7];
  if(type==='urban')return [...trees,...small];
  if(type==='forest')return [...trees,...trees,...small,8];
  if(type==='grass')return [...trees,...small,9];
  return [];
}
export const earthTreeFrames=(type,lat,lon=0,season='summer')=>earthDecorationFrames(type,lat,lon,season).filter(earthDecorationIsTree);
export function earthDecorationStyle(type,frame){
  return [16,17,18,19,11].includes(frame)?{snow:true,earthDecoVariant:frame===16||frame===17?'snowTree':frame===18?'snowBush':frame===19?'snowMound':'snowRock'}:
    type==='crops'&&frame===20?{earthDecoVariant:'wheat'}:{};
}
