/* Cubit Builder — prices.js : the price book (what Cubit pays for every product) and what a home costs to build.

   The book: one cost per product, shared by the team (/api/prices; on a local server, this browser only). Editors and
   admins change prices (an inventory person gets the Editor role); salespeople and up can look. A save sends only
   the prices that changed, so two people can price at once.

   Products (keys never change, so prices stick):
     unit:<id>     a window or door (data/units.json)                                     each
     item:<k>      anything bought that's placed in a home: fixtures, sinks, appliances,
                   furniture, a fireplace insert                                          each
     cab:sheet     cabinet sheet stock (casework settings: one material)                 per sheet
     cab:band      edge banding                                                          per ft
     cab:formx     countertop sheet (FormX)                                              per sheet
     hw:<name>     cabinet hardware (hinges, runners, handles…)                          each
     sip:<kind>    a SIP panel 4 × 8: wall-ext, wall-int, floor-ext, floor-int,
                   ceiling-int, roof                                                     each
     buy:<what>    every line of the home's shopping list (lumber and LVL by length, EPS,
                   OSB, steel, ACM, screws, ground screws, concrete, seals, SilverBack…)  as the line counts it
     lab:rate:<t>  labour rate per trade                                                 per hour
     lab:std:<j>   standard hours for a job (per pod, per panel, per cabinet)            hours
   A home's cost (homeCost): its quantities × these costs, with every product that has no price listed. */
import { MODELS } from './data.js';
import { state } from './state.js';
import { ITEMS, itemDef, catOf as cwCat, partsOf, totals, hardwareOf, newItem, settings } from './casework.js';
import { UNITLIB, TYPES, unitFor, catOf as opCat } from './units.js';
import { DEVICES } from './devices.js';
import { deviceCounts } from './electrical.js';
import { slotsFor, layerSlotsFor, podList } from './layout.js';
import { bodyWall } from './panels.js';
import { pickFor } from './state.js';
import { shoppingList, upstairsBuyLines } from './takeoff.js';
import { homePlans } from './labels.js';
import { LAYER_KINDS, PW } from './config.js';

const LOCAL_KEY = 'cubit-prices';
let BOOK = { items:{} }, LOCAL = false, loaded = false;

/* ---------------------------------------------------------------- the book */
async function loadPrices(force=false){
  if(loaded && !force) return BOOK;
  try{ const r=await fetch('api/prices', { cache:'no-store' });
    if(r.ok && (r.headers.get('content-type')||'').includes('json')){ BOOK=await r.json(); BOOK.items ||= {}; LOCAL=false; loaded=true; return BOOK; }
    if(r.status===401 || r.status===403){ BOOK={ items:{}, denied:true }; loaded=true; return BOOK; } }catch(e){}
  LOCAL=true; try{ BOOK=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null') || { items:{} }; }catch(e){ BOOK={ items:{} }; }
  BOOK.items ||= {}; loaded=true; return BOOK;
}
const book = () => BOOK;
const priceOf = key => { const v=BOOK.items[key]?.cost; return typeof v==='number' ? v : null; };
const isLocal = () => LOCAL;
/* set: { key: { cost, unit, name } | null } → the book as saved */
async function savePrices(set){
  if(LOCAL){ const at=new Date().toISOString();
    Object.entries(set).forEach(([k,v])=>{ if(v===null) delete BOOK.items[k]; else BOOK.items[k]={ ...BOOK.items[k], ...v, by:'this browser', at }; });
    try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(BOOK)); }catch(e){} return BOOK; }
  const r=await fetch('api/prices', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ set }) });
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error || `Not saved (${r.status})`);
  BOOK=j; BOOK.items ||= {}; return BOOK;
}

/* ---------------------------------------------------------------- what's sold by what */
const unitOfLine = what => /^yd³/.test(what) ? 'yd³' : /^sq ft/.test(what) ? 'sq ft' : /^ft ·/.test(what) ? 'ft' : 'each';
const BOUGHT_CATS = new Set(['appliance','bath','sink','furniture','fire']);
const made = it => partsOf(it).some(p=>!p.hw && !p.solid && !p.counter);
const bought = it => BOUGHT_CATS.has(itemDef(it.k)?.cat) || partsOf(it).some(p=>p.solid);
const SIP = { 'wall-ext':'SIP wall panel, 6½″ exterior, 4 × 8', 'wall-int':'SIP wall panel, 4½″ interior, 4 × 8',
  ...Object.fromEntries(Object.entries(LAYER_KINDS).map(([k,K])=>[k, `${K.label} panel, ${K.t}″, 4 × 8`])) };
