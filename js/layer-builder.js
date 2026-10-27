/* Cubit Builder — layer-builder.js : build a floor, ceiling or roof panel layer without Shapr3D (the wall builder's twin).

   A layer is the pod's length (8′, 16′ or 24′) × 8′ (96″) across, in 4′ panels; its thickness comes from its kind
   (exterior floor, interior floor, ceiling, roof). On it:
     · rectangular holes right through (a heat pump head, an attic hatch, a chase)
     · round holes right through
     · rectangular and round pockets from the top or the bottom face, to any depth
   Every item can be switched between "right through" and a pocket from either face, with its depth.
   Tap an item to pick it and type its size and place (inches); drag it to move it. View from above or from below
   (from below, left and right swap, as when you look up at it). Mirror turns it end for end, Flip front to back.
   Save puts it in the layer library (shared by the team, functions/api/layers.js), ready to pick for any pod of
   that length; opened from a pod's layer, saving also puts it on that pod.
   Same data as the scanned layers: holes { x, z, w, d } by their corner, x along the pod (0..length), z across
   (0..96), as seen from above; round ones add shape:'round', dia; pockets add depth and face 'top' | 'bottom'.
   On a ceiling the pot lights stay with the light rules (and Lights by hand); they show here faintly. */
import { LAYERLIB, layerById, mirrorLayer, forgetLayerMirrors, saveLayerLib } from './data.js';
import { state, chooseLayer } from './state.js';
import { canSave } from './role.js';
import { buildHome } from './scene3d.js';
import { renderSide, toast } from './sidebar.js';
import { slotsFor } from './layout.js';
import { edgeSides, isDrawnLight } from './lights.js';
import { LAYER_KINDS } from './config.js';
import { fin } from './format.js';

const WID=96, PW=48, SPLINE=1.75;
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const r8 = v => Math.round(v*8)/8;
let Lr=null, view='top', sel=null, dlg=null, origin=null, forSlot=null;

function blank(len=24, kind='ceiling-int'){ const K=LAYER_KINDS[kind]; return { id:null, name:'', kind, len, t:K.t, z:K.z, seams:[], holes:[] }; }
/* open the builder: a fresh layer, a copy of a library layer, or (from a pod's layer panel) ready to use there */
function openLayerBuilder({ from=null, slot=null, len, kind }={}){
  forSlot=slot||null;
  const src = from ? layerById(from) : null;
  if(src && !src.blank){ Lr=clone(src); delete Lr.src; delete Lr.mirrorOf; delete Lr.by; delete Lr.saved;
    origin = src.src==='team' && !String(from).includes('~m') ? src.id : null; if(!origin){ Lr.id=null; Lr.name=''; } }
  else { Lr=blank(len||slot?.len||24, kind||slot?.kind||'ceiling-int'); origin=null; }
  Lr.holes = (Lr.holes||[]).map(h=>{ const c={...h}; delete c._f; if(c.hand===false) delete c.hand; return c; });   // drop what the 3D view adds
  view = Lr.kind==='ceiling-int' ? 'bottom' : 'top';
  sel=null; ensure(); render(); if(!dlg.open) dlg.showModal();
}
function ensure(){
  if(dlg) return; dlg=document.createElement('dialog'); dlg.className='cw-dlg wb-dlg'; dlg.setAttribute('aria-label','Floor, ceiling and roof builder');
  document.body.appendChild(dlg);
}
const L = () => Lr.len*12;
const T = () => +(Lr.t || LAYER_KINDS[Lr.kind].t);
const K = () => LAYER_KINDS[Lr.kind];
const near = () => view;                                  // the face you're looking at
const isLight = h => Lr.kind==='ceiling-int' && isDrawnLight(h);
const seams = () => Lr.seams?.length ? Lr.seams.slice() : [...Array(Math.max(0,Math.ceil(L()/PW-1e-6)-1))].map((_,i)=>(i+1)*PW);
/* screen x of an item's left edge (from below, left and right swap) */
const sx = h => view==='top' ? h.x : L()-h.x-h.w;
const fromSx = (h, x) => view==='top' ? x : L()-x-h.w;
const cutOf = h => !h.depth || h.depth>=T()-0.0625 ? 'thru' : h.face==='bottom' ? 'bottom' : 'top';
const kindName = h => `${h.shape==='round'?'Round':'Rectangular'} ${cutOf(h)==='thru'?'hole':'pocket'}`;

