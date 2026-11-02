import {createRng,hashSeed} from './rng_core.js';
import {emptyStreet,rectangle} from './adventure_city_street_layout_core.js';
import {livingArtDimensions} from './adventure_city_living_art_core.js';

const homes=['cream-balcony','brick-home','blue-walkup','stair-apartment','laundry-home','tank-apartment','peach-home','corner-home','green-shophouse','tile-home','white-walkup','brick-corner'];
const shops=['breakfast','noodles','grocery','fruit','repair','tea','florist','restaurant','bakery','hardware','books','tailor'];
const titles=['早餐铺','面馆','杂货铺','鲜果铺','单车修理','茶饮铺','花坊','家常菜','烘焙坊','五金铺','书屋','裁缝铺'];
const prefixes=['榕荫','巷口','邻里','早安','晴日','街角','青禾','南风','慢时光','小院','新晴','暖阳'];
const stock={breakfast:['steamers','baskets'],noodles:['dining-table','vegetables'],grocery:['drink-crates','shelf'],fruit:['fruit-crates','vegetables'],repair:['scooter','bike-rack'],tea:['cafe-table','home-pots'],florist:['bougainvillea','home-pots'],restaurant:['dining-table','baskets'],bakery:['cafe-table','handcart'],hardware:['paint-cans','shelf'],books:['wood-bench','shrub-pot'],tailor:['baskets','home-pots']};
const menus={breakfast:'热包子 · 豆浆\n清早开门',noodles:'汤面 · 拌面\n现煮现做',grocery:'米面 · 日用品\n街坊所需',fruit:'时令鲜果\n每日到货',repair:'补胎 · 调刹车\n单车维修',tea:'凉茶 · 柠檬茶\n冰热可选',florist:'盆栽 · 鲜花\n日常花束',restaurant:'家常小菜\n现点现炒',bakery:'新鲜面包\n每日出炉',hardware:'五金 · 工具\n家用配件',books:'童书 · 旧书\n慢慢翻阅',tailor:'改衣 · 补衣\n街坊手艺'};
const shopDetails={breakfast:['red-stools',30],noodles:['red-stools',30],grocery:['delivery-boxes',40],repair:['folded-cart',36],tea:['umbrella-holder',28],restaurant:['wash-basin',64],bakery:['delivery-cooler',40],hardware:['delivery-boxes',40],books:['newspaper-rack',48],tailor:['umbrella-holder',28]};

