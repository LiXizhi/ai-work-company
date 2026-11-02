import {normalizeSpeech} from './language_adventure_core.js';

function speechTokens(text,locale){
    const words=normalizeSpeech(text,locale).match(/[\p{L}\p{N}]+/gu)||[];
    return locale==='zh-CN'?words.flatMap(word=>[...word]):words;
}
function similarWord(expected,heard,locale){
    if(expected===heard)return true;
    // Forgive a missing plural/verb ending and small ASR spelling differences.
    // Short function words and Chinese characters still need an exact match.
    if(locale!=='en'||Math.min(expected.length,heard.length)<3)return false;
    const limit=Math.max(1,Math.floor(expected.length/4));
    if(Math.abs(expected.length-heard.length)>limit)return false;
    let row=Array.from({length:heard.length+1},(_,i)=>i);
    for(let i=1;i<=expected.length;i++){
        const next=[i];
        for(let j=1;j<=heard.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(expected[i-1]!==heard[j-1]));
        row=next;
    }
    return row[heard.length]<=limit;
}
// Target-word coverage, not pronunciation: order, repetitions and extra speech do not penalize.
export function compareDungeonSpeech(transcript,expected,locale){
    const heard=speechTokens(transcript,locale),target=speechTokens(expected,locale);
    const matched=word=>heard.some(candidate=>similarWord(word,candidate,locale));
    const differences=target.filter(word=>!matched(word)).map(word=>({expected:word,heard:''}));
    // Preserve original casing, punctuation and spacing for inline feedback, including contractions.
    const parts=[];let offset=0;
    const pattern=locale==='zh-CN'?/[\p{L}\p{N}]/gu:/[\p{L}\p{N}]+(?:['’‘][\p{L}\p{N}]+)*/gu;
    for(const match of String(expected||'').matchAll(pattern)){
        if(match.index>offset)parts.push({text:expected.slice(offset,match.index),missing:false});
        const missing=speechTokens(match[0],locale).some(word=>!matched(word));
        parts.push({text:match[0],missing,matched:!missing});
        offset=match.index+match[0].length;
    }
    if(offset<String(expected||'').length)parts.push({text:expected.slice(offset),missing:false});
    return {accuracy:target.length?1-differences.length/target.length:0,differences,parts,transcript:String(transcript||'')};
}
