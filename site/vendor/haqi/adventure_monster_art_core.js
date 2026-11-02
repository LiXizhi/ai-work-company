// Appearance lookup is independent of combat stats, pet capture identity and saves.
const normalize=v=>String(v||'').replaceAll('\\','/').toLowerCase();
export function monsterArtBinding(monster,art){
    if(!monster)return null;
    const source=normalize(monster.appearanceSource||monster.source||monster.id),model=normalize(monster.attributes?.asset||monster.model);
    return art?.bindings?.[source+'|'+model]||art?.models?.[model]||(monster.speciesId?{kind:'pet',petId:monster.speciesId}:null);
}
export function validateMonsterArt(art,pets){
    if(art?.version!==1||!art.entries||!art.bindings||!art.models)throw Error('怪物美术清单无效');
    for(const [id,e] of Object.entries(art.entries))if(!(e.width===256&&e.height===256&&e.size>0&&e.size<48000&&/^https:\/\/cdn\.keepwork\.com\/.+\.webp$/.test(e.cdn)&&/^[a-f0-9]{64}$/.test(e.sha256)))throw Error('Boss图片尚未准备完整：'+id);
    for(const b of [...Object.values(art.bindings),...Object.values(art.models)]){
        if(b.kind==='portrait'? !art.entries[b.id]: b.kind==='pet'? !pets[b.petId]?.art: true)throw Error('怪物外观缺少资源');
    }
    return art;
}
