/* GET  /api/library   the team's library edits (everyone who can log in)
   POST /api/library   admins only: {op:'rename', kind, id, name} · {op:'delete', kind, id} · {op:'restore', kind, id}
                       · {op:'hand', kind, id, feat, on}  (a hole / chase / feature made by hand, not by the CNC)
   Renames and deletions of library items (model names, homes, pods, walls, floor/ceiling/roof layers, decks) are kept as one
   small JSON file in the R2 bucket (binding STEPS, key catalog/library-edits.json) and laid over the library
   files when the app loads. A deleted item is hidden from every list; homes already using it keep working, and
   it can be brought back. */
import { whoIs, json } from '../_auth.js';
const KEY = 'catalog/library-edits.json';
const KINDS = ['families','models','pods','walls','layers','decks'];
async function read(env){
  const o = await env.STEPS.get(KEY); const empty = { names:{}, gone:{}, hand:{} };
  if(!o) return empty;
  try{ const v = await o.json(); return { names:v.names||{}, gone:v.gone||{}, hand:v.hand||{} }; }catch(e){ return empty; }
}
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env);
  if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json({ names:{}, gone:{} });
  return json(await read(env));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env);
  if(me.role !== 'admin') return json({ error:'Only admins can change the library.' }, 403);
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  if(!b || !['rename','delete','restore','hand'].includes(b.op) || !KINDS.includes(b.kind) || typeof b.id !== 'string' || !b.id || b.id.length > 80) return json({ error:'Bad request.' }, 400);
  const key = `${b.kind}:${b.id}`, ed = await read(env);
  if(b.op === 'rename'){
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    if(!name) return json({ error:'A name is needed.' }, 400);
    ed.names[key] = name;
  } else if(b.op === 'delete') ed.gone[key] = { by: me.email, at: new Date().toISOString() };
  else if(b.op === 'hand'){   // a feature made by hand, not by the CNC: feat = "<list>:<index>"
    if(typeof b.feat !== 'string' || !/^[a-z]:\d{1,4}$/.test(b.feat)) return json({ error:'Bad feature.' }, 400);
    const set = new Set(ed.hand[key]||[]); if(b.on) set.add(b.feat); else set.delete(b.feat);
    if(set.size) ed.hand[key] = [...set]; else delete ed.hand[key];
  }
  else delete ed.gone[key];
  await env.STEPS.put(KEY, JSON.stringify(ed), { httpMetadata:{ contentType:'application/json' } });
  return json({ ok:true, ...ed });
}
