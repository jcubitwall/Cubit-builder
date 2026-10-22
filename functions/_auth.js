/* Cubit Builder — who is asking, and what they may do.
   The whole site sits behind Cloudflare Access, so only invited people get in at all. Access signs every
   request with a JWT (header Cf-Access-Jwt-Assertion / cookie CF_Authorization). We verify it here and
   look the email up in ADMIN_EMAILS: admins can upload STEP files; everyone else is a viewer.

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
export async function whoIs(request, env){
  const claims = await verify(request.headers.get('Cf-Access-Jwt-Assertion') || cookie(request,'CF_Authorization'), env);
  if(!claims?.email) return { email:null, role:'none' };
  const admins = (env.ADMIN_EMAILS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  return { email: claims.email, role: admins.includes(claims.email.toLowerCase()) ? 'admin' : 'viewer' };
}
export const json = (obj, status=200) => new Response(JSON.stringify(obj), { status, headers:{ 'content-type':'application/json', 'cache-control':'no-store' } });
