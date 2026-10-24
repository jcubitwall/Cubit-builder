/* GET  /api/drafts                       your own drafts (nobody else sees them)
   POST /api/drafts {op:'put', item}      save one draft  (item.key = draft-…/custom-…)
        {op:'delete', key}                delete one of yours
   Kept in the R2 bucket (binding STEPS) under drafts/<you>/<key>.json — one folder per person, read and
   written only with that person's own signed-in email. */
import { whoIs, json } from '../_auth.js';
const okKey = k => typeof k==='string' && /^(draft|custom)-[a-z0-9]{3,30}$/.test(k);
const folder = email => 'drafts/'+String(email).toLowerCase().replace(/[^a-z0-9@._-]/g,'_')+'/';
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none' || !me.email) return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json([]);
  const r = await env.STEPS.list({ prefix:folder(me.email) }), out=[];
  for(const o of r.objects){ const v = await (await env.STEPS.get(o.key))?.json().catch(()=>null); if(v) out.push(v); }
  return json(out);
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none' || !me.email) return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  if(!b || !['put','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(JSON.stringify(b).length > 3_000_000) return json({ error:'Too big.' }, 413);
  if(b.op==='put'){
    const it=b.item; if(!it || !okKey(it.key) || !it.model || !Array.isArray(it.model.pods)) return json({ error:'Bad draft.' }, 400);
    it.owner=me.email; it.saved=new Date().toISOString();
    await env.STEPS.put(folder(me.email)+it.key+'.json', JSON.stringify(it), { httpMetadata:{ contentType:'application/json' } });
    return json({ ok:true, saved:it.saved });
  }
  if(!okKey(b.key)) return json({ error:'Bad key.' }, 400);
  await env.STEPS.delete(folder(me.email)+b.key+'.json');
  return json({ ok:true });
}