// Authored dimensions and arrangements are art, not combat balance or surveyed geography.
export function generateLivingStreetLayout(seed,{art=null,params}={}){
    if(params?.streetSize!==2400)throw Error('生活街区样板地图必须为2400单位');
    const rng=createRng(seed),s=emptyStreet(),size=params.streetSize;
    const skeleton=rng.pick(['straight','corner','side-lanes']);
    const districtName=createRng(hashSeed(`${seed}:district-name`)).pick(['榕荫里','青禾巷','南风坊','晴日街','小院里','暖阳里']);
    s.districtName=districtName;s.markings=[];s.wear=[];s.doorNodes=[];
    Object.assign(s,{theme:'south-china',walkRadius:params.streetHeroRadius,movementStep:params.streetMovementStep,edgeMargin:params.streetEdgeMargin,layoutKind:skeleton,ground:'#c6c2b6',groundArt:'living:concrete',provenance:{kind:'artistic',description:'华南生活街区艺术样板，非当地实景测绘'},views:{entrance:{x:1200,y:1450},commercial:{x:660,y:900},residential:{x:760,y:590},rest:{x:1840,y:1990}},anchors:{station:{x:1310,y:1320},residents:[]}});
    const surface=(id,kind,x,y,w,h,material,color)=>s.surfaces.push({id,kind,points:rectangle(x,y,w,h),material:'living:'+material,color});
    const wearRng=createRng(hashSeed(`${seed}:ground-wear`));
    const wear=(id,kind,x,y,w,h,color)=>{const points=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,r=wearRng.int(76,100)/100;return{x:x+Math.cos(a)*w/2*r,y:y+Math.sin(a)*h/2*r};});s.wear.push({id,kind,points,color});};
    surface('north-court','paving',40,30,2320,1000,'pavers','#bdb8aa');
    surface('market-court','paving',40,1030,2320,440,'sidewalk','#d5ccba');
    surface('south-court','paving',40,1770,1460,590,'brick-paving','#b99b81');
    surface('garden-lawn','grass',1560,1830,760,490,'lawn','#8d9d72');
    s.surfaces.at(-1).points=[{x:1560,y:1830},{x:2180,y:1830},{x:2180,y:1880},{x:2320,y:1880},{x:2320,y:2210},{x:2270,y:2210},{x:2270,y:2320},{x:1660,y:2320},{x:1660,y:2260},{x:1560,y:2260}];
    const road=(id,kind,points,width,material)=>s.roads.push({id,kind,points,width,material:'living:'+material});
    const avenue=skeleton==='corner'?[{x:0,y:1580},{x:650,y:1580},{x:1050,y:1660},{x:size,y:1660}]:[{x:0,y:1580},{x:size,y:1580}];
    // Road-owned details follow the actual centerline, including the bend.
    const avenueY=x=>{for(let i=1;i<avenue.length;i++){const a=avenue[i-1],b=avenue[i];if(x<=b.x)return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x);}return avenue.at(-1).y;};
    road('avenue','road',avenue,params.streetRoadWidth,'asphalt');
    road('market-walk','walk',[{x:80,y:1180},{x:2320,y:1180}],params.streetWalkWidth,'sidewalk');
    road('north-walk','walk',[{x:80,y:560},{x:2320,y:560}],100,'cobbles');
    road('main-alley','walk',[{x:1200,y:40},{x:1200,y:2360}],100,'concrete');
    road('west-alley','walk',[{x:80,y:40},{x:80,y:2360}],85,'pavers');
    road('east-alley','walk',[{x:2320,y:40},{x:2320,y:2360}],85,'pavers');
    road('south-walk','walk',[{x:80,y:1980},{x:2320,y:1980}],110,'pavers');
    road('garden-entry','walk',[{x:1200,y:1840},{x:1520,y:1840},{x:1520,y:1980},{x:1800,y:1980}],90,'pavers');
    road('garden-loop','walk',[{x:1800,y:1980},{x:1800,y:2160},{x:2140,y:2160},{x:2280,y:1980}],72,'gravel');
    s.transitions={curbs:true,landings:[],aprons:[],tactile:[]};
    s.facilityNodes=[];
    s.alleyConnections=[];s.frontageRevision=2;
    road('south-door-walk','walk',[{x:80,y:2360},{x:1500,y:2360}],65,'brick-paving');
    if(skeleton==='side-lanes')for(const x of [620,1780])road('branch-'+x,'walk',[{x,y:570},{x,y:820},{x:x+80,y:820}],65,'cobbles');
    let serial=0;
    const dimensions=key=>art?.entries?.['living:'+key]||livingArtDimensions['living:'+key];
    const frame=(key,width)=>{const d=dimensions(key);return{art:'living:'+key,w:width,h:width*d.height/d.width};};
    const add=(id,key,x,y,width,options={})=>{
        const o={id, type:options.type||'prop',x,y,...frame(key,width),provenance:'artistic',...options};s.objects.push(o);
        if(options.solid){const fw=options.footprintWidth||(options.type==='tree'?width*.42:width*.8),fd=options.footprintDepth||params.streetPropDepth;o.footprint=rectangle(x-fw/2,y-fd,fw,fd);s.colliders.push({id:id+':collision',points:o.footprint});}
        return o;
    };
    const attachment=(key,x,y,width,options={})=>({...frame(key,width),x,y,...options});
    const shopOrder=rng.shuffle([...rng.shuffle([0,3,4]),...rng.shuffle(shops.map((_,i)=>i).filter(i=>![0,3,4].includes(i))).slice(0,5)]);
    let previousHome=-1,shopNumber=0;
    const shopSites=[];
    const frontageRng=createRng(hashSeed(`${seed}:frontage-details`)),doorPlants=['home-pots','fern-pot','shrub-pot'];
    let previousDoorPlant=-1;
    for(const row of [{id:'homes',y:430,commercial:false},{id:'market',y:1040,commercial:true},{id:'south',y:2320,commercial:false}]){
        const xs=row.id==='south'?[260,540,820,1050,1450]:[240,510,780,1035,1450,1720,1990,2235];
        const frontage=[];
        for(let i=0;i<xs.length;i++){
            const homeIndex=(previousHome+1+rng.int(0,homes.length-2))%homes.length;previousHome=homeIndex;
            const x=xs[i],y=row.y,d=dimensions(homes[homeIndex]);
            const h=params.streetBuildingHeight,w=Math.min(params.streetBuildingMaxWidth,h*d.width/d.height);
            const building={id:row.id+'-'+i,type:'building',x,y,...frame(homes[homeIndex],w),components:[],provenance:'artistic'};
            building.footprint=rectangle(x-w*.42,y-85,w*.84,105);
            s.colliders.push({id:building.id+':collision',points:building.footprint});s.objects.push(building);frontage.push(building);
            const walkY=row.id==='market'?1180:row.id==='south'?2360:560;
            const doorX=x+(row.commercial?0:w*.20);
            s.doorNodes.push({id:building.id+'-door',x:doorX,y:y+(row.id==='south'?40:48),buildingId:building.id});
            road(building.id+'-door-path','walk',[{x:doorX,y:y+2},{x:doorX,y:walkY}],row.commercial?78:54,row.commercial?'sidewalk':'concrete');
            if(row.commercial){
                // Select without adjacent repeats, while store text is unique within this street.
                const shopIndex=shopOrder[shopNumber];
                const key=shops[shopIndex],name=prefixes[shopNumber%prefixes.length]+titles[shopIndex];
                building.shopKind=key;building.shopName=name;
                wear(building.id+'-footfall','footfall',x,y+28,w*.65,32,'#81766428');
                const front=attachment(key,0,0,Math.min(w,params.streetShopWidth),{text:name});
                building.imageOffsetY=building.h*.29-front.h;
                building.components.push(front);
                if(i===3)building.components.push(attachment('banner',0,building.imageOffsetY-building.h*.57,w*.66,{text:districtName+'生活街'}));
                const props=stock[key];
                const primaryWidth=props[0].includes('table')?78:props[0]==='wood-bench'?96:props[0]==='scooter'?64:props[0]==='bougainvillea'?64:props[0]==='fruit-crates'?64:props[0]==='drink-crates'?58:48;
                const secondaryWidth=props[1]==='bike-rack'?84:props[1]==='handcart'?62:props[1]==='shelf'?64:42;
                // Keep the physical base inside the frontage, with a small
                // setback from either alley; larger furniture moves inward.
                const sideX=(width,side)=>x+side*(w/2-width*.4-6);
                const stall=add('stock-'+serial++,props[0],sideX(primaryWidth,-1),y+78,primaryWidth,{solid:true});
                add('stock-'+serial++,props[1],sideX(secondaryWidth,1),y+55,secondaryWidth,{solid:true,occludes:props[1]==='shelf'});
                add('menu-'+i,'menu-board',sideX(60,1),y+80,60,{text:menus[key],solid:true,occludes:true});
                const detail=shopDetails[key];
                if(detail)add('shop-detail-'+i+'-'+detail[0],detail[0],sideX(detail[1],-1),y+112,detail[1],{solid:true});
                if(['grocery','fruit'].includes(key))add('shop-bags-'+i,'shopping-bags',sideX(28,1),y+112,28,{solid:true});
                if(key==='florist'){
                    add('shop-watering-'+i,'watering-can',sideX(26,1),y+112,26,{solid:true});
                    building.components.push(attachment('wall-hose',-w*.35,-35,32));
                }
                if(['breakfast','noodles','restaurant'].includes(key))building.components.push(attachment('wall-fan',w*.35,-70,32));
                shopSites.push({kind:key,x,y:y+120,front:stall});shopNumber++;
            }else{
                building.components.push(attachment('wall-sign',w*.34,-70,24,{text:String((row.id==='south'?32:12)+i)}));
                building.components.push(attachment('mailbox',-w*.35,-74,20,{text:String((row.id==='south'?32:12)+i)}));
                if(i%2===0)building.components.push(attachment('broom-rack',-w*.34,-24,24));
                if(i%4===0)building.components.push(attachment('courtyard-sink',-w*.28,14,42));
                if(i%4===1)building.components.push(attachment('reed-mat',-w*.38,8,20));
                if(i%3===0)building.components.push(attachment('hanging-fern',w*.18,-100,36));
                if(i%2===1)building.components.push(attachment('porch-lamp',w*.20+22,-88,14));
                if(i%3===2)add(row.id+'-laundry-'+i,'laundry-basket',x-w*.18,y+(row.id==='south'?20:50),34,{solid:true});
                const plantIndex=(previousDoorPlant+1+frontageRng.int(0,doorPlants.length-2))%doorPlants.length;previousDoorPlant=plantIndex;
                add(row.id+'-pot-'+i,doorPlants[plantIndex],x-w*.39,y+(row.id==='south'?20:40),frontageRng.pick([38,42,44]),{solid:true});
                if(i%3===1)add(row.id+'-shoes-'+i,'shoe-rack',x-w*(row.id==='south'?.18:.39),y+(row.id==='south'?20:76),38,{solid:true});
                add(row.id+'-threshold-drain-'+i,'drain',doorX,y+18,28,{ground:true});
                wear(building.id+'-drain-moisture','moisture',doorX,y+17,48,18,'#58654728');
                wear(building.id+'-door-use','footfall',doorX,y+34,34,20,'#81766420');
                if(i===0)building.components.push(attachment('wall-sign',-w*.30,-110,64,{text:districtName+(row.id==='south'?'南巷':'北巷')}));
            }
        }
        // Every inter-building gap has a defined use: a connected service alley
        // plus low courtyard infill. Main cross streets remain fully open.
        for(let i=1;i<frontage.length;i++){
            const left=frontage[i-1],right=frontage[i],lo=left.x+left.w/2,hi=right.x-right.w/2,gap=hi-lo;
            if(gap<26){if(!row.commercial)left.components.push(attachment('water-meters',left.w*.38,-8,24));continue;}
            const major=lo<1200&&hi>1200,x=major?1200:(lo+hi)/2,walkY=row.id==='market'?1180:row.id==='south'?2360:560;
            const width=major?100:Math.min(72,gap-12),id=row.id+'-gap-'+i;
            road(id,'walk',[{x,y:row.y-350},{x,y:walkY}],width,i%2?'cobbles':'concrete');
            s.alleyConnections.push({id,x,y:walkY,entry:{x,y:row.y+38},width,between:[left.id,right.id]});
            if(gap>170){
                const wallWidth=Math.min(70,x-width/2-lo-12),gateWidth=Math.min(70,hi-x-width/2-12);
                if(wallWidth>28)add(id+'-wall',i%2?'fern-wall':'brick-wall',lo+wallWidth/2+4,row.y,wallWidth,{solid:true});
                if(gateWidth>28)add(id+'-gate',i%2?'garden-gate':'courtyard-gate',hi-gateWidth/2-4,row.y,gateWidth,{solid:true});
            }
            // Pipes/meters attach to the wall, leaving the whole lane clear.
            // Shop frames already include their utility equipment. Residential
            // meters sit below address plaques, instead of covering their text.
            if(!row.commercial)left.components.push(attachment(i%2?'water-meters':'meter-wall',left.w*.38,-8,30));
            if(major&&!row.commercial)left.components.push(attachment('wall-sign',left.w*.30,-116,52,{text:'主街通道'}));
            if(gap>90&&!major){
                add(id+'-pots','fern-pot',lo+12,row.y+(row.id==='south'?16:36),26,{solid:true});
                add(id+'-grate','drain',x,row.y+52,Math.min(30,width*.7),{ground:true});
            }
        }
    }
    // Street edges, rather than arbitrary empty-ground scatter, own all furniture.
    const streetPaletteRng=createRng(hashSeed(`${seed}:street-palette`)),streetLamp=streetPaletteRng.pick(['gray-lamp','green-lamp']),streetTree=streetPaletteRng.pick(['shade-pit','banyan-pit']);
    s.streetPalette={lamp:streetLamp,tree:streetTree};
    for(let i=0;i<10;i++){
        const x=180+i*220;
        const lampSize=dimensions(streetLamp);add('lamp-'+i,streetLamp,x,1430,180*lampSize.width/lampSize.height,{solid:true,footprintWidth:10,footprintDepth:10});
        add('drain-'+i,'drain',x+60,1488,34,{ground:true});
        if(i%2===0)add('pit-'+i,streetTree,i===4?1110:x+90,1410,streetPaletteRng.pick([162,170,178]),{type:'tree',solid:true});
    }
    for(const [i,x] of [340,900,1500,2080].entries())add('manhole-'+i,'manhole',x,avenueY(x),42,{ground:true});
    // A shaded entrance, open sitting bay and a loop replace the repeated
    // two-row nursery grid. Detail randomness cannot reshuffle the storefronts.
    const gardenRng=createRng(hashSeed(`${seed}:garden-details`));
    const treeSites=[['banyan-pit',1700,1870,140],['shade-pit',1830,1850,110],['palm-pit',1990,1870,115],['bauhinia-pit',2240,1940,125],['shade-pit',1650,2240,125],['banyan-pit',1900,2290,145],['palm-pit',2170,2280,110]];
    for(const [i,[key,x,y,width]] of treeSites.entries())add('garden-tree-'+i,key,x+gardenRng.int(-8,8),y+gardenRng.int(-6,6),width,{type:'tree',solid:true});
    const beds=[['flowerbed',1640,1940,95],['grass-planter',1770,1940,70],['hedge',2090,1930,100],['flowerbed',2160,2028,80],['shrub-pot',1750,2280,56],['flowerbed',2070,2320,125]];
    for(const [i,[key,x,y,width]] of beds.entries())add('garden-bed-'+i,key,x,y,width,{solid:true});
    const seats=[['wood-bench',1660,2080],['stone-bench',2050,2070],['wood-bench',2230,2150]];
    s.restNodes=seats.map(([key,x,y],i)=>{add('garden-seat-'+i,key,x,y,92,{solid:true});return{id:'garden-seat-'+i,x,y:y+40};});
    for(const [i,[,x,y]] of seats.entries())surface('garden-seat-pad-'+i,'paving',x-58,y-8,116,68,'gravel','#c4b795');
    for(const [i,points] of [
        [{x:1800,y:2145},{x:1660,y:2145},{x:1660,y:2120}],
        [{x:2050,y:2160},{x:2050,y:2110}],
        [{x:2140,y:2160},{x:2230,y:2190}],
    ].entries())road('garden-seat-walk-'+i,'walk',points,54,'gravel');
    add('garden-bin','sorting-bin',2280,2070,50,{solid:true});
    add('garden-water-barrel','water-barrel',2100,2260,36,{solid:true});
    road('garden-service-walk','walk',[{x:2050,y:2160},{x:2060,y:2260}],48,'gravel');
    s.facilityNodes.push({id:'garden-water-access',x:2060,y:2260});
    add('garden-pots','home-pots',1600,2110,45,{solid:true});
    add('garden-wall','fern-wall',2190,2350,96,{solid:true}).components=[attachment('wall-hose',20,-24,28)];
    add('street-map','notice-board',1310,1280,115,{text:districtName+'生活街\n小巷 · 商铺 · 榕荫',solid:true,occludes:true});
    add('directions','direction-sign',1280,1900,84,{text:'树荫小院',solid:true,footprintWidth:10,footprintDepth:10});
    add('advert','advert-board',2100,1350,68,{text:'街坊花市\n周末见',solid:true});
    add('bus-stop','bus-shelter',460,1440,210,{text:districtName+'站',solid:true,footprintDepth:34,occludes:true}).components=[attachment('wall-sign',70,-75,46,{text:'生活街区\n环线停靠'})];
    add('bus-bin','sorting-bin',660,1435,46,{solid:true});
    add('bikes','bike-rack',1850,1350,104,{solid:true});
    add('bin','sorting-bin',2260,1350,62,{solid:true});
    add('hydrant','hydrant',145,1410,30,{solid:true,footprintWidth:22,footprintDepth:18});
    add('cabinet','utility-box',160,660,54,{solid:true});
    add('cones','cones',160,700,45,{solid:true,footprintDepth:18});
    add('utility-notice','service-sign',220,700,44,{text:'设备检修\n请绕行',solid:true});
    surface('utility-service-pad','paving',122,625,76,92,'concrete','#c6c2b6');
    road('utility-approach','walk',[{x:80,y:735},{x:220,y:735}],54,'concrete');
    s.facilityNodes.push({id:'utility-access',x:220,y:735});
    const courtyardSites=[[200,1930],[248,1922],[297,1934],[872,1930],[920,1922],[968,1934]];
    for(const [i,[x,y]] of courtyardSites.entries())add('courtyard-pot-'+i,['banana-planter','fern-pot','home-pots','citrus-pot','bougainvillea','shrub-pot'][i],x,y,50,{solid:true});
    // Retain each facility's authored setback from the road, rather than
    // treating the bent avenue as a straight line at y=1580.
    for(const o of s.objects)if(/^(lamp-|drain-|pit-)/.test(o.id)||['bus-stop','bus-bin','bikes','bin','hydrant','cones','advert'].includes(o.id)){
        const dy=avenueY(o.x)-1580;o.y+=dy;
        if(o.footprint){for(const p of o.footprint)p.y+=dy;}
    }
    for(const o of s.objects.filter(o=>o.id.startsWith('manhole-')))wear(o.id+'-patch','asphalt-repair',o.x,o.y-o.h/2,o.w+30,o.h+16,'#393f3e30');
    for(const o of s.objects.filter(o=>o.id.startsWith('pit-')))wear(o.id+'-soil','tree-soil',o.x,o.y+3,o.w*.55,26,'#76674724');
    const facility=id=>s.objects.find(o=>o.id===id);
    const stop=facility('bus-stop');
    surface('bus-waiting-pad','paving',stop.x-125,stop.y-42,250,102,'sidewalk','#d5ccba');
    road('bus-approach','walk',[{x:stop.x+130,y:1180},{x:stop.x+130,y:stop.y+26},{x:stop.x,y:stop.y+26}],54,'sidewalk');
    s.facilityNodes.push({id:'bus-wait',x:stop.x,y:stop.y+26},{id:'bike-access',x:1850,y:avenueY(1850)-192},{id:'bin-access',x:2260,y:avenueY(2260)-192});
    wear('bus-wait-use','footfall',stop.x,stop.y+25,174,22,'#81766420');
    const bike=facility('bikes');
    surface('bicycle-pad','paving',bike.x-75,bike.y-52,150,84,'concrete','#c6c2b6');
    for(let i=0;i<3;i++){const x=bike.x-60+i*40;s.markings.push({id:'cycle-slot-'+i,points:[{x,y:bike.y-45},{x,y:bike.y+22},{x:x+30,y:bike.y+22},{x:x+30,y:bike.y-45}],width:2,color:'#ded8b6a0'});}
    for(let i=0;i<3;i++){const x=bike.x-44+i*40;s.markings.push({id:'cycle-wear-'+i,points:[{x,y:bike.y-38},{x:x+1,y:bike.y-12},{x:x-2,y:bike.y+13}],width:1.5,color:'#474b4936'});}
    const bin=facility('bin');
    surface('bin-service-pad','paving',bin.x-86,bin.y-42,132,64,'pavers','#bdb8aa');
    add('bin-service-drain','drain',bin.x,bin.y+17,30,{ground:true});
    add('bin-mop','mop-bucket',bin.x-65,bin.y+5,28,{solid:true});
    wear('bin-wash-wear','wash',bin.x,bin.y+17,62,22,'#53615628');
    s.transitions.gutters=true;
    const crossingY=avenueY(1200),halfRoad=params.streetRoadWidth/2;
    s.crossings.push({x:1200,y:crossingY,w:100,h:params.streetRoadWidth});
    // Flush curb approaches belong to the crossing, never form a raised step.
    for(const side of [-1,1]){const edgeY=crossingY+side*halfRoad;
        s.transitions.aprons.push({id:'crossing-apron-'+side,points:rectangle(1154,Math.min(edgeY,edgeY+side*32),92,32),material:'living:pavers',color:'#bdb8aa'});
        s.transitions.tactile.push({id:'crossing-tactile-'+side,x:1158,y:edgeY+side*25-4,w:84,h:8});
        s.facilityNodes.push({id:'crossing-wait-'+side,x:1200,y:edgeY+side*36});
    }
    s.signals.push({id:'crossing-light',x:1270,y:avenueY(1270)-100,period:14,green:8,offset:0});
    s.signals.push({id:'crossing-light-south',x:1270,y:avenueY(1270)+118,period:14,green:8,offset:0});
    let crossingDistance=0;
    for(let i=1;i<avenue.length;i++){const a=avenue[i-1],b=avenue[i],length=Math.hypot(b.x-a.x,b.y-a.y);crossingDistance+=length*Math.max(0,Math.min(1,(1200-a.x)/(b.x-a.x)));if(b.x>=1200)break;}
    s.routes.push({id:'traffic',kind:'vehicle',points:avenue.map(p=>({x:p.x,y:p.y+25})),speed:85,count:3,art:seed%2?'car':'minibus',stops:[{signal:'crossing-light',distance:crossingDistance-150}]});
    s.routes.push({id:'residents',kind:'pedestrian',points:[{x:180,y:1180},{x:2200,y:1180},{x:180,y:1180}],speed:25,count:5});
    const siteFor=key=>shopSites.find(p=>p.kind===key)||shopSites[shops.indexOf(key)%shopSites.length];
    s.anchors.residents=[siteFor('breakfast'),siteFor('fruit'),s.doorNodes.find(p=>p.buildingId==='homes-2'),siteFor('repair'),s.restNodes[0],{x:1300,y:1788}].map(({x,y})=>({x,y}));
    return s;
}
