/* Cubit Builder — state.js : what the person has chosen, kept in their browser */
import { MODELS, byId, optionsFor, layerOptions, layerById, podById } from './data.js';
import { LAYER_KINDS, T, TI } from './config.js';
import { canSave } from './role.js';

const state = { model:'cove', picks:{}, layerPicks:{}, wallA:{}, faces:{}, bearing:{}, northUp:false, selected:null, exploded:false, nums:true, letters:true,
  show:{ roof:false, ceiling:false, walls:true, floors:true, decks:true, screws:false, units:true }, glass:false, inset:6, view:'studio', face:'int', reverse:false, sheetSlot:null };
const KEY='cubit-wall-studio';
function initState(){
  try{
    const s=JSON.parse(localStorage.getItem(KEY)||'{}');
    if(s.picks) state.picks=s.picks;
    if(s.wallA) state.wallA=s.wallA;
    if(s.faces) state.faces=s.faces;
    if(s.layerPicks) state.layerPicks=s.layerPicks;
    if(s.bearing) state.bearing=s.bearing;
    if(s.northUp) state.northUp=true;
    if(s.inset) state.inset=s.inset;
    if(s.show) Object.assign(state.show, s.show);
    if(s.glass) state.glass=true;
    if(s.nums===false) state.nums=false;
    if(s.letters===false) state.letters=false;
    if(s.model&&MODELS[s.model]) state.model=s.model;
  }catch(e){}
}
function save(){ if(!canSave()) return; try{ localStorage.setItem(KEY, JSON.stringify({picks:state.picks, layerPicks:state.layerPicks, wallA:state.wallA, faces:state.faces, bearing:state.bearing, northUp:state.northUp, inset:state.inset, model:state.model, show:state.show, glass:state.glass, nums:state.nums, letters:state.letters})); }catch(e){} }
const fits = (w,slot) => w && w.len===slot.len && (w.type||'ext')===(slot.type||'ext');
/* Which wall sits in a slot: the person's own choice, else the model's own wall (models.json "picks"),
   else a sensible sample wall of the right length and type. */
function pickFor(slot){
  const m = state.picks[state.model] || (state.picks[state.model]={});
  let w = byId(m[slot.id]);
  if(fits(w,slot)) return w;
  w = byId(MODELS[state.model]?.picks?.[slot.id]);
  if(fits(w,slot)) return w;
  const seg = podSeg(slot);
  w = seg && byId(seg.wall);
  if(fits(w,slot)) return w;
  const ty = slot.type||'ext';
  const opts = optionsFor(slot.len, ty, state.model);
  if(opts.length) return opts[0];
  return blankWall(slot);
}
/* The pod's own wall for this stretch: kept on the pod itself (walls it carried when it was moved, turned
   or dropped in), else the library pod it came from. Matched by the pod's own side, the distance from
   that side's left end seen from outside, the length and the type. */
function podSeg(slot){
  const p=slot.pod; if(!p || slot.local==null) return null;
  for(const src of [p, podById(p.src)]){
    const g = src?.walls?.[slot.local]?.find(g=>Math.abs(g.from-slot.from)<1e-6 && g.len===slot.len && g.type===(slot.type||'ext'));
    if(g) return g;
  }
  return null;
}
/* A plain wall with no openings, used where the library has nothing of that size yet. Not saved anywhere. */
function blankWall(slot){
  const ty=slot.type||'ext';
  return { id:`BLANK-${ty==='int'?'I':'W'}${String(slot.len).padStart(2,'0')}`, name:`Blank ${slot.len}′ ${ty==='int'?'interior':'exterior'} wall (nothing scanned yet)`, len:slot.len, type:ty, t:ty==='int'?TI:T, openings:[], inside:[], outside:[], blank:true };
}
/* Floors / ceilings: same order — person's choice, the model's own, first library item, else a plain layer */
function pickLayer(slot){
  const m = state.layerPicks[state.model] || {};
  let l = layerById(m[slot.id]);
  if(l && l.kind===slot.kind && l.len===slot.len) return l;
  l = layerById(MODELS[state.model]?.layerPicks?.[slot.id]);
  if(l && l.kind===slot.kind && l.len===slot.len) return l;
  for(const src of [slot.pod, podById(slot.pod?.src)]){ l = layerById(src?.layers?.[slot.kind]); if(l && l.kind===slot.kind && l.len===slot.len) return l; }
  const opts = layerOptions(slot.kind, slot.len);
  if(opts.length) return opts[0];
  const K=LAYER_KINDS[slot.kind];
  return { id:`BLANK-${K.code}${String(slot.len).padStart(2,'0')}`, name:`Plain ${slot.len}′ ${K.label.toLowerCase()} (nothing scanned yet)`, kind:slot.kind, len:slot.len, t:K.t, z:K.z, holes:[], seams:[], blank:true };
}
function chooseLayer(slot, id){ (state.layerPicks[state.model] ||= {})[slot.id]=id; save(); }
function setFace(slot, f){ (state.faces[state.model] ||= {})[slot.id]=f; save(); }
function choose(slot, wallId){ (state.picks[state.model] ||= {})[slot.id]=wallId; save(); }

export { state, initState, save, pickFor, podSeg, choose, setFace, pickLayer, chooseLayer, blankWall };
