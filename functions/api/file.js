/* The one-hour signed link handed to the GitHub Action that scans an uploaded STEP file (see api/upload.js).
   GitHub has no Cloudflare login, so this one path is left open in Cloudflare Access (a "bypass" app for
   cubit-builder.pages.dev/api/file). Instead each link is signed with IMPORT_SECRET and dies after an hour, so
   only the link the site handed to the Action works, and only for that one upload.

   GET  /api/file?id&exp&sig            the uploaded STEP file
   GET  /api/file?id&exp&sig&seed=1     the library the scan adds to: { sets:{ walls, layers, pods, decks, projects,
                                        units, sinks } } (it works on a copy and sends back what changed)
   POST /api/file?id&exp&sig            the scan's result: { sets:{ <set>: value, … }, entry:{ the import log line } }
                                        → the sets are written to the catalogue (MongoDB seed) and the log line to
                                        MariaDB (step_imports) */
import { mac } from '../_sign.js';
import { json } from '../_auth.js';
import { mongo } from '../_mongo.js';
import { readSet, writeSet, okSet } from '../_seed.js';
import { withSql, toDT } from '../_sql.js';
const SCAN_SETS = ['walls','layers','pods','decks','projects','units','sinks'];
const writable = s => SCAN_SETS.includes(s) || /^sinks\/[a-z0-9][a-z0-9_-]{0,60}$/.test(s);
async function check(request, env){
  const u = new URL(request.url), id = u.searchParams.get('id')||'', exp = +u.searchParams.get('exp')||0, sig = u.searchParams.get('sig')||'';
  if(!env.IMPORT_SECRET || !/^\d{14}-[a-z0-9]{1,8}$/.test(id) || exp < Date.now()/1000) return null;
  const want = await mac(env, `${id}.${exp}`);
  let diff = want.length ^ sig.length; for(let i=0;i<want.length;i++) diff |= want.charCodeAt(i) ^ (sig.charCodeAt(i)||0);
  return diff ? null : { id, u };
}
export async function onRequestGet({ request, env }){
  const ok = await check(request, env); if(!ok) return new Response('Not found', { status:404 });
  if(ok.u.searchParams.get('seed')){
    const M = mongo(env), sets = {};
    for(const s of SCAN_SETS){ const v = await readSet(M, s); if(v !== undefined) sets[s] = v; }
    return json({ sets });
  }
  const obj = env.STEPS && await env.STEPS.get(`incoming/${ok.id}.step`);
  if(!obj) return new Response('Not found', { status:404 });
  return new Response(obj.body, { headers:{ 'content-type':'application/octet-stream', 'content-length': String(obj.size), 'cache-control':'no-store' } });
}
export async function onRequestPost({ request, env }){
  const ok = await check(request, env); if(!ok) return new Response('Not found', { status:404 });
  const b = await request.json().catch(()=>null);
  if(!b || typeof b !== 'object') return json({ error:'Bad request.' }, 400);
  const M = mongo(env), done = [];
  const e = b.entry || {};
  for(const [s, v] of Object.entries(b.sets || {})){
    if(!okSet(s) || !writable(s) || v == null || typeof v !== 'object') return json({ error:`The scan may not write ${s}.` }, 400);
    done.push(await writeSet(M, s, v, `STEP import ${ok.id}${e.by ? ' · '+e.by : ''}`));
  }
  await withSql(env, db => db.q(`INSERT INTO step_imports (id, kind, name, file, by_email, started, finished, status, summary, error) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE kind=VALUES(kind), name=VALUES(name), file=VALUES(file), by_email=VALUES(by_email), started=VALUES(started), finished=VALUES(finished), status=VALUES(status), summary=VALUES(summary), error=VALUES(error)`,
    [ok.id, String(e.kind||'').slice(0,60), String(e.name||'').slice(0,160), String(e.file||'').slice(0,200), String(e.by||'').slice(0,254), toDT(e.started), toDT(e.finished),
     String(e.status||'done').slice(0,20), e.summary ? JSON.stringify(e.summary) : null, e.error ? String(e.error).slice(0,4000) : null]));
  return json({ ok:true, written:done });
}
