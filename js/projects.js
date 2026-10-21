/* Cubit Builder — projects.js : save a configured home under a name and open it again later.
   A project keeps its own copy of the layout (including added pods), every wall choice, which wall
   is A, which side faces the assemblers, and the ground-screw inset. Projects live in this browser;
   "Export" makes a file to share, and projects in data/projects.json are shared with everyone. */
import { MODELS, LIB, LAYERLIB, PODLIB, byId, layerById, podById, savePodLib, saveWallLib, saveLayerLib } from './data.js';
import { state, save } from './state.js';
import { saveToLibraries } from './pods.js';

const KEY='cubit-projects';
const PROJECTS={};          // id -> project (own, from this browser)
const SHARED={};            // id -> project (from data/projects.json, read-only)
const clone = o => JSON.parse(JSON.stringify(o));

async function loadProjects(){
  try{ Object.assign(PROJECTS, JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){}
  try{ const r=await fetch('data/projects.json'); if(r.ok){ const list=await r.json(); (Array.isArray(list)?list:Object.values(list)).forEach(p=>{ SHARED[p.id]={...p, shared:true}; }); } }catch(e){}
  Object.values(SHARED).forEach(register); Object.values(PROJECTS).forEach(register);
}
const keyOf = p => 'proj-'+p.id;
function register(p){
  MODELS[keyOf(p)] = { ...clone(p.model), name:p.name, size:p.model.size||'', project:p.id, shared:!!p.shared, custom:false };
}
function persist(){ try{ localStorage.setItem(KEY, JSON.stringify(PROJECTS)); }catch(e){} }

function snapshot(name, id){
  const m = MODELS[state.model];
  const model = clone({ name:m.name, size:m.size, pods:m.pods, picks:m.picks||{}, layerPicks:m.layerPicks||{}, base:m.base || (m.project?undefined:state.model), wallA:m.wallA, note:m.note });
  if(model.base===undefined) delete model.base;
  if(m.base) model.base=m.base;
  return { id, name, saved:new Date().toISOString(), from:m.project ? (MODELS[state.model].from||state.model) : state.model, model,
    picks: clone(state.picks[state.model]||{}), layerPicks: clone(state.layerPicks[state.model]||{}), wallA: clone(state.wallA[state.model]||{}), faces: clone(state.faces[state.model]||{}), inset: state.inset };
}
/* Save: updates the open project, or makes a new one */
function saveProject(name, asNew=false){
  const open = MODELS[state.model]?.project;
  const id = (!asNew && open && PROJECTS[open]) ? open : Date.now().toString(36);
  const p = snapshot(name, id);
  PROJECTS[id]=p; persist();
  const k=keyOf(p);
  // carry this browser's choices over to the project key
  state.picks[k]=clone(p.picks); state.layerPicks[k]=clone(p.layerPicks||{}); state.wallA[k]=clone(p.wallA); state.faces[k]=clone(p.faces);
  register(p); state.model=k; save();
  // new walls, floors, ceilings and pods of this home go into their libraries; the project then refers to them
  const counts = saveToLibraries(name);
  const q = snapshot(name, id); PROJECTS[id]=q; persist(); register(q);
  state.picks[k]={}; state.layerPicks[k]={}; state.wallA[k]={}; state.faces[k]={}; save();
  return {project:q, counts};
}
function openProject(id){
  const p = PROJECTS[id] || SHARED[id]; if(!p) return;
  const k=keyOf(p); register(p);
  if(!state.picks[k] || PROJECTS[id]) state.picks[k]=clone(p.picks||{});
  if(!state.layerPicks[k] || PROJECTS[id]) state.layerPicks[k]=clone(p.layerPicks||{});
  if(!state.wallA[k] || PROJECTS[id]) state.wallA[k]=clone(p.wallA||{});
  if(!state.faces[k] || PROJECTS[id]) state.faces[k]=clone(p.faces||{});
  if(p.inset) state.inset=p.inset;
  state.model=k; state.selected=null; save();
}
function deleteProject(id){ delete PROJECTS[id]; persist(); delete MODELS['proj-'+id]; if(state.model==='proj-'+id){ state.model=Object.keys(MODELS)[0]; save(); } }
function renameProject(id, name){ if(!PROJECTS[id]) return; PROJECTS[id].name=name; persist(); register(PROJECTS[id]); }
/* exported projects carry the library items they use that aren't in the shared library files */
function libraryFor(p){
  const walls=new Set(), layers=new Set(), pods=new Set(), M=p.model||{};
  const addPod = q => { if(!q) return; Object.values(q.walls||{}).flat().forEach(g=>g.wall&&walls.add(g.wall.replace(/~m$/,''))); Object.values(q.layers||{}).forEach(id=>layers.add(id)); };
  (M.pods||[]).forEach(q=>{ addPod(q); if(q.src){ pods.add(q.src); addPod(podById(q.src)); } });
  [M.picks, p.picks].forEach(o=>Object.values(o||{}).forEach(id=>walls.add(String(id).replace(/~m$/,''))));
  [M.layerPicks, p.layerPicks].forEach(o=>Object.values(o||{}).forEach(id=>layers.add(id)));
  const own = x => x && x.src && x.src!=='library';
  const strip = ({src, ...x}) => x;
  return { walls:[...walls].map(byId).filter(own).map(strip), layers:[...layers].map(layerById).filter(own).map(strip), pods:[...pods].map(podById).filter(own).map(strip) };
}
const exportJSON = ids => JSON.stringify(ids.map(id=>PROJECTS[id]||SHARED[id]).filter(Boolean).map(p=>({...p, library:libraryFor(p)})), null, 2);
function importJSON(text){
  let list=JSON.parse(text); if(!Array.isArray(list)) list=[list];
  let n=0; list.forEach(p=>{ if(!p||!p.model||!p.model.pods) return;
    const lib=p.library||{}; delete p.library;
    (lib.walls||[]).forEach(w=>{ if(!LIB.find(x=>x.id===w.id)) LIB.push({...w, src:'saved'}); });
    (lib.layers||[]).forEach(l=>{ if(!LAYERLIB.find(x=>x.id===l.id)) LAYERLIB.push({...l, src:'saved'}); });
    (lib.pods||[]).forEach(q=>{ if(!PODLIB.find(x=>x.id===q.id)) PODLIB.push({...q, src:'saved'}); });
    if(lib.walls?.length) saveWallLib(); if(lib.layers?.length) saveLayerLib(); if(lib.pods?.length) savePodLib(); const id=p.id && !PROJECTS[p.id] ? p.id : Date.now().toString(36)+n; PROJECTS[id]={...p, id, shared:false}; register(PROJECTS[id]); n++; });
  persist(); return n;
}

export { loadProjects, saveProject, openProject, deleteProject, renameProject, exportJSON, importJSON, PROJECTS, SHARED };
