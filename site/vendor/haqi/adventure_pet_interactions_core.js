import {validatePetGrowth} from './adventure_pet_traits_core.js';
// Web adventure rules, not an original Lua combat formula. Clock and scene truth are injected.
import {createRng,hashSeed} from './rng_core.js';
import {mapCoordinateVersion} from './adventure_coordinates_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {petParams,petXpLevel,recommendedPetDeck,validatePetDeck} from './adventure_pets_core.js';
import {petInteractionParams} from './adventure_pet_meeting_core.js';
export {petInteractionParams};

export const PET_INSTANCE_VERSION=1;
const copy=value=>JSON.parse(JSON.stringify(value));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const identifier=id=>typeof id==='string'&&id.length>0&&id.length<=240&&!/[\u0000-\u001f]/.test(id);
const order=(a,b)=>a<b?-1:a>b?1:0;
export function petFriendDay(now){
    check(integer(now),'宠物互动时间无效');
    return Math.floor((now+8*3600000)/86400000);
}
export function createPetInstance(content,{id,speciesId,ownerId,xp=0,gender,deck,appearanceStage,passiveTraits,captureCount,obtainedCount}={}){
    check(identifier(id)&&identifier(ownerId)&&Object.hasOwn(content.pets,speciesId),'宠物实例身份无效');
    check(integer(xp),'宠物经验无效');
    const pet={version:PET_INSTANCE_VERSION,id,ownerId,speciesId,xp,level:petXpLevel(xp,content),
        gender:gender??createRng(hashSeed(`pet-gender:${id}`)).pick(['male','female']),
        cooldownUntil:0,birthSerial:0,memorySerial:0,memoryClock:0,memories:[],deck:[]};
    if(passiveTraits!==undefined)pet.passiveTraits=copy(passiveTraits);
    if(captureCount!==undefined)pet.captureCount=captureCount;
    if(obtainedCount!==undefined)pet.obtainedCount=obtainedCount;
    pet.deck=deck?copy(deck):recommendedPetDeck(pet,content);
    if(appearanceStage!==undefined)pet.appearanceStage=appearanceStage;
    validatePetInstance(pet,content);return pet;
}
export function validatePetInstance(pet,content){
    validatePetGrowth(pet);
    check(pet?.version===PET_INSTANCE_VERSION&&identifier(pet.id)&&Object.hasOwn(content.pets,pet.speciesId),'宠物实例身份无效');
    check(pet.ownerId===null||identifier(pet.ownerId),'宠物主人无效');
    check(['male','female'].includes(pet.gender),'宠物性别无效');
    check(integer(pet.xp)&&pet.level===petXpLevel(pet.xp,content),'宠物等级无效');
    check(['cooldownUntil','birthSerial','memorySerial','memoryClock'].every(key=>integer(pet[key])),'宠物关系计数无效');
    check(content.pets[pet.speciesId]?.staticAppearance?pet.appearanceStage===undefined||pet.appearanceStage===0:pet.appearanceStage===undefined||Number.isInteger(pet.appearanceStage)&&pet.appearanceStage>=0&&pet.appearanceStage<petParams(content).stageLevels.filter(n=>pet.level>=n).length,'宠物外观无效');
    validatePetDeck(pet,content,pet.deck);
    check(Array.isArray(pet.memories),'宠物记忆无效');
    const seen=new Set();
    for(const row of pet.memories){
        check(identifier(row?.otherId)&&row.otherId!==pet.id&&!seen.has(row.otherId)&&identifier(row.ownerId)&&row.ownerId!==pet.ownerId,'宠物记忆对象无效');seen.add(row.otherId);
        check(Number.isInteger(row.level)&&row.level>=1&&row.level<=petParams(content).levelCap,'宠物记忆等级无效');
        check(identifier(row.epoch)&&integer(row.lastAt)&&row.lastAt<=pet.memoryClock&&integer(row.total)&&integer(row.available)&&row.available<=row.total,'宠物印记无效');
        check(Number.isInteger(row.lastMarkDay)&&row.lastMarkDay>=-1&&row.lastMarkDay<=petFriendDay(pet.memoryClock),'宠物印记日期无效');
    }
    if(pet.birth){
        const birth=pet.birth;
        check(Array.isArray(birth.parents)&&birth.parents.length===2&&new Set(birth.parents).size===2&&birth.parents.every(id=>identifier(id)&&id!==pet.id),'宠物亲缘无效');
        check(identifier(birth.zone)&&integer(birth.at)&&integer(birth.seed)&&Number.isFinite(birth.anchor?.x)&&Number.isFinite(birth.anchor?.y),'宝宝出生记录无效');
        check(birth.adoptedAt===null||integer(birth.adoptedAt)&&birth.adoptedAt>=birth.at,'宝宝领养记录无效');
        check((birth.adoptedAt===null)===(pet.ownerId===null),'宝宝归属不一致');
    }else check(pet.ownerId!==null,'无主宠物缺少出生记录');
    return pet;
}
// Each pet keeps the most recent relationships, capped by memoryCapacity. Recency is lastAt.
export function prunePetMemories(pet,now,content){
    check(integer(now),'宠物互动时间无效');
    const p=petInteractionParams(content),at=Math.max(now,pet.memoryClock);
    const keep=[...pet.memories].sort((a,b)=>b.lastAt-a.lastAt||order(a.otherId,b.otherId)).slice(0,p.memoryCapacity)
        .sort((a,b)=>order(a.otherId,b.otherId));
    const changed=JSON.stringify(keep)!==JSON.stringify(pet.memories);
    // Reading a pet alone never creates a time-only durable write.
    return changed?{...copy(pet),memoryClock:at,memories:copy(keep)}:copy(pet);
}
function pairRows(a,b){return [a.memories.find(row=>row.otherId===b.id),b.memories.find(row=>row.otherId===a.id)];}
function sameRelationship(left,right){return left&&right&&left.epoch===right.epoch;}
function rememberedRow(left,right){return sameRelationship(left,right)||!!left!==!!right?left||right:null;}
function mirrorRow(row,other){return {...row,otherId:other.id,ownerId:other.ownerId,level:other.level};}
function reconcile(left,right){
    // A matching epoch must be atomically saved on both pets. A mismatch is a conflict, not bonus progress.
    check(left.total===right.total&&left.available===right.available&&left.lastMarkDay===right.lastMarkDay,'宠物关系版本冲突，请重新读取');
}
function sceneEligible(a,b,scene,content){
    const p=petInteractionParams(content);
    return a.id!==b.id&&a.ownerId&&b.ownerId&&a.ownerId!==b.ownerId&&!(a.ownerId.startsWith('npc:')&&b.ownerId.startsWith('npc:'))&&!scene.inBattle&&
        identifier(scene.zone)&&Number.isFinite(scene.distance)&&scene.distance>=0&&scene.distance<=p.interactionDistance;
}
// Returns staged copies. Only an acknowledged storage commit may replace live state.
export function interactPets(left,right,{kind,now,scene,completed=false},content){
    validatePetInstance(left,content);validatePetInstance(right,content);check(integer(now),'宠物互动时间无效');
    const eligible=sceneEligible(left,right,scene,content);
    if(!eligible||!completed||!['owner-dialogue','manual-feed'].includes(kind))return {pets:[copy(left),copy(right)],markAdded:false,play:eligible};
    let a=prunePetMemories(left,now,content),b=prunePetMemories(right,now,content);
    const at=Math.max(now,a.memoryClock,b.memoryClock),day=petFriendDay(at);
    a.memoryClock=b.memoryClock=at;
    let [ra,rb]=pairRows(a,b);
    const priorDay=Math.max(ra?.lastMarkDay??-1,rb?.lastMarkDay??-1);
    if(sameRelationship(ra,rb))reconcile(ra,rb);
    else if(ra&&!rb){rb=mirrorRow(ra,a);b.memories=b.memories.filter(r=>r.otherId!==a.id);b.memories.push(rb);}
    else if(rb&&!ra){ra=mirrorRow(rb,b);a.memories=a.memories.filter(r=>r.otherId!==b.id);a.memories.push(ra);}
    else{
        a.memorySerial++;b.memorySerial++;
        // Epoch includes complete participant identities without growing through generations.
        const token=JSON.stringify([[a.id,a.memorySerial],[b.id,b.memorySerial]].sort((x,y)=>order(x[0],y[0])));
        const epoch=`r-${hashSeed(token)}-${hashSeed('epoch:'+token)}`;
        ra={otherId:b.id,ownerId:b.ownerId,level:b.level,lastAt:at,epoch,total:0,available:0,lastMarkDay:priorDay};
        rb={...ra,otherId:a.id,ownerId:a.ownerId,level:a.level};
        a.memories=a.memories.filter(r=>r.otherId!==b.id);a.memories.push(ra);
        b.memories=b.memories.filter(r=>r.otherId!==a.id);b.memories.push(rb);
    }
    const markAdded=day>priorDay;
    for(const [row,other] of [[ra,b],[rb,a]]){
        row.lastAt=at;row.level=other.level;
        if(markAdded){row.total++;row.available++;row.lastMarkDay=day;}
    }
    a=prunePetMemories(a,at,content);b=prunePetMemories(b,at,content);
    return {pets:[a,b],markAdded,play:true};
}
export function petPairStatus(a,b,{now,scene},content){
    check(integer(now),'宠物互动时间无效');
    const [ra,rb]=pairRows(a,b),p=petInteractionParams(content);
    const same=sameRelationship(ra,rb),remembered=rememberedRow(ra,rb);
    if(same)reconcile(ra,rb);
    const available=remembered?remembered.available:0,at=Math.max(now,a.memoryClock,b.memoryClock);
    const base={available,progress:Math.min(1,available/p.marksRequired),canBreed:false};
    if(!sceneEligible(a,b,scene,content))return {...base,reason:'需要在场景中靠近'};
    if(a.gender===b.gender||Math.min(a.level,b.level)<petParams(content).stageLevels[2])return {...base,reason:'玩伴'};
    if(at<Math.max(a.cooldownUntil,b.cooldownUntil))return {...base,reason:'冷却中'};
    if(available<p.marksRequired)return {...base,reason:'好友印记不足'};
    return {...base,canBreed:true,reason:'可以迎接宝宝'};
}
export function breedPets(left,right,{now,scene,babyId},content){
    validatePetInstance(left,content);validatePetInstance(right,content);
    left=prunePetMemories(left,now,content);right=prunePetMemories(right,now,content);
    const status=petPairStatus(left,right,{now,scene},content);
    if(!status.canBreed)return {pets:[copy(left),copy(right)],baby:null,status};
    check(identifier(babyId)&&babyId!==left.id&&babyId!==right.id,'宝宝实例编号无效');
    check(Number.isFinite(scene.anchor?.x)&&Number.isFinite(scene.anchor?.y)&&scene.walkable===true,'宝宝出生位置不可行走');
    const candidates=Object.keys(content.pets).filter(id=>!content.pets[id].legacy&&!content.pets[id].staticAppearance&&[content.pets[left.speciesId].school,content.pets[right.speciesId].school].includes(content.pets[id].school)).sort(order);
    check(candidates.length,'父母系别没有可用宝宝');
    const a=copy(left),b=copy(right),at=Math.max(now,a.memoryClock,b.memoryClock),p=petInteractionParams(content);
    const ids=[a,b].sort((x,y)=>order(x.id,y.id));
    const seed=hashSeed(JSON.stringify(ids.map(p=>[p.id,p.birthSerial+1]))),rng=createRng(seed);
    const baby=createPetInstance(content,{id:babyId,speciesId:rng.pick(candidates),ownerId:'birth',gender:rng.pick(ids).gender});
    baby.ownerId=null;baby.birth={parents:ids.map(p=>p.id),at,seed,zone:scene.zone,anchor:{x:scene.anchor.x,y:scene.anchor.y},...(scene.zone==='camp'?{coordinateVersion:mapCoordinateVersion(scene.zone,content)}:{}),adoptedAt:null};
    for(const pet of [a,b]){pet.birthSerial++;pet.cooldownUntil=at+p.cooldownMs;pet.memoryClock=at;}
    for(const row of pairRows(a,b))if(row)row.available-=p.marksRequired;
    validatePetInstance(baby,content);return {pets:[a,b],baby,status};
}
export function adoptPet(baby,{ownerId,now,zone,inBattle=false},content){
    validatePetInstance(baby,content);check(identifier(ownerId)&&integer(now),'领养信息无效');
    check(baby.birth&&!inBattle&&baby.birth.zone===zone,'请在宝宝所在场景领养');
    if(baby.birth.adoptedAt!==null){check(baby.ownerId===ownerId,'宝宝已被领养');return {pet:copy(baby),adopted:false};}
    check(now>=baby.birth.at,'领养时间无效');
    const pet=copy(baby);pet.ownerId=ownerId;pet.birth.adoptedAt=now;
    return {pet,adopted:true};
}
export function recordPetMeeting(current,{petId,otherId,at},content){
    check(identifier(petId)&&identifier(otherId)&&petId!==otherId&&integer(at),'宠物相遇记录无效');
    const cap=petInteractionParams(content).memoryCapacity;
    const book=current&&typeof current==='object'&&!Array.isArray(current)?copy(current):{};
    const rows=(Array.isArray(book[petId])?book[petId]:[]).filter(row=>row?.otherId!==otherId);
    rows.unshift({otherId,at});
    book[petId]=rows.slice(0,cap);
    return book;
}
export function validatePetMeetings(save){
    if(save.petMeetings===undefined)return;
    check(save.petMeetings&&typeof save.petMeetings==='object'&&!Array.isArray(save.petMeetings),'宠物相遇记录无效');
    const cap=petInteractionParams({}).memoryCapacity;
    for(const [id,rows] of Object.entries(save.petMeetings)){
        check(identifier(id)&&Array.isArray(rows)&&rows.length<=cap,'宠物相遇记录无效');
        for(const row of rows)check(row&&identifier(row.otherId)&&row.otherId!==id&&integer(row.at),'宠物相遇记录无效');
    }
}
export function petDisplayScale(pet,content){
    return pet.birth&&pet.level<petParams(content).stageLevels[1]?petInteractionParams(content).babyScale:1;
}
export function migratePetInstances(save,content,{ownerId}={}){
    check(!save.pendingEncounter,'请先结束旧战斗再迁移宠物');
    const pets=[],formation=[];
    for(const pet of Object.values(save.pets||{}))pets.push(createPetInstance(content,{...pet,ownerId}));
    for(const key of save.formation||[])formation.push(key==null?null:save.pets[key]?.id);
    check(formation.every(id=>id===null||pets.some(p=>p.id===id)),'旧宠物阵容无效');
    return {pets,formation};
}
