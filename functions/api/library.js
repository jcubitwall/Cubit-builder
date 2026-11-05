/* GET  /api/library   the team's library edits (everyone who can log in)
   POST /api/library   admins only: {op:'rename', kind, id, name} · {op:'delete', kind, id} · {op:'restore', kind, id}
                       · {op:'newfam', name}  a new model name (it gets an id from its name)
                       · {op:'hand', kind, id, feat, on}  (a hole / chase / feature made by hand, not by the CNC)
   Renames and deletions of library items (model names, homes, pods, walls, floor/ceiling/roof layers, decks,
   cabinets / appliances / fixtures and windows / doors) are kept as one
   small JSON file in the R2 bucket (binding STEPS, key catalog/library-edits.json) and laid over the library
   files when the app loads. A deleted item is hidden from every list; homes already using it keep working, and
   it can be brought back. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { atomic } from '../_store.js';
const KEY = 'catalog/library-edits.json';
const KINDS = ['families','models','pods','walls','layers','decks','casework','units'];   // casework = cabinets, appliances, fixtures …; units = windows and doors
const FIXED = ['lifepod','nest','haven','cove','panorama','expanse'];   // the model names in data/families.json
async function read(env){
  const o = await env.STEPS.get(KEY); const empty = { names:{}, gone:{}, hand:{}, fams:[] };
  if(!o) return empty;
  try{ const v = await o.json(); return { names:v.names||{}, gone:v.gone||{}, hand:v.hand||{}, fams:v.fams||[] }; }catch(e){ return empty; }
}
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env);
  if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json({ names:{}, gone:{} });
  return json(await read(env));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env);
  if(!atLeast(me,'editor')) return denied('editor');
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  if(b && b.op === 'newfam') b.kind = 'families', b.id = '-';
  if(!b || !['rename','delete','restore','hand','newfam'].includes(b.op) || !KINDS.includes(b.kind) || typeof b.id !== 'string' || !b.id || b.id.length > 80) return json({ error:'Bad request.' }, 400);
  const key = `${b.kind}:${b.id}`;
  const r = await atomic(env, KEY, ()=>({ names:{}, gone:{}, hand:{}, fams:[] }), async v=>{
    const ed = { names:v.names||{}, gone:v.gone||{}, hand:v.hand||{}, fams:v.fams||[] };
    if(b.op === 'newfam'){
      const name = typeof b.name === 'string' ? b.name.trim().slice(0, 40) : '';
      if(!name) return json({ error:'A name is needed.' }, 400);
      const taken = new Set([...FIXED, ...ed.fams.map(f=>f.id)]);
      const live = n => n.toLowerCase().replace(/[^a-z0-9]+/g,'');
      if([...ed.fams.filter(f=>!ed.gone[`families:${f.id}`]).map(f=>ed.names[`families:${f.id}`]||f.name)].some(n=>live(n)===live(name))) return json({ error:`“${name}” is already a model name.` }, 409);
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,28) || 'model';
      let id = base, n = 2; while(taken.has(id)) id = `${base}-${n++}`;
      ed.fams.push({ id, name, by: me.email, at: new Date().toISOString() });
    }
    else if(b.op === 'rename'){
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
    return { value:ed };
  });
  if(r.response) return r.response;
  return json({ ok:true, ...r.value });
}
