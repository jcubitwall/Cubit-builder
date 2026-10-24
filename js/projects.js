/* Cubit Builder — projects.js : save a configured home under a name and open it again later.
   A project keeps its own copy of the layout (including added pods), every wall choice, windows and doors, which
   wall is A, which side faces the assemblers, cabinets, lights, foundation and the screw inset, plus any library
   items it uses that aren't in the library files (pods, walls, floors saved from the planner).

   Projects are the TEAM's: on the private site they're saved on the server (api/projects), everyone sees the same
   list, admins save. Every save keeps the one before it, so earlier versions can be brought back. Projects that
   were kept in one browser before, and layouts built in Plan & pods, are moved up to the team the next time an
   admin opens the app on that device. Opened from a local server (no API) projects stay in the browser. */
import { MODELS, LIB, LAYERLIB, PODLIB, DECKLIB, byId, layerById, podById, deckById, savePodLib, saveWallLib, saveLayerLib, saveDeckLib } from './data.js';
import { state, save, foundationOf, deckOCOf } from './state.js';
import { saveToLibraries } from './pods.js';
import { getBearing } from './orient.js';
import { canSave, isAdmin } from './role.js';

const KEY='cubit-projects';
const PROJECTS={};          // id -> project (own, from this browser)
const SHARED={};            // id -> project (from data/projects.json, read-only)
const TEAM={};              // id -> project (the team's, on the server)
let remote=false;
const UP_KEY='cubit-projects-uploaded';
const clone = o => JSON.parse(JSON.stringify(o));

