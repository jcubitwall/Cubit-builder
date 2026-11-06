/* The version of library items (walls, layers) as they were at a moment: for homes that are locked (signed, in
   production, built, archived), which keep what they were locked with however the library changes after.
   Each save keeps the version it replaces under <dir>/history/<id>/<its saved time>.json. */
const stamp = t => String(t).replace(/[:.]/g,'-');
/* → { id: the item as it was at `at` | null (it was not in the team library then) } */
export async function asOf(env, dir, current, ids, at){
  const out={}, A=stamp(at);
  for(const id of ids.slice(0,200)){
    if(!/^[A-Z]{1,3}\d{2}-[A-Z0-9]{1,8}$/.test(id)) continue;
    const cur=current.find(x=>x.id===id);
    if(cur && cur.saved && stamp(cur.saved)<=A){ out[id]=cur; continue; }
    const pre=`${dir}/history/${id}/`, L=await env.STEPS.list({ prefix:pre });
    const keys=(L.objects||[]).map(o=>o.key).filter(k=>k.slice(pre.length).replace(/\.json$/,'')<=A).sort();
    if(!keys.length){ out[id]=null; continue; }
    const o=await env.STEPS.get(keys[keys.length-1]); out[id]=o ? await o.json().catch(()=>null) : null;
  }
  return out;
}
