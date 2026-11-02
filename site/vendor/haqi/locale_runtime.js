// Identity until the browser locale module installs a translator. Safe for Node tests.
let translate = value => value;
let translatorLocale='zh-CN';
const translationObservers=new Set();
export function observeTranslations(listener){translationObservers.add(listener);return ()=>translationObservers.delete(listener);}
export function notifyTranslation(source,text,locale){for(const listener of translationObservers){try{listener({source,text,locale});}catch{/* Observation must never interrupt presentation. */}}}

export function setTranslator(fn,locale='zh-CN') {
    translate = typeof fn === 'function' ? fn : value => value;
    translatorLocale=locale;
}

const CJK = /[\u4e00-\u9fff]/;

export function tr(value) {
    const source = String(value ?? '');
    const text=translate(source);notifyTranslation(source,text,translatorLocale);return text;
}

function slot(value) {
    const raw = value == null ? '' : String(value);
    return CJK.test(raw) ? tr(raw) : raw;
}

// Translate a Chinese pattern, then substitute {tokens}. Chinese slot values are looked up too.
export function fill(pattern, vars = {}) {
    const source = String(pattern ?? '');
    let text = tr(source);
    let zh = source;
    for (const [key, value] of Object.entries(vars)) {
        const raw = value == null ? '' : String(value);
        const token = `{${key}}`;
        text = text.replaceAll(token, slot(value));
        zh = zh.replaceAll(token, raw);
    }
    return { zh, text };
}

export function setText(node, source, vars) {
    if (vars) {
        const filled = fill(source, vars);
        if (node?.dataset) node.dataset.zh = filled.zh;
        if (node) node.textContent = filled.text;
        return node;
    }
    const text = String(source ?? '');
    if (node?.dataset) node.dataset.zh = text;
    if (node) node.textContent = tr(text);
    return node;
}
