/* GET  /api/customers                       every customer (salespeople and up; users see names and homes only)
   GET  /api/customers?signed=<id>&home=<p>  the signed record of one home (signatures + the summary signed)
   POST /api/customers  salespeople and up:
        {op:'save', item}                     add or update a customer (profile, linked homes, selections)
        {op:'sign', id, home, rec}            both signatures + the summary of the home as signed
        {op:'delete', id}                     editors and up: hidden at once, kept two weeks, then gone
        {op:'photo', id, home, data}          a picture of the home (a JPEG data URL, from Build's snapshot), kept for good
   GET  /api/customers?photos=<id>           the customer's pictures: [{ key, at, size }]
   GET  /api/customers?photo=<key>           one picture (salespeople and up)
   R2: customers/index.json (the list) and customers/<id>/signed-<home>-<time>.json (each signing, kept for good). */
import { whoIs, json, atLeast, denied } from '../_auth.js';
import { atomic, getJSON, putJSON } from '../_store.js';
const KEY = 'customers/index.json', KEEP = 14*24*3600*1000;
const okId = id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
const str = (v, n=200) => String(v??'').slice(0, n);
const FIELDS = { name:80, company:80, email:120, phone:40, address:200, site:200, notes:2000, status:40 };
function clean(it, cur){
  const out = { ...(cur||{}), id:it.id };
  Object.entries(FIELDS).forEach(([k,n])=>{ if(k in it) out[k]=str(it[k], n); });
  if(Array.isArray(it.homes)) out.homes = [...new Set(it.homes.filter(okId))].slice(0,40);
  if(it.selections && typeof it.selections==='object') out.selections = JSON.parse(JSON.stringify(it.selections).slice(0, 200000));
  if(it.signed && typeof it.signed==='object' && !cur?.signed) out.signed = it.signed;
  return out;
}
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(me.role === 'none') return json({ error:'Not signed in.' }, 401);
  if(!env.STEPS) return json([]);
  const u = new URL(request.url), sid = u.searchParams.get('signed'), home = u.searchParams.get('home');
  const pList = u.searchParams.get('photos'), pOne = u.searchParams.get('photo');
  if(pList || pOne){ if(!atLeast(me,'sales')) return denied('sales');
    if(pList){ if(!okId(pList)) return json({ error:'Bad id.' }, 400);
      const r = await env.STEPS.list({ prefix:`customers/${pList}/photos/` });
      return json(r.objects.map(o=>({ key:o.key, size:o.size, at:o.uploaded })).sort((a,b)=>a.key<b.key?1:-1)); }
    if(!/^customers\/[a-z0-9-]{1,40}\/photos\/[a-z0-9-]{1,80}\.jpg$/.test(pOne)) return json({ error:'Bad key.' }, 400);
    const obj = await env.STEPS.get(pOne); if(!obj) return new Response('Not found', { status:404 });
    return new Response(obj.body, { headers:{ 'content-type':'image/jpeg', 'cache-control':'private, max-age=86400' } }); }
  if(sid){ if(!atLeast(me,'sales')) return denied('sales'); if(!okId(sid) || !okId(home)) return json({ error:'Bad id.' }, 400);
    const r = await env.STEPS.list({ prefix:`customers/${sid}/signed-${home}-` }); const last = r.objects.sort((a,b)=>a.key<b.key?1:-1)[0];
    return json(last ? await getJSON(env, last.key, ()=>null) : null); }
  const L = (await getJSON(env, KEY, ()=>[])).filter(c => !c.deleted || Date.now()-Date.parse(c.deleted.at) < KEEP);
  // production (users) needs to know whose home it is, not their contact details
  return json(atLeast(me,'sales') ? L : L.filter(c=>!c.deleted).map(c=>({ id:c.id, name:c.name, homes:c.homes||[], signed:c.signed||{} })));
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'sales')) return denied('sales');
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  if(!b || !['save','sign','delete','restore','photo'].includes(b.op)) return json({ error:'Bad request.' }, 400);
  if(JSON.stringify(b).length > 3_000_000) return json({ error:'Too big.' }, 413);
  if(['delete','restore'].includes(b.op) && !atLeast(me,'editor')) return denied('editor');
  const now = new Date().toISOString();
  if(b.op === 'photo'){
    if(!okId(b.id) || (b.home && !okId(b.home))) return json({ error:'Bad id.' }, 400);
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data||'')); if(!m) return json({ error:'A JPEG picture is needed.' }, 400);
    const bin = Uint8Array.from(atob(m[1]), c=>c.charCodeAt(0));
    const key = `customers/${b.id}/photos/${(b.home||'home')}-${now.replace(/[:.TZ]/g,'').toLowerCase()}.jpg`;
    await env.STEPS.put(key, bin, { httpMetadata:{ contentType:'image/jpeg' }, customMetadata:{ by:String(me.email||''), at:now } });
    return json({ ok:true, key });
  }
  if(b.op === 'sign'){
    if(!okId(b.id) || !okId(b.home) || !b.rec?.sigRep || !b.rec?.sigClient) return json({ error:'Both signatures are needed.' }, 400);
    await putJSON(env, `customers/${b.id}/signed-${b.home}-${now.replace(/[:.]/g,'-')}.json`, { ...b.rec, at:now, by:me.email });
  }
  const r = await atomic(env, KEY, ()=>[], L=>{
    if(!Array.isArray(L)) L=[];
    const i = L.findIndex(c => c.id === (b.item?.id ?? b.id));
    if(b.op === 'save'){
      const it = b.item; if(!it || !okId(it.id) || !str(it.name).trim()) return json({ error:'A customer needs a name.' }, 400);
      const c = clean(it, i>=0 ? L[i] : null); c.log = [...(i>=0 ? L[i].log||[] : [{ at:now, by:me.email, what:'customer added' }]), ...(b.note ? [{ at:now, by:me.email, what:str(b.note,300) }] : [])].slice(-200);
      if(i < 0){ c.created = now; c.by = me.email; L.unshift(c); } else L[i] = c;
    } else {
      if(i < 0) return json({ error:'No such customer.' }, 404);
      const c = { ...L[i] };
      if(b.op === 'sign'){ c.signed = { ...(c.signed||{}), [b.home]:{ at:now, by:me.email, rep:str(b.rec.rep,80), client:str(b.rec.client,80) } }; c.status = 'Signed'; c.log = [...(c.log||[]), { at:now, by:me.email, what:`home ${b.home} signed and locked` }]; }
      else if(b.op === 'delete'){ c.deleted = { at:now, by:me.email }; c.log = [...(c.log||[]), { at:now, by:me.email, what:'deleted' }]; }
      else { delete c.deleted; c.log = [...(c.log||[]), { at:now, by:me.email, what:'restored' }]; }
      L[i] = c;
    }
    // gone for good after two weeks
    return { value:L.filter(c => !c.deleted || Date.now()-Date.parse(c.deleted.at) < KEEP) };
  });
  if(r.response) return r.response;
  return json({ ok:true, customers:r.value });
}
