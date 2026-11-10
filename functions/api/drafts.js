/* GET  /api/drafts                       your own drafts (nobody else sees them)
   POST /api/drafts {op:'put', item}      save one draft  (item.key = draft-…/custom-…)
        {op:'delete', key}                delete one of yours
   Kept in MongoDB: drafts, one document per draft, _id = "<your email>/<key>", read and written only with that
   person's own signed-in email. */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { mongo, bare } from '../_mongo.js';
const okKey = k => typeof k==='string' && /^(draft|custom)-[a-z0-9]{3,30}$/.test(k);
const owner = email => String(email).toLowerCase();
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none' || !me.email) return json({ error:'Not signed in.' }, 401);
  return json((await mongo(env).coll('drafts').find({ owner_key:owner(me.email) })).map(bare));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none' || !me.email) return json({ error:'Not signed in.' }, 401);
  const b = await request.json().catch(()=>null);
  if(!b || !['put','delete'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(!atLeast(me,'sales')) return denied('sales');
  if(JSON.stringify(b).length > 3_000_000) return json({ error:'Too big.' }, 413);
  const D = mongo(env).coll('drafts');
  if(b.op==='put'){
    const it=b.item; if(!it || !okKey(it.key) || !it.model || !Array.isArray(it.model.pods)) return json({ error:'Bad draft.' }, 400);
    it.owner=me.email; it.saved=new Date().toISOString();
    await D.put({ ...it, _id:`${owner(me.email)}/${it.key}`, owner_key:owner(me.email) });
    return json({ ok:true, saved:it.saved });
  }
  if(!okKey(b.key)) return json({ error:'Bad key.' }, 400);
  await D.del(`${owner(me.email)}/${b.key}`);
  return json({ ok:true });
}