const TRADES = { cnc:'CNC operator', assembly:'Pod assembly crew', cabinets:'Cabinet shop', finish:'Finishing', site:'Site set & install' };
const JOBS = { // job → [name, per, trade]
  'cnc-panel':['CNC time per SIP panel', 'panel', 'cnc'], 'assembly-pod':['Assembly per pod', 'pod', 'assembly'],
  'cabinet':['Cabinet build per cabinet', 'cabinet', 'cabinets'], 'finish-pod':['Finishing per pod', 'pod', 'finish'], 'site-pod':['Site set & install per pod', 'pod', 'site'] };

/* every product there is (for the price book): [{ key, group, name, unit }] */
function products(){
  const out=[], seen=new Set(), add=(key, group, name, unit)=>{ if(seen.has(key)) return; seen.add(key); out.push({ key, group, name, unit }); };
  UNITLIB.filter(u=>!u.deleted).forEach(u=>add(`unit:${u.id}`, 'Windows & doors', `${u.name} (${u.id})`, 'each'));
  DEVICES.filter(d=>!d.deleted).forEach(d=>add(`dev:${d.id}`, 'Plugs & switches', `${d.name} (${d.id})`, 'each'));
  ITEMS.filter(d=>!d.deleted).forEach(d=>{ let it; try{ it=newItem(d.k); }catch(e){ return; } if(!bought(it)) return;
    add(`item:${d.k}`, cwCat(d.cat)?.name || 'Bought items', made(it) ? `${d.name} (bought parts)` : d.name, 'each'); });
  const S=settings();
  add('cab:sheet', 'Cabinet stock & hardware', `${S.mat?.name||'Cabinet sheet'} sheet ${S.mat?.sheet?.join(' × ')||'48 × 96'}`, 'sheet');
  add('cab:band', 'Cabinet stock & hardware', 'Edge banding', 'ft');
  add('cab:formx', 'Cabinet stock & hardware', `${S.counter?.name||'Countertop'} sheet ${(S.counter?.cnc?.sheet||[30,144]).join(' × ')}`, 'sheet');
  const hw=new Set(); ITEMS.forEach(d=>{ try{ const it=newItem(d.k); if(made(it)) hardwareOf(it).forEach(h=>hw.add(h.name)); }catch(e){} });
  [...hw].sort().forEach(n=>add(`hw:${n}`, 'Cabinet stock & hardware', n, 'each'));
  Object.entries(SIP).forEach(([k,n])=>add(`sip:${k}`, 'SIP panels', n, 'each'));
  [...shopLines(), ...upstairsBuyLines()].forEach(l=>add(`buy:${l.what}`, `Build materials · ${l.group}`, l.what.replace(/^(yd³|sq ft|ft ·)\s*/,''), unitOfLine(l.what)));
  Object.entries(TRADES).forEach(([k,n])=>add(`lab:rate:${k}`, 'Labour rates', n, 'per hour'));
  Object.entries(JOBS).forEach(([k,[n,per]])=>add(`lab:std:${k}`, 'Labour hours', n, `hours per ${per}`));
  Object.entries(BOOK.items).forEach(([k,v])=>add(k, 'Other (not used by the app now)', v.name||k, v.unit||'each'));
  return out;
}
/* every shopping-list line the stock homes (and this home) need: the materials list, without the windows */
let SHOP=null;
function shopLines(){
  if(SHOP) return SHOP;
  const keep=state.model, m=new Map(), take=k=>{ try{ state.model=k; shoppingList().forEach(l=>{ if(l.group!=='Windows & doors' && !m.has(l.what)) m.set(l.what, l); }); }catch(e){} };
  try{ Object.keys(MODELS).filter(k=>!MODELS[k].custom).forEach(take); if(MODELS[keep]) take(keep); } finally{ state.model=keep; }
  return SHOP=[...m.values()].sort((a,b)=>a.group.localeCompare(b.group) || a.what.localeCompare(b.what));
}
const forgetProducts = () => { SHOP=null; };

