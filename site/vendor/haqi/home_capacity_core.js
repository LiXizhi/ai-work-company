// Counts belong to the home, not the bag. Terrain and residents do not consume slots.
export const HOME_OBJECT_LIMIT=20000;
export const isHomeChunk=key=>/^chunk:-?\d+,-?\d+$/.test(key);
export function homeCapacity(home){
 const keys=Object.keys(home.parts||{}).filter(isHomeChunk),counts=home.objectCounts||{};
 const known=keys.every(k=>Number.isSafeInteger(counts[k])&&counts[k]>=0);
 return {used:known?keys.reduce((n,k)=>n+counts[k],0):null,limit:HOME_OBJECT_LIMIT};
}
export function assertHomeCapacity(before,after,limit=HOME_OBJECT_LIMIT){
 // Existing over-limit homes remain editable; only net growth is rejected.
 if(after>before&&after>limit)throw Error(`家园容量不足：最多 ${limit.toLocaleString('en-US')} 件，目前 ${before.toLocaleString('en-US')} 件，本次新增 ${after-before} 件。请先拆除一些物件。`);
}
