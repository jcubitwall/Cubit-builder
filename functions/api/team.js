/* GET  /api/team   admins: who has which role  { members:{ email:{role, by, at} }, admins:[from ADMIN_EMAILS] }
   POST /api/team   admins: {op:'set', email, role}  ·  {op:'remove', email}
   Roles: admin · editor · sales · user (see _auth.js). Kept in R2 at catalog/team.json. ADMIN_EMAILS (Cloudflare
   setting) are always admins and can't be changed here, so nobody can lock the admins out. */
import { whoIs, json, atLeast, denied, ROLES, TEAM_KEY, forgetTeam } from '../_auth.js';
import { atomic, getJSON } from '../_store.js';
const okMail = e => typeof e === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);
const fixed = env => (env.ADMIN_EMAILS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'admin')) return denied('admin');
  const v = env.STEPS ? await getJSON(env, TEAM_KEY, ()=>({ members:{} })) : { members:{} };
  return json({ members:v.members||{}, admins:fixed(env) });
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'admin')) return denied('admin');
  if(!env.STEPS) return json({ error:'Storage is not set up (R2 binding STEPS).' }, 500);
  const b = await request.json().catch(()=>null);
  const mail = String(b?.email||'').trim().toLowerCase();
  if(!b || !['set','remove'].includes(b.op) || !okMail(mail)) return json({ error:'Give an email address.' }, 400);
  if(fixed(env).includes(mail)) return json({ error:'That person is an admin in the Cloudflare settings (ADMIN_EMAILS) and stays one.' }, 400);
  if(b.op==='set' && !ROLES.includes(b.role)) return json({ error:'Unknown role.' }, 400);
  const r = await atomic(env, TEAM_KEY, ()=>({ members:{} }), v=>{
    const m = { ...(v.members||{}) };
    if(b.op==='set') m[mail] = { role:b.role, by:me.email, at:new Date().toISOString() }; else delete m[mail];
    return { value:{ members:m } };
  });
  if(r.response) return r.response;
  forgetTeam();
  return json({ ok:true, members:r.value.members, admins:fixed(env) });
}
