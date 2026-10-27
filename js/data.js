/* Cubit Builder — data.js
   Wall library + home models, loaded from data/walls.json and data/models.json so the team can edit
   them without touching code. Layouts made with "Add a pod" are kept in this browser until copied
   into models.json.
   Every wall: { id, name, len (ft), type 'ext'|'int', t (thickness in), openings:[{kind,x,y,w,h}], inside:[...], outside:[...] }
   A wall with "model": "<key>" belongs to that one home (e.g. walls scanned from its STEP file).
   Openings + outside items: x in inches from the LEFT END SEEN FROM OUTSIDE. Inside items: from the left end seen from INSIDE. */
import { canSave } from './role.js';
import { mapX } from './panels.js';
const MODELS = {};
const LIB = [];
const LAYERLIB = [];
const PODLIB = [];          // unique pods: data/pods.json + pods saved in this browser
const POD_KEY = 'cubit-pods';
const DECKLIB = [];         // deck / porch frames: data/decks.json + decks saved in this browser
const DECK_KEY = 'cubit-decks';
const CUSTOM_KEY = 'cubit-custom-models';
async function loadData(){
  const [walls, models, layers] = await Promise.all([
    fetch('data/walls.json').then(r=>r.json()),
    fetch('data/models.json').then(r=>r.json()),
    fetch('data/layers.json').then(r=>r.ok?r.json():[]).catch(()=>[]),
    fetch('data/pods.json').then(r=>r.ok?r.json():[]).catch(()=>[]),
    fetch('data/decks.json').then(r=>r.ok?r.json():[]).catch(()=>[])
  ]).then(([w,m,l,p,dk])=>{ p.forEach(x=>PODLIB.push({...x, src:'library'})); dk.forEach(x=>DECKLIB.push({...x, src:'library'})); return [w,m,l]; });
  try{ JSON.parse(localStorage.getItem(DECK_KEY)||'[]').forEach(x=>{ if(!DECKLIB.find(y=>y.id===x.id)) DECKLIB.push({...x, src:'saved'}); }); }catch(e){}
  try{ JSON.parse(localStorage.getItem(POD_KEY)||'[]').forEach(x=>{ if(!PODLIB.find(y=>y.id===x.id)) PODLIB.push({...x, src:'saved'}); }); }catch(e){}
  try{ JSON.parse(localStorage.getItem('cubit-layers-saved')||'[]').forEach(x=>{ if(!layers.find(y=>y.id===x.id)) layers.push({...x, src:'saved'}); }); }catch(e){}
  layers.forEach(l=>LAYERLIB.push(l));
  Object.assign(MODELS, models);
  walls.forEach(w=>LIB.push({...w, src:'library'}));
  // walls made in the wall builder, shared by the team (api/walls); opened from a local server: this browser's own
  try{ const r=await fetch('api/walls',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ (await r.json()).forEach(w=>{ const i=LIB.findIndex(x=>x.id===w.id); if(i>=0) LIB[i]={...w, src:'team'}; else LIB.push({...w, src:'team'}); }); } }catch(e){}
  // floors / ceilings / roofs made in the layer builder, shared by the team (api/layers)
  try{ const r=await fetch('api/layers',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ (await r.json()).forEach(l=>{ const i=LAYERLIB.findIndex(x=>x.id===l.id); if(i>=0) LAYERLIB[i]={...l, src:'team'}; else LAYERLIB.push({...l, src:'team'}); }); } }catch(e){}
  try{ const saved = JSON.parse(localStorage.getItem('cubit-walls-imported')||'[]'); saved.forEach(w=>{ if(!LIB.find(x=>x.id===w.id)) LIB.push(w); }); }catch(e){}
  try{ const custom = JSON.parse(localStorage.getItem(CUSTOM_KEY)||'{}'); Object.entries(custom).forEach(([k,m])=>{ MODELS[k]={...m, custom:true}; }); }catch(e){}
}
function saveCustomModels(){
  if(!canSave()) return;
  const out={}; Object.entries(MODELS).forEach(([k,m])=>{ if(m.custom) out[k]=m; });
  try{ localStorage.setItem(CUSTOM_KEY, JSON.stringify(out)); }catch(e){}
}
/* options for a slot: same length and type; walls tied to one home only show up in that home */
const optionsFor = (len,type='ext',model=null) => LIB.filter(w=>!w.deleted && w.len===len && (w.type||'ext')===type && (!w.model || w.model===model || (model && MODELS[model]?.base===w.model)));
/* Mirrored walls: where two pods join, the neighbour's wall is the same wall mirrored, so a door or
   opening lines up through both. "<id>~m" is the mirror of wall <id>: every x is measured from the
   other end (openings and boxes keep their physical place along the wall). */
