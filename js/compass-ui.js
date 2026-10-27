/* Cubit Builder — compass-ui.js : the home's north in the Build view.
   A small dial under the view cube shows where north is on screen (it turns with the view). Tap it to set which
   way the home sits on its site: type the bearing, tap N / E / S / W, turn it 15° at a time, or drag the needle so
   north points where you point. The bearing is kept per home (orient.js): it turns the north arrow beside the
   home, says which way every wall faces, and is printed on the foundation sheet for the screw installers. */
import { getBearing, setBearing, northVec, fmtBearing } from './orient.js';
import { camera, controls, buildHome } from './scene3d.js';
import { canSave } from './role.js';
import { state } from './state.js';

const stage=document.getElementById('stage');
const box=document.createElement('div'); box.className='compass mini bc-compass'; box.id='bCompass'; box.setAttribute('aria-label','Home orientation');
box.innerHTML=`<svg viewBox="0 0 100 100" class="dial" role="img" aria-label="North"><circle cx="50" cy="50" r="46" class="ring"/>
    <g class="needle"><path d="M50 10 L58 50 L50 44 L42 50 Z" class="n"/><path d="M50 90 L58 50 L50 56 L42 50 Z" class="s"/><text x="50" y="8" text-anchor="middle" class="nl">N</text></g></svg>
  <div class="cb">
    <div class="eyebrow">North · plan top faces</div>
    <button class="cb-val" id="bcVal" title="Set which way the home faces">0° N</button>
    <label class="cb-in">Bearing <input id="bcIn" type="number" min="0" max="359.9" step="1" inputmode="decimal" enterkeyhint="done">°</label>
    <div class="cb-q">${['N','E','S','W'].map((k,i)=>`<button class="fsbtn" data-b="${i*90}" title="Plan top faces ${k}">${k}</button>`).join('')}<button class="fsbtn" data-step="-15" title="Turn 15° anticlockwise">↺ 15°</button><button class="fsbtn" data-step="15" title="Turn 15° clockwise">↻ 15°</button></div>
    <p class="cb-note">Drag the needle to point north. Used for which way each wall faces and on the foundation sheet.</p>
    <button class="linkbtn cb-close" id="bcDone">Done</button>
  </div>`;
stage?.appendChild(box);
const $=s=>box.querySelector(s);
/* where north points on screen now (degrees, clockwise from up) */
function screenNorth(){
  const c=controls.target.clone(), n=northVec();
  const a=c.clone().project(camera), b=new THREE.Vector3(c.x+n[0]*10, c.y, c.z+n[1]*10).project(camera);
  const dx=b.x-a.x, dy=b.y-a.y; if(Math.hypot(dx,dy)<1e-6) return 0;   // looking straight along it
  return Math.atan2(dx, dy)*180/Math.PI;
}
let hooked=false;
function draw(){
  if(!stage || box.hidden) return;
  try{ if(!hooked){ controls.addEventListener('change', draw); hooked=true; } }catch(e){ return; }   // the 3D view isn't up yet
  $('.needle').setAttribute('transform', `rotate(${screenNorth()} 50 50)`);
  $('#bcVal').textContent=fmtBearing(getBearing());
  const inp=$('#bcIn'); if(document.activeElement!==inp) inp.value=Math.round(getBearing()*10)/10;
}
function set(deg){ if(!canSave()) return; setBearing(deg); buildHome(); draw(); }
$('#bcVal').onclick=()=>{ box.classList.toggle('mini'); draw(); };
$('#bcDone').onclick=()=>box.classList.add('mini');
$('#bcIn').onchange=e=>{ const v=parseFloat(e.target.value); if(isFinite(v)) set(v); };
box.querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>set(+b.dataset.b));
box.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>set(getBearing()+ +b.dataset.step));
// the dial: tap it (folded) to open; drag the needle (open) so north points where you point
const dial=$('.dial'); let dragging=false;
const fromPointer=e=>{ const r=dial.getBoundingClientRect(), p=Math.atan2(e.clientX-(r.left+r.width/2), -(e.clientY-(r.top+r.height/2)))*180/Math.PI;
  let b=getBearing()+(screenNorth()-p); b=e.shiftKey?Math.round(b/5)*5:Math.round(b); setBearing(b); draw(); };
dial.addEventListener('pointerdown', e=>{ e.preventDefault(); e.stopPropagation(); if(box.classList.contains('mini')){ box.classList.remove('mini'); draw(); return; } if(!canSave()) return; dragging=true; dial.setPointerCapture(e.pointerId); fromPointer(e); });
dial.addEventListener('pointermove', e=>{ if(dragging) fromPointer(e); });
dial.addEventListener('pointerup', ()=>{ if(dragging){ dragging=false; buildHome(); draw(); } });
// show it in Build only, refresh when the home changes
setInterval(()=>{ const show=state.view==='studio' || !state.view; if(box.hidden===show){ box.hidden=!show; } draw(); }, 1000);
window.addEventListener('cubit:home', draw);
setTimeout(draw, 0);
export { draw as drawCompass };
