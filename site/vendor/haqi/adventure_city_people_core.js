import {createRng,hashSeed} from './rng_core.js';
import {validHeroBodyId} from './hero_body_core.js';

// Use the authoritative hero manifest; do not copy atlas crops or anchors.
export function urbanResidentProfiles(manifest){
    return Object.entries(manifest?.heads||{}).filter(([id,head])=>{
        const body=manifest.bodyVariants?.[head.recommendedBodyId];
        return id.startsWith('urban-')&&body?.gender===head.gender;
    }).sort(([a],[b])=>a.localeCompare(b)).map(([headId,head])=>({
        appearance:head.gender==='female'?'girl':'boy',headId,bodyId:head.recommendedBodyId,
    }));
}
export function validResidentCharacter(profile){
    return profile&&['boy','girl'].includes(profile.appearance)&&typeof profile.headId==='string'&&profile.headId.length<=80&&validHeroBodyId(profile.bodyId,profile.appearance);
}
function checkedCharacter(profile,manifest){
    const gender=profile?.appearance==='girl'?'female':'male';
    return validResidentCharacter(profile)&&manifest?.heads?.[profile.headId]?.gender===gender&&manifest?.bodyVariants?.[profile.bodyId]?.gender===gender;
}
export function streetPeopleProfiles(street,manifest,seed='street'){
    const pool=urbanResidentProfiles(manifest),rng=createRng(hashSeed(`${seed}:street-residents`));
    const groups=[[],[],[]];
    for(const p of pool)groups[/school|teen-/.test(p.headId)?0:/retired-resident|teacher|florist|gardener/.test(p.headId)?1:2].push(p);
    for(const group of groups)for(let i=group.length-1;i>0;i--){const j=rng.int(0,i);[group[i],group[j]]=[group[j],group[i]];}
    const order=[];
    while(groups.some(g=>g.length))for(const g of groups)if(g.length)order.push(g.shift());
    const profiles=new Map();let index=0;
    for(const route of street?.routes||[])if(route.kind==='pedestrian')for(let i=0;i<route.count;i++){
        const explicit=route.characters?.[i%route.characters.length];
        const profile=checkedCharacter(explicit,manifest)?explicit:order[index%order.length]||{appearance:index%2?'girl':'boy'};
        profiles.set(`${route.id}:${i}`,{...profile,mountId:null});index++;
    }
    return profiles;
}

// Only Earth city dungeons replace portrait NPCs with wardrobe characters.
// Island NPCs and Earth surface NPCs retain their original portraits/explicit characters.
export function npcCharacter(npc,manifest,cityDungeon=false){
    if(!cityDungeon&&!npc?.cityDungeonNpc&&!npc?.zone?.startsWith('city:'))return npc?.character?{...npc.character,mountId:null}:null;
    if(checkedCharacter(npc?.character,manifest))return{...npc.character,mountId:null};
    const pool=urbanResidentProfiles(manifest),identity=String(npc?.id??npc?.name??'resident');
    const selected=pool[hashSeed('npc-character:'+identity)%pool.length];
    return{...(selected||{appearance:hashSeed(identity)%2?'girl':'boy'}),mountId:null};
}
