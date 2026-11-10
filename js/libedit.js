/* Cubit Builder — libedit.js : rename and delete library items.

   Homes, pods, walls, floor / ceiling / roof layers and decks can each be renamed or deleted. The edits are shared
   by the team: on the private site they live on the server (api/library, admins change them, everyone sees them);
   opened from a local server they're kept in this browser. They're laid over the library files after loading, so
   nothing in the data files is rewritten.

   Delete hides the item from every list and picker at once. Homes already using it keep working (nothing breaks).
   For two weeks it can be brought back (⋯ → Deleted items); after that it's gone for good and isn't shown
   anywhere, not even there. */
import { MODELS, LIB, LAYERLIB, PODLIB, DECKLIB, clearMirrors } from './data.js';
import { FAMILIES } from './catalog.js';
import { ITEMS } from './casework.js';
import { UNITLIB } from './units.js';
import { DEVICES } from './devices.js';

const LOCAL_KEY = 'cubit-library-edits';
const KEEP_MS = 14*24*3600*1000;   // deleted things can come back for two weeks
let remote = false, ED = { names:{}, gone:{}, hand:{}, fams:[] };
const ORIG = new Map();          // "kind:id" → the name it had before any rename

const lists = () => ({ walls:LIB, layers:LAYERLIB, pods:PODLIB, decks:DECKLIB, families:FAMILIES, casework:ITEMS, units:UNITLIB, devices:DEVICES });
const idOf = x => x.id ?? x.k;   // cabinets, appliances and fixtures are known by their k
function itemsOf(kind){
  if(kind==='models') return Object.entries(MODELS).map(([id,m])=>({id, ref:m}));
  return (lists()[kind]||[]).map(x=>({id:idOf(x), ref:x}));
}
function find(kind, id){ return kind==='models' ? MODELS[id] : (lists()[kind]||[]).find(x=>idOf(x)===id); }

async function loadEdits(){
  try{ const r=await fetch('api/library',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ ED=await r.json(); remote=true; } }catch(e){}
  if(!remote){ try{ ED=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null') || ED; }catch(e){} }
  ED.names ||= {}; ED.gone ||= {}; ED.hand ||= {}; ED.fams ||= [];
  applyEdits();
}
/* lay the edits over whatever is loaded now (call again after more items are registered) */
function applyEdits(){
  // model names the team added (Homes → Cubit Homes → ＋ New model name)
  (ED.fams||[]).forEach(f=>{ if(!FAMILIES.find(x=>x.id===f.id)) FAMILIES.push({ id:f.id, name:f.name, base:null, added:true }); });
  ['families','models','pods','walls','layers','decks','casework','units','devices'].forEach(kind=>itemsOf(kind).forEach(({id,ref})=>{
    const k=`${kind}:${id}`;
    // drafts and team homes (Unassigned, customers) carry their own names, renamed on their own: never put back
    if(kind==='models' && (ref.custom || ref.project)){ ORIG.set(k, ref.name); }
    else { if(!ORIG.has(k)) ORIG.set(k, ref.name); ref.name = ED.names[k] || ORIG.get(k); }
    const g=ED.gone[k], at=g && g.at ? Date.parse(g.at) : NaN;
    ref.deleted = !!g; ref.deletedAt = g ? at : undefined;
    ref.purged = !!g && !(Date.now()-at < KEEP_MS);   // older than two weeks (or no date): gone for good
    // features made by hand: walls o (openings) / i (inside) / x (outside), layers h (holes); each keeps its index
    if(kind==='walls' || kind==='layers'){
      const H=new Set(ED.hand[k]||[]);
      (kind==='walls' ? [['o','openings'],['i','inside'],['x','outside']] : [['h','holes']]).forEach(([c,f])=>(ref[f]||[]).forEach((it,i)=>{ it._f=`${c}:${i}`; it.hand=H.has(it._f); }));
    }
  }));
  clearMirrors();
}
async function store(op, kind, id, name){
  if(remote){
    const r=await fetch('api/library',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(op==='hand' ? {op, kind, id, ...name} : {op, kind, id, name})});
    const out=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(out.error || `Server said ${r.status}`);
    ED={ names:out.names||{}, gone:out.gone||{}, hand:out.hand||{}, fams:out.fams||[] };
  } else {
    const k=`${kind}:${id}`;
    if(op==='rename') ED.names[k]=name; else if(op==='delete') ED.gone[k]={at:new Date().toISOString()};
    else if(op==='hand'){ const S=new Set(ED.hand[k]||[]); if(name.on) S.add(name.feat); else S.delete(name.feat); if(S.size) ED.hand[k]=[...S]; else delete ED.hand[k]; }
    else if(op==='newfam'){ const base=String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,28)||'model';
      let nid=base, n=2; while(FAMILIES.find(f=>f.id===nid) || ED.fams.find(f=>f.id===nid)) nid=`${base}-${n++}`;
      ED.fams.push({ id:nid, name, at:new Date().toISOString() }); }
    else delete ED.gone[k];
    try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(ED)); }catch(e){}
  }
  applyEdits();
}
const renameItem = (kind, id, name) => store('rename', kind, id, String(name).trim().slice(0,80));
/* a builder saved an item under a name: that's its name now (a team rename of it is updated, else it becomes the
   name the renames go back to) */
