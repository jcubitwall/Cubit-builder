/* Cubit Builder — state.js : what the person has chosen, kept in their browser */
import { MODELS, byId, optionsFor, layerOptions, layerById, podById, saveCustomModels, setScope } from './data.js';
import { LAYER_KINDS, T, TI } from './config.js';
import { canSave } from './role.js';
import { checkpoint } from './history.js';
import { ensureDraft } from './pods.js';

const state = { model:'cove', picks:{}, units:{}, found:{}, deckOC:{}, icf:{ brand:'nudura', core:6 }, layerPicks:{}, cabinets:{}, furniture:{}, lights:{}, wallA:{}, faces:{}, names:{}, bearing:{}, northUp:false, selected:null, exploded:false, nums:true, letters:true,
  show:{ roof:false, ceiling:false, walls:true, floors:true, decks:true, screws:false, frames:true, seals:true, units:true, framing:false, splines:false, swlinks:true }, focusPod:null, glass:false, inset:6, view:'studio', face:'int', reverse:false, sheetSlot:null };
const KEY='cubit-wall-studio';
setScope(()=>state.model);   // a locked home sees its walls as they were when it was locked (data.js FROZEN)
function initState(){
  try{
    const s=JSON.parse(localStorage.getItem(KEY)||'{}');
    if(s.picks) state.picks=s.picks;
    if(s.wallA) state.wallA=s.wallA;
    if(s.units) state.units=s.units;
    if(s.found) state.found=s.found;
    if(s.deckOC) state.deckOC=s.deckOC;
    if(s.icf) Object.assign(state.icf, s.icf);
    if(s.faces) state.faces=s.faces;
    if(s.names) state.names=s.names;
    if(s.layerPicks) state.layerPicks=s.layerPicks;
    if(s.cabinets) state.cabinets=s.cabinets;
    if(s.furniture) state.furniture=s.furniture;
    if(s.lights) state.lights=s.lights;
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
let saveHook=null; const onSave = fn => { saveHook=fn; };
function save(){ if(!canSave()) return; try{ saveHook?.(); }catch(e){} try{ localStorage.setItem(KEY, JSON.stringify({picks:state.picks, units:state.units, found:state.found, deckOC:state.deckOC, icf:state.icf, layerPicks:state.layerPicks, cabinets:state.cabinets, furniture:state.furniture, lights:state.lights, wallA:state.wallA, faces:state.faces, names:state.names, bearing:state.bearing, northUp:state.northUp, inset:state.inset, model:state.model, show:state.show, glass:state.glass, nums:state.nums, letters:state.letters})); }catch(e){} }
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
  if(slot.part){ w=byId(slot.part.wall); if(fits(w,slot)) return w; }
  if(MODELS[state.model]?.scratch || slot.part) return blankWall(slot);   // a middle wall starts solid: tap it for doors   // a home started from scratch: plain walls until you pick
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
  return { id:`BLANK-${ty==='int'?'I':'W'}${String(slot.len).padStart(2,'0')}`, name:`Blank ${slot.len}′ ${ty==='int'?'interior / connecting':'exterior'} wall (nothing scanned yet)`, len:slot.len, type:ty, t:ty==='int'?TI:T, openings:[], inside:[], outside:[], blank:true };
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
function chooseLayer(slot, id){ checkpoint(); ensureDraft(); (state.layerPicks[state.model] ||= {})[slot.id]=id; save(); }
function setFace(slot, f){ checkpoint(); ensureDraft(); (state.faces[state.model] ||= {})[slot.id]=f; save(); }
/* opts.follow: the neighbour taking the same wall mirrored (it doesn't lead the joint) */
function choose(slot, wallId, opts={}){ checkpoint(); ensureDraft(); (state.picks[state.model] ||= {})[slot.id]=wallId;
  // a wall swapped in takes its plugs and switches from the electrical rules, not the library (electrical.js)
  const m=MODELS[state.model];
  if(m){ if(!m.elec?.auto) m.elec={ ...(m.elec||{}), walls:{ ...(m.elec?.walls||{}), [wkey(slot)]:true } };
    try{ chooseHook?.(slot, m, opts); }catch(e){}   // between pods: this wall leads its joint (joints.js)
    if(m.custom) saveCustomModels(); }
  save(); }
let chooseHook=null; const setChooseHook = fn => { chooseHook=fn; };
/* a wall's lasting name in its home: pod number, the pod's own side, where along it, interior or exterior (survives moves and turns) */
/* a wall between pods made thicker or thinner, or taken out: MODELS[k].joint.t[wkey] (inches; 0 = no wall there)
   → its thickness, or null (the standard 4½″) */
const jointWallT = slot => { if(slot?.type!=='int' || slot.part || !slot.pod) return null; const v=MODELS[state.model]?.joint?.t?.[wkey(slot)]; return v==null || !isFinite(+v) ? null : +v; };
const wkey = slot => `${slot.pod.i}:${slot.local}:${slot.from}:${slot.type||'ext'}`;

/* what the home (pods) stands on: 'screws' (ground screws) or 'concrete' (ICF perimeter foundation) */
const foundationOf = k => state.found?.[k] || MODELS[k]?.found || 'screws';
function setFoundation(k, f){ if(k===state.model){ checkpoint(); k=ensureDraft(); } (state.found ||= {})[k]=f; save(); }
/* deck joist spacing for a home, inches on centre: 24 (standard) or 16 */
const deckOCOf = k => +(state.deckOC?.[k] || MODELS[k]?.deckOC || 24);
function setDeckOC(k, oc){ if(k===state.model){ checkpoint(); k=ensureDraft(); } (state.deckOC ||= {})[k]=oc; save(); }
export { jointWallT, setChooseHook, wkey, onSave, deckOCOf, setDeckOC, foundationOf, setFoundation, state, initState, save, pickFor, podSeg, choose, setFace, pickLayer, chooseLayer, blankWall };
