/* Cubit Builder — data.js */


/* ============================================================ wall library + home models
   Loaded from data/walls.json and data/models.json so the team can edit them without touching code.
   Every wall: { id, name, len (ft), type 'ext'|'int', t (thickness in), openings:[{kind,x,y,w,h}], inside:[...], outside:[...] }
   Openings + outside items: x in inches from the LEFT END SEEN FROM OUTSIDE. Inside items: from the left end seen from INSIDE. */
const MODELS = {};
const LIB = [];
async function loadData(){
  const [walls, models] = await Promise.all([
    fetch('data/walls.json').then(r=>r.json()),
    fetch('data/models.json').then(r=>r.json())
  ]);
  Object.assign(MODELS, models);
  walls.forEach(w=>LIB.push({...w, src:'library'}));
  // walls uploaded in this browser
  try{ const saved = JSON.parse(localStorage.getItem('cubit-walls-imported')||'[]'); saved.forEach(w=>{ if(!LIB.find(x=>x.id===w.id)) LIB.push(w); }); }catch(e){}
}
const optionsFor = (len,type='ext') => LIB.filter(w=>w.len===len && (w.type||'ext')===type);
const byId = id => LIB.find(w=>w.id===id);

export { MODELS, LIB, loadData, optionsFor, byId };
