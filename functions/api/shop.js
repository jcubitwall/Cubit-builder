/* GET  /api/shop?home=<key>          what's been ticked off on that home's shopping list (admins)
   POST /api/shop {home, key, done}   tick or untick one line (admins)
   Kept in the R2 bucket (binding STEPS) as shop/<home>.json, shared by every admin. */
import { whoIs, json } from '../_auth.js';
const ok = h => typeof h==='string' && /^[a-z0-9_-]{1,80}$/i.test(h);
async function read(env, home){ const o=await env.STEPS.get(`shop/${home}.json`); if(!o) return {}; try{ return await o.json(); }catch(e){ return {}; } }
export async function onRequestGet({ request, env }){
  const me=await whoIs(request, env); if(me.role!=='admin') return json({ error:'Admins only.' }, 403);
  const home=new URL(request.url).searchParams.get('home'); if(!ok(home)) return json({ error:'Bad home.' }, 400);
  return json(env.STEPS ? await read(env, home) : {});
}
export async function onRequestPost({ request, env }){
  const me=await whoIs(request, env); if(me.role!=='admin') return json({ error:'Admins only.' }, 403);
  if(!env.STEPS) return json({ error:'Storage is not set up.' }, 500);
  const b=await request.json().catch(()=>null);
  if(!b || !ok(b.home) || typeof b.key!=='string' || b.key.length>200) return json({ error:'Bad request.' }, 400);
  const cur=await read(env, b.home);
  if(b.done) cur[b.key]={ by:me.email, at:new Date().toISOString() }; else delete cur[b.key];
  await env.STEPS.put(`shop/${b.home}.json`, JSON.stringify(cur), { httpMetadata:{ contentType:'application/json' } });
  return json(cur);
}