async function loadProjects(){
  try{ Object.assign(PROJECTS, JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){}
  try{ const r=await fetch('data/projects.json'); if(r.ok){ const list=await r.json(); (Array.isArray(list)?list:Object.values(list)).forEach(p=>{ SHARED[p.id]={...p, shared:true}; }); } }catch(e){}
  try{ const r=await fetch('api/projects',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ (await r.json()).forEach(p=>{ TEAM[p.id]=p; }); remote=true; } }catch(e){}
  Object.values(SHARED).forEach(register); Object.values(PROJECTS).forEach(register); Object.values(TEAM).forEach(register);
  if(remote && isAdmin()) migrate().catch(()=>{});
}
/* the team's project carries the library items it uses that aren't in the library files: add them for everyone */
function addLibrary(lib){
  if(!lib) return;
  (lib.walls||[]).forEach(w=>{ if(!LIB.find(x=>x.id===w.id)) LIB.push({...w, src:'team'}); });
  (lib.layers||[]).forEach(l=>{ if(!LAYERLIB.find(x=>x.id===l.id)) LAYERLIB.push({...l, src:'team'}); });
  (lib.pods||[]).forEach(q=>{ if(!PODLIB.find(x=>x.id===q.id)) PODLIB.push({...q, src:'team'}); });
  (lib.decks||[]).forEach(q=>{ if(!DECKLIB.find(x=>x.id===q.id)) DECKLIB.push({...q, src:'team'}); });
}
async function post(body){
  const r=await fetch('api/projects',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
  const out=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(out.error || `Server said ${r.status}`);
  Object.keys(TEAM).forEach(k=>delete TEAM[k]); (out.projects||[]).forEach(p=>{ TEAM[p.id]=p; register(p); });
  return out;
}
/* move this device's own projects and Plan & pods layouts up to the team (once each) */
async function migrate(){
  let up=[]; try{ up=JSON.parse(localStorage.getItem(UP_KEY)||'[]'); }catch(e){}
  const done=new Set(up); let n=0;
  for(const p of Object.values(PROJECTS)){
    if(done.has('p:'+p.id) || TEAM[p.id]) continue;
    await post({op:'save', item:{...p, library:libraryFor(p)}}); done.add('p:'+p.id); n++;
  }
  for(const [k,m] of Object.entries(MODELS)){
    if(!m.custom || done.has('c:'+k)) continue;
    const id=('layout-'+k).toLowerCase().replace(/[^a-z0-9-]+/g,'-').slice(0,40);
    if(TEAM[id]){ done.add('c:'+k); continue; }
    const q=snapshot(m.name||'Layout', id, k); q.note='Moved up from Plan & pods';
    await post({op:'save', item:{...q, library:libraryFor(q)}}); done.add('c:'+k); n++;
  }
  try{ localStorage.setItem(UP_KEY, JSON.stringify([...done])); }catch(e){}
  if(n) window.dispatchEvent(new CustomEvent('cubit-projects-moved', {detail:n}));
}
const keyOf = p => 'proj-'+p.id;
function register(p, force=false){
  if(!force && TEAM[p.id] && TEAM[p.id]!==p) return;          // the team's copy wins over a browser's or the repo's
  addLibrary(p.library);
  MODELS[keyOf(p)] = { ...clone(p.model), name:p.name, size:p.model.size||'', project:p.id, shared:!!p.shared || !!TEAM[p.id], team:!!TEAM[p.id], by:p.by||'', saved:p.saved, custom:false };
}
function persist(){ if(!canSave()) return; try{ localStorage.setItem(KEY, JSON.stringify(PROJECTS)); }catch(e){} }

function snapshot(name, id, k=state.model){
  const m = MODELS[k];
  const model = clone({ name:m.name, size:m.size, pods:m.pods, decks:m.decks||[], picks:m.picks||{}, layerPicks:m.layerPicks||{}, base:m.base || (m.project?undefined:k), wallA:m.wallA, note:m.note });
  if(model.base===undefined) delete model.base;
  if(m.base) model.base=m.base;
  const own = f => clone(state[f]?.[k]||{});
  return { id, name, saved:new Date().toISOString(), from:m.project ? (MODELS[k].from||k) : k, model,
    picks: own('picks'), layerPicks: own('layerPicks'), wallA: own('wallA'), faces: own('faces'), inset: state.inset, bearing: getBearing(k), found: foundationOf(k), deckOC: deckOCOf(k), units: own('units'), cabinets: own('cabinets'), furniture: clone(state.furniture?.[k]||[]), lights: own('lights') };
}
/* Save: updates the open project, or makes a new one. On the team's server when there is one. */
const newId = () => Date.now().toString(36);
async function saveProject(name, asNew=false){
  const open = MODELS[state.model]?.project;
  const id = (!asNew && open && (PROJECTS[open] || TEAM[open] || (remote && SHARED[open]))) ? open : newId();
  const q0 = snapshot(name, id), k=keyOf(q0);
  // the project becomes the home on screen, carrying this browser's choices
  register(q0, true);
  ['picks','layerPicks','wallA','faces','units','cabinets','lights'].forEach(f=>{ (state[f] ||= {})[k]=clone(q0[f]||{}); });
  (state.furniture ||= {})[k]=clone(q0.furniture||[]);
  (state.bearing ||= {})[k]=q0.bearing; (state.found ||= {})[k]=q0.found; (state.deckOC ||= {})[k]=q0.deckOC;
  state.model=k; save();
  // new walls, floors, ceilings and pods of this home go into their libraries; the project then refers to them
  const counts = saveToLibraries(name);
  const q = snapshot(name, id, k);
  if(remote) await post({op:'save', item:{...q, library:libraryFor(q)}});
  else { PROJECTS[id]=q; persist(); register(q); }
  state.picks[k]={}; state.layerPicks[k]={}; state.wallA[k]={}; state.faces[k]={}; save();
  return {project:TEAM[id]||PROJECTS[id], counts};
}
function openProject(id){
  const p = TEAM[id] || PROJECTS[id] || SHARED[id]; if(!p) return;
  const fresh = !!TEAM[id];
  const k=keyOf(p); register(p);
  if(!state.picks[k] || fresh) state.picks[k]=clone(p.picks||{});
  if(!state.layerPicks[k] || fresh) state.layerPicks[k]=clone(p.layerPicks||{});
  if(!state.wallA[k] || fresh) state.wallA[k]=clone(p.wallA||{});
  if(!state.faces[k] || fresh) state.faces[k]=clone(p.faces||{});
  if(!state.cabinets?.[k] || fresh) (state.cabinets ||= {})[k]=clone(p.cabinets||{});
  if(!state.lights?.[k] || fresh) (state.lights ||= {})[k]=clone(p.lights||{});
  if(!state.furniture?.[k] || fresh) (state.furniture ||= {})[k]=clone(p.furniture||[]);
  if(p.inset) state.inset=p.inset;
  if(p.bearing!=null && (state.bearing?.[k]==null || fresh)) (state.bearing ||= {})[k]=p.bearing;
  if(p.found && (state.found?.[k]==null || fresh)) (state.found ||= {})[k]=p.found;
  if(p.deckOC && (state.deckOC?.[k]==null || fresh)) (state.deckOC ||= {})[k]=p.deckOC;
  if(p.units && (state.units?.[k]==null || fresh)) (state.units ||= {})[k]=clone(p.units);
  state.model=k; state.selected=null; save();
}
async function deleteProject(id){
  if(TEAM[id]) await post({op:'delete', id});
  delete PROJECTS[id]; persist(); delete MODELS['proj-'+id];
  if(SHARED[id]) register(SHARED[id]);
  if(!MODELS['proj-'+id] && state.model==='proj-'+id){ state.model=Object.keys(MODELS)[0]; save(); }
}
async function renameProject(id, name){
  if(TEAM[id]){ await post({op:'rename', id, name}); return; }
  if(!PROJECTS[id]) return; PROJECTS[id].name=name; persist(); register(PROJECTS[id]);
}
async function versions(id){ const r=await fetch('api/projects?versions='+encodeURIComponent(id),{cache:'no-store'}); return r.ok ? r.json() : []; }
async function restoreVersion(id, at){ await post({op:'restore', id, at}); openProject(id); }
const isTeam = () => remote;
/* exported projects carry the library items they use that aren't in the shared library files */
function libraryFor(p){
  const walls=new Set(), layers=new Set(), pods=new Set(), M=p.model||{};
  const addPod = q => { if(!q) return; Object.values(q.walls||{}).flat().forEach(g=>g.wall&&walls.add(g.wall.replace(/~m$/,''))); Object.values(q.layers||{}).forEach(id=>layers.add(String(id).replace(/~mx?z?$/,''))); };
  (M.pods||[]).forEach(q=>{ addPod(q); if(q.src){ pods.add(q.src); addPod(podById(q.src)); } });
  [M.picks, p.picks].forEach(o=>Object.values(o||{}).forEach(id=>walls.add(String(id).replace(/~m$/,''))));
  [M.layerPicks, p.layerPicks].forEach(o=>Object.values(o||{}).forEach(id=>layers.add(String(id).replace(/~mx?z?$/,''))));
  const own = x => x && x.src && x.src!=='library';
  const strip = ({src, ...x}) => x;
  const decks=[...new Set((M.decks||[]).map(d=>d.lib))];
  return { walls:[...walls].map(byId).filter(own).map(strip), layers:[...layers].map(layerById).filter(own).map(strip), pods:[...pods].map(podById).filter(own).map(strip), decks:decks.map(deckById).filter(own).map(strip) };
}
const exportJSON = ids => JSON.stringify(ids.map(id=>TEAM[id]||PROJECTS[id]||SHARED[id]).filter(Boolean).map(p=>({...p, library:libraryFor(p)})), null, 2);
function importJSON(text){
  let list=JSON.parse(text); if(!Array.isArray(list)) list=[list];
  let n=0; list.forEach(p=>{ if(!p||!p.model||!p.model.pods) return;
    const lib=p.library||{}; delete p.library;
    (lib.walls||[]).forEach(w=>{ if(!LIB.find(x=>x.id===w.id)) LIB.push({...w, src:'saved'}); });
    (lib.layers||[]).forEach(l=>{ if(!LAYERLIB.find(x=>x.id===l.id)) LAYERLIB.push({...l, src:'saved'}); });
    (lib.pods||[]).forEach(q=>{ if(!PODLIB.find(x=>x.id===q.id)) PODLIB.push({...q, src:'saved'}); });
    (lib.decks||[]).forEach(q=>{ if(!DECKLIB.find(x=>x.id===q.id)) DECKLIB.push({...q, src:'saved'}); });
    if(lib.decks?.length) saveDeckLib();
    if(lib.walls?.length) saveWallLib(); if(lib.layers?.length) saveLayerLib(); if(lib.pods?.length) savePodLib(); const id=p.id && !PROJECTS[p.id] ? p.id : Date.now().toString(36)+n; PROJECTS[id]={...p, id, shared:false}; register(PROJECTS[id]); n++; });
  persist(); return n;
}

export { snapshot, libraryFor, loadProjects, saveProject, openProject, deleteProject, renameProject, exportJSON, importJSON, versions, restoreVersion, isTeam, PROJECTS, SHARED, TEAM };
