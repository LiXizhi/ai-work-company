// rng_core.js — 可播种伪随机数（mulberry32）。
// 引擎内所有随机都必须经过这里，禁止直接使用 Math.random()，以保证同 seed 结果可复现。
// int(min, max) 与 Lua 的 math.random(min, max) 一样是闭区间。

export function createRng(seed = 1) {
    let state = (Number(seed) >>> 0) || 0x9e3779b9;

    function nextUint32() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) >>> 0;
    }

    const rng = {
        seed,
        /** [0, 1) */
        float() {
            return nextUint32() / 4294967296;
        },
        /** 闭区间整数，等价 Lua math.random(min, max) */
        int(min, max) {
            min = Math.floor(min);
            max = Math.floor(max);
            if (max < min) [min, max] = [max, min];
            return min + Math.floor(rng.float() * (max - min + 1));
        },
        pick(arr) {
            if (!arr || arr.length === 0) return undefined;
            return arr[rng.int(0, arr.length - 1)];
        },
        /** 原地 Fisher-Yates */
        shuffle(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = rng.int(0, i);
                const tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
            }
            return arr;
        },
        /** 派生子 rng（用于 worker 分片） */
        fork() {
            return createRng(nextUint32());
        },
        state() {
            return state;
        },
    };
    return rng;
}

/** 把任意字符串 hash 成 32 位 seed */
export function hashSeed(text) {
    let h = 2166136261;
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
