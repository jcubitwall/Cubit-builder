/* Cubit Builder — data.js
   Wall library + home models, loaded from data/walls.json and data/models.json so the team can edit
   them without touching code. Layouts made with "Add a pod" are kept in this browser until copied
   into models.json.
   Every wall: { id, name, len (ft), type 'ext'|'int', t (thickness in), openings:[{kind,x,y,w,h}], inside:[...], outside:[...] }
   A wall with "model": "<key>" belongs to that one home (e.g. walls scanned from its STEP file).
   Openings + outside items: x in inches from the LEFT END SEEN FROM OUTSIDE. Inside items: from the left end seen from INSIDE. */
const MODELS = {};
const LIB = [];
const CUSTOM_KEY = 'cubit-custom-models';
async function loadData(){
  const [walls, models] = await Promise.all([
    fetch('data/walls.json').then(r=>r.json()),
    fetch('data/models.json').then(r=>r.json())
  ]);
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
const byId = id => LIB.find(w=>w.id===id);

export { MODELS, LIB, loadData, optionsFor, byId, saveCustomModels };
