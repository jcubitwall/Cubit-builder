/* Cubit Builder — productmedia.js : photos, documents and extra details for products. Store products are keyed
   store:<store id>:<sku>, Cubit catalogue items cubit:<item key>. What comes with the app is data/product-media.json
   (photos and specs gathered from the stores' pages); what the team adds on a product page (api/stores, info) goes on
   top of it. The details are merged into the store products themselves, and read for Cubit items with mediaOf(). */
import { STORES } from './stores.js';

const BASE={}, TEAM={}; let remote=false; const LOCAL='cubit-product-info';
async function loadMedia(){
  try{ const r=await fetch('data/product-media.json'); if(r.ok) Object.assign(BASE, (await r.json()).media||{}); }catch(e){}
  try{ const r=await fetch('api/stores',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ Object.assign(TEAM, (await r.json()).info||{}); remote=true; } }catch(e){}
  if(!remote){ try{ Object.assign(TEAM, JSON.parse(localStorage.getItem(LOCAL)||'{}')); }catch(e){} }
  applyToStores();
}
const keyStore = (sid, sku) => `store:${sid}:${sku}`;
const keyCubit = k => `cubit:${k}`;
/* everything known about a product key: the app's, then the team's on top (photos and documents: the team's list
   replaces the app's once the team has edited it) */
function mediaOf(key){ const a=BASE[key]||{}, b=TEAM[key]||{}; return { ...a, ...b }; }
const teamOf = key => TEAM[key] || null;
/* the store products get their details merged in (the price from a store page beats the stored one) */
function applyToStores(){
  STORES.forEach(s=>Object.entries(s.cats||{}).forEach(([cat,L])=>L.forEach(P=>{ const m=mediaOf(keyStore(s.id,P.sku)); if(!Object.keys(m).length) return;
    const { by, at, ...rest }=m; if(!P._orig) Object.defineProperty(P, '_orig', { value:{ ...P }, enumerable:false });
    Object.assign(P, P._orig, rest); })));
}
async function saveMedia(key, info){
  const clean = info ? JSON.parse(JSON.stringify(info)) : null;
  if(remote){ const r=await fetch('api/stores',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'info', key, info:clean})}); const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error||`Server said ${r.status}`); }
  if(clean) TEAM[key]=clean; else delete TEAM[key];
  if(!remote){ try{ localStorage.setItem(LOCAL, JSON.stringify(TEAM)); }catch(e){} }
  applyToStores();
}
/* a photo or PDF up to the server; answers its url. Opened locally (no server): kept as a data URL in this browser. */
async function uploadMedia(file){
  if(remote){ const r=await fetch(`api/media?name=${encodeURIComponent(file.name)}`, { method:'PUT', headers:{ 'content-type':file.type }, body:file }); const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error||`Server said ${r.status}`); return o.url; }
  return await new Promise((ok,no)=>{ const fr=new FileReader(); fr.onload=()=>ok(fr.result); fr.onerror=()=>no(new Error('Could not read the file')); fr.readAsDataURL(file); });
}
export { loadMedia, mediaOf, teamOf, saveMedia, uploadMedia, keyStore, keyCubit, applyToStores };
