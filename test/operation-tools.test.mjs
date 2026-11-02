import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { renderMarkdown, linkTarget, documents } from '../scripts/build-docs.mjs';
import { servicePlist } from '../scripts/local-service.mjs';
import { backupDatabase } from '../scripts/backup.mjs';
test('document renderer escapes executable text, allows only safe URLs and renders tables',()=>{
  const html=renderMarkdown('# Title\n<script>alert(1)</script>\n[x](javascript:alert)\n[y](//evil.example)\n\n| A | B |\n| --- | --- |\n| **ok** | `data` |\n\n```\n<img onerror=run()>\n```');
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));assert.ok(!html.includes('href="//'));assert.match(html,/<table>/);assert.match(html,/<strong>ok<\/strong>/);assert.match(html,/&lt;img/);
  assert.equal(linkTarget('business-model-analysis.md'),'business-model-analysis.html');assert.equal(linkTarget('../site/agent.md'),'agent.md');assert.match(linkTarget('implementation.md'),/github.com.*docs\/implementation.md$/);
});
test('generated documentation matches source and has navigable published links',async()=>{
  for(const name of documents){const html=await readFile(new URL(`../docs/${name}.html`,import.meta.url),'utf8');const md=await readFile(new URL(`../docs/${name}.md`,import.meta.url),'utf8');assert.ok(html.includes(renderMarkdown(md)));assert.match(html,/name="viewport"/);assert.ok(html.includes(`${name}.md" download`));
    for(const [,href] of html.matchAll(/href="([^"]+)"/g))assert.ok(href.startsWith('https://')||['./','agent.md','report.css',...documents.flatMap(d=>[`${d}.md`,`${d}.html`])].includes(href),href);
  }
});
test('launchd uses separate arguments, private umask and bounded restart policy',()=>{
  const xml=servicePlist({role:'worker',policy:'/private/a & b.json',clientDir:'/private/client',logs:'/private/logs'});
  assert.match(xml,/<string>--continuous<\/string>/);assert.match(xml,/a &amp; b.json/);assert.match(xml,/<key>SuccessfulExit<\/key><false\/>/);assert.match(xml,/<key>Umask<\/key><integer>63/);assert.ok(!xml.includes('/bin/sh'));
  assert.throws(()=>servicePlist({role:'backend',logs:'/tmp'}),/invalid_service_config/);
});
test('online SQLite backup includes WAL changes and refuses overwrite',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'awc-backup-'));const src=resolve(dir,'source.sqlite'),dst=resolve(dir,'backup.sqlite');const db=new DatabaseSync(src);
  try{db.exec('PRAGMA journal_mode=WAL; CREATE TABLE t(n INTEGER); INSERT INTO t VALUES(42)');await backupDatabase(src,dst);const copy=new DatabaseSync(dst,{readOnly:true});try{assert.equal(copy.prepare('SELECT n FROM t').get().n,42);}finally{copy.close();}assert.equal((await stat(dst)).mode&0o777,0o600);await assert.rejects(backupDatabase(src,dst),{code:'EEXIST'});}finally{db.close();}
});
