/* Cubit Builder — who is asking, and what they may do.
   The whole site sits behind Cloudflare Access, so only invited people get in at all. Access signs every
   request with a JWT (header Cf-Access-Jwt-Assertion / cookie CF_Authorization). We verify it here and
   look up the email's role (see whoIs below).

   Settings (Cloudflare Pages → Settings → Variables and secrets):
     ACCESS_TEAM    your Access team domain, e.g. cubit.cloudflareaccess.com (optional: if it is not set, the
                    team is read from the token's issuer, which must be a *.cloudflareaccess.com address)
     ACCESS_AUD     the Application Audience (AUD) tag of the Access application
     ADMIN_EMAILS   comma-separated admin emails
*/
let certCache = { at: 0, keys: [] };
const b64url = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')), c=>c.charCodeAt(0));
const cookie = (req, name) => (req.headers.get('Cookie')||'').split(/;\s*/).map(p=>p.split('=')).find(([k])=>k===name)?.[1];

async function verify(token, env){
  if(!token || !env.ACCESS_AUD) return null;
  const [h, p, sig] = token.split('.');
  if(!sig) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  let team = env.ACCESS_TEAM;
  if(!team){
    const iss = JSON.parse(new TextDecoder().decode(b64url(p))).iss || '';
    const m = iss.match(/^https:\/\/([a-z0-9-]+\.cloudflareaccess\.com)$/); if(!m) return null;
    team = m[1];
  }
  if(Date.now()-certCache.at > 3600e3 || certCache.team !== team){
    const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
    certCache = { at: Date.now(), team, keys: (await r.json()).keys || [] };
  }
  const jwk = certCache.keys.find(k=>k.kid===header.kid); if(!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
  if(!ok) return null;
  const claims = JSON.parse(new TextDecoder().decode(b64url(p)));
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if(!aud.includes(env.ACCESS_AUD) || claims.exp*1000 < Date.now()) return null;
  return claims;
}
/* Roles, lowest to highest:
     user     look at everything (explode, walls, labels, production guidance); saves nothing
     sales    + customers, swap walls, add / move pods, basic choices with a client, save to Purgatory / a customer
     editor   + everything that changes homes and libraries (panel builder, windows, plugs, delete, adopt into Cubit Homes)
     admin    + app settings, the team list, STEP uploads
   On top of any role, an admin can tick "Prices" for someone (an inventory person): they may change the price book,
   whatever their role. Editors and admins always may.
   ADMIN_EMAILS (Cloudflare setting) are always admins. Everyone else gets the role an admin gave them in the app
   (⋯ → Team, kept in the MariaDB table team_members); anyone else who can log in is a user. */
import { withSql, toISO } from './_sql.js';
export const RANK = { user:0, sales:1, editor:2, admin:3 };
export const ROLES = Object.keys(RANK);
let teamCache = { at:0, v:null };
export const forgetTeam = () => { teamCache = { at:0, v:null }; };
/* { email: { role, prices?, by, at } } */
export async function teamOf(env, fresh=false){
  if(!env.MARIADB) return {};
  if(!fresh && teamCache.v && Date.now()-teamCache.at < 15000) return teamCache.v;
  let v = {};
  try{ const rows = await withSql(env, db => db.q('SELECT email, role, prices, set_by, set_at FROM team_members'));
    for(const r of rows) v[r.email] = { role:r.role, ...(r.prices ? { prices:true } : {}), by:r.set_by, at:toISO(r.set_at) }; }
  catch(e){ console.warn('team', e.message); }
  teamCache = { at:Date.now(), v }; return v;
}
export async function whoIs(request, env){
  const claims = await verify(request.headers.get('Cf-Access-Jwt-Assertion') || cookie(request,'CF_Authorization'), env);
  if(!claims?.email) return { email:null, role:'none' };
  const mail = claims.email.toLowerCase();
  const admins = (env.ADMIN_EMAILS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  if(admins.includes(mail)) return { email: claims.email, role:'admin', fixed:true, prices:true };
  const t = (await teamOf(env))[mail];
  const role = RANK[t?.role] != null ? t.role : 'user';
  return { email: claims.email, role, prices: RANK[role] >= RANK.editor || !!t?.prices };
}
/* may change the price book: editors, admins, and anyone given "Prices" in the team list */
export const canPrice = me => atLeast(me,'editor') || !!me?.prices;
/* at least this role? */
export const atLeast = (me, role) => (RANK[me?.role] ?? -1) >= RANK[role];
const WHO = { sales:'salespeople, editors and admins', editor:'editors and admins', admin:'admins', prices:'editors, admins and people given Prices in the team list' };
export const denied = role => new Response(JSON.stringify({ error:`Only ${WHO[role]} can do that.` }), { status:403, headers:{ 'content-type':'application/json', 'cache-control':'no-store' } });
export const json = (obj, status=200) => new Response(JSON.stringify(obj), { status, headers:{ 'content-type':'application/json', 'cache-control':'no-store' } });
