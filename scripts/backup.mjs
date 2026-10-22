import { DatabaseSync, backup } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { mkdir, lstat, chmod, open, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export async function backupDatabase(source,destination) {
  source=resolve(source); destination=resolve(destination);
  const s=await lstat(source); if(!s.isFile()||s.isSymbolicLink()||source===destination) throw new Error('invalid_backup_paths');
  await mkdir(dirname(destination),{recursive:true,mode:0o700});
  const dir=await lstat(dirname(destination)); if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)) throw new Error('backup_directory_must_be_private');
  const handle=await open(destination,'wx',0o600); await handle.close();
  let db;
  try {
    db=new DatabaseSync(source,{readOnly:true}); await backup(db,destination); await chmod(destination,0o600);
    const check=new DatabaseSync(destination,{readOnly:true}); try { if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('backup_integrity_failed'); } finally {check.close();}
  } catch(e) { await rm(destination,{force:true});throw e; } finally {db?.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [source,destination]=process.argv.slice(2);
  if(!source||!destination){console.error('Usage: npm run backup -- SOURCE.sqlite NEW_BACKUP.sqlite');process.exitCode=1;}
  else backupDatabase(source,destination).then(()=>console.log('Backup verified.')).catch(e=>{console.error(e.message);process.exitCode=1;});
}
