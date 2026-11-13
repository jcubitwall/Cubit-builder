/* Cubit Builder — sidingplayer.js : Install steps, the siding put up piece by piece in the 3D, pod by pod, in the
   same order as the install guide (sidingsteps.js). Next / Back (or ← →) adds or takes off one step; the piece
   going up glows orange, the camera stands in front of its wall, and the step is written underneath. */
import { MODELS } from './data.js';
import { state } from './state.js';
import { wallGroups, applyLayers, controls, camera, onBuilt, onLayers } from './scene3d.js';
import { sidingSchedule } from './sidingsheet.js';
import { wallSteps } from './sidingsteps.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let on=false, pod=null, seq=[], at=0, panel=null, saved=null;
const HI=new THREE.MeshStandardMaterial({ color:0xd0661f, emissive:0xd0661f, emissiveIntensity:0.35, roughness:0.5, metalness:0.2, side:THREE.DoubleSide });

function build(){
  const Sc=sidingSchedule(); if(!Sc) return [];
  const pods=[...new Set(Sc.S.walls.map(W=>W.s.pod.i))];
  if(pod==null || !pods.includes(pod)) pod=pods[0];
  const out=[];
  Sc.S.walls.filter(W=>W.s.pod.i===pod).forEach(W=>wallSteps(W, Sc).forEach(s=>out.push({ ...s, wall:W.s.id, label:W.s.label, L:W.L })));
  return out;
}
function meshesOf(wallId){ const g=wallGroups.find(g=>g.userData.slot?.id===wallId); return g ? g.children.filter(o=>o.userData.siding) : []; }
function apply(){
  if(!on) return; inApply=true;
  const done=new Set(), cur=seq[at];
  seq.slice(0, at+1).forEach(s=>s.keys.forEach(k=>done.add(s.wall+'#'+k)));
  wallGroups.forEach(g=>g.children.forEach(o=>{ if(!o.userData.siding) return;
    if(o.userData._mat){ o.material=o.userData._mat; delete o.userData._mat; }
    const key=o.userData.wall+'#'+o.userData.sk, mine=g.userData.slot?.pod?.i===pod;
    o.visible = mine && done.has(key);
    if(cur && o.userData.wall===cur.wall && cur.keys.includes(o.userData.sk)){ o.userData._mat=o.material; o.material=HI; } }));
  inApply=false; aim(); text();
}
function aim(){
  const cur=seq[at]; if(!cur) return;
  const g=wallGroups.find(g=>g.userData.slot?.id===cur.wall); if(!g) return;
  const ms=meshesOf(cur.wall).filter(o=>cur.keys.includes(o.userData.sk)), box=new THREE.Box3();
  if(ms.length) ms.forEach(m=>box.expandByObject(m)); else box.setFromObject(g);
  const c=box.getCenter(new THREE.Vector3()), whole=new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
  c.lerp(whole, 0.45);                                       // keep most of the wall in view
  const o=g.localToWorld(new THREE.Vector3(0,0,0)), n=g.localToWorld(new THREE.Vector3(0,0,1)).sub(o).normalize();
  const span=Math.max(10, cur.L/12*1.3), fov=(camera.fov||40)*Math.PI/180, dist=(span/2)/Math.tan(fov/2)/Math.min(1, camera.aspect||1);   // the whole wall fills the view
  c.y-=span*0.14;   // the wall sits above the steps panel
  controls.target.copy(c); camera.position.copy(c).addScaledVector(n, dist).add(new THREE.Vector3(0, dist*0.06, 0)); controls.update();
}
function text(){
  if(!panel) return; const cur=seq[at];
  const pods=[...new Set((sidingSchedule()?.S.walls||[]).map(W=>W.s.pod))].sort((a,b)=>a.i-b.i);
  panel.innerHTML=`<div class="sp-top"><b>Install steps</b><div class="seg" role="group" aria-label="Pod">${pods.map(p=>`<button data-sppod="${p.i}" aria-pressed="${p.i===pod}">${esc(p.label)}</button>`).join('')}</div><button class="linkbtn" id="spClose">Close</button></div>
    ${cur?`<div class="sp-wall">${esc(cur.label)} · step ${at+1} of ${seq.length}</div>
    <div class="sp-title ${cur.kind==='rip'?'rip':''}">${cur.n?`<span class="sg-n">${cur.n}</span>`:''}${esc(cur.title.replace(/^\d+\. /,''))}</div>
    <div class="sp-text">${esc(cur.text)}</div>`:'<p class="note">No siding on this pod.</p>'}
    <div class="sp-nav"><button class="btn ghost" id="spBack" ${at<=0?'disabled':''}>← Back</button><input type="range" id="spAt" min="0" max="${Math.max(0,seq.length-1)}" value="${at}" aria-label="Step"><button class="btn" id="spNext" ${at>=seq.length-1?'disabled':''}>Next →</button></div>`;
  panel.querySelector('#spClose').onclick=close;
  panel.querySelector('#spBack').onclick=()=>go(at-1);
  panel.querySelector('#spNext').onclick=()=>go(at+1);
  panel.querySelector('#spAt').oninput=e=>go(+e.target.value);
  panel.querySelectorAll('[data-sppod]').forEach(b=>b.onclick=()=>{ pod=+b.dataset.sppod; seq=build(); at=0; apply(); });
}
function go(i){ at=Math.max(0, Math.min(seq.length-1, i)); apply(); }
function open(){
  if(on) return close();
  on=true; saved=state.show.siding; state.show.siding=true; applyLayers();
  panel=document.createElement('div'); panel.className='sp-panel'; panel.setAttribute('role','region'); panel.setAttribute('aria-label','Siding install steps');
  document.getElementById('stage').appendChild(panel);
  seq=build(); at=0; apply();
  document.getElementById('bSteps')?.setAttribute('aria-pressed','true');
}
function close(){
  on=false; panel?.remove(); panel=null; state.show.siding=saved; applyLayers();
  wallGroups.forEach(g=>g.children.forEach(o=>{ if(o.userData._mat){ o.material=o.userData._mat; delete o.userData._mat; } }));
  document.getElementById('bSteps')?.setAttribute('aria-pressed','false');
}
let inApply=false;
onLayers(()=>{ if(on && !inApply) apply(); });
onBuilt(()=>{ if(on){ seq=build(); at=Math.min(at, Math.max(0,seq.length-1)); apply(); } });
document.addEventListener('keydown', e=>{ if(!on || /input|textarea|select/i.test(e.target.tagName)) return;
  if(e.key==='ArrowRight'){ go(at+1); e.preventDefault(); } else if(e.key==='ArrowLeft'){ go(at-1); e.preventDefault(); } else if(e.key==='Escape') close(); });
document.getElementById('bSteps')?.addEventListener('click', open);
export { open as openInstallSteps, close as closeInstallSteps };
