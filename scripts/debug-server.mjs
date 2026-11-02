import {mkdirSync,existsSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {Store} from '../backend/store.mjs';
import {createServer} from '../backend/server.mjs';
process.umask(0o077);
// A separate fixed directory, deliberately ignoring AWC_DB and AWC_ADMIN_TOKEN.
const root=resolve('data/debug-live');mkdirSync(root,{recursive:true,mode:0o700});
const secret=resolve(root,'admin-token');
if(!existsSync(secret))writeFileSync(secret,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
const s=new Store(resolve(root,'debug.sqlite'),{debug:true});
s.tx(()=>{if(!s.one("SELECT id FROM accounts WHERE role='platform'"))s.provisionPlatform('DEBUG finite test employer',10000);});
const server=createServer(s,{adminToken:readFileSync(secret,'utf8').trim(),allowedHosts:['127.0.0.1','localhost']});
const timer=setInterval(()=>s.sweep(),5000);timer.unref();
server.listen(5005,'127.0.0.1',()=>console.log('ISOLATED TEST LEDGER: http://127.0.0.1:5005/admin/\nAdmin token file: '+secret+'\nReal Workers use their own compute. No test credits can be exported.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>{s.close();process.exit();});});
