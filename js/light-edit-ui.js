/* Cubit Builder — light-edit-ui.js : moving, adding and removing ceiling lights by hand.

   The ceiling's panel shows the pod's ceiling as a plan (turned the way the Build plan is), with every light:
     · tap lights to pick them (as many as you like); in 3D, tap the light holes on the ceiling once it's picked
     · type how many inches and press ← → ↑ ↓ (screen directions, as the plan shows it): the picked lights move
     · Add light: tap where it goes (a pendant, say); it's cut like a pot light (4″ pocket + ¾″ wire hole)
     · Remove takes the picked lights away; Reset puts this pod's ceiling back to the rules
   A light moved or added by hand is pinned: it stays exactly there whatever the rules do later. */
import { state } from './state.js';
import { pickLayer } from './state.js';
import { lightsIn, editsOf, setEdits, ceilingFrame, LIGHT } from './lights.js';
import { buildHome } from './scene3d.js';
import { renderSide, toast } from './sidebar.js';
import { canSave } from './role.js';

let sel={ pod:null, ids:new Set() }, adding=false, step=1;
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function selFor(ls){ if(sel.pod!==ls.pod.i){ sel={ pod:ls.pod.i, ids:new Set() }; adding=false; } return sel.ids; }
const selectedLights = () => sel;
const clearLightSel = () => { sel={ pod:null, ids:new Set() }; adding=false; };

/* the ceiling's own inches ⇄ plan inches (the plan as Build shows it: x to the right, z down the screen) */
function basis(ls){
  const { toW }=ceilingFrame(ls), O=toW(0,0).map(v=>v*12), X=toW(1,0).map((v,i)=>v*12-O[i]), Z=toW(0,1).map((v,i)=>v*12-O[i]);
  return { toP:(x,z)=>[O[0]+X[0]*x+Z[0]*z, O[1]+X[1]*x+Z[1]*z], toL:(px,pz)=>{ const dx=px-O[0], dz=pz-O[1]; return [dx*X[0]+dz*X[1], dx*Z[0]+dz*Z[1]]; } };
}
function lights(ls){ return lightsIn(pickLayer(ls), ls); }

