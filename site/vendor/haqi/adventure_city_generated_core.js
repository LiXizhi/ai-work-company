import {generateStreetLayout,placeStreetPoint} from './adventure_city_street_layout_core.js';
import {generateLivingStreetLayout} from './adventure_city_living_layout_core.js';
import {createRng,hashSeed} from './rng_core.js';
import {resolveParams} from './combat_params_core.js';
import {specMaxHp,petParams} from './adventure_pets_core.js';
import {generatedCityId,generatedCityDungeonId,validateGeneratedCityRoute} from './adventure_city_dungeons_core.js';
export {generatedCityId,generatedCityDungeonId,validateGeneratedCityRoute};
export function generatedCityRoute(city,save,profiles=[]){
    const level=Math.max(save.level||1,...profiles.map(p=>p.level||1),...(save.coopRun?.members||[]).map(m=>m.unit.level||1));
    return validateGeneratedCityRoute({...city,generationVersion:3,challengeLevel:Math.min(60,level),partySize:Math.min(4,1+profiles.length),layoutSeed:hashSeed(`city-view:1:${city.id}:${save.seed}`)});
}
// HelloWorld CityScene.js: 9x9 tiles, central station and crossing roads.
// City geometry has its own seeded RNG; it never consumes the combat RNG.
export function generateCityDungeon(content,route){
    validateGeneratedCityRoute(route);
    const p=resolveParams({version:'kids'},content.balanceParams||{}).cityDungeons;
    if(!Number.isInteger(p.gridSize)||p.gridSize<7||p.gridSize>15||p.gridSize%2!==1||p.tileSize<120||p.tileSize>200||!Number.isInteger(p.encounters)||p.encounters<1||p.encounters>3)throw Error('自动城市场景参数无效');
    const id=generatedCityId(route),dungeonId=generatedCityDungeonId(route),rng=createRng(route.layoutSeed??hashSeed(id)),grid=p.gridSize,tile=p.tileSize,size=grid*tile,center=size/2;
    const blocks=[];
    for(let y=0;y<grid;y++)for(let x=0;x<grid;x++)if(x!==Math.floor(grid/2)&&y!==Math.floor(grid/2))blocks.push({x:(x+.5)*tile,y:(y+.5)*tile,type:rng.pick(['home','shop','park']),variant:rng.int(0,3)});
    const pool=p.monsterIds.map(id=>content.monsters[id]).filter(m=>m?.pool?.length),rules=petParams(content),monsters={};
    if(!pool.length)throw Error('城市挑战缺少儿童版怪物');
    const spots=[{x:center,y:tile*1.5},{x:tile*1.5,y:center},{x:tile*(grid-1.5),y:center}];
    const encounters=Array.from({length:p.encounters},(_,i)=>{
        const level=Math.max(1,route.challengeLevel-(p.encounters-i-1)*p.levelStep),base=rng.pick(pool),monsterId=`${dungeonId}:monster:${level}:${i}`;
        const lessons=(content.learn?.[base.school]||[]).filter(row=>row.level<=level).slice(-8).map(row=>({key:row.key,weight:10}));
        // Existing trial opponent HP/rewards, using supported kids cards and AI.
        monsters[monsterId]={...structuredClone(base),id:monsterId,name:`${base.name} · ${level}级`,generatedCity:true,artSourceId:base.id,level,hp:specMaxHp({school:base.school,level,stats:{}}),attributes:{ai_module:'Genes_Attacker',power_pip_percent:0,startup_pips_normal:1},sequences:[],genes:[],cardsets:{},pool:lessons.length?lessons:structuredClone(base.pool),xp:rules.encounterXpBase+rules.encounterXpLevel*level,coins:rules.encounterCoinsBase+rules.encounterCoinsLevel*level};
        return {id:`${dungeonId}:challenge:${i}`,monsterId,monsterIds:Array(route.partySize).fill(monsterId),monsterSlots:Array.from({length:route.partySize},(_,i)=>i),...spots[i]};
    });
    const buildings=blocks.filter(b=>b.type!=='park').map(b=>({...b,y:b.y+40,w:105,h:100,atlas:'town',frame:b.type==='home'?'village':'tower',tile:4}));
    const scene={id:dungeonId,theme:'generated',generated:true,challengeLevel:route.challengeLevel,blocks,buildings,station:{x:center,y:center},map:{w:size,h:size,spawn:{x:center,y:size-tile},exit:{x:center,y:size-60},obstacles:buildings.map(b=>({x:b.x-40,y:b.y-80,w:80,h:80}))},npcs:[],items:{},art:{mode:'native-canvas'},hotspots:[{id:'station',kind:'sign',name:'城市挑战告示',x:center+60,y:center+60,text:'欢迎来到城市街区。沿着街道探索，可以自由选择挑战；随时能从南侧入口返回。'}],actions:[{id:`${dungeonId}:finish`,hotspot:'station',label:'确认街区安全',reply:'你完成了这次城市街区探索。',requiresBattles:encounters.map(e=>e.id)}],encounters,completion:[`${dungeonId}:finish`]};
    const residents=[];
    if(route.generationVersion>=2){
        scene.streetscape=route.generationVersion===3?generateLivingStreetLayout(route.layoutSeed,{art:content.cityStreetArt,params:p}):generateStreetLayout(route.layoutSeed,{size:2400});scene.buildings=[];scene.blocks=scene.streetscape.objects;
        scene.map={w:2400,h:2400,spawn:{x:1200,y:1500},exit:{x:1200,y:2290},obstacles:[]};
        const station=scene.hotspots[0];Object.assign(station,placeStreetPoint(scene,{x:1260,y:1470}),{text:'这是根据种子创作的城市街角，不是当地实景测绘。可以与居民交谈、逛街，也可以自由选择外围挑战。'});
        if(route.generationVersion===3){scene.map.spawn=placeStreetPoint(scene,{x:1200,y:1320});Object.assign(station,placeStreetPoint(scene,scene.streetscape.anchors.station),{streetArt:true,text:'这是华南生活街区艺术样板，暂用于各地随机城市，并非当地实景测绘。沿街可以找到小店、居民小巷和树荫小院。'});}
        const names=['小食摊主','果摊店主','街区居民','修理师傅','散步的游客','街区向导'];
        const positions=route.generationVersion===3?scene.streetscape.anchors.residents.map(p=>[p.x,p.y]):[[1080,1430],[1320,1460],[1170,1040],[1190,640],[1780,1000],[1200,1900]];
        for(let i=0;i<6;i++){const npc={id:991000+i,name:names[i]};residents.push(npc);const at=placeStreetPoint(scene,{x:positions[i][0],y:positions[i][1]});scene.npcs.push({id:npc.id,...at});scene.hotspots.push({id:'resident-'+i,kind:'npc',npcId:npc.id,name:npc.name,...at,text:['刚蒸好的小点心，闻起来很香。可以帮我把菜单送到果摊吗？','这些水果已经分好类了。谢谢你带来菜单。','沿着这条小巷走，可以到街角的树荫下。','我在检查自行车的刹车。出门前检查一下，骑车更安心。','这里的长椅正好可以歇脚。我们一起看看街边的小店吧。','先慢慢逛。外围的挑战可以稍后再去。'][i]});scene.actions.push({id:dungeonId+':greet:'+i,hotspot:'resident-'+i,label:i===0?'接过菜单':i===1?'送来菜单':'聊聊街区',reply:i===0?'你收好了菜单。':i===1?'果摊店主收到了菜单。':'你和居民聊了一会儿。',...(i===0?{give:{menu:1}}:i===1?{requires:[dungeonId+':greet:0'],consume:{menu:1}}:{})});}
        scene.items.menu={name:'小食摊菜单'};
        const edge=[[250,1650],[2130,1550],[2150,2150]];scene.encounters.forEach((e,i)=>Object.assign(e,placeStreetPoint(scene,{x:edge[i][0],y:edge[i][1]})));
    }
    return {city:{id,name:route.name,generated:true,npcs:residents,buildings:[],art:{},entrance:{lon:route.lon,lat:route.lat,level:route.level,dungeonId:`city:${id}:overview`},nodes:[{id:'default',cityId:id,name:route.name,lon:route.lon,lat:route.lat,source:{kind:'csv',id:String(route.id)},dungeon:scene}]},monsters};
}
