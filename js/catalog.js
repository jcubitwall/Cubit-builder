/* Cubit Builder — catalog.js : the model families and their sub-models.

   Every home is filed under one of the model names in data/families.json (LifePod, Nest, Haven, Cove,
   Panorama, Expanse). Under each name: the standard layout (models.json), then sub-models: offshoots with a
   pod or two more, or variations customers asked for and we liked. Any arrangement on screen (a built-in
   home, your own layout, a project) can be added to any model name as a sub-model.

   Sub-models are shared: on the private site they live on the server (api/catalog, admins add and change
   them, everyone sees them). Opened from a file or a local server they're kept in this browser instead.
   A sub-model carries everything a project does (layout, wall choices, Wall A, faces, foundation, windows and
   doors) plus any library items it uses that aren't in the shared library files. */
import { MODELS, LIB, LAYERLIB, PODLIB, DECKLIB } from './data.js';
import { state, save } from './state.js';
import { snapshot, libraryFor } from './projects.js';
import { email } from './role.js';

const FAMILIES = [];
const SUBS = {};
const LOCAL_KEY = 'cubit-submodels';
let remote = false;
const clone = o => JSON.parse(JSON.stringify(o));

async function loadCatalog(){
  try{ const r=await fetch('data/families.json'); if(r.ok) (await r.json()).forEach(f=>FAMILIES.push(f)); }catch(e){}
  if(!FAMILIES.length) FAMILIES.push(...[['lifepod','LifePod','life'],['nest','Nest','nest'],['haven','Haven',null],['cove','Cove','cove'],['panorama','Panorama','panorama'],['expanse','Expanse','expanse']].map(([id,name,base])=>({id,name,base})));
  FAMILIES.forEach(f=>{ if(f.base && MODELS[f.base]) MODELS[f.base].family=f.id; });
  let list=null;
  try{ const r=await fetch('api/catalog',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ list=await r.json(); remote=true; } }catch(e){}
  if(!Array.isArray(list)){ try{ list=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]'); }catch(e){ list=[]; } }
  try{ const r=await fetch('data/submodels.json'); if(r.ok) (await r.json()).forEach(it=>{ if(!list.find(x=>x.id===it.id)) list.push(it); }); }catch(e){}
  list.forEach(register);
}
const keyOf = it => 'sub-'+it.id;
/* the sub-model's own choices become the model's defaults, so everyone sees the same thing; anything you
   change on screen afterwards is yours until an admin saves it back */
function register(it){
  SUBS[it.id]=it;
  const lib=it.library||{};
  (lib.walls||[]).forEach(w=>{ if(!LIB.find(x=>x.id===w.id)) LIB.push({...w, src:'catalog'}); });
  (lib.layers||[]).forEach(l=>{ if(!LAYERLIB.find(x=>x.id===l.id)) LAYERLIB.push({...l, src:'catalog'}); });
  (lib.pods||[]).forEach(q=>{ if(!PODLIB.find(x=>x.id===q.id)) PODLIB.push({...q, src:'catalog'}); });
  (lib.decks||[]).forEach(q=>{ if(!DECKLIB.find(x=>x.id===q.id)) DECKLIB.push({...q, src:'catalog'}); });
  const m=clone(it.model), wallA={...(m.wallA||{})};
  Object.entries(it.wallA||{}).forEach(([i,side])=>{ wallA[+i+1]=side; });
  MODELS[keyOf(it)] = { ...m, name:it.name, size:m.size||'', family:it.family, sub:it.id, note:it.note||m.note, custom:false, project:undefined,
    picks:{...(m.picks||{}), ...(it.picks||{})}, layerPicks:{...(m.layerPicks||{}), ...(it.layerPicks||{})}, wallA,
    units:it.units||{}, found:it.found, deckOC:it.deckOC, bearing:it.bearing };
  const k=keyOf(it);
  if(it.faces && !state.faces[k]) state.faces[k]=clone(it.faces);
}
const familyById = id => FAMILIES.find(f=>f.id===id);
function familyOf(key){
  const m=MODELS[key]; if(!m) return null;
  if(m.family) return m.family;
  if(m.base && MODELS[m.base]?.family) return MODELS[m.base].family;
  return null;
}
/* the homes filed under a model name: the standard one, the shared sub-models, then your own layouts */
function variantsOf(fam){
  const ks=Object.keys(MODELS).filter(k=>!MODELS[k].project && !MODELS[k].deleted && familyOf(k)===fam);
  const rank=k=>{ const m=MODELS[k]; return familyById(fam)?.base===k ? 0 : m.sub ? 1 : 2; };
  return ks.sort((a,b)=>rank(a)-rank(b) || MODELS[a].name.localeCompare(MODELS[b].name));
}
async function store(op, payload){
  if(remote){
    const r=await fetch('api/catalog',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op, ...payload})});
    const out=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(out.error || `Server said ${r.status}`);
    return;
  }
  try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(Object.values(SUBS))); }catch(e){}
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,28) || 'model';
/* add what's on screen to a model name, or save it back over the sub-model it is */
async function saveSub({family, name, note, id}){
  const from=state.model, snap=snapshot(name, id||'x');
  const nid = id || `${slug(name)}-${Date.now().toString(36).slice(-4)}`;
  const it = { id:nid, family, name, note:note||'', saved:new Date().toISOString(), by:email()||'',
    model:{...snap.model, name, base:familyById(family)?.base||snap.model.base}, picks:snap.picks, layerPicks:snap.layerPicks, wallA:snap.wallA,
    faces:snap.faces, found:snap.found, deckOC:snap.deckOC, units:snap.units, bearing:snap.bearing };
  if(!it.model.base) delete it.model.base;
  it.library=libraryFor(it);
  const prev=SUBS[nid]; SUBS[nid]=it;
  try{ await store('upsert', {item:it}); }catch(e){ if(prev) SUBS[nid]=prev; else delete SUBS[nid]; throw e; }
  register(it);
  // the catalog now holds these choices: clear this browser's overrides for it
  const k=keyOf(it); ['picks','layerPicks','wallA','units','found','deckOC','bearing'].forEach(f=>{ if(state[f]) delete state[f][k]; });
  state.faces[k]=clone(it.faces||{});
  if(from!==k && MODELS[from]?.custom){ /* your own layout stays as it was */ }
  state.model=k; state.selected=null; save();
  return k;
}
async function removeSub(id){
  const it=SUBS[id]; delete SUBS[id];
  try{ await store('delete', {id}); }catch(e){ SUBS[id]=it; throw e; }
  delete MODELS['sub-'+id];
  if(state.model==='sub-'+id){ state.model=familyById(it.family)?.base || 'life'; save(); }
}
async function editSub(id, changes){
  const it={...SUBS[id], ...changes};
  const prev=SUBS[id]; SUBS[id]=it;
  try{ await store('upsert', {item:it}); }catch(e){ SUBS[id]=prev; throw e; }
  register(it);
}
export { FAMILIES, SUBS, loadCatalog, familyOf, familyById, variantsOf, saveSub, removeSub, editSub };
