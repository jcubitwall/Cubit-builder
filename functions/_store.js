/* Cubit Builder — safe saves to the shared R2 files.
   Each shared list (projects, walls, floors and roofs, shapes, sub-models, library edits) is one JSON file. Two saves
   at the same moment used to read the same file and the second write wiped out the first. atomic() writes only if
   the file is still the one it read (R2's etag check); if someone else's save got there first it reads again, redoes
   the change on top of theirs and tries again. */
import { json } from './_auth.js';
const J = { httpMetadata:{ contentType:'application/json' } };
export const putJSON = (env, key, v) => env.STEPS.put(key, JSON.stringify(v), J);
export async function getJSON(env, key, empty){
  const o = await env.STEPS.get(key); if(!o) return empty();
  try{ return await o.json(); }catch(e){ return empty(); }
}
/* mutate(value) → { value, ...anything to hand back }, or a Response to stop with (an error) */
export async function atomic(env, key, empty, mutate){
  for(let i=0; i<8; i++){
    const o = await env.STEPS.get(key); let v = empty();
    if(o){ try{ v = await o.json(); }catch(e){} }
    const r = await mutate(v);
    if(r instanceof Response) return { response:r };
    const ok = await env.STEPS.put(key, JSON.stringify(r.value), o ? { ...J, onlyIf:{ etagMatches:o.etag } } : J);
    if(ok) return r;
    await new Promise(s => setTimeout(s, 30 + Math.random()*100*(i+1)));
  }
  return { response: json({ error:"The server was busy with someone else's save. Try again." }, 503) };
}
