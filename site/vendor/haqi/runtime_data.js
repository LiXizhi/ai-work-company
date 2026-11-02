// Browser IO only. Source mode reads individual files; Vite releases read packs.
const productionPacks = typeof __HAQI_PACKED_DATA__ !== 'undefined' && __HAQI_PACKED_DATA__;

const defaultRequest=(...args)=>fetch(...args),sharedPacks=new WeakMap();
export function createJsonReader({ packed = productionPacks, request = defaultRequest, onProgress } = {}) {
    const pending = new Map();
    const transport=request===defaultRequest?globalThis.fetch:request;
    if(!sharedPacks.has(transport))sharedPacks.set(transport,new Map());
    const packPending=sharedPacks.get(transport);
    async function download(url) {
        const response = await request(url, packed ? undefined : { cache: 'no-cache' });
        if (!response.ok) throw new Error(`无法读取 ${url}（${response.status}）`);
        if (onProgress) {
            const length = Number(response.headers?.get('content-length'));
            const encoding = response.headers?.get('content-encoding');
            const total = (!encoding || encoding === 'identity') && length > 0 ? length : null;
            let loaded = 0;
            onProgress({ url, loaded, total, done: false });
            if (response.body?.getReader) {
                const reader = response.body.getReader(), decoder = new TextDecoder();
                const chunks = [];
                try {
                    while (true) {
                        const chunk = await reader.read();
                        if (chunk.done) break;
                        loaded += chunk.value.byteLength;
                        chunks.push(decoder.decode(chunk.value, { stream: true }));
                        onProgress({ url, loaded, total, done: false });
                    }
                    chunks.push(decoder.decode());
                    const value = JSON.parse(chunks.join(''));
                    onProgress({ url, loaded, total, done: true });
                    return value;
                } finally {
                    reader.releaseLock();
                }
            }
            const value = await response.json();
            onProgress({ url, loaded, total, done: true });
            return value;
        }
        return response.json();
    }
    return async function readJson(url) {
        const key = String(url).replace(/^\.\//, '');
        // The prologue is emitted as standalone JSON, outside the startup packs.
        if (!packed || /^data\/prologue\/(script|art)\.json$/.test(key)) {
            if(!pending.has(url))pending.set(url,download(url).finally(()=>pending.delete(url)));
            return structuredClone(await pending.get(url));
        }
        const match = /^data\/(adventure|kids|teen|sample)\/((?:(?:maps|island-packs|dictionary)\/)?[a-zA-Z0-9_-]+\.json)$/.exec(key);
        if (!match) throw new Error(`未知的数据路径：${url}`);
        const group = match[2] === 'manifest.json' && match[1] !== 'adventure' ? 'datasets' : match[1];
        const packUrl = `data/${group}.json`;
        if (!packPending.has(packUrl)) {
            packPending.set(packUrl, download(packUrl).then(pack => {
                if (pack?.schemaVersion !== 1 || !pack.files) throw new Error(`数据包格式无效：${packUrl}`);
                return pack;
            }).catch(error => { packPending.delete(packUrl); throw error; }));
        }
        const pack = await packPending.get(packUrl);
        if (!Object.hasOwn(pack.files, key)) throw new Error(`数据包缺少：${key}`);
        // Dataset normalization / adventure expansion mutate returned objects.
        // Each read must remain isolated, just like a fresh response.json().
        return structuredClone(pack.files[key]);
    };
}

export const fetchJson = createJsonReader();
