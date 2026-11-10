/* GET  /api/library   the team's library edits (everyone who can log in)
   POST /api/library   admins only: {op:'rename', kind, id, name} · {op:'delete', kind, id} · {op:'restore', kind, id}
                       · {op:'newfam', name}  a new model name (it gets an id from its name)
                       · {op:'hand', kind, id, feat, on}  (a hole / chase / feature made by hand, not by the CNC)
   Renames and deletions of library items (model names, homes, pods, walls, floor/ceiling/roof layers, decks,
   cabinets / appliances / fixtures and windows / doors) are kept as one document in MongoDB (library_edits,
   _id 'edits') and laid over the library when the app loads. A deleted item is hidden from every list; homes already using it keep working, and
   it can be brought back. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo } from '../_mongo.js';
const KINDS = ['families','models','pods','walls','layers','decks','casework','units','devices'];   // casework = cabinets, appliances, fixtures …; units = windows and doors
const FIXED = ['lifepod','nest','haven','cove','panorama','expanse'];   // the model names in data/families.json
const blank = () => ({ names:{}, gone:{}, hand:{}, fams:[] });
async function read(M){
  const v = await M.coll('library_edits').get('edits'); if(!v) return blank();
  return { names:v.names||{}, gone:v.gone||{}, hand:v.hand||{}, fams:v.fams||[], rev:v.rev||0 };
}
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env);
  if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  const { rev, ...v } = await read(mongo(env)); return json(v);
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env);
  if(!atLeast(me,'editor')) return denied('editor');
  const b = await request.json().catch(()=>null);
  if(b && b.op === 'newfam') b.kind = 'families', b.id = '-';
  if(!b || !['rename','delete','restore','hand','newfam'].includes(b.op) || !KINDS.includes(b.kind) || typeof b.id !== 'string' || !b.id || b.id.length > 80) return json({ error:'Bad request.' }, 400);
  const key = `${b.kind}:${b.id}`;
  // one document: written only if nobody else saved it since it was read (rev), else read again and redo
  const M = mongo(env);
  for(let n=0; n<8; n++){
    const v = await read(M);
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
    const res = v.rev
      ? await M.coll('library_edits').update({ _id:'edits', rev:v.rev }, { $set:{ ...ed, rev:v.rev+1 } })
      : await M.coll('library_edits').update({ _id:'edits', rev:{ $exists:false } }, { $set:{ ...ed, rev:1 } }, { upsert:true }).catch(()=>({ matched:0, upserted:0 }));
    if(res.matched || res.upserted) return json({ ok:true, ...ed });
    await new Promise(s => setTimeout(s, 30 + Math.random()*100*(n+1)));
  }
  return json({ error:"The server was busy with someone else's save. Try again." }, 503);
}