const MIRROR = {};
const clearMirrors = () => { Object.keys(MIRROR).forEach(k=>delete MIRROR[k]); };   // after a rename
function mirrorWall(w){
  // openings are placed by their left edge, face items by their centre; drawn outlines and tool paths mirror too
  const L=w.len*12, fo=o=>({...mapX(o, x=>L-x), x:+(L-o.x-(o.w||0)).toFixed(4)}), fi=b=>({...mapX(b, x=>L-x), x:+(L-b.x).toFixed(4)});
  return {...w, id:w.id+'~m', name:w.name+' · mirrored', mirrorOf:w.id, src:'mirror',
    openings:(w.openings||[]).map(fo).sort((a,b)=>a.x-b.x), inside:(w.inside||[]).map(fi), outside:(w.outside||[]).map(fi),
    ...(w.shapes?{shapes:w.shapes.map(s=>({...s, x:+(L-s.x-s.w).toFixed(4), mx:!s.mx}))}:{})};
}
const byId = id => {
  if(!id) return undefined;
  if(id.endsWith('~m')){ if(MIRROR[id]) return MIRROR[id]; const b=LIB.find(w=>w.id===id.slice(0,-2)); return b ? (MIRROR[id]=mirrorWall(b)) : undefined; }
  return LIB.find(w=>w.id===id);
};
const mirrorId = id => { if(!id) return id; if(id.endsWith('~m')) return id.slice(0,-2); const w=byId(id); return w?.mirrorOf || id+'~m'; };
const podById = id => id && PODLIB.find(p=>p.id===id);
const deckById = id => id && DECKLIB.find(d=>d.id===id);
function saveDeckLib(){ if(!canSave()) return; try{ localStorage.setItem(DECK_KEY, JSON.stringify(DECKLIB.filter(d=>d.src==='saved'))); }catch(e){} }
function savePodLib(){ if(!canSave()) return; try{ localStorage.setItem(POD_KEY, JSON.stringify(PODLIB.filter(p=>p.src==='saved'))); }catch(e){} }
function saveWallLib(){ if(!canSave()) return; try{ localStorage.setItem('cubit-walls-imported', JSON.stringify(LIB.filter(w=>w.src!=='library'))); }catch(e){} }
function saveLayerLib(){ if(!canSave()) return; try{ localStorage.setItem('cubit-layers-saved', JSON.stringify(LAYERLIB.filter(l=>l.src==='saved'))); }catch(e){} }
const layerOptions = (kind,len) => LAYERLIB.filter(l=>!l.deleted && l.kind===kind && l.len===len);
/* mirrored floor / ceiling / roof layers: "<id>~mx" end for end (along the pod), "~mz" front to back, "~mxz" both */
const LMIRROR = {};
/* forget the mirrored copies of a layer (after it is saved again) */
const forgetLayerMirrors = id => { Object.keys(LMIRROR).forEach(k=>{ if(k.startsWith(id+'~m')) delete LMIRROR[k]; }); };
const splitLayerId = id => { const m=String(id||'').match(/^(.*?)~m(x?)(z?)$/); return m ? {base:m[1], x:!!m[2], z:!!m[3]} : {base:id, x:false, z:false}; };
function mirrorLayer(l, mx, mz, id){
  const L=l.len*12, W=96, fx=v=>mx?L-v:v, fz=v=>mz?W-v:v, mp=P=>P.map(([a,b])=>[+fx(a).toFixed(4), +fz(b).toFixed(4)]);
  return {...l, id, name:l.name+` · ${mx&&mz?'mirrored + flipped':mx?'mirrored':'flipped'}`, mirrorOf:l.id, src:'mirror',
    holes:(l.holes||[]).map(h=>({...h, x:+(mx?L-h.x-(h.w||0):h.x).toFixed(4), z:+(mz?W-h.z-(h.d||0):h.z).toFixed(4), ...(h.ends?{ends:mp(h.ends)}:{}), ...(h.path?{path:mp(h.path)}:{}), ...(h.tool?{tool:h.tool.map(mp)}:{})})),
    seams:(l.seams||[]).map(s=>typeof s==='number' ? (mx?L-s:s) : s),
    ...(l.shapes?{shapes:l.shapes.map(s=>({...s, x:+(mx?L-s.x-s.w:s.x).toFixed(4), z:+(mz?W-s.z-s.h:s.z).toFixed(4), mx:mx?!s.mx:!!s.mx, my:mz?!s.my:!!s.my}))}:{})};
}
const layerById = id => {
  if(!id) return undefined;
  const s=splitLayerId(id); if(!s.x && !s.z) return LAYERLIB.find(l=>l.id===id);
  if(LMIRROR[id]) return LMIRROR[id];
  const b=LAYERLIB.find(l=>l.id===s.base); return b ? (LMIRROR[id]=mirrorLayer(b, s.x, s.z, id)) : undefined;
};
/* the id of a layer mirrored once more along x ('x') or z ('z') */
const layerMirrorId = (id, ax) => { const s=splitLayerId(id); const x=ax==='x'?!s.x:s.x, z=ax==='z'?!s.z:s.z; return s.base+(x||z?`~m${x?'x':''}${z?'z':''}`:''); };

export { mirrorLayer, forgetLayerMirrors, layerMirrorId, clearMirrors, DECKLIB, deckById, saveDeckLib, MODELS, LIB, LAYERLIB, PODLIB, loadData, optionsFor, byId, mirrorId, mirrorWall, podById, layerOptions, layerById, saveCustomModels, savePodLib, saveWallLib, saveLayerLib };
