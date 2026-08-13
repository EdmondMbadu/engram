#!/usr/bin/env node

import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const valueAfter = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : fallback;
};
const jobId = valueAfter('--job');
const port = Math.max(1024, Math.min(65535, Number.parseInt(valueAfter('--port', '4322'), 10)));
const root = path.resolve(valueAfter('--root', 'artifacts/codex-university-boards'), jobId);
if (!jobId) throw new Error('Pass --job JOB_ID.');

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

async function loadCatalog() {
  const entries = await readdir(root, { withFileTypes: true });
  const schools = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('school-')) continue;
    try {
      const artifact = JSON.parse(await readFile(path.join(root, entry.name, 'gemini-board-set.json'), 'utf8'));
      if (!Array.isArray(artifact.boards) || !artifact.boards.length) continue;
      schools.push({
        id: entry.name.slice('school-'.length),
        schoolName: artifact.school_name || artifact.boards[0]?.school_name || entry.name,
        townName: artifact.town_name || artifact.boards[0]?.town_name || '',
        boards: artifact.boards,
      });
    } catch { /* an interrupted school is not previewable */ }
  }
  return schools.sort((left, right) => left.schoolName.localeCompare(right.schoolName));
}

function page(catalog) {
  const data = JSON.stringify(catalog).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gemini University Board Preview</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#071411;color:#f1faf6}*{box-sizing:border-box}body{margin:0}header{position:sticky;top:0;z-index:4;padding:18px 24px;background:#071411eF;border-bottom:1px solid #214239;backdrop-filter:blur(14px)}h1{font-size:22px;margin:0 0 5px}header p{margin:0;color:#9ebbb1;font-size:13px}.shell{display:grid;grid-template-columns:290px 1fr;min-height:calc(100vh - 83px)}aside{border-right:1px solid #214239;padding:16px;overflow:auto;height:calc(100vh - 83px);position:sticky;top:83px}input{width:100%;padding:11px 12px;border:1px solid #31584c;background:#10231d;color:#fff;border-radius:10px;margin-bottom:12px}.school{width:100%;text-align:left;padding:10px;border:0;background:transparent;color:#d6e9e1;border-radius:9px;cursor:pointer}.school:hover,.school.active{background:#183c31}.school small{display:block;color:#87a79c;margin-top:3px}main{padding:26px;min-width:0}.summary{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:22px}.pill{border:1px solid #2a5a4b;background:#102b23;padding:7px 10px;border-radius:999px;font-size:12px}.board{border:1px solid #275044;background:#0e211b;border-radius:18px;margin:0 0 24px;overflow:hidden}.boardhead{padding:18px 20px;border-bottom:1px solid #24483d}.boardhead h2{margin:0 0 6px;font-size:19px}.boardhead p{margin:0;color:#9fbbb1}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;padding:14px}.card{padding:15px;background:#142c24;border:1px solid #2c4c42;border-radius:13px}.rank{display:inline-grid;place-items:center;width:25px;height:25px;background:#45d09f;color:#062119;border-radius:50%;font-weight:800;font-size:12px}.card h3{display:inline;margin-left:8px;font-size:15px}.sub{color:#bbd2ca;font-size:13px;margin:9px 0}.notes{font-size:13px;line-height:1.45;color:#e3eee9}.source{display:inline-block;color:#70e2b8;font-size:12px;margin-top:11px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.empty{color:#9ebbb1;padding:40px}@media(max-width:800px){.shell{grid-template-columns:1fr}aside{position:static;height:auto;border-right:0;border-bottom:1px solid #214239;max-height:280px}main{padding:16px}}
</style></head><body>
<header><h1>Paid Gemini output — read-only preview</h1><p>No AI calls, image purchases, Firestore writes, or publishing happen on this page.</p></header>
<div class="shell"><aside><input id="search" placeholder="Find a university"><div id="schools"></div></aside><main id="main"></main></div>
<script>
const catalog=${data}; let selected=catalog[0]?.id||'';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function renderList(){const q=document.querySelector('#search').value.toLowerCase();document.querySelector('#schools').innerHTML=catalog.filter(x=>(x.schoolName+' '+x.townName).toLowerCase().includes(q)).map(x=>'<button class="school '+(x.id===selected?'active':'')+'" data-id="'+esc(x.id)+'">'+esc(x.schoolName)+'<small>'+esc(x.townName)+' · '+x.boards.length+' boards</small></button>').join('');document.querySelectorAll('.school').forEach(b=>b.onclick=()=>{selected=b.dataset.id;renderList();renderMain()})}
function renderMain(){const s=catalog.find(x=>x.id===selected);if(!s){document.querySelector('#main').innerHTML='<div class="empty">No completed Gemini artifacts found.</div>';return}const cardCount=s.boards.reduce((n,b)=>n+(b.cards?.length||0),0);document.querySelector('#main').innerHTML='<h1>'+esc(s.schoolName)+'</h1><div class="summary"><span class="pill">'+esc(s.townName)+'</span><span class="pill">'+s.boards.length+' boards</span><span class="pill">'+cardCount+' sourced cards</span><span class="pill">unpublished preview</span></div>'+s.boards.map(b=>'<section class="board"><div class="boardhead"><h2>'+esc(b.title)+'</h2><p>'+esc(b.description)+'</p></div><div class="cards">'+(b.cards||[]).map((c,i)=>'<article class="card"><span class="rank">'+(i+1)+'</span><h3>'+esc(c.title)+'</h3><div class="sub">'+esc(c.subtitle)+'</div><div class="notes">'+esc(c.notes)+'</div><a class="source" target="_blank" rel="noreferrer" href="'+esc(c.source_url)+'">Source: '+esc(c.source_title)+'</a></article>').join('')+'</div></section>').join('')}
document.querySelector('#search').oninput=renderList;renderList();renderMain();
</script></body></html>`;
}

const catalog = await loadCatalog();
const html = page(catalog);
createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/index.html') { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(html);
}).listen(port, '127.0.0.1', () => {
  const boards = catalog.reduce((total, school) => total + school.boards.length, 0);
  console.log(`University preview: http://127.0.0.1:${port}/ (${catalog.length} universities, ${boards} boards)`);
});
