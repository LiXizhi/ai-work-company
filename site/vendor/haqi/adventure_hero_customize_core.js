// Paid name and base-head changes. Same 50 magic-bean price as totem conversion.
import {resolvedBodyId,validHeroBodyId} from './hero_body_core.js';
import {publicPhotoHead} from './photo_head_core.js';
export const HERO_NAME_BEANS = 50;
export const HERO_LOOK_BEANS = 50;
const HEAD_PATTERN = /^[a-z0-9-]{1,64}$/;
const suffix = appearance => appearance === 'girl' ? '-girl' : '-boy';

export function resolvedHeadId(save) {
    const girl = save.appearance === 'girl';
    const id = save.headId;
    if (typeof id === 'string' && HEAD_PATTERN.test(id) && id.endsWith(suffix(girl ? 'girl' : 'boy'))) return id;
    return girl ? 'elf-girl' : 'elf-boy';
}

export function heroCustomizeQuote(save, { name, appearance, headId, bodyId, customHead } = {}) {
    const nextName = typeof name === 'string' ? name.trim() : '';
    const nextAppearance = appearance === 'girl' || appearance === 'boy' ? appearance : null;
    const nextHead = typeof headId === 'string' ? headId : '';
    const nameChanged = nextName.length > 0 && nextName.length <= 16 && nextName !== save.name;
    const headOk = HEAD_PATTERN.test(nextHead) && !!nextAppearance && nextHead.endsWith(suffix(nextAppearance));
    const nextBody=bodyId??resolvedBodyId({...save,appearance:nextAppearance});
    const bodyOk=validHeroBodyId(nextBody,nextAppearance);
    let nextCustom;try{if(customHead)nextCustom=publicPhotoHead(customHead,{id:nextHead,appearance:nextAppearance});}catch{/* Invalid descriptors do not qualify for a free change. */}
    const lookChanged = headOk && bodyOk && (nextAppearance !== save.appearance || nextHead !== resolvedHeadId(save)||nextBody!==resolvedBodyId(save)||JSON.stringify(nextCustom)!==JSON.stringify(save.customHead));
    const nameCost = nameChanged ? HERO_NAME_BEANS : 0;
    const freeHeadChange=!!nextCustom&&nextAppearance===save.appearance&&nextBody===resolvedBodyId(save);
    const lookCost = lookChanged && !freeHeadChange ? HERO_LOOK_BEANS : 0;
    return { nameChanged, lookChanged, nameCost, lookCost, total: nameCost + lookCost, nextName, nextAppearance, nextHead, nextBody, nextCustom };
}

export function customizeHero(save, patch) {
    if (save.pendingEncounter) throw Error('请先完成当前战斗');
    const nextName = typeof patch?.name === 'string' ? patch.name.trim() : '';
    if (!nextName || nextName.length > 16) throw Error('名字需要一至十六个字');
    const appearance = patch?.appearance;
    if (appearance !== 'girl' && appearance !== 'boy') throw Error('请选择基础头部形象');
    const headId = patch?.headId;
    if (typeof headId !== 'string' || !HEAD_PATTERN.test(headId) || !headId.endsWith(suffix(appearance))) throw Error('头部形象和性别不一致');
    const bodyId=patch.bodyId??resolvedBodyId({...save,appearance});
    if(!validHeroBodyId(bodyId,appearance))throw Error('身体形象和性别不一致');
    const customHead=patch.customHead?publicPhotoHead(patch.customHead,{id:headId,appearance}):undefined;
    const quote = heroCustomizeQuote(save, { name: nextName, appearance, headId, bodyId, customHead });
    if (!quote.nameChanged&&!quote.lookChanged) throw Error('名字和形象都没有变化');
    const balance = save.inventory[984] ?? 0;
    if (!Number.isSafeInteger(balance) || balance < quote.total) {
        if (quote.nameChanged && quote.lookChanged) throw Error('改名字和形象需要100魔豆');
        if (quote.nameChanged) throw Error('改名字需要50魔豆');
        throw Error('改形象需要50魔豆');
    }
    save.inventory[984] = balance - quote.total;
    if (quote.nameChanged) save.name = nextName;
    if (quote.lookChanged) {
        save.appearance = appearance;
        save.headId = headId;
        save.bodyId = bodyId;
        if(customHead)save.customHead=customHead;else delete save.customHead;
    }
    return quote;
}
