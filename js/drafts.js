/* Cubit Builder — drafts.js : each person's own drafts.

   A draft is a home only you can see: a new home started from scratch, or the copy made the moment you change a
   Cubit model or a published variation. On the private site drafts are kept on the server in your own folder
   (api/drafts), so they follow you from the iPad to the computer; opened from a local server they stay in this
   browser. A draft reaches everyone only when it's published (publish-ui.js). */
import { MODELS, saveCustomModels } from './data.js';
import { state, save, onSave } from './state.js';
import { canSave } from './role.js';

const FIELDS = ['picks','layerPicks','units','wallA','faces','cabinets','lights','furniture','found','deckOC','bearing'];
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
    if(r.ok){ const o=await r.json().catch(()=>({})); MODELS[k].savedAt=o.saved; } }catch(e){}
}
/* every save while a draft is on screen sends it up (a moment later, once the edits settle) */
onSave(()=>{ const k=state.model; if(!remote || !isDraft(k)) return; clearTimeout(timers[k]); timers[k]=setTimeout(()=>push(k), 1200); });

/* a new home from scratch: one blank pod, filed under a model name if you pick one */
function newHome({ name, family=null, pod='L24' }){
  const k='draft-'+Date.now().toString(36);
  MODELS[k]={ name:name||'New home', size:'', family:family||null, pods:[{t:pod, x:0, z:0, rot:0}], decks:[], picks:{}, layerPicks:{}, custom:true, draft:true, created:new Date().toISOString(), scratch:true };
  if(!family) delete MODELS[k].family;
  ['picks','layerPicks','wallA','faces'].forEach(f=>{ (state[f] ||= {})[k]={}; });
  state.model=k; state.selected=null; state.selFurn=null;
  saveCustomModels(); save(); push(k);
  return k;
}
function renameDraft(k, name){ if(!isDraft(k)) return; MODELS[k].name=String(name).trim().slice(0,80)||MODELS[k].name; saveCustomModels(); save(); push(k); }
function setDraftFamily(k, family){ if(!isDraft(k)) return; if(family) MODELS[k].family=family; else delete MODELS[k].family; saveCustomModels(); save(); push(k); }
async function deleteDraft(k){
  if(!isDraft(k)) return;
  const from=MODELS[k].from; delete MODELS[k]; FIELDS.forEach(f=>{ if(state[f]) delete state[f][k]; });
  if(state.model===k) state.model = (from && MODELS[from]) ? from : (Object.keys(MODELS).find(x=>!MODELS[x].custom && !MODELS[x].deleted) || state.model);
  saveCustomModels(); save();
  if(remote) try{ await fetch('api/drafts',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'delete', key:k})}); }catch(e){}
}
const draftsRemote = () => remote;
export { loadDrafts, newHome, renameDraft, setDraftFamily, deleteDraft, myDrafts, isDraft, draftsRemote, push as pushDraft };
