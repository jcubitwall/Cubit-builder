/* Cubit Builder — kitchens.js : saved kitchens (cabinet groups) to drop into any home.
   On the private site they're the team's (api/kitchens, editors and admins save); opened locally, in this browser.
   A home keeps its own copy of a kitchen once it's dropped in: saving a kitchen again never changes homes that use it. */
const KITCHENS=[]; let remote=false; const subs=[];
/* tell the tray and the Library when the list changes */
const onKitchensChanged = fn => subs.push(fn);
const changed = () => subs.forEach(f=>{ try{ f(); }catch(e){} }); const LOCAL='cubit-kitchens';
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36) || 'kitchen';
async function loadKitchens(){
  try{ const r=await fetch('api/kitchens',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ KITCHENS.length=0; (await r.json()).forEach(k=>KITCHENS.push(k)); remote=true; return; } }catch(e){}
  try{ KITCHENS.length=0; JSON.parse(localStorage.getItem(LOCAL)||'[]').forEach(k=>KITCHENS.push(k)); }catch(e){}
}
const kitchenById = id => KITCHENS.find(k=>k.id===id) || null;
const newKitchenId = name => `${slug(name)}-${Date.now().toString(36).slice(-4)}`;
/* overwrite: true only after the person confirmed saving over the existing one */
async function saveKitchen(item, overwrite=false){
  if(remote){ const r=await fetch('api/kitchens',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'save', item, overwrite})});
    const out=await r.json().catch(()=>({})); if(!r.ok) throw new Error(out.error || `Server said ${r.status}`); KITCHENS.length=0; (out.kitchens||[]).forEach(k=>KITCHENS.push(k)); changed(); return kitchenById(item.id); }
  const i=KITCHENS.findIndex(k=>k.id===item.id); if(i>=0 && !overwrite) throw new Error('Confirm to save over it.');
  const out={ ...item, saved:new Date().toISOString(), rev:(i>=0?(KITCHENS[i].rev||0):0)+1 }; if(i>=0) KITCHENS[i]=out; else KITCHENS.unshift(out);
  try{ localStorage.setItem(LOCAL, JSON.stringify(KITCHENS)); }catch(e){} changed(); return out;
}
async function deleteKitchen(id){
  if(remote){ const r=await fetch('api/kitchens',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'delete', id})}); const out=await r.json().catch(()=>({})); if(!r.ok) throw new Error(out.error || `Server said ${r.status}`); KITCHENS.length=0; (out.kitchens||[]).forEach(k=>KITCHENS.push(k)); changed(); return; }
  const i=KITCHENS.findIndex(k=>k.id===id); if(i>=0) KITCHENS.splice(i,1); try{ localStorage.setItem(LOCAL, JSON.stringify(KITCHENS)); }catch(e){} changed();
}
export { onKitchensChanged, KITCHENS, loadKitchens, kitchenById, newKitchenId, saveKitchen, deleteKitchen };
