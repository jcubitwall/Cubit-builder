/* A short-lived download link for one object in the R2 bucket (S3 "presigned URL", SigV4), so the GitHub
   Action can fetch an uploaded STEP file without any keys of its own.
   Pages secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET. */
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(key, s){ const k = await crypto.subtle.importKey('raw', typeof key==='string'?enc.encode(key):key, {name:'HMAC', hash:'SHA-256'}, false, ['sign']); return crypto.subtle.sign('HMAC', k, enc.encode(s)); }
const uri = s => encodeURIComponent(s).replace(/[!'()*]/g, c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
export async function presignGet(env, key, seconds=3600, now=new Date()){
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region='auto', service='s3';
  const amz = now.toISOString().replace(/[-:]|\.\d{3}/g,''), day = amz.slice(0,8);
  const scope = `${day}/${region}/${service}/aws4_request`;
  const path = `/${env.R2_BUCKET}/${key.split('/').map(uri).join('/')}`;
  const q = { 'X-Amz-Algorithm':'AWS4-HMAC-SHA256', 'X-Amz-Credential':`${env.R2_ACCESS_KEY_ID}/${scope}`, 'X-Amz-Date':amz, 'X-Amz-Expires':String(seconds), 'X-Amz-SignedHeaders':'host' };
  const qs = Object.keys(q).sort().map(k=>`${uri(k)}=${uri(q[k])}`).join('&');
  const canonical = ['GET', path, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, await sha256(canonical)].join('\n');
  let k = await hmac('AWS4'+env.R2_SECRET_ACCESS_KEY, day); k = await hmac(k, region); k = await hmac(k, service); k = await hmac(k, 'aws4_request');
  const sig = hex(await hmac(k, toSign));
  return `https://${host}${path}?${qs}&X-Amz-Signature=${sig}`;
}