/* ---------------------------------------------------------------- a home's cost */
/* → { lines:[{ group, key, name, n, unit, cost, total }], groups:[{ group, total, missing }], total, missing, priced } */
function homeCost(k=state.model){
  const keep=state.model; state.model=k;
  try{
    const L=[], add=(group, key, name, n, unit)=>{ if(!(n>0)) return; const c=priceOf(key); L.push({ group, key, name, n:+(+n).toFixed(3), unit, cost:c, total:c==null?null:+(c*n).toFixed(2) }); };
    // windows and doors (one per opening, the unit chosen there)
    const u={}; slotsFor(k).forEach(s=>{ const w=bodyWall(s, pickFor(s)); (w?.openings||[]).filter(opCat).forEach(o=>{ const r=unitFor(s,o); if(r) (u[r.unit.id] ||= { n:0, name:`${r.unit.name} (${r.unit.id})` }).n++; }); });
    Object.entries(u).forEach(([id,x])=>add('Windows & doors', `unit:${id}`, x.name, x.n, 'each'));
    // plugs, switches and data jacks in the boxes laid out by the electrical rules (the devices chosen in each)
    try{ deviceCounts(k).forEach(x=>add('Plugs & switches', `dev:${x.id}`, x.name, x.n, 'each')); }catch(e){}
    // SIP panels: walls (a cut panel takes a whole one) and the floor, ceiling and roof layers (one per 4′ of pod)
    const walls={}; homePlans().forEach(pl=>{ const t=pl.slot.type==='int'?'wall-int':'wall-ext'; walls[t]=(walls[t]||0)+pl.panels.length; });
    Object.entries(walls).forEach(([t,n])=>add('SIP panels', `sip:${t}`, SIP[t], n, 'each'));
    const lay={}; layerSlotsFor(k).forEach(ls=>{ lay[ls.kind]=(lay[ls.kind]||0)+Math.ceil(ls.len*12/PW-1e-6); });
    Object.entries(lay).forEach(([t,n])=>add('SIP panels', `sip:${t}`, SIP[t], n, 'each'));
    const panels=Object.values(walls).reduce((a,b)=>a+b,0)+Object.values(lay).reduce((a,b)=>a+b,0);
    // build materials: the shopping list
    shoppingList().filter(l=>l.group!=='Windows & doors').forEach(l=>add(`Build materials · ${l.group}`, `buy:${l.what}`, l.what.replace(/^(yd³|sq ft|ft ·)\s*/,''), l.n, unitOfLine(l.what)));
    // cabinets, countertops and what's bought and placed
    const F=(state.furniture?.[k]||[]).filter(it=>itemDef(it.k));
    const cabs=F.filter(made), cnt={};
    F.filter(bought).forEach(it=>{ const d=itemDef(it.k); (cnt[it.k] ||= { n:0, d }).n++; });
    Object.entries(cnt).forEach(([kk,x])=>add(cwCat(x.d.cat)?.name||'Bought items', `item:${kk}`, made(newItem(kk)) ? `${x.d.name} (bought parts)` : x.d.name, x.n, 'each'));
    if(cabs.length){ const T=totals(cabs); Object.values(T.sheets).forEach(n=>add('Cabinets', 'cab:sheet', 'Cabinet sheets', n, 'sheet')); add('Cabinets', 'cab:band', 'Edge banding', T.bandFt, 'ft');
      const hw={}; cabs.forEach(it=>hardwareOf(it).forEach(h=>{ hw[h.name]=(hw[h.name]||0)+h.qty; })); Object.entries(hw).forEach(([n,q])=>add('Cabinets', `hw:${n}`, n, q, 'each')); }
    const cts=F.filter(it=>itemDef(it.k)?.cat==='counter');
    if(cts.length){ const S=settings(), sh=S.counter?.cnc?.sheet||[30,144], a=cts.reduce((s,it)=>s+it.w*it.d,0); add('Cabinets', 'cab:formx', `${S.counter?.name||'Countertop'} sheets`, Math.ceil(a*1.15/(sh[0]*sh[1])-1e-6), 'sheet'); }
    // labour: standard hours × the trade's rate
    const pods=podList(k).length, per={ panel:panels, pod:pods, cabinet:cabs.length };
    Object.entries(JOBS).forEach(([j,[name,p,trade]])=>{ const n=per[p]; if(!n) return; const h=priceOf(`lab:std:${j}`), rate=priceOf(`lab:rate:${trade}`);
      const hours=h==null?null:h*n; L.push({ group:'Labour', key:h==null?`lab:std:${j}`:`lab:rate:${trade}`, name:`${name.replace(/ per .*/,'')} · ${n} ${p}${n>1?'s':''} × ${h==null?'?':h} h`, n:hours==null?n:+hours.toFixed(2), unit:hours==null?p:'h', cost:hours==null?null:rate, total:hours==null||rate==null?null:+(hours*rate).toFixed(2), labour:{ job:j, trade } }); });
    const groups=[]; L.forEach(l=>{ let g=groups.find(x=>x.group===l.group); if(!g) groups.push(g={ group:l.group, total:0, missing:0, n:0 }); g.n++; if(l.total==null) g.missing++; else g.total+=l.total; });
    const total=groups.reduce((a,g)=>a+g.total,0), missing=L.filter(l=>l.total==null).length;
    return { lines:L, groups, total:+total.toFixed(2), missing, priced:L.length-missing };
  } finally { state.model=keep; }
}
const money = v => v==null ? '—' : '$'+v.toLocaleString('en-CA', { minimumFractionDigits:2, maximumFractionDigits:2 });

export { loadPrices, book, priceOf, savePrices, isLocal, products, forgetProducts, homeCost, money };
