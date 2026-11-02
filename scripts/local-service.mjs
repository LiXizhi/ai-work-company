import { mkdir, readFile, writeFile, lstat, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stopContinuous, validatePolicy } from '../worker/continuous.mjs';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function servicePlist({role,policy,clientDir,envFile,logs}, {node=process.execPath,home=homedir(),project=root,path=process.env.PATH}={}) {
  if(!['backend','worker'].includes(role) || !isAbsolute(logs||'') || (role==='backend'&&!isAbsolute(envFile||'')) || (role==='worker'&&(!isAbsolute(policy||'')||!isAbsolute(clientDir||'')))) throw new Error('invalid_service_config');
  const label=`org.ai-work-company.${role}`;
  const args=role==='backend'?[node,`--env-file=${envFile}`,resolve(project,'backend/server.mjs')]:[node,resolve(project,'cli/awc.mjs'),'work','--continuous','--policy',policy];
  const env={HOME:home,PATH:path,...(role==='worker'?{AWC_CLIENT_DIR:clientDir}:{})};
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map(a=>`<string>${xml(a)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(project)}</string><key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k,v])=>`<key>${k}</key><string>${xml(v)}</string>`).join('')}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>30</integer><key>Umask</key><integer>63</integer><key>StandardOutPath</key><string>${xml(resolve(logs,role+'.log'))}</string><key>StandardErrorPath</key><string>${xml(resolve(logs,role+'.error.log'))}</string></dict></plist>`;
}
async function privateFile(path) { const s=await lstat(path); if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)) throw new Error('service_file_must_be_private'); }
async function main() {
  const [action,configPath]=process.argv.slice(2);
  if(process.platform!=='darwin') throw new Error('launchd_requires_macos');
  if(!['install','status','uninstall'].includes(action)||!configPath) throw new Error('Usage: npm run service -- install|status|uninstall /private/service.json');
  await privateFile(configPath); const config=JSON.parse(await readFile(configPath,'utf8'));
  const plist=servicePlist(config);
  const label=`org.ai-work-company.${config.role}`, domain=`gui/${process.getuid()}`;
  const directory=resolve(homedir(),'Library/LaunchAgents'), file=resolve(directory,label+'.plist');
  const launch=(args)=>spawnSync('/bin/launchctl',args,{encoding:'utf8'});
  if(action==='status') { const r=launch(['print',`${domain}/${label}`]); console.log(JSON.stringify({label,loaded:r.status===0})); return; }
  if(config.role==='worker') {
    await privateFile(config.policy);
    const p=JSON.parse(await readFile(config.policy,'utf8')); validatePolicy(p,p.server);
    // The CLI origin defaults to loopback; require explicit backend origin in the generated arguments.
    config.server=p.server;
    if(action==='uninstall') {
      const home=resolve(config.clientDir,createHash('sha256').update(p.server).digest('hex'));
      await stopContinuous(home);
    }
  } else if(action==='install') await privateFile(config.envFile);
  if(action==='uninstall') { launch(['bootout',`${domain}/${label}`]); await rm(file,{force:true}); }
  else {
    const loaded=launch(['print',`${domain}/${label}`]); if(loaded.status===0) throw new Error('service_already_installed_uninstall_first');
    await mkdir(config.logs,{recursive:true,mode:0o700}); const s=await lstat(config.logs); if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)) throw new Error('logs_directory_must_be_private');
    await mkdir(directory,{recursive:true});
    const content=config.role==='worker'?plist.replace('<string>--policy</string>',`<string>--server</string><string>${xml(config.server)}</string><string>--policy</string>`):plist;
    await writeFile(file,content,{mode:0o600,flag:'wx'});
    const r=launch(['bootstrap',domain,file]); if(r.status!==0) { await rm(file); throw new Error('launchd_bootstrap_failed'); }
  }
  console.log(JSON.stringify({action,label}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e.message);process.exitCode=1;});
