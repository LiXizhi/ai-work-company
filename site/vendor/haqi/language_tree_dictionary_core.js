import {treeWordStatus} from './language_tree_core.js';
export function seedDictionaryTree(state,data){
 state.language=data.language;
 for(const e of data.entries){const id=e.text.toLowerCase();if(!Object.hasOwn(state.words,id))state.words[id]={id,ordinal:state.sequence++,source:'dictionary:'+data.language+':'+e.id,label:data.title,count:0,firstAt:0,lastAt:0,interval:0,mark:null,contexts:[],relations:[],evidence:[]};if(state.words[id].source==='dictionary:'+data.language)state.words[id].source='dictionary:'+data.language+':'+e.id;state.words[id].entryId=e.id;}
 return state;
}
export function earnedMastery(state){return [...new Set([...(state.masteryEarned||[]),...Object.values(state.words).filter(w=>treeWordStatus(w).kind==='mastered').map(w=>w.id)])].sort();}
export function validateMasteryList(value){
 if(!value)return {en:[],zh:[]};
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['en','zh'].includes(k)))throw Error('掌握清单格式无效');
 const clean={en:[],zh:[]};for(const lang of ['en','zh']){if(!Array.isArray(value[lang])||value[lang].length>50000||value[lang].some(w=>typeof w!=='string'||w.length>48||!(lang==='en'?/^[a-z]+(?:['’-][a-z]+)*$/:/^[\u3400-\u9fff]+$/u).test(w)))throw Error('掌握清单词语无效');clean[lang]=[...new Set(value[lang])].sort();}return clean;
}
export function restoreMastery(state,words){
 const earned=new Set(state.masteryEarned||[]);for(const id of words){if(!Object.hasOwn(state.words,id))state.words[id]={id,ordinal:state.sequence++,source:'mastered',label:'已掌握',count:0,firstAt:0,lastAt:0,interval:0,mark:null,contexts:[],relations:[],evidence:[]};const w=state.words[id];if(earned.has(id))continue;if(!w.mark&&!w.evidence.length){w.cloudMastered=true;w.mark='know';}}
 state.masteryEarned=[...new Set([...earned,...words])];
}
