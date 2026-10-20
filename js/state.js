/* Cubit Builder — state.js */
import { MODELS, byId, optionsFor } from './data.js';

/* ============================================================ state */
const state = { model:'cove', picks:{}, selected:null, exploded:false, roof:false, nums:true, screws:false, inset:6, view:'studio', face:'int', reverse:false, sheetSlot:null };
function initState(){
  try{ const s=JSON.parse(localStorage.getItem('cubit-wall-studio')||'{}'); if(s.picks) state.picks=s.picks; if(s.model&&MODELS[s.model]) state.model=s.model; }catch(e){}
}
function save(){ try{ localStorage.setItem('cubit-wall-studio', JSON.stringify({picks:state.picks, model:state.model})); }catch(e){} }
const DEFAULT_FRONT = { 24:'W24-08', 16:'W16-04', 8:'W08-02' };
function pickFor(slot){
  const m = state.picks[state.model] || (state.picks[state.model]={});
  let id = m[slot.id];
  const ty = slot.type||'ext';
  if(!id || !byId(id) || byId(id).len!==slot.len || (byId(id).type||'ext')!==ty){
    const opts = optionsFor(slot.len, ty);
    if(!opts.length) return null;
    if(ty==='int') id = (opts.find(o=>/Wide|Cased/.test(o.name))||opts[0]).id;
    else if(slot.side==='S' && slot.pod.i===0) id = DEFAULT_FRONT[slot.len] || opts[0].id;
    else if(slot.side==='S'||slot.side==='N') id = (opts[(slot.pod.i*3 + (slot.side==='N'?2:1)) % opts.length]||opts[0]).id;
    else id = (opts[(slot.pod.i + 1) % Math.min(opts.length,3)]||opts[0]).id;
    m[slot.id]=id;
  }
  return byId(id);
}

export { state, initState, save, DEFAULT_FRONT, pickFor };