function lightEditorHTML(ls){
  const L=pickLayer(ls), len=ls.len*12, B=basis(ls), ids=selFor(ls), pts=lights(ls), ed=canSave();
  const corners=[[0,0],[len,0],[len,96],[0,96]].map(([x,z])=>B.toP(x,z)), xs=corners.map(c=>c[0]), zs=corners.map(c=>c[1]);
  const x0=Math.min(...xs)-6, z0=Math.min(...zs)-6, W=Math.max(...xs)-x0+6, H=Math.max(...zs)-z0+6;
  const other=(L.holes||[]).filter(h=>!h.light && h.w>1.2).map(h=>{ const c=[[h.x,h.z],[h.x+h.w,h.z],[h.x+h.w,h.z+h.d],[h.x,h.z+h.d]].map(([x,z])=>B.toP(x,z)); return `<polygon points="${c.map(p=>p.join(',')).join(' ')}" class="le-hole"/>`; }).join('');
  const dots=pts.map(p=>{ const [px,pz]=B.toP(p.x,p.z); return `<g class="le-l${ids.has(p.id)?' on':''}${p.pin?' pin':''}" data-id="${esc(p.id)}"><circle cx="${px}" cy="${pz}" r="${LIGHT.d/2+1.2}"/>${p.added?`<text x="${px}" y="${pz-5}">pendant</text>`:''}</g>`; }).join('');
  const one = ids.size===1 ? pts.find(p=>ids.has(p.id)) : null;
  return `<div class="le-box">
    <div class="eyebrow">Lights by hand · ${pts.length} in this pod${editsOf(state.model, ls.pod.i).pins.length?` · ${editsOf(state.model, ls.pod.i).pins.length} pinned`:''}</div>
    <svg class="le-svg${adding?' adding':''}" viewBox="${x0} ${z0} ${W} ${H}" role="img" aria-label="Ceiling plan with lights; tap to pick">
      <polygon points="${corners.map(p=>p.join(',')).join(' ')}" class="le-ceil"/>${other}${dots}</svg>
    <p class="note">${adding ? '<b>Tap where the new light goes.</b>' : ids.size ? `${ids.size} picked${one?` · ${Math.round(one.x*8)/8}″ along, ${Math.round(one.z*8)/8}″ across${one.pin?' · pinned':''}`:''}. Type inches, then an arrow.` : 'Tap lights to pick them (as many as you like). In 3D you can tap the light holes on the ceiling too.'}</p>
    ${ed?`<div class="le-move"><label>Move <input type="text" id="leStep" inputmode="decimal" value="${step}"> ″</label>
      <div class="le-arrows"><button data-mv="up" aria-label="Up" ${ids.size?'':'disabled'}>↑</button><button data-mv="left" aria-label="Left" ${ids.size?'':'disabled'}>←</button><button data-mv="right" aria-label="Right" ${ids.size?'':'disabled'}>→</button><button data-mv="down" aria-label="Down" ${ids.size?'':'disabled'}>↓</button></div></div>
    <div class="row"><button class="btn ghost sm" id="leAdd" aria-pressed="${adding}">${adding?'Cancel adding':'Add light'}</button><button class="btn ghost sm" id="leAll">${ids.size===pts.length&&pts.length?'Pick none':'Pick all'}</button><button class="btn ghost sm" id="leDel" ${ids.size?'':'disabled'}>Remove</button><button class="btn ghost sm" id="leReset">Back to the rules</button></div>`:''}
  </div>`;
}
function parseIn(s){ s=String(s).trim(); const m=s.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/); if(!m) return NaN; return (m[1]?+m[1]:0)+(m[2]?(+m[2])/(+m[3]):0); }
/* change this pod's lights: fn(edits, pts) mutates edits; ids that become pins are re-pointed in the selection */
function change(ls, fn){
  const E=editsOf(state.model, ls.pod.i), pts=lights(ls); fn(E, pts);
  setEdits(state.model, ls.pod.i, E); buildHome(); renderSide();
}
const newPin = () => 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
function moveSel(ls, dir){
  const d=parseIn(document.getElementById('leStep')?.value ?? step); if(!(d>0)){ toast('Type how many inches to move.'); return; } step=d;
  const B=basis(ls), v={right:[1,0], left:[-1,0], up:[0,-1], down:[0,1]}[dir], [O0,O1]=B.toL(0,0), [lx,lz]=B.toL(v[0]*d, v[1]*d), dx=lx-O0, dz=lz-O1;
  const ids=selFor(ls), len=ls.len*12, cl=(a,lo,hi)=>Math.min(hi,Math.max(lo,a));
  change(ls, (E, pts)=>{ const next=new Set();
    pts.filter(p=>ids.has(p.id)).forEach(p=>{
      const x=+cl(p.x+dx, 3, len-3).toFixed(4), z=+cl(p.z+dz, 3, 93).toFixed(4);
      if(p.pin){ const q=E.pins.find(q=>q.id===p.id); if(q){ q.x=x; q.z=z; } next.add(p.id); }
      else { E.hide.push(p.id); const id=newPin(); E.pins.push({id, x, z}); next.add(id); } });
    sel.ids=next; });
}
function bindLightEditor(root, ls){
  const box=root.querySelector('.le-box'); if(!box) return;
  const ids=selFor(ls), svg=box.querySelector('.le-svg'), B=basis(ls);
  svg.addEventListener('click', e=>{
    const g=e.target.closest('.le-l');
    if(g && !adding){ const id=g.dataset.id; if(ids.has(id)) ids.delete(id); else ids.add(id); renderSide(); markers(); return; }
    const pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const p=pt.matrixTransform(svg.getScreenCTM().inverse());
    const [x,z]=B.toL(p.x, p.y), len=ls.len*12;
    if(adding){ if(x<3||x>len-3||z<3||z>93){ toast('Inside the ceiling, please.'); return; }
      adding=false; change(ls, E=>{ const id=newPin(); E.pins.push({id, x:+x.toFixed(2), z:+z.toFixed(2), added:true}); sel.ids=new Set([id]); }); toast('Light added · cut like a pot light'); return; }
    // a finger is wide: the nearest light within 10″ counts as tapped
    const near=lights(ls).map(q=>({q, d:Math.hypot(q.x-x, q.z-z)})).sort((a,b)=>a.d-b.d)[0];
    if(near && near.d<=10){ const id=near.q.id; if(ids.has(id)) ids.delete(id); else ids.add(id); renderSide(); markers(); return; }
    if(ids.size){ ids.clear(); renderSide(); markers(); }
  });
  box.querySelectorAll('[data-mv]').forEach(b=>b.onclick=()=>moveSel(ls, b.dataset.mv));
  box.querySelector('#leStep')?.addEventListener('change', e=>{ const v=parseIn(e.target.value); if(v>0) step=v; });
  box.querySelector('#leAdd')?.addEventListener('click', ()=>{ adding=!adding; renderSide(); });
  box.querySelector('#leAll')?.addEventListener('click', ()=>{ const pts=lights(ls); if(ids.size===pts.length) ids.clear(); else pts.forEach(p=>ids.add(p.id)); renderSide(); markers(); });
  box.querySelector('#leDel')?.addEventListener('click', ()=>{ change(ls, (E, pts)=>{ pts.filter(p=>ids.has(p.id)).forEach(p=>{ if(p.pin) E.pins=E.pins.filter(q=>q.id!==p.id); else E.hide.push(p.id); }); sel.ids=new Set(); }); toast('Removed'); });
  box.querySelector('#leReset')?.addEventListener('click', e=>{ const b=e.target; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to reset'; return; }
    change(ls, E=>{ E.hide=[]; E.pins=[]; sel.ids=new Set(); }); toast('Lights back to the rules'); });
  markers();
}
/* a tap on the picked ceiling in 3D (ceiling inches): pick / unpick the light there, or add one in add mode */
function pickLightAt(ls, x, z){
  const ids=selFor(ls);
  if(adding){ adding=false; change(ls, E=>{ const id=newPin(); E.pins.push({id, x:+x.toFixed(2), z:+z.toFixed(2), added:true}); sel.ids=new Set([id]); }); return true; }
  const p=lights(ls).map(p=>({p, d:Math.hypot(p.x-x, p.z-z)})).sort((a,b)=>a.d-b.d)[0];
  if(!p || p.d>5) return false;
  if(ids.has(p.p.id)) ids.delete(p.p.id); else ids.add(p.p.id); renderSide(); markers(); return true;
}
/* orange rings on the picked lights, in 3D */
let markHook=()=>{}; const onMarkers = fn => { markHook=fn; };
function markers(){ markHook(); }
export { lightEditorHTML, bindLightEditor, pickLightAt, selectedLights, clearLightSel, onMarkers, lights as lightsOfSlot };
