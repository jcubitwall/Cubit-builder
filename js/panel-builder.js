/* Cubit Builder — panel-builder.js : one Panel builder for every SIP panel — wall, exterior floor, interior floor,
   ceiling, roof. The chooser at the top switches between them (the wall builder and the floor / ceiling / roof
   builder underneath; each shows only what belongs to it and saves to its own library).
   ⋯ → Panel builder opens on whatever is picked in the home (a wall, a floor, the ceiling…); with nothing picked,
   on the last kind used. Picked in the home and opened from its panel, it opens on that wall or layer. */
import { state, pickFor, pickLayer } from './state.js';
import { slotsFor, layerSlotsFor } from './layout.js';
import { LAYER_KINDS } from './config.js';

const KINDS = [['wall','Wall'], ...Object.entries(LAYER_KINDS).map(([k,v])=>[k, v.label])];
let last='wall';
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* the chooser, for the builders' title bars */
function kindChooser(cur){ last=cur; return `<div class="seg pb-kinds" role="tablist" aria-label="Which panel">${KINDS.map(([k,l])=>`<button role="tab" data-pkind="${k}" aria-selected="${k===cur}" aria-pressed="${k===cur}">${esc(l)}</button>`).join('')}</div>`; }
/* a builder switches to another kind: from a wall to a layer (or back), keeping the length where it can */
async function switchKind(to, { len, close }){
  if(to==='wall'){ close?.(); const m=await import('./wall-builder.js'); m.openWallBuilder({ len: [4,8,12,16,20,24].includes(len)?len:8, type:'ext' }); return; }
  close?.(); const m=await import('./layer-builder.js'); const L=[8,16,24].reduce((b,v)=>Math.abs(v-(len||24))<Math.abs(b-(len||24))?v:b, 24);
  m.openLayerBuilder({ kind:to, len:L });
}
/* open on what's picked in the home, else the last kind used */
async function openPanelBuilder({ kind=null }={}){
  const id=state.selected;
  if(!kind && id){
    const ws=slotsFor(state.model).find(s=>s.id===id);
    if(ws){ const w=pickFor(ws), m=await import('./wall-builder.js'); m.openWallBuilder({ from: w && !w.blank ? w.id : null, slot:ws, len:ws.len, type:ws.type||'ext' }); return; }
    const ls=layerSlotsFor(state.model).find(s=>s.id===id);
    if(ls){ const L=pickLayer(ls), m=await import('./layer-builder.js'); m.openLayerBuilder({ from: L.blank ? null : L.id, slot:ls, len:ls.len, kind:ls.kind }); return; }
  }
  const k=kind||last;
  if(k==='wall'){ const m=await import('./wall-builder.js'); m.openWallBuilder(); }
  else { const m=await import('./layer-builder.js'); m.openLayerBuilder({ kind:k }); }
}
/* ⋯ menu → Panel builder (one entry for all of them) */
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bPanelB')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bPanelB'; b.textContent='Panel builder (walls, floors, ceilings, roofs)';
    pop.insertBefore(b, document.getElementById('bUpload')); b.onclick=()=>{ pop.hidden=true; openPanelBuilder(); }; } }
export { openPanelBuilder, kindChooser, switchKind };
