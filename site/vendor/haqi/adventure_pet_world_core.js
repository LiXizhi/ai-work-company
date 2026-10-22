import {rollPetTraits,petTraitParams} from './adventure_pet_traits_core.js';
import {ownedPetRecords} from './adventure_pet_files_core.js';
import {recordPetMeal} from './adventure_pet_quests_core.js';
import {validPetFileRef} from './adventure_pet_files_core.js';
// Whole-game transaction rules. Persist the returned save before replacing live state.
import {createPetInstance,migratePetInstances,validatePetInstance,interactPets,breedPets,adoptPet,prunePetMemories,petInteractionParams,petPairStatus} from './adventure_pet_interactions_core.js';
import {addPet,mergeOwnedPetSpecies,petMaxHp,petParams,nutritionStock,consumeNutrition} from './adventure_pets_core.js';
import {selectSocialPetId} from './adventure_companion_core.js';
import {hashSeed} from './rng_core.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const check=(ok,message)=>{if(!ok)throw Error(message);};
export function initializePetWorld(save,content){
    if(save.petInstanceVersion===1||save.pendingEncounter)return false;
    const ownerId=`hero:${save.seed}`,migration=migratePetInstances(save,content,{ownerId});
    const old=new Map(Object.values(save.pets).map(p=>[p.id,p]));
    save.pets=Object.fromEntries(migration.pets.map(p=>[p.id,{...p,hp:old.get(p.id).hp,hunger:old.get(p.id).hunger}]));
    save.formation=migration.formation;save.petInstanceVersion=1;save.petOwnerId=ownerId;save.petWorld={};
    return true;
}
export function npcPetId(owner){return `npc-pet:${owner}`;}
export function createNpcPet(profile,content){
    const ownerId=`npc:${profile.id}`,level=petParams(content).stageLevels[2];
    // A resident's fixed adulthood is independent of the hero's changing level.
    const xp=petParams(content).petXpStep*level*(level-1)/2,schools=['fire','ice','storm','life','death'];
    const school=schools.includes(profile.school)?profile.school:schools[hashSeed(String(profile.id))%schools.length];
    return createPetInstance(content,{id:npcPetId(profile.id),ownerId,speciesId:selectSocialPetId({...profile,school},content),xp});
}
export function validatePetWorld(save,content){
    if(save.petInstanceVersion===undefined)return;
    check(save.petInstanceVersion===1&&save.petOwnerId===`hero:${save.seed}`&&save.petWorld&&typeof save.petWorld==='object'&&!Array.isArray(save.petWorld),'宠物世界无效');
    for(const [id,ref]of Object.entries(save.petFileRefs||{}))check(validPetFileRef(id,ref)&&content.pets[ref.summary.speciesId]&&['pets','petWorld'].includes(ref.group),'宠物引用无效');
    for(const [id,p] of Object.entries(save.petWorld)){check(id===p.id&&!save.pets[id]&&p.ownerId!==save.petOwnerId,'宠物世界身份无效');validatePetInstance(p,content);}
}
export function petWorldAction(source,content,action){
    check(source.petInstanceVersion===1&&!source.pendingEncounter,'请先结束战斗');
    const save=copy(source),effects=[],babies=[],temporaryPairs={...action.temporaryPairs};
    const own=p=>p.ownerId===save.petOwnerId||p.ownerId===null;
    for(const id of Object.keys(save.petWorld))if(String(id).startsWith('npc-pet:'))delete save.petWorld[id];
    if(save.petFileRefs)for(const id of Object.keys(save.petFileRefs))if(String(id).startsWith('npc-pet:'))delete save.petFileRefs[id];
    const visitors=new Map();
    for(const pet of action.visitors||[]){check(pet?.id&&String(pet.id).startsWith('npc-pet:')&&pet.ownerId!==save.petOwnerId,'来访宠物无效');visitors.set(pet.id,copy(pet));}
    for(const profile of action.residents||[]){const id=npcPetId(profile.id);if(!visitors.has(id))visitors.set(id,{...createNpcPet(profile,content),homeZone:save.zone});}
    const set=p=>{if(!own(p))return;if(p.ownerId===save.petOwnerId)save.pets[p.id]={...p,hp:save.pets[p.id]?.hp??petMaxHp(p,content),hunger:save.pets[p.id]?.hunger??100};else save.petWorld[p.id]=p;};
    const lookup=id=>save.pets[id]||save.petWorld[id]||visitors.get(id);
    if(action.type==='adopt'){
        if(save.petMergedIds?.includes(action.id))return {save:source,effects,babies,changed:false};
        const baby=save.petWorld[action.id]||save.pets[action.id];if(!baby&&save.petFileRefs?.[action.id]?.group==='pets')return {save:source,effects,babies,changed:false};check(baby,'宝宝已不在场景');
        const result=adoptPet(baby,{ownerId:save.petOwnerId,now:action.now,zone:save.zone},content);
        if(!result.adopted)return {save:source,effects,babies,changed:false};
        const existing=Object.values(ownedPetRecords(save)).find(p=>p.speciesId===result.pet.speciesId);
        const traits=result.pet.passiveTraits??rollPetTraits(result.pet.id,petTraitParams(content),existing?.passiveTraits);
        if(existing){
            addPet(save,content,result.pet.speciesId,result.pet.xp,{traits});
            save.petMergedIds??=[];if(!save.petMergedIds.includes(action.id))save.petMergedIds.push(action.id);
            if(save.petFileRefs)delete save.petFileRefs[action.id];
        }else set({...result.pet,passiveTraits:traits,captureCount:0,obtainedCount:1});
        delete save.petWorld[action.id];
    }else{
        const now=action.now;
        if(action.type==='feed'){
            const pet=save.pets[action.hostId];check(pet&&nutritionStock(save)>0,'需要一份营养餐');
            recordPetMeal(save,content);consumeNutrition(save);pet.hunger=Math.min(100,pet.hunger+petParams(content).foodRestore);
        }
        const seen=new Set(),pairs=[];
        for(const pair of action.pairs||[]){const key=JSON.stringify([...pair.ids].sort());if(!seen.has(key)){seen.add(key);pairs.push(pair);}}
        const ordered=pairs.length?[pairs[0],...pairs.slice(1).sort((a,b)=>JSON.stringify([...a.ids].sort()).localeCompare(JSON.stringify([...b.ids].sort())))]:[];
        for(const pair of ordered){
            let [a,b]=pair.ids.map(lookup);check(a&&b,'互动宠物尚未加载');
            if(a.ownerId!==save.petOwnerId&&b.ownerId!==save.petOwnerId)continue;
            if(['feed','meal-arrival'].includes(action.type))check(pair.ids.includes(action.hostId),'分享只能建立主人宠物与来访宠物的关系');
            const pairKey=JSON.stringify([...pair.ids].sort()),persistent=pair.ids.some(id=>action.friendPetIds?.includes(id));
            if(!persistent){
                [a,b]=[a,b].map(p=>{const old=temporaryPairs[pairKey]?.find(row=>row.id===p.id);return {...p,memories:copy(old?.memories||[]),memoryClock:old?.memoryClock||0,memorySerial:old?.memorySerial||0};});
            }
            const scene={...pair.scene,zone:save.zone,inBattle:false};
            const confirmed=action.type==='dialogue'||(['feed','meal-arrival'].includes(action.type)&&pair.ids.some(id=>action.confirmedOwners?.includes(id)));
            const interaction=interactPets(a,b,{kind:confirmed?(action.type==='dialogue'?'owner-dialogue':'manual-feed'):'proximity',now,scene,completed:confirmed},content);
            [a,b]=interaction.pets;
            const key=JSON.stringify([a,b].sort((x,y)=>x.id.localeCompare(y.id)).map(p=>[p.id,p.birthSerial+1]));
            const babyId=`baby:${save.seed}:${hashSeed(key)}:${hashSeed('birth:'+key)}`;
            const birth=confirmed&&persistent?breedPets(a,b,{now,scene,babyId},content):{pets:[a,b],baby:null,status:petPairStatus(a,b,{now,scene},content)};
            if(!persistent&&confirmed)temporaryPairs[pairKey]=copy(interaction.pets);
            if(persistent&&(interaction.markAdded||birth.baby))for(const pet of birth.pets)if(pet.ownerId===save.petOwnerId)set(pet);
            if(birth.baby){check(!save.pets[babyId]&&!save.petWorld[babyId]&&!save.petFileRefs?.[babyId],'宝宝编号冲突');set(birth.baby);babies.push(birth.baby);}
            effects.push({temporary:!persistent,ids:pair.ids,markAdded:interaction.markAdded,play:interaction.play,status:birth.status,babyId:birth.baby?.id});
        }
        if(action.type==='prune')for(const id of action.ids||[]){const p=lookup(id);if(p?.ownerId===save.petOwnerId)set(prunePetMemories(p,now,content));}
    }
    mergeOwnedPetSpecies(save,content);
    const changed=!['proximity','gesture'].includes(action.type)&&JSON.stringify(save)!==JSON.stringify(source);
    if(changed)save.revision++;
    return {save:changed?save:source,effects,babies,changed,temporaryPairs};
}
