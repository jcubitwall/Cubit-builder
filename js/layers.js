/* Cubit Builder — layers.js : the Layers menu in the 3D view.
     Focus   one tap shows a trade's parts clearly (the rest goes see-through or away)
     Pods    look at one pod of a grouped home on its own (it explodes where it stands)
     Show    every part on its own switch, plus see-through glass and the labels */
import { state, save } from './state.js';
import { applyLayers, buildHome, focusCamera, applyExplode, focusIsolated, isoTarget, camera, controls, highlight } from './scene3d.js';
import { renderSide } from './sidebar.js';
import { podList, slotsFor, layerSlotsFor } from './layout.js';

import { CATS as CW_CATS } from './casework.js';
import { applyFurniture, resetCabExplode, cabExploded } from './furniture.js';
const CW_COL={base:'#dcc39a',upper:'#e4cfa4',tall:'#cdb287',linen:'#d8bd8c',wardrobe:'#c9a978',vanity:'#e6d3ae',bench:'#b98f60',shelf:'#ead9b6',fire:'#8a8f94',counter:'#8f9493',appliance:'#c9cdd1',furniture:'#8e978a'};
const CW_ROWS = CW_CATS.map(c=>['cw-'+c.k, c.name, CW_COL[c.k]]);
/* top down, the way the home is built: roof first, the ground screws and foundation last */
const ROWS = [
  ['Show'],
  ['roof','Roof','#4b514d'], ['ceiling','Ceiling','#d9d2bf'], ['walls','Walls (SIP)','#c9a46a'], ['units','Windows & doors','#8fc3ea'],
  ['seals','Compression seals','#e8170f'], ['framing','Lumber & LVL','#e0b36a'], ['splines','OSB splines','#b7864a'],
  ['Cabinets & furniture'],
  ...CW_ROWS,
  ['-'],
  ['floors','Floors','#8d8f86'], ['decks','Decks','#a88f5d'], ['frames','Steel frame & ACM','#3d4247'], ['screws','Ground screws & foundation','#56606b'],
  ['-'],
  ['glass','See-through glass & doors'],
  ['-'],
  ['Labels'],
  ['letters','Wall letters'], ['nums','Panel numbers'],
];
/* Focus presets: what a trade wants to see. Walls go see-through whenever lumber or splines show. */
const BASE = { roof:false, ceiling:false, walls:true, floors:true, decks:true, screws:false, frames:true, seals:true, units:true, framing:false, splines:false };
const FOCUS = [
  ['home',    'Whole home',      {}],
  ['sip',     'SIP panels',      { roof:true, ceiling:true, decks:false, units:false }],
  ['lumber',  'Lumber & LVL',    { framing:true, splines:true, decks:false, units:false }],
  ['splines', 'Splines',         { splines:true, decks:false, units:false }],
  ['units',   'Windows & doors', { decks:false, glassOn:true }],
  ['found',   'Foundation',      { screws:true, walls:false, units:false }],
  ['plumb',   'Plumbing',        null],
  ['wire',    'Wiring',          null],
];
const btn=document.getElementById('bLayers'), pop=document.getElementById('layersPop');
const val=k=> k in state.show ? !!state.show[k] : (k==='frames'||k==='seals'||k.startsWith('cw-')) ? true : state[k];
const stage=document.getElementById('stage');
const badge=document.createElement('button'); badge.className='pod-badge'; badge.hidden=true; stage.appendChild(badge);

function activeFocus(){
  return FOCUS.find(([,,o])=>o && Object.entries({...BASE,...o}).every(([k,v])=>k==='glassOn' ? !!state.glass===v : !!state.show[k]===v))?.[0];
}
function render(){
  const pods=podList(state.model), af=activeFocus();
  let h=`<h4>Focus</h4><div class="lay-chips">${FOCUS.map(([k,l,o])=>`<button class="chip${af===k?' on':''}" data-focus="${k}" ${o?'':'disabled title="Comes with the plumbing / wiring drawings"'}>${l}</button>`).join('')}</div>`;
  if(pods.length>1) h+=`<h4>Pods</h4><div class="lay-chips"><button class="chip${state.focusPod==null?' on':''}" data-pod="">All</button>${pods.map((p,i)=>`<button class="chip${state.focusPod===i?' on':''}" data-pod="${i}">Pod ${i+1}</button>`).join('')}</div>`;
  h+='<div class="lay-sep"></div>'+ROWS.map(([k,label,col])=>{
    if(k==='-') return '<div class="lay-sep"></div>';
    if(!label) return `<h4>${k}</h4>`;
    return `<button class="lay-row" role="switch" aria-checked="${!!val(k)}" data-k="${k}"><span>${col?`<i style="background:${col}"></i>`:''}${label}</span><span class="sw" aria-hidden="true"></span></button>`;
  }).join('');
  pop.innerHTML=h;
}
function set(k, v){
  if(k.startsWith('cw-')){ state.show[k]=v; applyFurniture(); save(); render(); return; }
  if(k in state.show){ state.show[k]=v; applyLayers(); if(k==='screws') renderSide(); }
  else { state[k]=v; if(k==='glass') applyLayers(); else buildHome(); }
  save(); render();
}
function setFocus(k){
  const o=FOCUS.find(f=>f[0]===k)?.[2]; if(!o) return;
  const {glassOn, ...show}={...BASE,...o};
  Object.assign(state.show, show); state.glass=!!glassOn;
  applyLayers(); renderSide(); save(); render();
}
function setPod(i){
  state.focusPod = i;
  applyLayers(); applyExplode(); focusCamera(i); showBadge(); render();
}
function showBadge(){
  if(state.isolate){ badge.hidden=false; badge.innerHTML=`${state.isoLabel||'Isolated'} only <span aria-hidden="true">✕</span>`; badge.title='Back to the whole home'; return; }
  badge.hidden = state.focusPod==null;
  if(!badge.hidden) badge.innerHTML=`Pod ${state.focusPod+1} only <span aria-hidden="true">✕</span>`;
  badge.title='Show the whole home again';
}
badge.onclick=()=>{ if(state.isolate) setIsolate(null); else setPod(null); };
/* Isolate one part (wall, layer or deck): only it shows, from every angle. Leaving puts back the view you had. */
let isoView=null;
function setIsolate(id, label){
  if(id && !isoTarget(id)) return;
  if(id && !state.isolate) isoView={pos:camera.position.clone(), tgt:controls.target.clone()};
  const cabOf = s => (String(s||'').match(/^furn:([^:]+)/)||[])[1];
  if(cabOf(id)!==cabOf(state.isolate)) resetCabExplode();   // a newly isolated cabinet starts assembled
  state.isolate=id||null; state.isoLabel=id ? (label||'') : '';
  applyLayers(); applyExplode(); highlight();
  document.getElementById('tExplode')?.setAttribute('aria-pressed', cabOf(id) ? cabExploded() : !!state.exploded);
  if(id) focusIsolated();
  else if(isoView){ camera.position.copy(isoView.pos); controls.target.copy(isoView.tgt); controls.update(); isoView=null; }
  showBadge(); renderSide();
}
/* double-tap (or double-click) a wall, floor, ceiling or roof: that pod on its own. Double-tap again anywhere: the
   whole home. Works with a finger on the iPad / iPhone as well as a mouse (touch screens don't send dblclick). */