async function nameSaved(kind, id, name){
  const k=`${kind}:${id}`;
  if(ED.names[k] && ED.names[k]!==name){ try{ await renameItem(kind, id, name); }catch(e){} }
  else if(!ED.names[k]) ORIG.set(k, name);
}
const deleteItem = (kind, id) => store('delete', kind, id);
const restoreItem = (kind, id) => store('restore', kind, id);
/* a new model name for the team; returns its id. Refused when a live model name already reads the same */
async function addFamily(name){
  name=String(name||'').trim().slice(0,40); if(!name) throw new Error('A name is needed.');
  const flat=n=>String(n).toLowerCase().replace(/[^a-z0-9]+/g,'');
  if(FAMILIES.some(f=>!f.deleted && flat(f.name)===flat(name))) throw new Error(`“${name}” is already a model name.`);
  const before=new Set(FAMILIES.map(f=>f.id));
  await store('newfam', 'families', '-', name);
  return FAMILIES.find(f=>!before.has(f.id))?.id || null;
}
const setHand = (kind, id, feat, on) => store('hand', kind, id, {feat, on:!!on});
const originalName = (kind, id) => ORIG.get(`${kind}:${id}`) ?? find(kind,id)?.name;

/* which homes use an item (by its id appearing in the home or in this browser's choices for it) */
function usedBy(kind, id, state){
  if(kind==='models') return [];
  if(kind==='families') return Object.entries(MODELS).filter(([k,m])=>!m.deleted && !m.project && (m.family===id || m.sub && JSON.stringify(m).includes(`"family":"${id}"`))).map(([,m])=>m.name);
  const pat = kind==='pods' ? new RegExp(`"(src|lib)":"${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`) : new RegExp(`"${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(~m)?"`);
  const homes = Object.entries(MODELS).filter(([k,m])=>!m.deleted && (pat.test(JSON.stringify(m)) || pat.test(JSON.stringify([state?.picks?.[k], state?.layerPicks?.[k], state?.furniture?.[k], state?.units?.[k]])))).map(([,m])=>m.name);
  const pods = kind==='walls'||kind==='layers' ? PODLIB.filter(p=>!p.deleted && pat.test(JSON.stringify(p))).map(p=>p.name) : [];
  return [...new Set(homes)].concat(pods.map(n=>`pod ${n}`));
}
const isRemote = () => remote;
export { nameSaved, addFamily, setHand, loadEdits, applyEdits, renameItem, deleteItem, restoreItem, usedBy, originalName, itemsOf, isRemote , KEEP_MS };
