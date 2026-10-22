/* Signs and checks the one-hour download links handed to the scan (see api/file.js). */
const enc = new TextEncoder();
export async function mac(env, msg){
  const key = await crypto.subtle.importKey('raw', enc.encode(env.IMPORT_SECRET), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function signLink(env, origin, id, seconds=3600){
  const exp = Math.floor(Date.now()/1000) + seconds;
  return `${origin}/api/file?id=${id}&exp=${exp}&sig=${await mac(env, `${id}.${exp}`)}`;
}