let lastTap=null;
stage.addEventListener('pointerup', e=>{
  if(e.target.tagName!=='CANVAS' || podList(state.model).length<2 || state.isolate || e.cubitFlat || document.getElementById('studio').classList.contains('build')) return;   // in Build, double-tap = the flat plan
  const now=performance.now(), near = lastTap && now-lastTap.t<450 && Math.hypot(e.clientX-lastTap.x, e.clientY-lastTap.y)<30;
  if(!near){ lastTap={t:now, x:e.clientX, y:e.clientY}; return; }
  lastTap=null;
  setTimeout(()=>{
    if(state.focusPod!=null){ setPod(null); return; }
    const id=state.selected; if(!id) return;
    const s=slotsFor(state.model).find(x=>x.id===id) || layerSlotsFor(state.model).find(x=>x.id===id); if(!s?.pod) return;
    setPod(s.pod.i); }, 0);
});
pop.addEventListener('click', e=>{
  const r=e.target.closest('.lay-row'); if(r) return set(r.dataset.k, !val(r.dataset.k));
  const f=e.target.closest('[data-focus]'); if(f && !f.disabled) return setFocus(f.dataset.focus);
  const p=e.target.closest('[data-pod]'); if(p) return setPod(p.dataset.pod==='' ? null : +p.dataset.pod);
});
/* open / close the Layers list: under its button (left), or at a point on screen (a long touch on empty space, like a right click) */
function open(on, at=null){
  pop.hidden=!on; btn.setAttribute('aria-expanded', on); btn.setAttribute('aria-pressed', on);
  pop.style.left=pop.style.top=pop.style.maxHeight='';
  if(!on) return;
  render();
  if(at){ const P=(pop.offsetParent||document.body).getBoundingClientRect(), w=pop.offsetWidth, h=Math.min(pop.scrollHeight, P.height-16);
    pop.style.maxHeight=h+'px';
    pop.style.left=Math.max(8, Math.min(P.width-w-8, at.x-P.left))+'px';
    pop.style.top=Math.max(8, Math.min(P.height-h-8, at.y-P.top))+'px'; }
}
btn.onclick=e=>{ e.stopPropagation(); open(pop.hidden); };
document.addEventListener('pointerdown', e=>{ if(!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) open(false); });
document.addEventListener('keydown', e=>{
  if(e.target.closest('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey || state.view!=='studio') return;
  if(e.key==='l'||e.key==='L'){ e.preventDefault(); open(pop.hidden); }
  if(e.key==='Escape' && !pop.hidden){ e.stopPropagation(); open(false); }
  else if(e.key==='Escape' && state.isolate){ setIsolate(null); }
  else if(e.key==='Escape' && state.focusPod!=null){ setPod(null); }
}, true);
/* a different home: back to all pods */
let lastModel=state.model;
setInterval(()=>{ if(state.model!==lastModel){ lastModel=state.model; if(state.isolate){ state.isolate=null; isoView=null; applyLayers(); showBadge(); }
  if(state.focusPod!=null){ state.focusPod=null; applyLayers(); showBadge(); } }
  else if(state.isolate && !isoTarget(state.isolate)){ setIsolate(null); } }, 400);

/* Exploded view brings the roof and ceiling in (they lift off the top); leaving it puts back what you had */
let before=null;
function explodeLayers(on){
  // only what's switched on comes apart; anything switched off stays hidden (no layer is turned on for you)
  applyLayers(); if(!pop.hidden) render();
}
export { open as openLayers, explodeLayers, render as renderLayers, setIsolate, setPod };
