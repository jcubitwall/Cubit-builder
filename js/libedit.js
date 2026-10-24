/* Cubit Builder — libedit.js : rename and delete library items.

   Homes, pods, walls, floor / ceiling / roof layers and decks can each be renamed or deleted. The edits are shared
   by the team: on the private site they live on the server (api/library, admins change them, everyone sees them);
   opened from a local server they're kept in this browser. They're laid over the library files after loading, so
   nothing in the data files is rewritten.

   Delete hides the item from every list and picker. Homes already using it keep working (nothing breaks), and a
   deleted item can be brought back from the Library window. */
import { MODELS, LIB, LAYERLIB, PODLIB, DECKLIB, clearMirrors } from './data.js';
import { FAMILIES } from './catalog.js';

const LOCAL_KEY = 'cubit-library-edits';
let remote = false, ED = { names:{}, gone:{}, hand:{} };
const ORIG = new Map();          // "kind:id" → the name it had before any rename

const lists = () => ({ walls:LIB, layers:LAYERLIB, pods:PODLIB, decks:DECKLIB, families:FAMILIES });
function itemsOf(kind){
  if(kind==='models') return Object.entries(MODELS).map(([id,m])=>({id, ref:m}));
  return (lists()[kind]||[]).map(x=>({id:x.id, ref:x}));
}
function find(kind, id){ return kind==='models' ? MODELS[id] : (lists()[kind]||[]).find(x=>x.id===id); }

async function loadEdits(){
  try{ const r=await fetch('api/library',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ ED=await r.json(); remote=true; } }catch(e){}
  if(!remote){ try{ ED=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null') || ED; }catch(e){} }
  ED.names ||= {}; ED.gone ||= {}; ED.hand ||= {};
  applyEdits();
}
/* lay the edits over whatever is loaded now (call again after more items are registered) */
function applyEdits(){
  ['families','models','pods','walls','layers','decks'].forEach(kind=>itemsOf(kind).forEach(({id,ref})=>{
    const k=`${kind}:${id}`;
    if(!ORIG.has(k)) ORIG.set(k, ref.name);
    ref.name = ED.names[k] || ORIG.get(k);
    ref.deleted = !!ED.gone[k];
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
    ED={ names:out.names||{}, gone:out.gone||{}, hand:out.hand||{} };
  } else {
    const k=`${kind}:${id}`;
    if(op==='rename') ED.names[k]=name; else if(op==='delete') ED.gone[k]={at:new Date().toISOString()};
    else if(op==='hand'){ const S=new Set(ED.hand[k]||[]); if(name.on) S.add(name.feat); else S.delete(name.feat); if(S.size) ED.hand[k]=[...S]; else delete ED.hand[k]; }
    else delete ED.gone[k];
    try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(ED)); }catch(e){}
  }
  applyEdits();
}
const renameItem = (kind, id, name) => store('rename', kind, id, String(name).trim().slice(0,80));
const deleteItem = (kind, id) => store('delete', kind, id);
const restoreItem = (kind, id) => store('restore', kind, id);
const setHand = (kind, id, feat, on) => store('hand', kind, id, {feat, on:!!on});
const originalName = (kind, id) => ORIG.get(`${kind}:${id}`) ?? find(kind,id)?.name;

/* which homes use an item (by its id appearing in the home or in this browser's choices for it) */
function usedBy(kind, id, state){
  if(kind==='models') return [];
  if(kind==='families') return Object.entries(MODELS).filter(([k,m])=>!m.deleted && !m.project && (m.family===id || m.sub && JSON.stringify(m).includes(`"family":"${id}"`))).map(([,m])=>m.name);
  const pat = kind==='pods' ? new RegExp(`"(src|lib)":"${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`) : new RegExp(`"${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(~m)?"`);
  const homes = Object.entries(MODELS).filter(([k,m])=>!m.deleted && (pat.test(JSON.stringify(m)) || pat.test(JSON.stringify([state?.picks?.[k], state?.layerPicks?.[k]])))).map(([,m])=>m.name);
  const pods = kind==='walls'||kind==='layers' ? PODLIB.filter(p=>!p.deleted && pat.test(JSON.stringify(p))).map(p=>p.name) : [];
  return [...new Set(homes)].concat(pods.map(n=>`pod ${n}`));
}
const isRemote = () => remote;
export { setHand, loadEdits, applyEdits, renameItem, deleteItem, restoreItem, usedBy, originalName, itemsOf, isRemote };
