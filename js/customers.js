/* Cubit Builder — customers.js : the customer list and what's signed.

   A customer has a profile (name, contact, site, notes), their home(s) and, per home, the selections: everything
   picked in the home itself (pods, windows and doors, cabinets, appliances, fixtures, foundation, decks) plus the
   finishes typed in on the profile (cladding and colours, flooring, cabinet finish…). A customer's home is a team
   project with project.customer = the customer's id (projects.js); a project without a customer is in Unassigned.

   Signing: the customer and the Cubit rep both sign on the iPad. The signatures and the summary as signed are kept
   for good (server), the home locks (no more saves) and stays locked until an editor or admin unlocks it, giving a
   reason and any fee; every unlock is logged on the home and the customer.

   On the private site customers live on the server (api/customers); opened locally, in this browser. */
import { MODELS } from './data.js';
import { state } from './state.js';
import { podList, deckList } from './layout.js';
import { foundationOf } from './state.js';
import { itemDef } from './casework.js';
import { schedules, homeModel } from './blueprint.js';
import { fin } from './format.js';

const LOCAL='cubit-customers', KEEP=14*24*3600*1000;
const CUSTOMERS=[]; let remote=false;
const clone = o => JSON.parse(JSON.stringify(o));
const newCustomerId = () => 'c-'+Date.now().toString(36);
const live = () => CUSTOMERS.filter(c=>!c.deleted);
const customerById = id => CUSTOMERS.find(c=>c.id===id) || null;
function setAll(list){ CUSTOMERS.length=0; (list||[]).forEach(c=>CUSTOMERS.push(c)); }
async function loadCustomers(){
  try{ const r=await fetch('api/customers',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ setAll(await r.json()); remote=true; return; } }catch(e){}
  try{ setAll(JSON.parse(localStorage.getItem(LOCAL)||'[]').filter(c=>!c.deleted || Date.now()-Date.parse(c.deleted.at)<KEEP)); }catch(e){}
}
function persist(){ try{ localStorage.setItem(LOCAL, JSON.stringify(CUSTOMERS)); }catch(e){} }
async function post(body){
  const r=await fetch('api/customers',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
  const out=await r.json().catch(()=>({})); if(!r.ok) throw new Error(out.error || `Server said ${r.status}`);
  if(out.customers) setAll(out.customers); return out;
}
async function saveCustomer(item, note){
  if(remote){ await post({op:'save', item, ...(note?{note}:{})}); return customerById(item.id); }
  const i=CUSTOMERS.findIndex(c=>c.id===item.id), now=new Date().toISOString();
  const c={ ...(i>=0?CUSTOMERS[i]:{ created:now, log:[{at:now, what:'customer added'}] }), ...clone(item) };
  if(note) c.log=[...(c.log||[]), {at:now, what:note}];
  if(i>=0) CUSTOMERS[i]=c; else CUSTOMERS.unshift(c); persist(); return c;
}
async function linkHome(cid, homeId){ const c=customerById(cid); if(!c) return; const homes=[...new Set([...(c.homes||[]), homeId])]; return saveCustomer({ ...c, homes }, `home ${homeId} linked`); }
async function unlinkHome(cid, homeId){ const c=customerById(cid); if(!c) return; return saveCustomer({ ...c, homes:(c.homes||[]).filter(h=>h!==homeId) }, `home ${homeId} unlinked`); }
async function signHome(cid, homeId, rec){
  if(remote){ await post({op:'sign', id:cid, home:homeId, rec}); return; }
  const c=customerById(cid); const now=new Date().toISOString();
  c.signed={ ...(c.signed||{}), [homeId]:{ at:now, rep:rec.rep, client:rec.client } }; c.status='Signed';
  c.log=[...(c.log||[]), {at:now, what:`home ${homeId} signed and locked`}];
  try{ localStorage.setItem(`${LOCAL}-signed-${cid}-${homeId}`, JSON.stringify({ ...rec, at:now })); }catch(e){}
  persist();
}
async function signedRecord(cid, homeId){
  if(remote){ const r=await fetch(`api/customers?signed=${encodeURIComponent(cid)}&home=${encodeURIComponent(homeId)}`,{cache:'no-store'}); return r.ok ? r.json() : null; }
  try{ return JSON.parse(localStorage.getItem(`${LOCAL}-signed-${cid}-${homeId}`)||'null'); }catch(e){ return null; }
}
async function deleteCustomer(id){
  if(remote){ await post({op:'delete', id}); return; }
  const c=customerById(id); if(c){ c.deleted={ at:new Date().toISOString() }; persist(); }
}
async function restoreCustomer(id){
  if(remote){ await post({op:'restore', id}); return; }
  const c=customerById(id); if(c){ delete c.deleted; persist(); }
}

/* ---------------------------------------------------------------- what's in a home, for the profile and the signed summary */
const FINISHES = [
  ['cladding','Exterior cladding'], ['claddingColour','Cladding colour'], ['accent','Accent walls'], ['trim','Window & door frames'],
  ['flooring','Flooring'], ['walls','Interior wall finish'], ['ceiling','Ceiling finish'], ['cabinets','Cabinet finish'],
  ['counters','Countertops'], ['hardware','Hardware'], ['fixtures','Plumbing fixture finish'], ['other','Other'] ];
/* the selections built from the home on screen (key = its MODELS key) */
function homeSummary(k=state.model){
  const m=MODELS[k]; if(!m) return null;
  const keep=state.model; let H=null, S=null;
  try{ state.model=k; H=homeModel(k); S=schedules(H); } finally { state.model=keep; }
  const pods=podList(k), counts={}; pods.forEach(p=>counts[p.len]=(counts[p.len]||0)+1);
  const area=pods.reduce((a,p)=>a+p.len*8,0);
  const items={}; (state.furniture?.[k]||[]).forEach(it=>{ const d=itemDef(it.k); if(!d) return; const key=`${d.name} · ${fin(it.w)} wide`; (items[d.cat] ||= {})[key]=((items[d.cat]||{})[key]||0)+1; });
  const unitRows = (L) => L.map(r=>`${r.n} × ${r.desc} ${r.lab}${r.lab.includes('X')?'':` (${fin(r.w)} × ${fin(r.h)})`}`);
  return {
    home: m.name, pods: Object.entries(counts).sort((a,b)=>b[0]-a[0]).map(([l,n])=>`${n} × ${l}′`).join(' + '), area,
    foundation: foundationOf(k)==='concrete' ? 'Concrete footing + ICF' : 'Ground screws',
    decks: deckList(k).map(d=>`${d.L.w}′ × ${d.L.d}′`),
    windows: unitRows(S.windows), doors: unitRows(S.extDoors), inside: unitRows(S.intDoors),
    cabinets: items, lights: H.lights.length,
  };
}
const CAT_NAME = { base:'Base cabinets', upper:'Upper cabinets', tall:'Pantries', linen:'Linen towers', wardrobe:'Wardrobes', vanity:'Vanities', bench:'Window benches', shelf:'Shelves', fire:'Fireplaces', counter:'Countertops', appliance:'Appliances', bath:'Bathroom fixtures', sink:'Sinks', furniture:'Furniture' };

/* pictures of a customer's home (Build's snapshot), on the server only */
async function savePhoto(cid, home, data){
  const r=await fetch('api/customers', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ op:'photo', id:cid, home, data }) });
  const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error||('HTTP '+r.status)); return o.key; }
async function listPhotos(cid){ try{ const r=await fetch('api/customers?photos='+encodeURIComponent(cid), {cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')) return await r.json(); }catch(e){} return []; }
const photoURL = key => 'api/customers?photo='+encodeURIComponent(key);
const customersOnline = () => remote;
export { savePhoto, listPhotos, photoURL, customersOnline };
export { CUSTOMERS, FINISHES, CAT_NAME, live as liveCustomers, customerById, newCustomerId, loadCustomers, saveCustomer, linkHome, unlinkHome, signHome, signedRecord, deleteCustomer, restoreCustomer, homeSummary };
const customersRemote = () => remote;
export { customersRemote };
