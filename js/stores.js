/* Cubit Builder — stores.js : store catalogues (Home Depot …) shown under any Library category, and adopting
   their products into the Cubit library.

   the stores catalogue (api/seed/stores) (tools/stores/*.py): each store's short lists by Library category key ('fire' fireplaces; the
   same keys as the Library: 'appliance', 'rc' receptacles, 'sw' switches, 'dt' data …) of products that can be
   ordered online and shipped to Cubit. The Library shows each list as "<store> store" right under its category.
   Adopt (editors and admins) puts a product in the Cubit library for the whole team (api/adopted; this browser
   when opened locally): a cabinet-library category gets a fixed-size item of that size (casework.js
   defStoreItem; a fireplace insert also becomes an Insert choice in the surround); a plug / switch / data
   category gets a device (devices.js); a device box ('bx', e.g. Eddy Group) joins the Cubit box catalogue (boxes.js). */
import { CATS, defStoreItem } from './casework.js';
import { saveDevice, deviceById } from './devices.js';
import { addBox } from './boxes.js';

const STORES=[], ADOPTED=[]; let remote=false; const LOCAL='cubit-adopted';
const subs=[]; const onAdoptedChanged = fn => subs.push(fn);
let teamRemote=false; const TEAM_LOCAL='cubit-team-stores';
let TEAM_INFO=null;   // the team's product details came with the stores (productmedia.js reads them: no second trip)
const teamInfo = () => TEAM_INFO;
async function loadStores(){
  try{ const r=await fetch('api/seed/stores'); if(r.ok){ STORES.length=0; ((await r.json()).stores||[]).forEach(s=>STORES.push(s)); } }catch(e){}
  // the team's own stores, local or online (api/stores; this browser when opened locally)
  let T=null;
  try{ const r=await fetch('api/stores',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ const j=await r.json(); T=j.stores||[]; TEAM_INFO=j.info||{}; teamRemote=true; } }catch(e){}
  if(!T){ try{ T=JSON.parse(localStorage.getItem(TEAM_LOCAL)||'[]'); }catch(e){ T=[]; } }
  T.forEach(s=>{ if(!STORES.some(x=>x.id===s.id)) STORES.push({ ...s, team:true }); });
  let L=null;
  try{ const r=await fetch('api/adopted',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ L=await r.json(); remote=true; } }catch(e){}
  if(!L){ try{ L=JSON.parse(localStorage.getItem(LOCAL)||'[]'); }catch(e){ L=[]; } }
  ADOPTED.length=0; (L||[]).forEach(a=>{ ADOPTED.push(a); register(a); });
}
const storeById = id => STORES.find(s=>s.id===id) || null;
/* the stores that have a list for a Library category key: [{ store, items }] */
const storesFor = key => STORES.filter(s=>s.cats?.[key]?.length || (s.team && s.cats && key in s.cats)).map(s=>({ store:s, items:s.cats[key]||[] }));
/* the team's own stores: add / change one (with its lists), or take one off */
async function saveTeamStore(st){
  const s={ ...st, team:true };
  if(teamRemote){ const r=await fetch('api/stores',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'save', store:s})}); const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error||`Server said ${r.status}`); }
  else { const L=STORES.filter(x=>x.team && x.id!==s.id); try{ localStorage.setItem(TEAM_LOCAL, JSON.stringify([s, ...L])); }catch(e){} }
  const i=STORES.findIndex(x=>x.id===s.id); if(i>=0) STORES[i]=s; else STORES.push(s);
  subs.forEach(f=>{ try{ f(); }catch(e){} }); return s;
}
async function deleteTeamStore(id){
  if(teamRemote){ const r=await fetch('api/stores',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'delete', id})}); const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error||`Server said ${r.status}`); }
  const i=STORES.findIndex(x=>x.id===id && x.team); if(i>=0) STORES.splice(i,1);
  if(!teamRemote){ try{ localStorage.setItem(TEAM_LOCAL, JSON.stringify(STORES.filter(x=>x.team))); }catch(e){} }
  subs.forEach(f=>{ try{ f(); }catch(e){} });
}
/* which categories a store product can be adopted into the Cubit library from */
const canAdopt = cat => isCasework(cat) || ['sw','rc','dt','bx'].includes(cat);
const adoptId = (storeId, cat, sku) => `${storeId}:${cat}:${sku}`;
const isAdopted = (storeId, cat, sku) => ADOPTED.some(a=>a.id===adoptId(storeId, cat, sku));
const isCasework = cat => CATS.some(c=>c.k===cat);
/* make an adopted product usable: an item in the cabinet library, or a device */
function register(a){
  const s=storeById(a.store), P={ ...a.product, storeId:a.store, store:s?.name||a.store };
  if(isCasework(a.cat)) return defStoreItem(a.cat, P);
  if(a.cat==='bx') return addBox(a.product, a.store, s?.name||a.store);   // a device box: into the Cubit box catalogue
  return null;
}
async function adopt(storeId, cat, P){
  const a={ id:adoptId(storeId, cat, P.sku), store:storeId, cat, product:P };
  if(!isCasework(cat) && cat!=='bx'){   // a plug, switch or data device: into the device library
    const id=`${cat.toUpperCase()}-HD${P.sku}`.slice(0,48);
    if(!deviceById(id)) await saveDevice({ id, kind:cat, name:P.name, note:`${P.brand} ${P.model} · SKU ${P.sku}`, store:{ id:storeId, sku:P.sku, url:P.url, price:P.price } });
  }
  if(remote){ const r=await fetch('api/adopted',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'save', item:a})});
    const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error || `Server said ${r.status}`); }
  else { let L=[]; try{ L=JSON.parse(localStorage.getItem(LOCAL)||'[]'); }catch(e){} L=L.filter(x=>x.id!==a.id); L.unshift({ ...a, at:new Date().toISOString() }); try{ localStorage.setItem(LOCAL, JSON.stringify(L)); }catch(e){} }
  if(!ADOPTED.some(x=>x.id===a.id)) ADOPTED.unshift(a);
  const it=register(a); subs.forEach(f=>{ try{ f(); }catch(e){} }); return it;
}
export { teamInfo, STORES, ADOPTED, loadStores, storeById, storesFor, isAdopted, adopt, onAdoptedChanged, saveTeamStore, deleteTeamStore, canAdopt };
