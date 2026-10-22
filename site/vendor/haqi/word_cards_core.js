import {createRng,hashSeed} from './rng_core.js';

export function validateWordCards(rows,cards){
    if(!Array.isArray(rows)||rows.length>60)throw Error('文字卡配置无效');
    const ids=new Set();
    for(const row of rows){
        if(!row||!['zh','en'].includes(row.language)||typeof row.entryId!=='string'||row.id!==`${row.language}:${row.entryId}`||ids.has(row.id)||!cards[row.baseCardKey]||['title','readText','description'].some(k=>typeof row[k]!=='string'||!row[k].trim()||row[k].length>160))throw Error('文字卡配置无效');
        ids.add(row.id);
    }
    return rows;
}
export function recentWordCards(state,rows,limit=10){
    limit=Number.isInteger(limit)?Math.max(0,Math.min(10,limit)):10;
    return rows.map(row=>({row,at:Math.max(state?.languages?.[row.language]?.entries?.[row.entryId]?.lastAttemptAt||0,state?.languages?.[row.language]?.entries?.[row.entryId]?.lastReviewAt||0)}))
        .filter(r=>Number.isFinite(r.at)&&r.at>0).sort((a,b)=>b.at-a.at||a.row.id.localeCompare(b.row.id)).slice(0,limit).map(r=>structuredClone(r.row));
}
export function makeWordCardSnapshot(state,rows,seed,limit=10){
    return {version:2,cards:createRng(hashSeed(`${seed}:word-cards`)).shuffle(recentWordCards(state,rows,limit)),activated:[]};
}
export function installWordCards(unit,snapshot,cards){
    if(!snapshot)return;
    if(![1,2].includes(snapshot.version)||!Array.isArray(snapshot.cards)||snapshot.cards.length>10||!Array.isArray(snapshot.activated)||new Set(snapshot.activated).size!==snapshot.activated.length||snapshot.activated.some(id=>!snapshot.cards.some(c=>c.id===id)))throw Error('文字卡检查点无效');
    validateWordCards(snapshot.cards,cards);
    unit.wordCards={};unit.wordCardRulesVersion=snapshot.version;
    // Appended stable sequences keep ordinary and pet card identities intact.
    for(const row of snapshot.cards){const seq=unit.deckSeq.length;unit.deckSeq.push(row.baseCardKey);unit.deckMap.push(0);unit.wordCards[seq]={...structuredClone(row),activated:false};}
}
export function prepareWordHand(unit,size){
    const inHand=unit.deckMap.reduce((a,s,i)=>s===1?[...a,i]:a,[]);
    // V2 guarantees a word slot even when ordinary cards were prepared before installation.
    // Return the last ordinary card to the draw pool; never consume or reorder it.
    if(unit.wordCardRulesVersion>=2&&size>0&&inHand.length>=size&&!inHand.some(i=>unit.wordCards[i])&&unit.deckMap.some((s,i)=>s===0&&unit.wordCards[i])){
        const seq=inHand.pop();unit.deckMap[seq]=0;
    }
    let free=size-inHand.length;if(free<=0)return;
    const normal=[],words=[];
    unit.deckMap.forEach((s,i)=>{if(s===0)(unit.wordCards[i]?words:normal).push(i);});
    const hasWord=inHand.some(i=>unit.wordCards[i]);
    const normalCount=Math.min(normal.length,Math.max(0,free-(!hasWord&&words.length?1:0)));
    for(const i of normal.slice(0,normalCount)){unit.deckMap[i]=1;free--;}
    for(const i of words.slice(0,free)){unit.deckMap[i]=1;free--;}
    for(const i of normal.slice(normalCount,normalCount+free))unit.deckMap[i]=1;
}
export function activateWordCard(unit,seq){
    if(unit.deckMap[seq]!==1||!unit.wordCards?.[seq])throw Error('文字卡不在手中');
    unit.wordCards[seq].activated=true;
}
export function wordReadingMatches(actual,expected){
    const normalize=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
    return !!normalize(actual)&&normalize(actual)===normalize(expected);
}
// Only real successful exercises may satisfy island tasks; collection fragments never do.
export function syncDictionaryQuestProgress(save,content,state){
    let changed=false;
    for(const quest of content.questCatalog?.quests||content.catalogQuests?.quests||[]){
        const record=save.quests?.[quest.id];if(!record?.accepted||record.claimed)continue;
        for(const group of quest.groups||[])if(group.kind==='hanzi')for(const item of group.items){
            if(state?.languages?.zh?.entries?.[item.id]?.learned||Number.isFinite(state?.languages?.zh?.entries?.[item.id]?.lastPracticeSuccessAt)||save.hanzi?.entries?.[item.id]?.attempts?.some(a=>['write','speak'].includes(a.method))){if(record.wordPracticeVersion!==1){record.wordPracticeVersion=1;for(const g of quest.groups||[])if(g.kind==='hanzi')for(const i of g.items){record.progress||={};delete record.progress[`hanzi:${i.id}`];}changed=true;}record.progress||={};if(record.progress[`hanzi:${item.id}`]!==1){record.progress[`hanzi:${item.id}`]=1;changed=true;}}
        }
    }
    return changed;
}
