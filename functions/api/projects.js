/* GET  /api/projects                 the team's projects (everyone who can log in)
   GET  /api/projects?versions=<id>   earlier saves of one project [{at, by, name}]
   POST /api/projects                 save / rename / lock: salespeople and up; delete / restore / unlock: editors and up
        {op:'save', item, baseRev}   save a project (the save before it is kept as an earlier version).
                                     baseRev = the version (rev) the saver started from. If someone saved since,
                                     nothing is saved: 409 {changed:true, current} so the app can merge the two
                                     and save again (sync.js)
        {op:'rename', id, name}
        {op:'delete', id}            removed from the list; kept with its earlier versions so it can come back
        {op:'restore', id, at}       bring back an earlier version (or a deleted project: at = its last save)
        {op:'lock', id, lock}        signed by the customer and the rep: no more saves until it's unlocked
        {op:'unlock', id, reason, fee}  editors and admins: opens a signed home for changes (logged on the project)
   A project with a customer (item.customer = the customer's id) is that customer's home; without one it's in
   Purgatory, waiting for the team to adopt it into Cubit Homes.
   Projects are kept in the R2 bucket (binding STEPS): projects/index.json (all current projects) and
   projects/history/<id>/<time>.json (every earlier save). */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { atomic } from '../_store.js';
const KEY = 'projects/index.json';
const okId = id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
async function list(env){ const o = await env.STEPS.get(KEY); if(!o) return []; try{ const v = await o.json(); return Array.isArray(v) ? v : []; }catch(e){ return []; } }
const put = (env, key, v) => env.STEPS.put(key, JSON.stringify(v), { httpMetadata:{ contentType:'application/json' } });
async function keep(env, p){ if(p) await put(env, `projects/history/${p.id}/${(p.saved||new Date().toISOString()).replace(/[:.]/g,'-')}.json`, p); }

export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env);
  if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json([]);
  const v = new URL(request.url).searchParams.get('versions');
  if(v){
    if(!okId(v)) return json({ error:'Bad id.' }, 400);
    const r = await env.STEPS.list({ prefix:`projects/history/${v}/` });
    const out = [];
    for(const o of r.objects.slice(-40)){ const p = await (await env.STEPS.get(o.key))?.json().catch(()=>null); if(p) out.push({ at:p.saved, by:p.by||'', name:p.name, key:o.key.split('/').pop().replace('.json','') }); }
    return json(out.reverse());
  }
  return json(await list(env));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env);
  if(!atLeast(me,'sales')) return denied('sales');
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  if(!b || !['save','rename','delete','restore','lock','unlock'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(['delete','restore','unlock'].includes(b.op) && !atLeast(me,'editor')) return denied('editor');
  if(JSON.stringify(b).length > 4_000_000) return json({ error:'Too big.' }, 413);
  const r = await atomic(env, KEY, ()=>[], async L=>{
    if(!Array.isArray(L)) L=[];
    const at = id => L.findIndex(p => p.id === id);
    if(b.op === 'save'){
      const it = b.item;
      if(!it || !okId(it.id) || typeof it.name !== 'string' || !it.model || !Array.isArray(it.model.pods)) return json({ error:'Bad project.' }, 400);
      const i = at(it.id), cur = i >= 0 ? L[i] : null;
      // someone saved this project after the saver opened it: hand theirs back to be merged, save nothing
      if(cur && b.baseRev != null && (cur.rev||0) !== b.baseRev) return json({ changed:true, current:cur }, 409);
      if(cur?.locked) return json({ error:'This home is signed and locked. Unlock it first (editors and admins).', locked:cur.locked }, 423);
      it.locked = null; if(cur?.unlocks) it.unlocks = cur.unlocks;
      if(cur) await keep(env, cur);
      it.by = me.email; it.saved = new Date().toISOString(); it.name = it.name.trim().slice(0,80) || 'Untitled'; it.rev = (cur?.rev||0) + 1;
      if(b.merged) it.merged = b.merged; else delete it.merged;
      if(i >= 0) L[i] = it; else L.unshift(it);
    } else {
      if(!okId(b.id)) return json({ error:'Bad id.' }, 400);
      const i = at(b.id);
      if(b.op === 'lock' || b.op === 'unlock'){
        if(i < 0) return json({ error:'No such project.' }, 404);
        await keep(env, L[i]);
        if(b.op === 'lock'){ const l = b.lock || {}; L[i] = { ...L[i], locked:{ at:new Date().toISOString(), by:me.email, customer:String(l.customer||L[i].customer||'').slice(0,40), rep:String(l.rep||'').slice(0,80), client:String(l.client||'').slice(0,80) } }; }
        else { const reason = String(b.reason||'').trim().slice(0,300); if(!reason) return json({ error:'Say why it is being unlocked.' }, 400);
          L[i] = { ...L[i], locked:null, unlocks:[...(L[i].unlocks||[]), { at:new Date().toISOString(), by:me.email, reason, fee:String(b.fee||'').slice(0,40), was:L[i].locked||null }] }; }
      }
      else if(b.op === 'rename'){ if(i < 0) return json({ error:'No such project.' }, 404); const nm = String(b.name||'').trim().slice(0,80); if(!nm) return json({ error:'A name is needed.' }, 400); L[i] = { ...L[i], name:nm }; }
      else if(b.op === 'delete'){ if(i >= 0){ await keep(env, L[i]); L.splice(i,1); } }
      else {   // restore
        const key = `projects/history/${b.id}/${String(b.at||'').replace(/[^0-9TZ-]/g,'')}.json`;
        const old = await (await env.STEPS.get(key))?.json().catch(()=>null);
        if(!old) return json({ error:'That version is gone.' }, 404);
        if(i >= 0) await keep(env, L[i]);
        const it = { ...old, saved:new Date().toISOString(), by:me.email, restoredFrom:old.saved, rev:((i>=0?L[i].rev:old.rev)||0)+1 };
        if(i >= 0) L[i] = it; else L.unshift(it);
      }
    }
    return { value:L };
  });
  if(r.response) return r.response;
  return json({ ok:true, projects:r.value });
}
