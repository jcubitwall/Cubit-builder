/* Cubit Builder — layer-builder.js : build a floor, ceiling or roof panel layer without Shapr3D (the wall builder's twin).

   A layer is the pod's length (8′, 16′ or 24′) × 8′ (96″) across, in 4′ panels; its thickness comes from its kind
   (exterior floor, interior floor, ceiling, roof). On it:
     · rectangular holes right through (a heat pump head, an attic hatch, a chase)
     · round holes right through
     · rectangular and round pockets from the top or the bottom face, to any depth
   Every item can be switched between "right through" and a pocket from either face, with its depth.
   Tap an item to pick it and type its size and place (inches); drag a picked item to move it, along or across only. View from above or from below
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
import { kindChooser, switchKind } from './panel-builder.js';
import { SHAPELIB, placeItem, regionsOf, shapeThumb } from './shapes.js';
import { openShapeStudio } from './shape-studio.js';
import { flatten, bboxAll } from './geom2d.js';
import { makeHistory, histButtons, bindHistory } from './local-history.js';
import { makeRefTool } from './refmeasure.js';

const WID=96, PW=48, SPLINE=1.75;
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const r8 = v => Math.round(v*8)/8;
let Lr=null, view='top', sel=null, dlg=null, origin=null, forSlot=null, ssel=null, shapePick=false;
/* placed shapes: screen x of the left edge of the box, and back */
const ssx = it => view==='top' ? it.x : L()-it.x-it.w;
const fromSsx = (it, x) => view==='top' ? x : L()-x-it.w;
/* (shape thumbnails: shapeThumb in shapes.js) */
const HIST = makeHistory(()=>(Lr), v=>{ Lr=v; sel=null; ssel=null; });

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
  sel=null; ssel=null; shapePick=false; ensure(); HIST.reset(); render(); if(!dlg.open) dlg.showModal();
}
function ensure(){
  if(dlg) return; dlg=document.createElement('dialog'); dlg.className='cw-dlg wb-dlg'; dlg.setAttribute('aria-label','Panel builder: floor, ceiling or roof');
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
/* measuring from a point of reference (refmeasure.js): drawing coords, x right, y down = z */
const holeBox = h => { const x=sx(h); return { x0:x, x1:x+h.w, y0:h.z, y1:h.z+h.d, round:h.shape==='round' }; };
const shapeBox = it => { const x=ssx(it); return { x0:x, x1:x+it.w, y0:it.z, y1:it.z+it.h }; };
const RF = makeRefTool({
  items: () => [ ...Lr.holes.map((h,i)=>i===sel ? null : { ...holeBox(h), label: isLight(h) ? 'pot light' : h.label || `${kindName(h).toLowerCase()} ${i+1}` }),
                 ...(Lr.shapes||[]).map((it,i)=>i===ssel ? null : { ...shapeBox(it), label:`shape ${it.name||i+1}` }) ].filter(Boolean),
  lines: () => [ ...seams().map(q=>[{x:view==='top'?q:L()-q}, 'panel joint']), [{x:0}, 'left end'], [{x:L()}, 'right end'], [{y:0}, 'top edge'], [{y:WID}, 'bottom edge'] ],
  extent: () => ({ x0:0, x1:L(), y0:0, y1:WID }),
  box: () => ssel!=null ? shapeBox(Lr.shapes[ssel]) : holeBox(Lr.holes[sel]),
  moveBy: (dx, dy) => {
    if(ssel!=null){ const it=Lr.shapes[ssel]; it.x=+fromSsx(it, ssx(it)+dx).toFixed(4); it.z=+(it.z+dy).toFixed(4); return ''; }
    const h=Lr.holes[sel], ox=h.x; h.x=+fromSx(h, sx(h)+dx).toFixed(4); h.z=+(h.z+dy).toFixed(4);
    if(h.path){ const mx=h.x-ox; h.path=h.path.map(([a,b])=>[+(a+mx).toFixed(4), +(b+dy).toFixed(4)]); }
    return ''; },
  rerender: () => render(), toast: m => toast(m),
});
let lastSel='';

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
  (Lr.shapes||[]).forEach((it,i)=>{ if(it.x<-0.01 || it.x+it.w>L()+0.01 || it.z<-0.01 || it.z+it.h>WID+0.01) out.push(`Shape ${it.name||i+1} runs past the edge`); });
  return out;
}
function autoName(){
  const ok=Lr.holes.filter(h=>!isLight(h)), n=f=>ok.filter(f).length;
  const holes=n(h=>cutOf(h)==='thru'), pk=n(h=>cutOf(h)!=='thru');
  const ns=(Lr.shapes||[]).length, bits=[holes&&`${holes} hole${holes>1?'s':''}`, pk&&`${pk} pocket${pk>1?'s':''}`, ns&&`${ns} shape${ns>1?'s':''}`].filter(Boolean);
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
  (Lr.shapes||[]).forEach((it,i)=>{ const on=ssel===i, far=it.face!==near(); let p='';
    regionsOf(it).forEach(r=>{ const thru=r.cut==='thru'||r.depth>=T()-0.0625;
      const ring=P=>'M'+P.map(([x,y])=>{ const X=it.x+x; return `${(view==='top'?X:L()-X).toFixed(2)} ${(it.z+it.h-y).toFixed(2)}`; }).join('L')+'Z';
      p+=`<path d="${[r.pts,...(r.holes||[])].map(ring).join(' ')}" fill-rule="evenodd" class="${thru?'wb-op lb-thru':'wb-box wb-pk'+(far?' far':'')}"/>`; });
    const x=ssx(it); p+=`<rect x="${x-3}" y="${it.z-3}" width="${it.w+6}" height="${it.h+6}" class="wb-hit"/>`;
    g+=`<g class="wb-shape${on?' on':''}" data-k="s" data-i="${i}">${p}</g>`; });
  if(ssel!=null){ const it=(Lr.shapes||[])[ssel]; if(it){ const x=ssx(it), ym=it.z+it.h/2, xm=x+it.w/2;
    g+=`<line x1="0" y1="${ym}" x2="${x}" y2="${ym}" class="wb-dim"/><text x="${x/2}" y="${ym-1.5}" class="wb-dimt">${fin(x)}</text>`;
    g+=`<line x1="${xm}" y1="0" x2="${xm}" y2="${it.z}" class="wb-dim"/><text x="${xm+1.5}" y="${it.z/2}" class="wb-dimt" text-anchor="start">${fin(it.z)}</text>`; } }
  // the picked item's distances to the left end and the top edge
  if(sel!=null){ const h=Lr.holes[sel]; if(h){ const x=sx(h), ym=h.z+h.d/2, xm=x+h.w/2;
    g+=`<line x1="0" y1="${ym}" x2="${x}" y2="${ym}" class="wb-dim"/><text x="${x/2}" y="${ym-1.5}" class="wb-dimt">${fin(x)}</text>`;
    g+=`<line x1="${xm}" y1="0" x2="${xm}" y2="${h.z}" class="wb-dim"/><text x="${xm+1.5}" y="${h.z/2}" class="wb-dimt" text-anchor="start">${fin(h.z)}</text>`; } }
  const lx = view==='top' ? E.x0 : E.x1, rx = view==='top' ? E.x1 : E.x0;
  g+=`<text x="${len/2}" y="-3" class="wb-end" text-anchor="middle">${esc(E.z0||'this edge')}</text><text x="${len/2}" y="${WID+6}" class="wb-end" text-anchor="middle">${esc(E.z1||'')}</text>`;
  g+=`<text x="-3" y="${WID/2}" class="wb-end" text-anchor="middle" transform="rotate(-90 -3 ${WID/2})">${esc(lx)}</text><text x="${len+3}" y="${WID/2}" class="wb-end" text-anchor="middle" transform="rotate(90 ${len+3} ${WID/2})">${esc(rx)}</text>`;
  return `<svg class="wb-svg" viewBox="${-pad} ${-pad} ${len+2*pad} ${WID+2*pad+8}" role="img" aria-label="The ${esc(K().label.toLowerCase())} seen from ${view==='top'?'above':'below'}">${g}${RF.overlay()}
    <text x="0" y="${WID+12}" class="wb-end">seen from ${view==='top'?'above':'below'} · ${Lr.len}′ × 8′ · ${fin(T())} thick</text></svg>`;
}
function fields(){
  if(ssel!=null && Lr.shapes?.[ssel]){ const it=Lr.shapes[ssel], R=regionsOf(it), th=R.filter(r=>r.cut==='thru'||r.depth>=T()-0.0625), pk=R.filter(r=>!th.includes(r));
    const f=(id,label,v)=>`<label class="cw-f"><span>${label}</span><input data-sf="${id}" inputmode="decimal" value="${Math.round(v*16)/16}"><i>″</i></label>`;
    return `<div class="wb-sel"><div class="eyebrow">Shape · ${esc(it.name||'')}${it.ref?` · ${esc(it.ref)}`:''}</div>
      <p class="note">${fin(it.w)} × ${fin(it.h)}${th.length?` · ${th.length} through`:''}${pk.length?` · ${pk.length} pocket${pk.length>1?'s':''} (${[...new Set(pk.map(r=>fin(r.depth)))].join(', ')} deep)`:''}</p>
      <div class="cw-fs">${f('x','Left edge from the left end', ssx(it))}${f('z','Top edge from the top edge', it.z)}</div>
      <div class="rf-wrap">${RF.panel()}</div>
      ${pk.length?`<div class="cw-opt"><span>Pockets cut from</span><div class="seg"><button data-sface="top" aria-pressed="${it.face!=='bottom'}">Top face</button><button data-sface="bottom" aria-pressed="${it.face==='bottom'}">Bottom face</button></div></div>`:''}
      <div class="row"><button class="btn ghost sm" data-smir="x">Mirror</button><button class="btn ghost sm" data-smir="y">Flip</button><button class="btn ghost sm" id="lbSDup">Duplicate</button><button class="btn ghost sm" id="lbSDel">Remove</button></div></div>`; }
  if(sel==null) return `<p class="note">Tap an item to pick it, then drag it to move it along or across (one at a time), or type its size and place. Measurements are from the left end and the top edge as you see it now.</p>`;
  const h=Lr.holes[sel]; if(!h) return '';
  const round=h.shape==='round', shaped=h.shape==='poly' || h.shape==='slot', c=cutOf(h);
  const f=(id,label,v)=>`<label class="cw-f"><span>${label}</span><input data-f="${id}" inputmode="decimal" value="${Math.round(v*16)/16}"><i>″</i></label>`;
  return `<div class="wb-sel"><div class="eyebrow">${kindName(h)}${shaped?' · as drawn':''}</div>
    <label class="cw-f wb-name"><span>Name <small>(optional)</small></span><input data-nm="1" value="${esc(h.label||'')}" placeholder="${esc(kindName(h))}" maxlength="60"></label>
    <div class="seg wrap" role="group" aria-label="Cut"><button data-cut="thru" aria-pressed="${c==='thru'}">Right through</button><button data-cut="top" aria-pressed="${c==='top'}">Pocket from the top</button><button data-cut="bottom" aria-pressed="${c==='bottom'}">Pocket from the bottom</button></div>
    <div class="cw-fs">${shaped ? '' : round ? f('dia','Diameter',h.dia||h.w) : f('w','Length (along the pod)',h.w)+f('d','Width (across)',h.d)}
      ${f('x','Left edge from the left end', sx(h))}
      ${f('z','Top edge from the top edge', h.z)}
      ${c!=='thru' ? f('depth','Depth', h.depth) : ''}</div>
    <div class="rf-wrap">${RF.panel()}</div>
    ${c!=='thru' ? `<p class="note">${fin(T()-h.depth)} of the panel left at the ${h.face==='bottom'?'top':'bottom'}. As deep as the panel (${fin(T())}) = right through.</p>` : ''}
    <div class="row"><button class="btn ghost sm" id="lbDup">Duplicate</button><button class="btn ghost sm" id="lbDel">Remove</button></div></div>`;
}
function render(){
  HIST.track();
  const sk = ssel!=null ? 's'+ssel : sel!=null ? 'h'+sel : ''; if(sk!==lastSel){ RF.reset(); lastSel=sk; }
  const P=problems(), libHit=!!origin, lights=Lr.holes.filter(isLight).length;
  dlg.innerHTML=`<div class="cw">
    <header class="cw-h"><h2>Panel builder</h2>${kindChooser(Lr.kind)}<span class="note">${origin?`editing <b>${esc(origin)}</b>`:forSlot?`for ${esc(forSlot.label)}`:'new layer'}</span><span class="spacer"></span><button class="btn ghost cw-x" aria-label="Close">✕</button></header>
    <div class="wb-body">
      <div class="wb-view">
        <div class="cw-vh"><div class="seg"><button data-view="top" aria-pressed="${view==='top'}">From above</button><button data-view="bottom" aria-pressed="${view==='bottom'}">From below</button></div>
          <span class="spacer"></span>${histButtons(HIST)}<button class="btn ghost sm" id="lbMir" title="Turn it end for end">Mirror</button><button class="btn ghost sm" id="lbFlip" title="Turn it front to back">Flip</button></div>
        <div class="wb-stage">${plan()}</div>
        ${P.length?`<ul class="wb-warn">${P.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:''}
      </div>
      <div class="cw-side">
        <div class="cw-opt"><span>Length (8′ across)</span><div class="seg wrap">${[8,16,24].map(n=>`<button data-len="${n}" aria-pressed="${Lr.len===n}">${n}′</button>`).join('')}</div></div>
        <h3>Right through</h3>
        <div class="wb-add"><button class="btn ghost sm" data-add="rect">Rectangular hole</button><button class="btn ghost sm" data-add="hatch">Hatch 22 × 30</button><button class="btn ghost sm" data-add="round">Round hole</button></div>
        <h3>Pocket in the ${view==='top'?'top':'bottom'} face</h3>
        <div class="wb-add"><button class="btn ghost sm" data-add="rpocket">Rectangular pocket</button><button class="btn ghost sm" data-add="cpocket">Round pocket</button></div>
        ${Lr.kind==='ceiling-int'?`<p class="note">Heat pump head, hatch or chase: add a rectangular hole, then make it a pocket and set its depth if it shouldn't go right through.${lights?` The ${lights/2|0} pot lights shown faintly follow the light rules (change them with Lights by hand on the ceiling).`:' Pot lights follow the light rules; change them with Lights by hand on the ceiling.'}</p>`:''}
        <h3>Shapes</h3>
        <div class="wb-add"><button class="btn ghost sm" id="lbShape" aria-pressed="${shapePick}">Add shape</button><button class="btn ghost sm" id="lbDraw">Draw a new shape</button></div>
        ${shapePick?`<div class="wb-shapes">${SHAPELIB.length ? SHAPELIB.map(s=>`<button class="wb-shp" data-shape="${esc(s.id)}">${shapeThumb(s)}<span><b>${esc(s.name)}</b><small>${fin(s.w||0)} × ${fin(s.h||0)}</small></span></button>`).join('') : '<p class="note">No shapes yet: Draw a new shape.</p>'}</div>`:''}
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
  bindHistory(dlg, HIST, render);
  RF.bind(dlg);
  dlg.querySelectorAll('[data-nm]').forEach(inp=>inp.onchange=()=>{ const h=Lr.holes[sel]; if(!h) return; const v=inp.value.trim().slice(0,60); if(v) h.label=v; else delete h.label; render(); });
  dlg.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{ view=b.dataset.view; render(); });
  dlg.querySelectorAll('[data-pkind]').forEach(b=>b.onclick=()=>{ const k=b.dataset.pkind; if(k==='wall'){ switchKind('wall', { len:Lr.len, close:()=>dlg.close() }); return; } Lr.kind=k; Lr.t=K().t; Lr.z=K().z; render(); });
  dlg.querySelectorAll('[data-len]').forEach(b=>b.onclick=()=>{ Lr.len=+b.dataset.len; Lr.seams=[]; render(); });
  dlg.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add));
  dlg.querySelectorAll('[data-cut]').forEach(b=>b.onclick=()=>setCut(b.dataset.cut));
  dlg.querySelectorAll('[data-f]').forEach(inp=>inp.onchange=()=>{ const s=String(inp.value).trim(), m=s.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/); const v=m?(m[1]?+m[1]:0)+(m[2]?(+m[2])/(+m[3]):0):NaN; setField(inp.dataset.f, v); });
  $('#lbShape')?.addEventListener('click',()=>{ shapePick=!shapePick; render(); });
  $('#lbDraw')?.addEventListener('click',()=>openShapeStudio());
  dlg.querySelectorAll('[data-shape]').forEach(b=>b.onclick=()=>{ const sh=SHAPELIB.find(x=>x.id===b.dataset.shape); if(!sh) return;
    const it=placeItem(sh); it.face=near(); if(view==='bottom') it.mx=true;   // reads as drawn from the side you're looking at
    it.z=r8(Math.max(0, WID/2-it.h/2)); it.x=r8(fromSsx(it, L()/2-it.w/2)); (Lr.shapes ||= []).push(it); ssel=Lr.shapes.length-1; sel=null; shapePick=false; render(); });
  dlg.querySelectorAll('[data-sface]').forEach(b=>b.onclick=()=>{ Lr.shapes[ssel].face=b.dataset.sface; render(); });
  dlg.querySelectorAll('[data-smir]').forEach(b=>b.onclick=()=>{ const it=Lr.shapes[ssel]; if(b.dataset.smir==='x') it.mx=!it.mx; else it.my=!it.my; render(); });
  dlg.querySelectorAll('[data-sf]').forEach(inp=>inp.onchange=()=>{ const s=String(inp.value).trim(), m=s.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/); const v=m?(m[1]?+m[1]:0)+(m[2]?(+m[2])/(+m[3]):0):NaN; if(!isFinite(v)) return render();
    const it=Lr.shapes[ssel]; if(inp.dataset.sf==='x') it.x=+fromSsx(it,v).toFixed(4); else it.z=v; render(); });
  $('#lbSDel')?.addEventListener('click',()=>{ Lr.shapes.splice(ssel,1); ssel=null; render(); });
  $('#lbSDup')?.addEventListener('click',()=>{ const it=clone(Lr.shapes[ssel]); it.x += view==='top' ? it.w+6 : -(it.w+6); Lr.shapes.push(it); ssel=Lr.shapes.length-1; render(); });
  $('#lbDel')?.addEventListener('click',()=>{ Lr.holes.splice(sel,1); sel=null; render(); });
  $('#lbDup')?.addEventListener('click',()=>{ const h=clone(Lr.holes[sel]); h.x += view==='top' ? h.w+6 : -(h.w+6); if(h.path) h.path=h.path.map(([a,b])=>[a+(view==='top'?h.w+6:-(h.w+6)),b]); Lr.holes.push(h); sel=Lr.holes.length-1; render(); });
  const turn=(mx,mz,msg)=>{ const m=mirrorLayer({...Lr, id:'X', name:''}, mx, mz, 'X'); Lr.holes=m.holes; Lr.seams=m.seams; if(m.shapes) Lr.shapes=m.shapes; sel=null; ssel=null; render(); toast(msg); };
  $('#lbMir').onclick=()=>turn(true,false,'Turned end for end');
  $('#lbFlip').onclick=()=>turn(false,true,'Turned front to back');
  $('#lbName')?.addEventListener('change', e=>{ Lr.name=e.target.value.trim(); });
  $('#lbSave')?.addEventListener('click',()=>saveLayer(false));
  $('#lbSaveNew')?.addEventListener('click',()=>saveLayer(true));
  // pick and drag on the drawing
  const svg=$('.wb-svg'); let drag=null;
  const toP=e=>{ const p=svg.createSVGPoint(); p.x=e.clientX; p.y=e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  svg.addEventListener('pointerdown', e=>{
    if(RF.handle(e)) return;
    if(RF.mode()==='pick'){ e.preventDefault(); return; }       // measuring: only the reference points answer
    const t=e.target.closest('[data-k]');
    if(!t){ if(sel!=null || ssel!=null){ sel=null; ssel=null; render(); } return; }
    const i=+t.dataset.i, p=toP(e);
    e.preventDefault();
    // first tap only picks it; once picked, a drag moves it along one line only (along or across)
    const c0=[e.clientX,e.clientY];
    if(t.dataset.k==='s'){ if(ssel!==i){ ssel=i; sel=null; render(); return; } const it=Lr.shapes[i]; drag={s:true, i, p0:p, c0, x0:ssx(it), z0:it.z}; svg.setPointerCapture(e.pointerId); return; }
    if(sel!==i){ sel=i; ssel=null; render(); return; }
    const h=Lr.holes[i];
    drag={i, p0:p, c0, x0:sx(h), z0:h.z, px:h.x, path:h.path?clone(h.path):null}; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', e=>{ if(!drag) return; let p=toP(e);
    if(!drag.axis){ const dx=e.clientX-drag.c0[0], dy=e.clientY-drag.c0[1]; if(Math.hypot(dx,dy)<8) return; drag.axis=Math.abs(dx)>=Math.abs(dy)?'x':'y'; }
    drag.moved=true; p = drag.axis==='x' ? {x:p.x, y:drag.p0.y} : {x:drag.p0.x, y:p.y};
    if(drag.s){ const it=Lr.shapes[drag.i], nx=r8(drag.x0+(p.x-drag.p0.x)), nz=r8(drag.z0+(p.y-drag.p0.y)); it.x=fromSsx(it,nx); it.z=Math.max(-it.h/2, Math.min(WID-it.h/2, nz));
      svg.querySelector(`[data-k="s"][data-i="${drag.i}"]`)?.setAttribute('transform', `translate(${(ssx(it)-drag.x0).toFixed(2)} ${(it.z-drag.z0).toFixed(2)})`); return; }
    const h=Lr.holes[drag.i];
    const nx=r8(drag.x0+(p.x-drag.p0.x)), nz=r8(drag.z0+(p.y-drag.p0.y));
    h.x=fromSx(h, nx); h.z=Math.max(-h.d/2, Math.min(WID-h.d/2, nz));
    if(drag.path){ const dx=h.x-drag.px, dz=h.z-drag.z0; h.path=drag.path.map(([a,b])=>[+(a+dx).toFixed(4), +(b+dz).toFixed(4)]); }
    const el=svg.querySelector(`[data-i="${drag.i}"]:not(.wb-hit)`), x=sx(h);
    if(el.tagName==='circle'){ el.setAttribute('cx', x+h.w/2); el.setAttribute('cy', h.z+h.d/2); }
    else if(el.tagName==='rect'){ el.setAttribute('x', x); el.setAttribute('y', h.z); } });
  svg.addEventListener('pointerup', ()=>{ if(!drag) return; const m=drag.moved; drag=null; if(m) render(); });
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
window.addEventListener('cubit:shapes', ()=>{ if(dlg?.open){ shapePick=true; render(); } });
export { openLayerBuilder };
