/* GET  /api/team   admins: who has which role  { members:{ email:{role, prices?, by, at} }, admins:[from ADMIN_EMAILS] }
   POST /api/team   admins: {op:'set', email, role, prices?}  ·  {op:'remove', email}
   prices: may change the price book whatever the role (an inventory person); left out, it stays as it was.
   Roles: admin · editor · sales · user (see _auth.js). Kept in MariaDB (team_members). ADMIN_EMAILS (Cloudflare
   setting) are always admins and can't be changed here, so nobody can lock the admins out. */
import { whoIs, json, atLeast, denied, ROLES, forgetTeam, teamOf } from '../_auth.js';
import { withSql, toDT } from '../_sql.js';
const okMail = e => typeof e === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);
const fixed = env => (env.ADMIN_EMAILS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
export async function onRequestGet({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'admin')) return denied('admin');
  return json({ members:await teamOf(env, true), admins:fixed(env) });
}
export async function onRequestPost({ request, env }){
  const me = await whoIs(request, env); if(!atLeast(me,'admin')) return denied('admin');
  const b = await request.json().catch(()=>null);
  const mail = String(b?.email||'').trim().toLowerCase();
  if(!b || !['set','remove'].includes(b.op) || !okMail(mail)) return json({ error:'Give an email address.' }, 400);
  if(fixed(env).includes(mail)) return json({ error:'That person is an admin in the Cloudflare settings (ADMIN_EMAILS) and stays one.' }, 400);
  if(b.op==='set' && !ROLES.includes(b.role)) return json({ error:'Unknown role.' }, 400);
  await withSql(env, async db => {
    if(b.op==='set'){
      // prices left out: it stays as it was
      const cur = await db.one('SELECT prices FROM team_members WHERE email=?', [mail]);
      const pr = typeof b.prices==='boolean' ? b.prices : !!cur?.prices;
      await db.q(`INSERT INTO team_members (email, role, prices, set_by, set_at) VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE role=VALUES(role), prices=VALUES(prices), set_by=VALUES(set_by), set_at=VALUES(set_at)`, [mail, b.role, pr?1:0, me.email, toDT(new Date().toISOString())]);
    } else await db.q('DELETE FROM team_members WHERE email=?', [mail]);
  });
  forgetTeam();
  return json({ ok:true, members:await teamOf(env, true), admins:fixed(env) });
}
