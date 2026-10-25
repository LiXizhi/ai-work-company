// Browser IO only. Credentials/tickets live in closures and never in saves or URLs.
import {createRemotePresence, presenceAppearance} from './adventure_presence_core.js';
export const GAME_SERVER_URL = 'https://us1.gameserver.keepwork.com';
export function normalizeGameServerUrl(value) {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((!local && (url.protocol !== 'https:' || !url.hostname.endsWith('.gameserver.keepwork.com')))
        || (local && !['http:', 'https:'].includes(url.protocol))
        || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw Error('游戏服必须使用安全连接及 Keepwork 游戏服域名');
    }
    return url.origin;
}
export function createGameServerSession({getState, getCredentials, project = 'haqi', onStatus = () => {}, onReplaced = () => {},
    gatewayUrl = GAME_SERVER_URL, fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket,
    now = Date.now, setTimer = setInterval, clearTimer = clearInterval} = {}) {
    // Consumers (haqi, awc) share one gateway; rooms must stay inside their own project prefix.
    if (typeof project !== 'string' || !/^[a-z][a-z0-9-]{0,15}$/.test(project)) throw Error('游戏服项目标识无效');
    let gateway = new URL(normalizeGameServerUrl(gatewayUrl));
    let lastReceived = 0, suspended = false;
    let socket = null, abort = null, generation = 0, identity = '', online = false;
    let room = '', nextAttempt = 0, failures = 0, timer, handshakeTimer, stopped = true, connecting = false;
    let lastStatus = '', instanceId = null, requestedInstanceId = null;
    const listeners = new Set();
    const remote = createRemotePresence();
    let sentAppearance = '';
    const emit = () => { for (const listener of listeners) listener(); };
    const status = value => { if (value !== lastStatus) { lastStatus = value; onStatus(value); emit(); } };
    function disconnect() {
        remote.reset(); sentAppearance = '';
        generation++; clearTimeout(handshakeTimer); abort?.abort(); abort = null; connecting = false; online = false; instanceId = null;
        const previous = socket; socket = null; previous?.close();
    }
    function fail(epoch, denied = false, reason = '游戏服连接中断') {
        if (epoch !== generation) return;
        disconnect(); failures++; nextAttempt = now() + (denied ? 30000 : Math.min(30000, 1000 * 2 ** Math.min(failures, 5)));
        status(denied ? '游戏服身份验证失败，请重新登录 Keepwork' : `${reason}，正在重连；本地进度仍保留`);
    }
    async function connect(state, credentials) {
        const epoch = ++generation;
        const isCurrent = () => {
            if (epoch !== generation) return false;
            const latest = getState();
            try {
                const auth = getCredentials();
                if (latest?.owner === state.owner && latest?.roleId === state.roleId
                    && auth?.username === credentials.username && auth?.token === credentials.token) return true;
            } catch { /* Expired/changed session must not complete its old handshake. */ }
            disconnect(); return false;
        };
        connecting = true; abort = new AbortController();
        const deadline = setTimeout(() => { if (epoch === generation) fail(epoch, false, '游戏服登录超时'); }, 15000);
        handshakeTimer = deadline;
        status('正在验证游戏服登录');
        try {
            const response = await fetchImpl(new URL('/api/join', gateway), {
                method: 'POST', headers: {'content-type': 'application/json', Authorization: `Bearer ${credentials.token}`},
                body: JSON.stringify({username: credentials.username, project, roleId: state.roleId,
                    roomId: state.roomId, x: state.x, y: state.y, ...(requestedInstanceId ? {instanceId: requestedInstanceId} : {})}), signal: abort.signal, redirect: 'error',
            });
            if (!isCurrent()) return;
            if (!response.ok) {
                let code;
                try { code = (await response.json())?.error; } catch { /* Proxy errors may not be JSON. */ }
                if (!isCurrent()) return;
                if (requestedInstanceId && ((response.status === 503 && ['no-server', 'server-full'].includes(code))
                    || (response.status === 400 && code === 'instance-unavailable'))) {
                    disconnect(); suspended = true; status('所选服务器暂不可用，请选择其他服务器'); return;
                }
                const reason = code === 'auth-unavailable' ? '游戏服暂时无法连接 Keepwork 身份验证服务'
                    : `游戏服网关请求失败（${response.status}）`;
                fail(epoch, response.status === 401, reason); return;
            }
            const assignment = await response.json();
            if (!isCurrent()) return;
            if (requestedInstanceId && assignment.instanceId !== requestedInstanceId) throw Error('instance');
            if (!Number.isSafeInteger(assignment.instanceId) || assignment.instanceId < 1) throw Error('instance');
            if (assignment.username !== credentials.username || !assignment.ticket || !assignment.playerId) throw Error('identity');
            const url = new URL(assignment.url);
            if (url.hostname !== gateway.hostname || (gateway.protocol === 'https:' && url.protocol !== 'wss:')
                || !['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('socket-url');
            socket = new WebSocketImpl(url.href);
            remote.reset(state.roomId, assignment.playerId);
            const current = socket;
            current.onopen = () => {
                if (!isCurrent()) { current.close(); return; }
                try { current.send(JSON.stringify({type: 'hello', playerId: assignment.playerId, ticket: assignment.ticket,
                    instanceId: assignment.instanceId, roomId: state.roomId, name: state.name,
                    appearance: presenceAppearance(state.appearance), x: state.x, y: state.y, facing: state.facing || 0}));
                    sentAppearance = JSON.stringify(presenceAppearance(state.appearance)); }
                catch { fail(epoch, false, '游戏服发送失败'); }
            };
            current.onmessage = event => {
                if (!isCurrent()) return;
                lastReceived = now();
                let message;
                try { message = JSON.parse(event.data); if (!message || typeof message.type !== 'string') throw Error('message'); } catch { fail(epoch); return; }
                remote.receive(message, now());
                if (message.type === 'welcome') {
                    if (message.self?.id !== assignment.playerId || message.roomId !== state.roomId || message.instanceId !== assignment.instanceId) { fail(epoch, true); return; }
                    clearTimeout(deadline); connecting = false; online = true; failures = 0; room = state.roomId;
                    instanceId = assignment.instanceId;
                    status('已连接游戏服务器'); emit();
                } else if (message.type === 'migrate' && online && Number.isSafeInteger(message.instanceId) && message.instanceId > 0) {
                    remote.reset(room, assignment.playerId);
                    instanceId = message.instanceId; requestedInstanceId = instanceId; emit();
                } else if (message.type === 'reject') {
                    if (message.reason === 'replaced') {
                        disconnect(); suspended = true;
                        status('该角色已在其他页面登录，你已被踢下线，请重新登录。');
                        onReplaced();
                    } else if (message.reason === 'account-connection-limit') {
                        fail(epoch, false, '同一 Keepwork 账号最多同时连接10个客户端，请关闭其他客户端后重试');
                        nextAttempt = now() + 30000;
                    } else fail(epoch, message.reason === 'auth-required' || String(message.reason).startsWith('ticket'), '游戏服拒绝入场');
                }
            };
            // Browser error carries no details; close supplies the actual code (or handshake deadline expires).
            current.onerror = () => {};
            current.onclose = event => fail(epoch, false, event?.code ? `游戏服连接关闭（${event.code}）` : '游戏服连接中断');
        } catch { fail(epoch, false, '无法连接游戏服，请检查网络或页面来源权限'); }
        finally { if (!socket || epoch !== generation) clearTimeout(deadline); }
    }
    function tick() {
        if (stopped) return;
        const state = getState();
        let credentials;
        try { credentials = state?.owner ? getCredentials() : null; } catch { credentials = null; }
        if (!state?.owner || !credentials?.token || credentials.username !== state.owner) {
            if (identity || socket || connecting) disconnect();
            identity = ''; status('游戏服未连接'); return;
        }
        if (typeof state.roomId !== 'string' || !state.roomId.startsWith(`${project}:`)) {
            if (identity || socket || connecting) disconnect();
            identity = ''; status('游戏服房间不属于当前项目'); return;
        }
        // Token participates in the in-memory lifecycle only; never report this key.
        const key = JSON.stringify([state.owner, state.roleId, credentials.token]);
        if (identity !== key) { disconnect(); identity = key; nextAttempt = 0; failures = 0; suspended = false; }
        if (suspended) return;
        if (!socket && !connecting && now() >= nextAttempt) { void connect(state, credentials); return; }
        if (online && now() - lastReceived > 20000) {
            fail(generation, false, '游戏服响应超时'); return;
        }
        if (online && socket?.readyState === 1) {
            try {
                if (room !== state.roomId) {
                    remote.reset(state.roomId);
                    socket.send(JSON.stringify({type: 'enterRoom', roomId: state.roomId, x: state.x, y: state.y})); room = state.roomId;
                } else socket.send(JSON.stringify({type: 'move', x: state.x, y: state.y, facing: state.facing || 0}));
                const appearance = presenceAppearance(state.appearance), serialized = JSON.stringify(appearance);
                if (serialized !== sentAppearance) { socket.send(JSON.stringify({type: 'appear', appearance})); sentAppearance = serialized; }
            } catch { fail(generation, false, '游戏服发送失败'); }
        }
    }
    return {
        remoteCount(roomId) { return online ? remote.count(roomId) : 0; },
        remoteActors(roomId) { return online ? remote.actors(roomId, now()) : []; },
        get connected() { return online; },
        waitUntilConnected(timeoutMs = 15000) {
            tick();
            if (online) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => { listeners.delete(check); reject(Error('游戏服登录超时，请重试')); }, timeoutMs);
                const check = () => {
                    if (!online && !suspended) return;
                    clearTimeout(timer); listeners.delete(check);
                    if (online) resolve(); else reject(Error(lastStatus));
                };
                listeners.add(check); check();
            });
        },
        get state() { return {gatewayUrl: gateway.origin, connected: online, instanceId, message: lastStatus}; },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        async listInstances(page = 1, {signal} = {}) {
            const url = new URL('/api/instances', gateway); url.searchParams.set('page', page); url.searchParams.set('pageSize', 20);
            const timeout = AbortSignal.timeout(10000);
            let response;
            try {
                response = await fetchImpl(url, {signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: 'error'});
            } catch (error) {
                if (signal?.aborted) throw error;
                if (timeout.aborted || error?.name === 'TimeoutError') throw Error('读取服务器列表超时，请重试');
                throw Error('无法连接服务器列表服务，请稍后重试');
            }
            if ([403, 404].includes(response.status)) throw Error('服务器列表服务暂未开放，请稍后重试');
            if (!response.ok) throw Error('无法读取服务器列表，请稍后刷新');
            let result;
            try { result = await response.json(); }
            catch (error) {
                if (signal?.aborted) throw error;
                if (timeout.aborted || error?.name === 'TimeoutError') throw Error('读取服务器列表超时，请重试');
                throw Error('服务器列表响应异常，请稍后重试');
            }
            if (!result || !Array.isArray(result.instances) || !Number.isSafeInteger(result.pages) || result.pages < 1) throw Error('服务器列表格式错误');
            return result;
        },
        switchInstance(value) {
            if (!Number.isSafeInteger(value) || value < 1) throw Error('服务器编号无效');
            if (!getState()?.owner || !getCredentials()?.token) throw Error('请先登录后再切换服务器');
            if (online && instanceId === value) return;
            disconnect(); requestedInstanceId = value; suspended = false; nextAttempt = 0; failures = 0; tick(); emit();
        },
        reconnect() { disconnect(); suspended = false; nextAttempt = 0; failures = 0; tick(); },
        resume() { if (!suspended) { nextAttempt = 0; tick(); } },
        switchServer(value) {
            const next = new URL(normalizeGameServerUrl(value));
            disconnect(); requestedInstanceId = null; gateway = next; suspended = false; nextAttempt = 0; failures = 0; tick();
        },
        start() { if (!stopped) return; stopped = false; timer = setTimer(tick, 1000); tick(); },
        stop() { stopped = true; clearTimer(timer); disconnect(); identity = ''; status('游戏服未连接'); },
        tick,
    };
}
