// Chinese source strings are the dictionary keys. zh-CN has no file.

export const LOCALES = [
    { id: 'zh-CN', name: '中文', englishName: 'Chinese', speech: 'zh-CN' },
    { id: 'en', name: 'English', englishName: 'English', speech: 'en-US' },
    { id: 'ja', name: '日本語', englishName: 'Japanese', speech: 'ja-JP' },
    { id: 'ko', name: '한국어', englishName: 'Korean', speech: 'ko-KR' },
];

const IDS = new Set(LOCALES.map(row => row.id));

export function isLocaleId(id) {
    return IDS.has(id);
}

export function localeById(id) {
    return LOCALES.find(row => row.id === id) || LOCALES[0];
}

export function speechCode(id) {
    return localeById(id).speech;
}

export function lookup(sourceZh, locale, dictionaries = {}) {
    const source = String(sourceZh ?? '');
    if (!source || locale === 'zh-CN' || !IDS.has(locale)) return source;
    const table = dictionaries[locale];
    if (!table || !Object.hasOwn(table, source)) return source;
    const value = table[source];
    return typeof value === 'string' && value ? value : source;
}

export function pairAllowed(native, target) {
    return IDS.has(native) && IDS.has(target) && native !== target;
}

// The longest run of "|" on the line is the separator. A tie is skipped.
export function splitLocaleLine(line) {
    const runs = [...String(line).matchAll(/\|+/g)];
    if (!runs.length) return null;
    const longest = Math.max(...runs.map(run => run[0].length));
    const winners = runs.filter(run => run[0].length === longest);
    if (winners.length !== 1) return null;
    const at = winners[0].index;
    const key = line.slice(0, at);
    const value = line.slice(at + longest);
    if (!key) return null;
    return { key, value };
}

function decodeLocaleField(text) {
    return text.replace(/\\n/g, '\n');
}

// A blank translation is a known key. Newlines are stored as \n. The longest "|" run is one longer than any run in the text.
export function formatLocaleLine(key, value = '') {
    const source = String(key).replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '\\n');
    const translated = String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '\\n');
    if (!source) return null;
    const runs = [...`${source}\n${translated}`.matchAll(/\|+/g)];
    const longest = runs.reduce((max, run) => Math.max(max, run[0].length), 1);
    return `${source}${'|'.repeat(longest + 1)}${translated}`;
}

// A leading # with no "|" is a source note, not a dictionary key.
export function isLocaleComment(line) {
    const trimmed = String(line).trim();
    return trimmed.startsWith('#') && !trimmed.includes('|');
}

export function stripLocaleComments(text) {
    return String(text || '').split(/\r?\n/).filter(line => !isLocaleComment(line)).join('\n');
}

export function localeIdsToLoad(save) {
    if (!save) return [];
    const learning = save.languageLearning && typeof save.languageLearning === 'object' ? save.languageLearning : null;
    const ids = learning?.enabled === true ? [save.locale, learning.target, learning.native] : [save.locale];
    return [...new Set(ids.filter(id => IDS.has(id) && id !== 'zh-CN'))];
}

export function parseLocaleFile(text) {
    const table = {};
    for (const raw of String(text || '').split(/\r?\n/)) {
        if (!raw.trim() || isLocaleComment(raw)) continue;
        const pair = splitLocaleLine(raw);
        if (!pair) continue;
        const key = decodeLocaleField(pair.key);
        if (Object.hasOwn(table, key)) continue;
        table[key] = decodeLocaleField(pair.value);
    }
    return table;
}

export function diffLocaleLines(baseText, otherText) {
    const base = parseLocaleFile(baseText);
    const other = parseLocaleFile(otherText);
    const missing = Object.keys(base).filter(key => !Object.hasOwn(other, key));
    const extra = Object.keys(other).filter(key => !Object.hasOwn(base, key));
    return { missing, extra };
}

export function normalizeLocaleSave(save) {
    if (!IDS.has(save.locale)) save.locale = 'zh-CN';
    const learning = save.languageLearning && typeof save.languageLearning === 'object' ? save.languageLearning : {};
    const native = IDS.has(learning.native) ? learning.native : 'zh-CN';
    let target = IDS.has(learning.target) ? learning.target : 'en';
    if (native === target) target = native === 'en' ? 'zh-CN' : 'en';
    save.languageLearning = { enabled: learning.enabled !== false, native, target, autoSpeak: learning.autoSpeak === true,
        autoReadDialogue:learning.autoReadDialogue!==false,
        selectionConfirmed:learning.selectionConfirmed===true||(learning.selectionConfirmed===undefined&&IDS.has(learning.target)),
        showChinese:learning.showChinese!==false,
        model:typeof learning.model==='string'?learning.model.slice(0,160):'',
        voiceType:typeof learning.voiceType==='string'?learning.voiceType.slice(0,160):'' };
    if (typeof save.learnerMemory !== 'string') save.learnerMemory = '';
    return save;
}
