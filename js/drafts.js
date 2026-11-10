/* Cubit Builder — drafts.js : each person's own drafts.

   A draft is a home only you can see: a new home started from scratch, or the copy made the moment you change a
   Cubit model or a published variation. On the private site drafts are kept on the server in your own folder
   (api/drafts), so they follow you from the iPad to the computer; opened from a local server they stay in this
   browser. A draft reaches everyone only when it's published (publish-ui.js). */
import { MODELS, saveCustomModels } from './data.js';
import { state, save, onSave } from './state.js';
import { canSave } from './role.js';
import { famByName } from './catalog.js';

const FIELDS = ['picks','layerPicks','units','wallA','faces','names','cabinets','lights','furniture','found','deckOC','bearing'];
let remote=false;
const timers={};
const clone = o => JSON.parse(JSON.stringify(o));
const isDraft = k => !!MODELS[k]?.custom;
const myDrafts = () => Object.keys(MODELS).filter(k=>MODELS[k].custom && !MODELS[k].deleted).sort((a,b)=>String(MODELS[b].created||b).localeCompare(String(MODELS[a].created||a)));

function pack(k){
  const m=MODELS[k], st={};
  FIELDS.forEach(f=>{ const v=state[f]?.[k]; if(v!=null) st[f]=clone(v); });
  return { key:k, name:m.name, model:clone(m), state:st };
}
function unpack(it){
  MODELS[it.key]={ ...it.model, custom:true, draft:true, name:it.model.name||it.name, savedAt:it.saved };
  Object.entries(it.state||{}).forEach(([f,v])=>{ (state[f] ||= {})[it.key]=v; });
}
async function loadDrafts(){
  Object.values(MODELS).forEach(m=>{ if(m.custom) m.draft=true; });
  let list=null;
  try{ const r=await fetch('api/drafts',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ list=await r.json(); remote=true; } }catch(e){}
  if(!remote) return;
  const onServer=new Set(list.map(it=>it.key));
  list.forEach(unpack);
  // drafts made in this browser before they were kept on the server: send them up
  Object.keys(MODELS).filter(k=>MODELS[k].custom && !onServer.has(k)).forEach(k=>push(k));
  saveCustomModels();
}
async function push(k){
  if(!remote || !isDraft(k) || !canSave()) return;
  try{ const r=await fetch('api/drafts',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'put', item:pack(k)})});
    if(r.ok){ const o=await r.json().catch(()=>({})); MODELS[k].savedAt=o.saved; }
    try{ window.dispatchEvent(new CustomEvent('cubit:saved', {detail:{k, ok:r.ok}})); }catch(e){} }
  catch(e){ try{ window.dispatchEvent(new CustomEvent('cubit:saved', {detail:{k, ok:false}})); }catch(err){} }
}
/* every save while a draft is on screen sends it up (a moment later, once the edits settle) */
onSave(()=>{ const k=state.model; if(!remote || !isDraft(k)) return; clearTimeout(timers[k]); timers[k]=setTimeout(()=>push(k), 1200); });

/* a new home from scratch: one blank pod, filed under a model name if you pick one */
function newHome({ name, family=null, pod='L24' }){
  const k='draft-'+Date.now().toString(36);
  family = family || famByName(name);
  MODELS[k]={ name:name||'New home', size:'', family:family||null, pods:[{t:pod, x:0, z:0, rot:0}], decks:[], picks:{}, layerPicks:{}, custom:true, draft:true, created:new Date().toISOString(), scratch:true, elec:{ auto:true } };
  if(!family) delete MODELS[k].family;
  ['picks','layerPicks','wallA','faces'].forEach(f=>{ (state[f] ||= {})[k]={}; });
  state.model=k; state.selected=null; state.selFurn=null;
  saveCustomModels(); save(); push(k);
  return k;
}
function renameDraft(k, name){ if(!isDraft(k)) return; MODELS[k].name=String(name).trim().slice(0,80)||MODELS[k].name;
  const f=famByName(MODELS[k].name); if(f) MODELS[k].family=f;   // named after a model: it files itself under it
  saveCustomModels(); save(); push(k); }
function setDraftFamily(k, family){ if(!isDraft(k)) return; if(family) MODELS[k].family=family; else delete MODELS[k].family; saveCustomModels(); save(); push(k); }
/* deleted drafts are kept for two weeks in this browser (⋯ → Deleted items), then forgotten */
const TRASH_KEY='cubit-draft-trash', KEEP_MS=14*24*3600*1000;
function trash(){ let t=[]; try{ t=JSON.parse(localStorage.getItem(TRASH_KEY)||'[]'); }catch(e){}
  const now=Date.now(), keep=t.filter(x=>now-Date.parse(x.at) < KEEP_MS); if(keep.length!==t.length) try{ localStorage.setItem(TRASH_KEY, JSON.stringify(keep)); }catch(e){}
  return keep; }
const deletedDrafts = () => trash();
function restoreDraft(key){ const t=trash(), it=t.find(x=>x.item.key===key); if(!it) return false;
  unpack(it.item); MODELS[key].custom=true; saveCustomModels(); save(); push(key);
  try{ localStorage.setItem(TRASH_KEY, JSON.stringify(t.filter(x=>x!==it))); }catch(e){}
  return true; }
async function deleteDraft(k, { moved=false }={}){   // moved: it went to Unassigned, a customer or Cubit Homes (nothing to keep)
  if(!isDraft(k)) return;
  if(!moved) try{ const t=trash().filter(x=>x.item.key!==k); t.push({ at:new Date().toISOString(), item:pack(k) }); localStorage.setItem(TRASH_KEY, JSON.stringify(t)); }catch(e){}
  const from=MODELS[k].from; delete MODELS[k]; FIELDS.forEach(f=>{ if(state[f]) delete state[f][k]; });
  if(state.model===k) state.model = (from && MODELS[from]) ? from : (Object.keys(MODELS).find(x=>!MODELS[x].custom && !MODELS[x].deleted) || state.model);
  saveCustomModels(); save();
  if(remote) try{ await fetch('api/drafts',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'delete', key:k})}); }catch(e){}
}
const draftsRemote = () => remote;
export { deletedDrafts, restoreDraft, loadDrafts, newHome, renameDraft, setDraftFamily, deleteDraft, myDrafts, isDraft, draftsRemote, push as pushDraft };
