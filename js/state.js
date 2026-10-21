/* Cubit Builder — state.js : what the person has chosen, kept in their browser */
import { MODELS, byId, optionsFor } from './data.js';

const state = { model:'cove', picks:{}, wallA:{}, faces:{}, selected:null, exploded:false, roof:false, nums:true, letters:true, screws:false, inset:6, view:'studio', face:'int', reverse:false, sheetSlot:null };
const KEY='cubit-wall-studio';
function initState(){
  try{
    const s=JSON.parse(localStorage.getItem(KEY)||'{}');
    if(s.picks) state.picks=s.picks;
    if(s.wallA) state.wallA=s.wallA;
    if(s.faces) state.faces=s.faces;
    if(s.inset) state.inset=s.inset;
    if(s.model&&MODELS[s.model]) state.model=s.model;
  }catch(e){}
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify({picks:state.picks, wallA:state.wallA, faces:state.faces, inset:state.inset, model:state.model})); }catch(e){} }
const DEFAULT_FRONT = { 24:'W24-08', 16:'W16-04', 8:'W08-02' };
const fits = (w,slot) => w && w.len===slot.len && (w.type||'ext')===(slot.type||'ext');
/* Which wall sits in a slot: the person's own choice, else the model's own wall (models.json "picks"),
   else a sensible sample wall of the right length and type. */
function pickFor(slot){
  const m = state.picks[state.model] || (state.picks[state.model]={});
  let w = byId(m[slot.id]);
  if(fits(w,slot)) return w;
  w = byId(MODELS[state.model]?.picks?.[slot.id]);
  if(fits(w,slot)) return w;
  const ty = slot.type||'ext';
  const opts = optionsFor(slot.len, ty).filter(o=>!o.model);
  if(!opts.length) return null;
  let id;
  if(ty==='int') id = (opts.find(o=>/Wide|Cased/.test(o.name))||opts[0]).id;
  else if(slot.side==='S' && slot.pod.i===0) id = DEFAULT_FRONT[slot.len] || opts[0].id;
  else if(slot.side==='S'||slot.side==='N') id = (opts[(slot.pod.i*3 + (slot.side==='N'?2:1)) % opts.length]||opts[0]).id;
  else id = (opts[(slot.pod.i + 1) % Math.min(opts.length,3)]||opts[0]).id;
  return byId(id);
}
function setFace(slot, f){ (state.faces[state.model] ||= {})[slot.id]=f; save(); }
function choose(slot, wallId){ (state.picks[state.model] ||= {})[slot.id]=wallId; save(); }

export { state, initState, save, DEFAULT_FRONT, pickFor, choose, setFace };