/* the wall on each edge, when opened from a pod: { z0, z1, x0, x1 } → "Wall A" … */
function edgeNames(){
  const out={ z0:'', z1:'', x0:'end', x1:'end' };
  if(!forSlot) return out;
  try{ const E=edgeSides(forSlot), ws=slotsFor(state.model).filter(s=>s.pod?.i===forSlot.pod?.i);
    Object.entries(E).forEach(([e,side])=>{ const s=ws.find(w=>w.side===side && w.letter); if(s) out[e]=`Wall ${s.letter[0]}`; }); }catch(e){}
  return out;
}
/* checks: inside the panel, pockets clear of the panel joints (splines), depth no more than the panel */
function problems(){
  const out=[], S=seams();
  Lr.holes.forEach((h,i)=>{ if(isLight(h)) return;
    if(h.x<-0.01 || h.x+h.w>L()+0.01 || h.z<-0.01 || h.z+h.d>WID+0.01) out.push(`${kindName(h)} ${i+1} runs past the edge`);
    if(cutOf(h)!=='thru' && S.some(s=>s>h.x-SPLINE && s<h.x+h.w+SPLINE)) out.push(`${kindName(h)} ${i+1} is on a panel joint (spline): move it at least 1¾″ clear`); });
  return out;
}
function autoName(){
  const ok=Lr.holes.filter(h=>!isLight(h)), n=f=>ok.filter(f).length;
  const holes=n(h=>cutOf(h)==='thru'), pk=n(h=>cutOf(h)!=='thru');
  const bits=[holes&&`${holes} hole${holes>1?'s':''}`, pk&&`${pk} pocket${pk>1?'s':''}`].filter(Boolean);
  return `${Lr.len}′ ${K().label.toLowerCase()}${bits.length?' · '+bits.join(', '):' · plain'}`;
}

