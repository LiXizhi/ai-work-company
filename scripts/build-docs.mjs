import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
export const documents=['business-model-analysis','autonomous-operation-plan'];
const root=fileURLToPath(new URL('../',import.meta.url));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function linkTarget(url) {
  if (/^https?:\/\//i.test(url) || /^#[\w-]*$/.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || /[\\\x00-\x20]/.test(url)) return '#';
  if(documents.some(n=>url===`${n}.md`)) return url.replace(/\.md$/,'.html');
  if(url==='../site/index.html') return './';
  if(url==='../site/agent.md') return 'agent.md';
  const path=posix.normalize(posix.join('docs',url));
  if(path.startsWith('../') || path.startsWith('/')) return '#';
  return `https://github.com/LiXizhi/ai-work-company/blob/main/${path}`;
}
function inline(s) {
  const parts=[];
  s=s.replace(/`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g,(_,code,label,url)=> { const i=parts.length; parts.push(code?`<code>${esc(code)}</code>`:`<a href="${esc(linkTarget(url))}">${esc(label)}</a>`); return `\u0000${i}\u0000`; });
  return esc(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\u0000(\d+)\u0000/g,(_,i)=>parts[Number(i)]);
}
export function renderMarkdown(md) {
  const lines=md.replace(/\r/g,'').split('\n'); let out=[],list=null;
  const close=()=>{if(list){out.push(`</${list}>`);list=null;}};
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    if(line.startsWith('```')) { close(); const block=[]; while(++i<lines.length&&!lines[i].startsWith('```')) block.push(lines[i]); out.push(`<pre><code>${esc(block.join('\n'))}</code></pre>`); continue; }
    if(/^\|/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i+1]||'')) {
      close(); const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
      out.push('<div class="table"><table><thead><tr>'+cells(line).map(c=>`<th>${inline(c)}</th>`).join('')+'</tr></thead><tbody>'); i++;
      while(/^\|/.test(lines[i+1]||'')) out.push('<tr>'+cells(lines[++i]).map(c=>`<td>${inline(c)}</td>`).join('')+'</tr>');
      out.push('</tbody></table></div>');continue;
    }
    const heading=line.match(/^(#{1,6}) (.+)$/); if(heading){close();out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);continue;}
    const item=line.match(/^(?:([-*])|\d+\.) (.*)$/); if(item){const kind=item[1]?'ul':'ol';if(list!==kind){close();list=kind;out.push(`<${kind}>`);}out.push(`<li>${inline(item[2])}</li>`);continue;}
    close(); if(!line.trim())continue;
    out.push(line.startsWith('> ')?`<blockquote>${inline(line.slice(2))}</blockquote>`:`<p>${inline(line)}</p>`);
  }
  close();return out.join('\n');
}
export function buildDocs() {
  writeFileSync(resolve(root,'docs','report.css'),'body{margin:0;background:#f6f8fa;color:#17212b;font:17px/1.8 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:32px 22px 80px}h1{font-size:2rem;line-height:1.3}h2{margin-top:2.4em;border-bottom:1px solid #ccd5df}a{color:#1559aa;overflow-wrap:anywhere}nav,aside{padding:16px;background:#e9eff7;border-radius:8px}.table,pre{overflow:auto}table{border-collapse:collapse;width:100%;background:white}td,th{border:1px solid #ccd5df;padding:10px;text-align:left;min-width:100px}pre{background:#17212b;color:#f8fafc;padding:16px;border-radius:8px}code{font-size:.9em}blockquote{border-left:4px solid #4879a7;padding-left:18px;margin-left:0}p,li{overflow-wrap:anywhere}@media(max-width:600px){main{padding:20px 16px}h1{font-size:1.6rem}}'+'\n');
  for(const name of documents) {
    const md=readFileSync(resolve(root,'docs',`${name}.md`),'utf8');
    const title=md.match(/^# (.+)/m)?.[1]||name;
    const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · AI Work Company</title><link rel="stylesheet" href="report.css"></head><body><main><nav><a href="./">AI Work Company</a> · <a href="business-model-analysis.html">商业分析</a> · <a href="autonomous-operation-plan.html">实施计划</a> · <a href="${name}.md" download>下载 Markdown</a></nav><aside>由 docs/${name}.md 自动生成，Markdown 为唯一编辑源。已实现能力以实现状态和测试为准；本计划新增能力见实施计划，后续设计不代表已交付。GitHub Pages 仅托管静态文档，不运行交易后端。</aside>${renderMarkdown(md)}</main></body></html>\n`;
    writeFileSync(resolve(root,'docs',`${name}.html`),html);
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) buildDocs();
