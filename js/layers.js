/* Cubit Builder — layers.js : the Layers menu. One small button in the 3D view; every part of the home
   switches on or off on its own, plus see-through glass and doors and the labels. */
import { state, save } from './state.js';
import { applyLayers, buildHome } from './scene3d.js';
import { renderSide } from './sidebar.js';

const ROWS = [
  ['Show'],
  ['roof','Roof','#4b514d'], ['ceiling','Ceiling','#d9d2bf'], ['walls','Walls','#c9a46a'], ['floors','Floors','#8d8f86'],
  ['decks','Decks','#a88f5d'], ['screws','Foundation','#56606b'], ['units','Windows & doors','#8fc3ea'],
  ['-'],
  ['glass','See-through glass & doors'],
  ['-'],
  ['Labels'],
  ['letters','Wall letters'], ['nums','Panel numbers'],
];
const btn=document.getElementById('bLayers'), pop=document.getElementById('layersPop');
const val=k=> k in state.show ? state.show[k] : state[k];

function render(){
  pop.innerHTML = ROWS.map(([k,label,col])=>{
    if(k==='-') return '<div class="lay-sep"></div>';
    if(!label) return `<h4>${k}</h4>`;
    return `<button class="lay-row" role="switch" aria-checked="${!!val(k)}" data-k="${k}"><span>${col?`<i style="background:${col}"></i>`:''}${label}</span><span class="sw" aria-hidden="true"></span></button>`;
  }).join('');
}
function set(k, v){
  if(k in state.show){ state.show[k]=v; applyLayers(); if(k==='screws') renderSide(); }
  else { state[k]=v; if(k==='glass') applyLayers(); else buildHome(); }
  save(); render();
}
pop.addEventListener('click', e=>{ const r=e.target.closest('.lay-row'); if(r) set(r.dataset.k, !val(r.dataset.k)); });
function open(on){ pop.hidden=!on; btn.setAttribute('aria-expanded', on); btn.setAttribute('aria-pressed', on); if(on) render(); }
btn.onclick=e=>{ e.stopPropagation(); open(pop.hidden); };
document.addEventListener('pointerdown', e=>{ if(!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) open(false); });
document.addEventListener('keydown', e=>{
  if(e.target.closest('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey || e.altKey || state.view!=='studio') return;
  if(e.key==='l'||e.key==='L'){ e.preventDefault(); open(pop.hidden); }
  if(e.key==='Escape' && !pop.hidden){ e.stopPropagation(); open(false); }
}, true);

/* Exploded view brings the roof and ceiling in (they lift off the top); leaving it puts back what you had */
let before=null;
function explodeLayers(on){
  if(on){ before={roof:state.show.roof, ceiling:state.show.ceiling}; state.show.roof=state.show.ceiling=true; }
  else if(before){ Object.assign(state.show, before); before=null; }
  applyLayers(); if(!pop.hidden) render();
}
export { explodeLayers, render as renderLayers };
