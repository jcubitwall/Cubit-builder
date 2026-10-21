/* Cubit Builder — data.js
   Wall library + home models, loaded from data/walls.json and data/models.json so the team can edit
   them without touching code. Layouts made with "Add a pod" are kept in this browser until copied
   into models.json.
   Every wall: { id, name, len (ft), type 'ext'|'int', t (thickness in), openings:[{kind,x,y,w,h}], inside:[...], outside:[...] }
   A wall with "model": "<key>" belongs to that one home (e.g. walls scanned from its STEP file).
   Openings + outside items: x in inches from the LEFT END SEEN FROM OUTSIDE. Inside items: from the left end seen from INSIDE. */
const MODELS = {};
const LIB = [];
const LAYERLIB = [];
const PODLIB = [];          // unique pods: data/pods.json + pods saved in this browser
const POD_KEY = 'cubit-pods';
const CUSTOM_KEY = 'cubit-custom-models';
async function loadData(){
  const [walls, models, layers] = await Promise.all([
    fetch('data/walls.json').then(r=>r.json()),
    fetch('data/models.json').then(r=>r.json()),
    fetch('data/layers.json').then(r=>r.ok?r.json():[]).catch(()=>[]),
    fetch('data/pods.json').then(r=>r.ok?r.json():[]).catch(()=>[])
  ]).then(([w,m,l,p])=>{ p.forEach(x=>PODLIB.push({...x, src:'library'})); return [w,m,l]; });
  try{ JSON.parse(localStorage.getItem(POD_KEY)||'[]').forEach(x=>{ if(!PODLIB.find(y=>y.id===x.id)) PODLIB.push({...x, src:'saved'}); }); }catch(e){}
  try{ JSON.parse(localStorage.getItem('cubit-layers-saved')||'[]').forEach(x=>{ if(!layers.find(y=>y.id===x.id)) layers.push({...x, src:'saved'}); }); }catch(e){}
  layers.forEach(l=>LAYERLIB.push(l));
  Object.assign(MODELS, models);
  walls.forEach(w=>LIB.push({...w, src:'library'}));
  try{ const saved = JSON.parse(localStorage.getItem('cubit-walls-imported')||'[]'); saved.forEach(w=>{ if(!LIB.find(x=>x.id===w.id)) LIB.push(w); }); }catch(e){}
  try{ const custom = JSON.parse(localStorage.getItem(CUSTOM_KEY)||'{}'); Object.entries(custom).forEach(([k,m])=>{ MODELS[k]={...m, custom:true}; }); }catch(e){}
}
function saveCustomModels(){
  const out={}; Object.entries(MODELS).forEach(([k,m])=>{ if(m.custom) out[k]=m; });
  try{ localStorage.setItem(CUSTOM_KEY, JSON.stringify(out)); }catch(e){}
}
/* options for a slot: same length and type; walls tied to one home only show up in that home */
const optionsFor = (len,type='ext',model=null) => LIB.filter(w=>w.len===len && (w.type||'ext')===type && (!w.model || w.model===model || (model && MODELS[model]?.base===w.model)));
/* Mirrored walls: where two pods join, the neighbour's wall is the same wall mirrored, so a door or
   opening lines up through both. "<id>~m" is the mirror of wall <id>: every x is measured from the
   other end (openings and boxes keep their physical place along the wall). */
const MIRROR = {};
function mirrorWall(w){
  const L=w.len*12, fx=o=>({...o, x:+(L-o.x-(o.w||0)).toFixed(4)});
  return {...w, id:w.id+'~m', name:w.name+' · mirrored', mirrorOf:w.id, src:'mirror',
    openings:(w.openings||[]).map(fx).sort((a,b)=>a.x-b.x), inside:(w.inside||[]).map(fx), outside:(w.outside||[]).map(fx)};
}
const byId = id => {
  if(!id) return undefined;
  if(id.endsWith('~m')){ if(MIRROR[id]) return MIRROR[id]; const b=LIB.find(w=>w.id===id.slice(0,-2)); return b ? (MIRROR[id]=mirrorWall(b)) : undefined; }
  return LIB.find(w=>w.id===id);
};
const mirrorId = id => { if(!id) return id; if(id.endsWith('~m')) return id.slice(0,-2); const w=byId(id); return w?.mirrorOf || id+'~m'; };
const podById = id => id && PODLIB.find(p=>p.id===id);
function savePodLib(){ try{ localStorage.setItem(POD_KEY, JSON.stringify(PODLIB.filter(p=>p.src==='saved'))); }catch(e){} }
function saveWallLib(){ try{ localStorage.setItem('cubit-walls-imported', JSON.stringify(LIB.filter(w=>w.src!=='library'))); }catch(e){} }
function saveLayerLib(){ try{ localStorage.setItem('cubit-layers-saved', JSON.stringify(LAYERLIB.filter(l=>l.src==='saved'))); }catch(e){} }
const layerOptions = (kind,len) => LAYERLIB.filter(l=>l.kind===kind && l.len===len);
const layerById = id => LAYERLIB.find(l=>l.id===id);

export { MODELS, LIB, LAYERLIB, PODLIB, loadData, optionsFor, byId, mirrorId, mirrorWall, podById, layerOptions, layerById, saveCustomModels, savePodLib, saveWallLib, saveLayerLib };
