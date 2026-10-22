// Presentation only: independent seeded weather, never the combat/generation RNG.
// Reference: HelloWorld/WeatherService.js computeSceneLighting (readable violet
// moonlight and warm twilight). Weather here is simulated, with no network IO.
import {createRng,hashSeed} from './rng_core.js';
export const EARTH_LIGHT_MODES=['auto','day','dusk','night'];
export const EARTH_WEATHER_MODES=['auto','clear','rain','snow','fog','sand','off'];
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const RAD=Math.PI/180,DAY=86400000;
export function earthSolarElevation(at,lon=0,lat=0){
    const day=Math.floor(at/DAY),yearDay=((day-10957)%365.2425+365.2425)%365.2425;
    const declination=23.44*RAD*Math.sin(2*Math.PI*(yearDay-80)/365.2425);
    const hour=((at/DAY%1)*24+lon/15+24)%24,angle=(hour-12)*15*RAD,latitude=lat*RAD;
    return Math.asin(Math.sin(latitude)*Math.sin(declination)+Math.cos(latitude)*Math.cos(declination)*Math.cos(angle))/RAD;
}
export function earthEnvironment({at,lon=0,lat=0,biome='grass',light='auto',weather='auto'}={}){
    const elevation=light==='day'?60:light==='night'?-30:light==='dusk'?0:earthSolarElevation(at,lon,lat);
    const night=1-smooth((elevation+12)/18),warm=smooth((elevation+9)/9)*(1-smooth(elevation/18));
    let kind=weather;
    if(kind==='auto'){
        // Half-hour geographic fronts; walking between source pixels does not
        // roll weather. Land cover only selects an appropriate precipitation.
        const rng=createRng(hashSeed(`earth-weather:1:${Math.floor(at/1800000)}:${Math.floor(lon/2)}:${Math.floor(lat/2)}`)),roll=rng.float();
        kind=biome==='snow'?(roll<.55?'snow':'clear'):biome==='barren'?(roll<.28?'sand':'clear'):
            biome==='wetland'?(roll<.3?'fog':roll<.55?'rain':'clear'):
            roll<.22?'rain':roll<.3?'fog':'clear';
    }
    if(!EARTH_WEATHER_MODES.includes(kind)||kind==='off')kind='clear';
    return {night,warm,kind,elevation};
}