/* ---------------------------------------------------------------- drawing (plan, z down the screen) */
function plan(){
  const len=L(), pad=12, E=edgeNames();
  let g=`<rect x="0" y="0" width="${len}" height="${WID}" class="wb-wall lb-${Lr.kind}"/>`;
  seams().forEach(s=>{ const x = view==='top' ? s : len-s; g+=`<line x1="${x}" y1="0" x2="${x}" y2="${WID}" class="wb-seam"/>`; });
  Lr.holes.forEach((h,i)=>{
    const x=sx(h), on=sel===i, c=cutOf(h), light=isLight(h);
    const cls = light ? 'lb-light' : `${c==='thru'?'wb-op lb-thru':'wb-box'}${c!=='thru' && c!==near()?' far':''}${on?' on':''}`;
    const at = light ? '' : ` data-k="h" data-i="${i}"`;
    if(h.shape==='round') g+=`<circle cx="${x+h.w/2}" cy="${h.z+h.d/2}" r="${(h.dia||h.w)/2}" class="${cls}"${at}/>`;
    else if(h.shape==='poly' && h.path){ const P=h.path.map(([a,b])=>[view==='top'?a:len-a, b]); g+=`<polygon points="${P.map(p=>p.join(',')).join(' ')}" class="${cls}"${at}/>`; }
    else g+=`<rect x="${x}" y="${h.z}" width="${h.w}" height="${h.d}" class="${cls}"${at}/>`;
    if(!light){ if(c==='thru' && h.w>=12 && h.d>=8) g+=`<text x="${x+h.w/2}" y="${h.z+h.d/2+1}" class="wb-lab">hole</text>`;
      g+=`<rect x="${x-4}" y="${h.z-4}" width="${h.w+8}" height="${h.d+8}" class="wb-hit"${at}/>`; }   // a finger-sized target
  });
  // the picked item's distances to the left end and the top edge
  if(sel!=null){ const h=Lr.holes[sel]; if(h){ const x=sx(h), ym=h.z+h.d/2, xm=x+h.w/2;
    g+=`<line x1="0" y1="${ym}" x2="${x}" y2="${ym}" class="wb-dim"/><text x="${x/2}" y="${ym-1.5}" class="wb-dimt">${fin(x)}</text>`;
    g+=`<line x1="${xm}" y1="0" x2="${xm}" y2="${h.z}" class="wb-dim"/><text x="${xm+1.5}" y="${h.z/2}" class="wb-dimt" text-anchor="start">${fin(h.z)}</text>`; } }
  const lx = view==='top' ? E.x0 : E.x1, rx = view==='top' ? E.x1 : E.x0;
  g+=`<text x="${len/2}" y="-3" class="wb-end" text-anchor="middle">${esc(E.z0||'this edge')}</text><text x="${len/2}" y="${WID+6}" class="wb-end" text-anchor="middle">${esc(E.z1||'')}</text>`;
  g+=`<text x="-3" y="${WID/2}" class="wb-end" text-anchor="middle" transform="rotate(-90 -3 ${WID/2})">${esc(lx)}</text><text x="${len+3}" y="${WID/2}" class="wb-end" text-anchor="middle" transform="rotate(90 ${len+3} ${WID/2})">${esc(rx)}</text>`;
  return `<svg class="wb-svg" viewBox="${-pad} ${-pad} ${len+2*pad} ${WID+2*pad+8}" role="img" aria-label="The ${esc(K().label.toLowerCase())} seen from ${view==='top'?'above':'below'}">${g}
    <text x="0" y="${WID+12}" class="wb-end">seen from ${view==='top'?'above':'below'} · ${Lr.len}′ × 8′ · ${fin(T())} thick</text></svg>`;
}
function fields(){
  if(sel==null) return `<p class="note">Tap an item to size and place it, or drag it. Measurements are from the left end and the top edge as you see it now.</p>`;
  const h=Lr.holes[sel]; if(!h) return '';
  const round=h.shape==='round', shaped=h.shape==='poly' || h.shape==='slot', c=cutOf(h);
  const f=(id,label,v)=>`<label class="cw-f"><span>${label}</span><input data-f="${id}" inputmode="decimal" value="${Math.round(v*16)/16}"><i>″</i></label>`;
  return `<div class="wb-sel"><div class="eyebrow">${kindName(h)}${shaped?' · as drawn':''}</div>
    <div class="seg wrap" role="group" aria-label="Cut"><button data-cut="thru" aria-pressed="${c==='thru'}">Right through</button><button data-cut="top" aria-pressed="${c==='top'}">Pocket from the top</button><button data-cut="bottom" aria-pressed="${c==='bottom'}">Pocket from the bottom</button></div>
    <div class="cw-fs">${shaped ? '' : round ? f('dia','Diameter',h.dia||h.w) : f('w','Length (along the pod)',h.w)+f('d','Width (across)',h.d)}
      ${f('x','Left edge from the left end', sx(h))}
      ${f('z','Top edge from the top edge', h.z)}
      ${c!=='thru' ? f('depth','Depth', h.depth) : ''}</div>
    ${c!=='thru' ? `<p class="note">${fin(T()-h.depth)} of the panel left at the ${h.face==='bottom'?'top':'bottom'}. As deep as the panel (${fin(T())}) = right through.</p>` : ''}
    <div class="row"><button class="btn ghost sm" id="lbDup">Duplicate</button><button class="btn ghost sm" id="lbDel">Remove</button></div></div>`;
}
function render(){
  const P=problems(), libHit=!!origin, lights=Lr.holes.filter(isLight).length;
  dlg.innerHTML=`<div class="cw">
    <header class="cw-h"><h2>Floor, ceiling &amp; roof builder</h2><span class="note">${origin?`editing <b>${esc(origin)}</b>`:forSlot?`for ${esc(forSlot.label)}`:'new layer'}</span><span class="spacer"></span><button class="btn ghost cw-x" aria-label="Close">✕</button></header>
    <div class="wb-body">
      <div class="wb-view">
        <div class="cw-vh"><div class="seg"><button data-view="top" aria-pressed="${view==='top'}">From above</button><button data-view="bottom" aria-pressed="${view==='bottom'}">From below</button></div>
          <span class="spacer"></span><button class="btn ghost sm" id="lbMir" title="Turn it end for end">Mirror</button><button class="btn ghost sm" id="lbFlip" title="Turn it front to back">Flip</button></div>
        <div class="wb-stage">${plan()}</div>
        ${P.length?`<ul class="wb-warn">${P.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:''}
      </div>
      <div class="cw-side">
        <div class="cw-opt"><span>Layer</span><div class="seg wrap">${Object.entries(LAYER_KINDS).map(([k,v])=>`<button data-kind="${k}" aria-pressed="${Lr.kind===k}">${v.label}</button>`).join('')}</div></div>
        <div class="cw-opt"><span>Length (8′ across)</span><div class="seg wrap">${[8,16,24].map(n=>`<button data-len="${n}" aria-pressed="${Lr.len===n}">${n}′</button>`).join('')}</div></div>
        <h3>Right through</h3>
        <div class="wb-add"><button class="btn ghost sm" data-add="rect">Rectangular hole</button><button class="btn ghost sm" data-add="hatch">Hatch 22 × 30</button><button class="btn ghost sm" data-add="round">Round hole</button></div>
        <h3>Pocket in the ${view==='top'?'top':'bottom'} face</h3>
        <div class="wb-add"><button class="btn ghost sm" data-add="rpocket">Rectangular pocket</button><button class="btn ghost sm" data-add="cpocket">Round pocket</button></div>
        ${Lr.kind==='ceiling-int'?`<p class="note">Heat pump head, hatch or chase: add a rectangular hole, then make it a pocket and set its depth if it shouldn't go right through.${lights?` The ${lights/2|0} pot lights shown faintly follow the light rules (change them with Lights by hand on the ceiling).`:' Pot lights follow the light rules; change them with Lights by hand on the ceiling.'}</p>`:''}
        ${fields()}
        <h3>Save</h3>
        <label class="cw-f"><span>Name</span><input id="lbName" value="${esc(Lr.name||'')}" placeholder="${esc(autoName())}"></label>
        <div class="row">${canSave()?`<button class="btn" id="lbSave">${libHit?'Save changes':'Save to layer library'}</button>${libHit?'<button class="btn ghost" id="lbSaveNew">Save as a new layer</button>':''}`:'<span class="note">Viewers can look but not save.</span>'}</div>
        ${forSlot?`<p class="note">Saving also puts it on ${esc(forSlot.label)}.</p>`:''}
      </div></div></div>`;
  bind();
}
/* ---------------------------------------------------------------- editing */
function add(kind){
  const face=near(), cx=L()/2, n=Lr.holes.filter(h=>!isLight(h)).length%4, off=n*8;
  const h = kind==='rect' ? {w:24, d:24} : kind==='hatch' ? {w:30, d:22} : kind==='round' ? {shape:'round', dia:4, w:4, d:4}
          : kind==='rpocket' ? {w:36, d:12, depth:2, face} : {shape:'round', dia:4, w:4, d:4, depth:2, face};
  h.x=r8(fromSx(h, cx-h.w/2+off)); h.z=r8(WID/2-h.d/2+off);
  Lr.holes.push(h); sel=Lr.holes.length-1; render();
}
function setField(f, v){
  const h=Lr.holes[sel]; if(!h || !isFinite(v) || v<0) return;
  if(f==='dia'){ const cx=h.x+h.w/2, cz=h.z+h.d/2; h.dia=h.w=h.d=v; h.x=cx-v/2; h.z=cz-v/2; }
  else if(f==='x') h.x=fromSx(h, v);
  else if(f==='w'){ const left=sx(h); h.w=v; h.x=fromSx(h, left); }     // keep the left edge you see
  else if(f==='depth'){ if(v>=T()-0.0625){ delete h.depth; delete h.face; } else h.depth=v; }
  else h[f]=v;
  ['x','z','w','d','dia','depth'].forEach(k=>{ if(h[k]!=null) h[k]=Math.round(h[k]*10000)/10000; });
  render();
}
function setCut(c){
  const h=Lr.holes[sel]; if(!h) return;
  if(c==='thru'){ delete h.depth; delete h.face; }
  else { h.face=c; if(!h.depth || h.depth>=T()-0.0625) h.depth=Math.min(2, T()/2); }
  render();
}
function bind(){
  const $=s=>dlg.querySelector(s);
  $('.cw-x').onclick=()=>dlg.close();
  dlg.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{ view=b.dataset.view; render(); });
  dlg.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{ Lr.kind=b.dataset.kind; Lr.t=K().t; Lr.z=K().z; render(); });
  dlg.querySelectorAll('[data-len]').forEach(b=>b.onclick=()=>{ Lr.len=+b.dataset.len; Lr.seams=[]; render(); });
  dlg.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add));
  dlg.querySelectorAll('[data-cut]').forEach(b=>b.onclick=()=>setCut(b.dataset.cut));
  dlg.querySelectorAll('[data-f]').forEach(inp=>inp.onchange=()=>{ const s=String(inp.value).trim(), m=s.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/); const v=m?(m[1]?+m[1]:0)+(m[2]?(+m[2])/(+m[3]):0):NaN; setField(inp.dataset.f, v); });
  $('#lbDel')?.addEventListener('click',()=>{ Lr.holes.splice(sel,1); sel=null; render(); });
  $('#lbDup')?.addEventListener('click',()=>{ const h=clone(Lr.holes[sel]); h.x += view==='top' ? h.w+6 : -(h.w+6); if(h.path) h.path=h.path.map(([a,b])=>[a+(view==='top'?h.w+6:-(h.w+6)),b]); Lr.holes.push(h); sel=Lr.holes.length-1; render(); });
  const turn=(mx,mz,msg)=>{ const m=mirrorLayer({...Lr, id:'X', name:''}, mx, mz, 'X'); Lr.holes=m.holes; Lr.seams=m.seams; sel=null; render(); toast(msg); };
  $('#lbMir').onclick=()=>turn(true,false,'Turned end for end');
  $('#lbFlip').onclick=()=>turn(false,true,'Turned front to back');
  $('#lbName')?.addEventListener('change', e=>{ Lr.name=e.target.value.trim(); });
  $('#lbSave')?.addEventListener('click',()=>saveLayer(false));
  $('#lbSaveNew')?.addEventListener('click',()=>saveLayer(true));
  // pick and drag on the drawing
  const svg=$('.wb-svg'); let drag=null;
  const toP=e=>{ const p=svg.createSVGPoint(); p.x=e.clientX; p.y=e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  svg.addEventListener('pointerdown', e=>{ const t=e.target.closest('[data-k]');
    if(!t){ if(sel!=null){ sel=null; render(); } return; }
    const i=+t.dataset.i, h=Lr.holes[i], p=toP(e);
    sel=i; drag={i, p0:p, x0:sx(h), z0:h.z, px:h.x, path:h.path?clone(h.path):null}; svg.setPointerCapture(e.pointerId); e.preventDefault(); });
  svg.addEventListener('pointermove', e=>{ if(!drag) return; const p=toP(e), h=Lr.holes[drag.i];
    const nx=r8(drag.x0+(p.x-drag.p0.x)), nz=r8(drag.z0+(p.y-drag.p0.y));
    h.x=fromSx(h, nx); h.z=Math.max(-h.d/2, Math.min(WID-h.d/2, nz));
    if(drag.path){ const dx=h.x-drag.px, dz=h.z-drag.z0; h.path=drag.path.map(([a,b])=>[+(a+dx).toFixed(4), +(b+dz).toFixed(4)]); }
    const el=svg.querySelector(`[data-i="${drag.i}"]:not(.wb-hit)`), x=sx(h);
    if(el.tagName==='circle'){ el.setAttribute('cx', x+h.w/2); el.setAttribute('cy', h.z+h.d/2); }
    else if(el.tagName==='rect'){ el.setAttribute('x', x); el.setAttribute('y', h.z); } });
  svg.addEventListener('pointerup', ()=>{ if(!drag) return; drag=null; render(); });
}
const nextId=prefix=>{ let n=1; while(LAYERLIB.some(x=>x.id===`${prefix}-${String(n).padStart(2,'0')}`)) n++; return `${prefix}-${String(n).padStart(2,'0')}`; };
async function saveLayer(asNew){
  if(!canSave()){ toast('Viewers can look but not save.'); return; }
  const l=clone(Lr); l.name=(dlg.querySelector('#lbName')?.value||'').trim() || autoName();
  l.t=T(); l.z=l.z ?? K().z;
  // a floor keeps how the standard cassette is built (rims, EPS, blocks, frame) unless it already says
  if(!l.build){ const std=LAYERLIB.find(x=>x.std && x.kind===l.kind && x.build); if(std) l.build=clone(std.build); }
  l.std=false; l.cnc = l.holes.length>0;
  if(asNew || !origin) l.id=nextId(`${K().code}${String(l.len).padStart(2,'0')}`); else l.id=origin;
  l.source=`Layer builder ${new Date().toISOString().slice(0,10)}`;
  let shared=false;
  try{ const r=await fetch('api/layers',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({op:'save', layer:l})});
    if(r.ok && (r.headers.get('content-type')||'').includes('json')) shared=true; else if(r.status!==404 && r.status!==405 && r.status!==501){ const o=await r.json().catch(()=>({})); if(o.error) throw new Error(o.error); } }
  catch(e){ toast(`Couldn't save: ${e.message||e}`); return; }
  const i=LAYERLIB.findIndex(x=>x.id===l.id), entry={...l, src: shared?'team':'saved'};
  if(i>=0) LAYERLIB[i]=entry; else LAYERLIB.push(entry);
  forgetLayerMirrors(l.id);
  if(!shared) saveLayerLib();
  origin=l.id; Lr.id=l.id; Lr.name=l.name;
  if(forSlot && forSlot.kind===l.kind && forSlot.len===l.len) chooseLayer(forSlot, l.id);
  buildHome(); renderSide(); render();
  toast(`${l.id} saved to the layer library${shared?' (for the whole team)':' (in this browser)'}${forSlot && forSlot.kind===l.kind && forSlot.len===l.len?` · on ${forSlot.label}`:''}`);
}
/* ⋯ menu → Floor / ceiling / roof builder */
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bLayerB')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bLayerB'; b.textContent='Floor / ceiling / roof builder';
    pop.insertBefore(b, document.getElementById('bUpload')); b.onclick=()=>{ pop.hidden=true; openLayerBuilder(); }; } }
export { openLayerBuilder };
