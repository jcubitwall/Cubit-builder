/* Cubit Builder — shape-studio.js : full-screen sketching for any shape to cut into a panel, following Shapr3D's
   sketching rules (the team already works that way).

   SKETCH, THEN REGIONS
     You draw lines, rectangles, circles, arcs and splines. Every area they close off is a REGION, whatever drew it:
     overlapping shapes and lines drawn across a shape split it, a shape inside another leaves an island. Tap a
     region to pick it, then say what it cuts: Not cut, Right through, or Pocket with its depth. A region keeps its
     setting while you edit; when one is split, both halves keep it.
   TOOLS (top bar; keys V L R C A S F O T M)
     Select   tap = pick (each tap ADDS to the selection; tap again to drop it; tap empty space to clear);
              double-tap a line = pick the whole chain; drag a point to move it, a line to move it (its neighbours
              stretch), a picked shape to move everything picked; drag empty space with the Pencil or a mouse = box
              select, with a finger = pan
     Line     one line after another; tap the start point to close it, tap the last point again (or double-tap,
              Enter) to finish; starting on the end of a line carries it on. Type the length, Tab to the angle, Enter.
     Rect     corner to corner, or from the centre (choose under the tool bar); drag or tap-tap; type W, Tab, H, Enter
     Circle   centre and radius, or through 3 points          Arc   3 points: start, end, then where it passes
     Spline   tap the points it passes through (fit points); tap the first to close, double-tap / Enter to finish
     Fillet   press on a corner and drag to round it (or tap the corner and type the radius)
     Offset   press on a closed shape and drag out or in (or tap it and type the distance): a copy that far away
     Trim     tap the piece of a line between two crossings to remove it
     Mirror   pick what to mirror first, then tap the line to mirror across: a mirrored copy
   SNAPPING (inference, as in Shapr3D): end points, midpoints, centres, quadrants, crossings, onto lines, lined up
     horizontally / vertically with other points (dotted guides), horizontal / vertical / perpendicular from the last
     point, then the grid. A small label says which.
   DIMENSIONS: everything shows its size while you draw and when picked; tap a dimension to type a new value.
   GESTURES: pinch to zoom, two fingers to pan, two-finger tap = undo, three-finger tap = redo.
   Inside corners the ¾″ bit can't make (tighter than ⅜″) are marked red, with what it really leaves dashed.
   Save puts the shape in the Shape library; the wall and floor / ceiling / roof builders place it (Add shape). */
import { flatten, area, bbox, bboxAll, segCount, segType, segLength, bulgeArc, fillet, offset, bool, asCut, mapAll, mirrorAll,
  arrangement, inRegion, interiorPoint, simplify, crossings, distToSeg, inPoly, R_BIT } from './geom2d.js';
import { SHAPELIB, shapeById, nextShapeId, saveShape, deleteShape, sharedShapes, shapeThumb } from './shapes.js';
import { makeHistory } from './local-history.js';
import { canSave } from './role.js';
import { toast } from './sidebar.js';
import { fin as finInch } from './format.js';
/* ---------------------------------------------------------------- units: inches (fractions), feet & inches, mm, cm.
   Everything is kept in inches; only what's shown and typed changes. A typed value can also say its own unit:
   3' 4"  ·  40"  ·  3 1/2  ·  25mm  ·  2.5cm  ·  1.2m  (a plain number is in the unit picked; feet & inches: inches) */
const UNITS = { in:{label:'in', sign:'″'}, ft:{label:'ft-in', sign:'″'}, mm:{label:'mm', sign:'mm'}, cm:{label:'cm', sign:'cm'} };
let unit = (()=>{ try{ return localStorage.getItem('cubit-ss-unit') || 'in'; }catch(e){ return 'in'; } })();
const uSign = () => UNITS[unit].sign;
function fin(v){ if(!isFinite(v)) return ''; const neg=v<0?'−':''; v=Math.abs(v);
  if(unit==='mm') return `${neg}${Math.round(v*25.4*10)/10} mm`;
  if(unit==='cm') return `${neg}${Math.round(v*2.54*100)/100} cm`;
  if(unit==='ft' && v>=12-1e-9){ const ft=Math.floor((v+1e-9)/12), r=v-ft*12; return `${neg}${ft}′${r>1e-6?' '+finInch(r):''}`; }
  return neg+finInch(v); }
/* a length in inches → the number shown in a field (no unit sign) */
const toU = v => unit==='mm' ? Math.round(v*25.4*100)/100 : unit==='cm' ? Math.round(v*2.54*1000)/1000 : Math.round(v*10000)/10000;
function parseIn(s){ s=String(s).trim().replace(/″/g,'"').replace(/′/g,"'"); if(!s) return NaN; if(s.startsWith('-')||s.startsWith('−')) return -parseIn(s.slice(1));
  let m;
  if((m=s.match(/^([\d.]+)\s*mm$/i))) return +m[1]/25.4;
  if((m=s.match(/^([\d.]+)\s*cm$/i))) return +m[1]/2.54;
  if((m=s.match(/^([\d.]+)\s*m$/i))) return +m[1]/0.0254;
  const frac = t => { const q=String(t).trim().match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/); if(!q || (!q[1] && !q[2])) return NaN; return (q[1]?+q[1]:0)+(q[2]?(+q[2])/(+q[3]):0); };
  if((m=s.match(/^([\d.]+)\s*'\s*(?:-?\s*(.*?)\s*"?)?$/))) return +m[1]*12 + (m[2] ? frac(m[2])||0 : 0);
  if((m=s.match(/^(.*?)\s*"$/))) return frac(m[1]);
  const v=frac(s); if(!isFinite(v)) return NaN;
  return unit==='mm' ? v/25.4 : unit==='cm' ? v/2.54 : v; }

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const hyp = Math.hypot;
const GRIDS_IN = [0.0625, 0.125, 0.25, 0.5, 1], GRIDS_MM = [1, 2, 5, 10, 25].map(v=>v/25.4);
const GRIDS = () => unit==='mm'||unit==='cm' ? GRIDS_MM : GRIDS_IN;
const TOOLS = [['select','Select','V'],['line','Line','L'],['rect','Rect','R'],['circle','Circle','C'],['arc','Arc','A'],['spline','Spline','S'],['fillet','Fillet','F'],['offset','Offset','O'],['trim','Trim','T'],['mirror','Mirror','M']];
const ICON = { select:'↖', line:'╱', rect:'▭', circle:'◯', arc:'◠', spline:'∿', fillet:'◜', offset:'⧈', trim:'✂', mirror:'⇋' };
let S=null, dlg=null, svg=null, tool='select', mode={rect:'corner', circle:'centre'}, sel=[], view={cx:12, cy:8, k:24}, snapOn=true, grid=0.125, origin=null;
let mirrorStep=1;
let draft=null, hover=null, typed={f:0, v:['','']}, drag=null, libOpen=false, editor=null, REG=[], regKey='', lastTap={t:0, key:''};
const HIST = makeHistory(()=>S, v=>{ S=v; sel=[]; draft=null; regKey=''; });
let uid=1; const newId = () => 'e'+Date.now().toString(36)+(uid++);
const ent = id => S.ents.find(e=>e.id===id);

/* ---------------------------------------------------------------- opening */
function openShapeStudio({ id=null }={}){
  const src = id ? shapeById(id) : null;
  if(src?.sketch) S={ id:src.id, name:src.name, ents:clone(src.sketch.ents), regs:clone(src.sketch.regs||[]) };
  else if(src){   // a first-style drawing: its outlines become the sketch, each one's cut a region setting
    const ents=clone(src.contours||[]).map(c=>({...c, id:c.id||newId()}));
    S={ id:src.id, name:src.name, ents, regs:[] };
    ents.filter(c=>c.kind==='circle'||c.closed).forEach(c=>{ const pts=flatten(c,0.05); S.regs.push({ seed:interiorPoint({outer:pts, holes:[]}), cut:c.cut||'pocket', depth:+c.depth||1, name:c.name||'' }); });
    ents.forEach(c=>{ delete c.cut; delete c.depth; delete c.name; });
  } else S={ id:null, name:'', ents:[], regs:[] };
  origin = src ? src.id : null; tool='select'; sel=[]; draft=null; libOpen=false; regKey=''; closeEditor();
  ensure(); syncRegions(); HIST.reset();
  if(!dlg.open) dlg.showModal();
  requestAnimationFrame(()=>{ fit(); render(); svg.focus({preventScroll:true}); });
}
function ensure(){
  if(dlg) return;
  dlg=document.createElement('dialog'); dlg.className='ss-dlg'; dlg.setAttribute('aria-label','Shape studio');
  dlg.innerHTML=`<div class="ss">
    <header class="ss-bar">
      <button class="btn ghost sm" id="ssClose" aria-label="Close">✕</button>
      <input id="ssName" class="ss-name" placeholder="Name this shape" aria-label="Shape name">
      <div class="seg ss-tools" role="toolbar" aria-label="Tools">${TOOLS.map(([k,l,key])=>`<button data-tool="${k}" title="${l} (${key})"><span class="ic">${ICON[k]}</span><span class="lb">${l}</span></button>`).join('')}</div>
      <span class="spacer"></span>
      <button class="btn ghost sm" id="ssSnap" aria-pressed="true" title="Snap to points, lines and the grid">Snap</button>
      <select id="ssUnit" aria-label="Units">${Object.entries(UNITS).map(([k,u])=>`<option value="${k}">${u.label}</option>`).join('')}</select>
      <select id="ssGrid" aria-label="Grid"></select>
      <span class="hist-btns"><button class="btn ghost sm" id="ssUndo" aria-label="Undo" title="Undo (two-finger tap)">↶</button><button class="btn ghost sm" id="ssRedo" aria-label="Redo" title="Redo (three-finger tap)">↷</button></span>
      <button class="btn ghost sm" id="ssFit" title="Fit the sketch to the screen">Fit</button>
      <button class="btn ghost sm" id="ssLib">Library</button>
      <button class="btn ghost sm" id="ssSaveNew" hidden>Save as new</button><button class="btn sm" id="ssSave">Save</button>
    </header>
    <div class="ss-sub"></div>
    <div class="ss-stage"><svg class="ss-svg" tabindex="0" aria-label="Sketch"></svg>
      <div class="ss-insp" hidden></div><div class="ss-lib" hidden></div><div class="ss-edit" hidden></div>
      <div class="ss-status"></div></div></div>`;
  document.body.appendChild(dlg);
  svg=dlg.querySelector('.ss-svg');
  dlg._toClient=(x,y)=>{ const r=svg.getBoundingClientRect(), [sx,sy]=toS([x,y]); return [r.left+sx, r.top+sy]; };   // for tests
  dlg._state=()=>({ S, REG:REG.map(r=>({net:r.net, holes:r.holes.length, set:r.set})), sel, tool, draft });
  const $=s=>dlg.querySelector(s);
  $('#ssClose').onclick=()=>dlg.close();
  $('#ssName').oninput=e=>{ S.name=e.target.value; };
  $('#ssName').onchange=()=>HIST.track();
  dlg.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  $('#ssSnap').onclick=()=>{ snapOn=!snapOn; render(); };
  $('#ssGrid').onchange=e=>{ grid=+e.target.value; render(); };
  $('#ssUnit').onchange=e=>{ unit=e.target.value; try{ localStorage.setItem('cubit-ss-unit', unit); }catch(_){}
    const G=GRIDS(); grid=G.reduce((b,g)=>Math.abs(g-grid)<Math.abs(b-grid)?g:b, G[1]); render(); };
  $('#ssUndo').onclick=()=>doUndo(); $('#ssRedo').onclick=()=>doRedo();
  $('#ssFit').onclick=()=>{ fit(); render(); };
  $('#ssLib').onclick=()=>{ libOpen=!libOpen; render(); };
  $('#ssSave').onclick=()=>save(false); $('#ssSaveNew').onclick=()=>save(true);
  bindPointer(); bindKeys();
  dlg.addEventListener('cancel', e=>e.preventDefault());   // Escape steps back inside the studio; ✕ closes it
  new ResizeObserver(()=>{ if(dlg.open) render(); }).observe(svg);
}
function doUndo(){ closeEditor(); if(HIST.undo()){ regKey=''; syncRegions(); render(); toast('Undo'); } }
function doRedo(){ closeEditor(); if(HIST.redo()){ regKey=''; syncRegions(); render(); toast('Redo'); } }
function setTool(t){ finishDraft(); tool=t; draft=null; if(['line','rect','circle','arc','spline'].includes(t)) sel=[]; typed={f:0,v:['','']}; closeEditor();
  if(t==='mirror'){ mirrorStep=1; sel=sel.filter(s=>s.t==='ent'||s.t==='seg').map(s=>({t:'ent', e:s.e})); }
  render(); svg?.focus({preventScroll:true}); }
/* every change ends here: regions worked out again, a step for undo, drawn */
function commit(){ syncRegions(); HIST.track(); render(); }

/* ---------------------------------------------------------------- regions (Shapr3D: every enclosed area) */
function syncRegions(){
  const key=JSON.stringify(S.ents); if(key===regKey) return; regKey=key;
  const prev=REG, regs=arrangement(S.ents.filter(e=>e.kind==='circle' || e.nodes?.length>=2));
  regs.forEach(r=>{
    const p=interiorPoint(r); r.seed=p;
    // its setting: one remembered inside it, else the region it came from, else a 1″ pocket
    const s = S.regs.find(q=>inRegion(q.seed, r)) || prev.find(q=>inRegion(p, q))?.set;
    r.set = s ? { cut:s.cut, depth:s.depth, name:s.name||'' } : { cut:'pocket', depth:1, name:'' };
    r.tight = r.set.cut==='none' ? [] : tightSpots(r);
  });
  REG=regs; S.regs=regs.map(r=>({ seed:r.seed.map(v=>+v.toFixed(4)), ...r.set }));
  sel=sel.filter(s=>s.t!=='reg' || s.k<REG.length);
}
/* where the ¾″ bit can't reach: the region less what the bit really cuts */
function tightSpots(r){
  const rings=[r.outer, ...r.holes], cut=asCut(rings); if(!cut.length) return [interiorPoint(r)];
  // what's left over: real corners are chunky (a 90° corner leaves 0.03 sq in about ⅛″ across); the hairline slivers
  // along straight and curved sides are just rounding, so keep pieces at least 0.02″ thick (area ÷ half the perimeter)
  const per=P=>P.reduce((s,q,i)=>s+hyp(q[0]-P[(i+1)%P.length][0], q[1]-P[(i+1)%P.length][1]),0);
  return bool([r.outer], cut.concat(r.holes), 'diff').filter(p=>{ const a=Math.abs(area(p)); return a>1e-3 && a/(per(p)/2)>0.02; }).map(p=>{ const B=bbox(p); return [(B.x0+B.x1)/2, (B.y0+B.y1)/2]; });
}

/* ---------------------------------------------------------------- view: world inches (y up) ⇄ screen px */
const size = () => [svg.clientWidth||800, svg.clientHeight||600];
const toS = ([x,y]) => { const [W,H]=size(); return [W/2+(x-view.cx)*view.k, H/2-(y-view.cy)*view.k]; };
const toW = (sx,sy) => { const [W,H]=size(); return [view.cx+(sx-W/2)/view.k, view.cy-(sy-H/2)/view.k]; };
function fit(){
  const [W,H]=size(), B = S.ents.length ? bboxAll(S.ents) : {x0:0,y0:0,x1:24,y1:16,w:24,h:16};
  const w=Math.max(B.w,6), h=Math.max(B.h,4); view.k=Math.max(2, Math.min(200, Math.min((W-120)/w, (H-160)/h)));
  view.cx=(B.x0+B.x1)/2; view.cy=(B.y0+B.y1)/2;
}
const evW = e => { const r=svg.getBoundingClientRect(); return toW(e.clientX-r.left, e.clientY-r.top); };

/* ---------------------------------------------------------------- geometry helpers */
const segEnds = (c,i) => { const n=c.nodes; return [n[i], n[(i+1)%n.length]]; };
function segPolyline(c, i, tol){ const [a,b]=segEnds(c,i);
  if(c.spline){ const all=flatten({...c}, tol); return null || all; }
  return flatten({kind:'path', nodes:[{x:a.x,y:a.y,ho:a.ho}, {x:b.x,y:b.y,hi:b.hi}], b:{0:c.b?.[i]}, closed:false}, tol); }
function entPolyline(c, tol=0.02){ return flatten(c, tol); }
function snapPoints(skipId){   // points to snap to: [{p, kind}]
  const out=[];
  S.ents.forEach(c=>{ if(c.id===skipId?.e && skipId.n==null && skipId.whole) return;
    if(c.kind==='circle'){ out.push({p:[c.cx,c.cy], kind:'centre'}); [[1,0],[0,1],[-1,0],[0,-1]].forEach(([u,v])=>out.push({p:[c.cx+u*c.rad, c.cy+v*c.rad], kind:'quadrant'})); return; }
    c.nodes.forEach((n,ni)=>{ if(skipId && skipId.e===c.id && (skipId.n===ni || skipId.whole)) return; out.push({p:[n.x,n.y], kind:'endpoint'}); });
    if(!c.spline) for(let i=0;i<segCount(c);i++){ const [a,b]=segEnds(c,i); if(skipId && skipId.e===c.id) continue;
      if(segType(c,i)==='line') out.push({p:[(a.x+b.x)/2,(a.y+b.y)/2], kind:'midpoint'});
      else if(segType(c,i)==='arc'){ const A=bulgeArc([a.x,a.y],[b.x,b.y],c.b[i]); if(A) out.push({p:[A.cx,A.cy], kind:'centre'}); } }
  });
  (REG.cross||[]).forEach(p=>out.push({p, kind:'intersection'}));
  return out;
}
/* Shapr3D-style inference: points first, then lining up, then the angle from the last point, then onto lines, then the grid */
function snapPt(p, { skip=null, from=null, prevDir=null }={}){
  const tol=12/view.k; let q=p.slice(); const guides=[];
  if(!snapOn) return { p:q, kind:null, guides };
  const pts=snapPoints(skip);
  let best=null; pts.forEach(o=>{ const d=hyp(o.p[0]-p[0], o.p[1]-p[1]); const w = o.kind==='midpoint'||o.kind==='quadrant' ? 0.8 : 1; if(d<tol*w && (!best || d<best.d)) best={...o, d}; });
  if(draft && (tool==='line'||tool==='spline')){ const f=chainStart(); if(f && hyp(f[0]-p[0], f[1]-p[1])<tol) return { p:f.slice(), kind:'close', guides }; }
  if(best) return { p:best.p.slice(), kind:best.kind, guides };
  // lined up with other points: dotted guides (horizontal / vertical)
  let gx=null, gy=null; const gt=8/view.k;
  pts.forEach(o=>{ if(o.kind==='midpoint'||o.kind==='quadrant'||o.kind==='intersection') return; const dx=Math.abs(o.p[0]-p[0]), dy=Math.abs(o.p[1]-p[1]); if(dx<gt && (!gx||dx<gx.d)) gx={d:dx, o:o.p}; if(dy<gt && (!gy||dy<gy.d)) gy={d:dy, o:o.p}; });
  // from the last point: horizontal / vertical, perpendicular to the last line, then 15° steps
  if(from){ const dx=p[0]-from[0], dy=p[1]-from[1], L=hyp(dx,dy);
    if(L>1e-6){ const a=Math.atan2(dy,dx);
      const cands=[[0,'horizontal'],[Math.PI/2,'vertical'],[Math.PI,'horizontal'],[-Math.PI/2,'vertical']];
      if(prevDir){ const pa=Math.atan2(prevDir[1],prevDir[0]); cands.push([pa+Math.PI/2,'perpendicular'],[pa-Math.PI/2,'perpendicular'],[pa,'parallel'],[pa+Math.PI,'parallel']); }
      for(const [ca,kind] of cands){ const da=Math.atan2(Math.sin(a-ca), Math.cos(a-ca)); if(Math.abs(da)<0.05){
        const ux=Math.cos(ca), uy=Math.sin(ca); let Lg=Math.round((dx*ux+dy*uy)/grid)*grid;
        // along this direction, still line up with a point if one is close (the dotted guide)
        if(gx && Math.abs(ux)>1e-3){ Lg=(gx.o[0]-from[0])/ux; guides.push({from:gx.o}); }
        else if(gy && Math.abs(uy)>1e-3){ Lg=(gy.o[1]-from[1])/uy; guides.push({from:gy.o}); }
        return { p:[from[0]+ux*Lg, from[1]+uy*Lg], kind, guides, ray:{from, dir:[ux,uy]} }; } }
      const s=Math.PI/12, as=Math.round(a/s)*s; if(Math.abs(a-as)<0.035 && !gx && !gy){ const Lg=Math.round(L/grid)*grid; return { p:[from[0]+Lg*Math.cos(as), from[1]+Lg*Math.sin(as)], kind:`${Math.round(((as*180/Math.PI)+360)%360)}°`, guides }; } } }
  if(gx || gy){ q=[gx?gx.o[0]:Math.round(p[0]/grid)*grid, gy?gy.o[1]:Math.round(p[1]/grid)*grid]; if(gx) guides.push({from:gx.o}); if(gy) guides.push({from:gy.o}); return { p:q, kind:'aligned', guides }; }
  // onto a line or curve
  let on=null; S.ents.forEach(c=>{ if(skip && c.id===skip.e) return; const P=entPolyline(c, 0.5/view.k), closed=c.kind==='circle'||c.closed;
    for(let i=0;i<P.length-(closed?0:1);i++){ const a=P[i], b=P[(i+1)%P.length], d=distToSeg(p,a,b); if(d<tol*0.6 && (!on||d<on.d)){ const dx=b[0]-a[0], dy=b[1]-a[1], L=dx*dx+dy*dy, t=L?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L)):0; on={d, p:[a[0]+t*dx, a[1]+t*dy]}; } } });
  if(on) return { p:on.p, kind:'on line', guides };
  return { p:[Math.round(p[0]/grid)*grid, Math.round(p[1]/grid)*grid], kind:'grid', guides };
}

/* ---------------------------------------------------------------- hit testing */
function hitDim(target){ const d=target?.closest?.('[data-dim]'); return d ? d.dataset.dim : null; }
function hit(p){
  const tol=12/view.k;
  // handles of a picked Bézier corner (first-style drawings)
  for(const s of sel){ if(s.t!=='node') continue; const n=ent(s.e)?.nodes?.[s.n]; if(!n) continue; for(const h of ['hi','ho']) if(n[h] && hyp(n[h][0]-p[0], n[h][1]-p[1])<tol) return { t:'handle', e:s.e, n:s.n, h }; }
  for(let i=S.ents.length-1;i>=0;i--){ const c=S.ents[i];
    if(c.kind==='circle'){ if(hyp(c.cx-p[0],c.cy-p[1])<tol*0.8) return { t:'centre', e:c.id }; continue; }
    for(let ni=0; ni<c.nodes.length; ni++){ const n=c.nodes[ni]; if(hyp(n.x-p[0], n.y-p[1])<tol) return { t:'node', e:c.id, n:ni }; } }
  let best=null;
  S.ents.forEach(c=>{
    if(c.kind==='circle'){ const d=Math.abs(hyp(c.cx-p[0],c.cy-p[1])-c.rad); if(d<tol*0.7 && (!best||d<best.d)) best={ t:'rim', e:c.id, d }; return; }
    if(c.spline){ const P=entPolyline(c, 0.5/view.k); for(let k=1;k<P.length;k++){ const d=distToSeg(p,P[k-1],P[k]); if(d<tol*0.7 && (!best||d<best.d)) best={ t:'seg', e:c.id, s:segOfSpline(c,p), d }; } return; }
    for(let i=0;i<segCount(c);i++){ const P=segPolyline(c,i,0.5/view.k); for(let k=1;k<P.length;k++){ const d=distToSeg(p,P[k-1],P[k]); if(d<tol*0.7 && (!best||d<best.d)) best={ t:'seg', e:c.id, s:i, d }; } } });
  if(best) return best;
  // a region: the smallest one it's in
  let r=null; REG.forEach((g,k)=>{ if(inRegion(p,g) && (!r || g.net<REG[r].net)) r=k; });
  if(r!=null) return { t:'reg', k:r };
  return null;
}
function segOfSpline(c, p){ let bi=0, bd=Infinity; for(let i=0;i<segCount(c);i++){ const a=c.nodes[i], b=c.nodes[(i+1)%c.nodes.length], d=distToSeg(p,[a.x,a.y],[b.x,b.y]); if(d<bd){ bd=d; bi=i; } } return bi; }
const selKey = s => s.t==='reg' ? 'r'+s.k : s.t==='node' ? `n${s.e}.${s.n}` : s.t==='seg' ? `s${s.e}.${s.s}` : `e${s.e}`;
const isSel = s => sel.some(q=>selKey(q)===selKey(s));
const wholeSel = id => sel.some(q=>q.t==='ent' && q.e===id);
function toggle(s){ const k=selKey(s); if(sel.some(q=>selKey(q)===k)) sel=sel.filter(q=>selKey(q)!==k); else sel.push(s); }

/* ---------------------------------------------------------------- pointer: tools, gestures */
const pointers=new Map(); let gest=null;
function bindPointer(){
  svg.addEventListener('pointerdown', e=>{
    e.preventDefault(); svg.setPointerCapture(e.pointerId); pointers.set(e.pointerId, {x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY}); svg.focus({preventScroll:true});
    if(pointers.size>=2){   // two or three fingers: a tap = undo / redo, a move = pinch and pan
      if(drag && drag.t!=='pan'){ cancelDrag(); }
      const P=[...pointers.values()]; gest={ n:pointers.size, t:performance.now(), moved:false, d:P.length>1?hyp(P[0].x-P[1].x,P[0].y-P[1].y):1, mid:mid(P), k:view.k, cx:view.cx, cy:view.cy }; drag=null; return; }
    const dim=hitDim(e.target); if(dim){ drag={ t:'dim', dim }; return; }
    if(e.button===1 || spaceDown){ drag={ t:'pan', s:[e.clientX,e.clientY], v:{...view} }; return; }
    down(evW(e), e);
  });
  svg.addEventListener('pointermove', e=>{
    const pt=pointers.get(e.pointerId); if(pt){ pt.x=e.clientX; pt.y=e.clientY; }
    if(gest && pointers.size>=2){ const P=[...pointers.values()];
      if(P.some(q=>hyp(q.x-q.x0,q.y-q.y0)>10)) gest.moved=true;
      if(gest.moved && P.length>=2){ const d=hyp(P[0].x-P[1].x,P[0].y-P[1].y), m=mid(P); view.k=Math.max(1, Math.min(400, gest.k*d/gest.d)); view.cx=gest.cx-(m[0]-gest.mid[0])/view.k; view.cy=gest.cy+(m[1]-gest.mid[1])/view.k; render(); }
      return; }
    if(gest) return;
    if(drag?.t==='pan'){ view.cx=drag.v.cx-(e.clientX-drag.s[0])/view.k; view.cy=drag.v.cy+(e.clientY-drag.s[1])/view.k; render(); return; }
    move(evW(e), e);
  });
  const end = e => { const pt=pointers.get(e.pointerId); pointers.delete(e.pointerId);
    if(gest){ if(!pointers.size){ const quick=performance.now()-gest.t<700; if(!gest.moved && quick){ if(gest.n===2) doUndo(); else if(gest.n>=3) doRedo(); } gest=null; } return; }
    if(drag?.t==='pan'){ drag=null; return; }
    if(drag?.t==='dim'){ const d=drag; drag=null; if(hitDim(document.elementFromPoint(e.clientX, e.clientY))===d.dim) openEditor(d.dim, e); return; }
    up(evW(e), e, pt); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', e=>{ pointers.delete(e.pointerId); if(!pointers.size) gest=null; cancelDrag(); render(); });
  svg.addEventListener('wheel', e=>{ e.preventDefault();
    if(e.ctrlKey || (Math.abs(e.deltaY)>=40 && !e.deltaX)){ const p=evW(e), f=Math.exp(-e.deltaY*(e.ctrlKey?0.01:0.0015)); view.k=Math.max(1, Math.min(400, view.k*f)); const q=evW(e); view.cx+=p[0]-q[0]; view.cy+=p[1]-q[1]; }
    else { view.cx+=e.deltaX/view.k; view.cy-=e.deltaY/view.k; }
    render(); }, { passive:false });
}
const mid = P => [P.reduce((s,q)=>s+q.x,0)/P.length, P.reduce((s,q)=>s+q.y,0)/P.length];
let spaceDown=false;
function cancelDrag(){ if(drag?.undo){ S=drag.undo; regKey=''; syncRegions(); } drag=null; }
const lastPt = () => draft?.pts?.at(-1) || null;
/* the line being drawn is saved segment by segment (each one its own undo step): draft.cont = the line it adds to */
const contEnt = () => draft?.cont ? ent(draft.cont.e) : null;
function chainStart(){ if(!draft) return null; const c=contEnt(); if(draft.t==='line' && c){ if(c.nodes.length<2) return null; const n = draft.cont.end===1 ? c.nodes[0] : c.nodes.at(-1); return [n.x,n.y]; } return draft.pts?.length>=3 ? draft.pts[0] : null; }
const prevDir = () => { const c=contEnt(); if(draft?.t==='line' && c && c.nodes.length>=2){ const n=c.nodes, [a,b] = draft.cont.end===1 ? [n.at(-2), n.at(-1)] : [n[1], n[0]]; return [b.x-a.x, b.y-a.y]; }
  const P=draft?.pts; if(!P || P.length<2) return null; const a=P.at(-2), b=P.at(-1); return [b[0]-a[0], b[1]-a[1]]; };
/* put the segment just drawn into the sketch now */
function flushLine(quiet){
  const P=draft.pts; if(P.length<2) return;
  const add=P.slice(1).map(([x,y])=>({x:+x.toFixed(4), y:+y.toFixed(4)})), c=contEnt();
  if(c){ if(draft.cont.end===1) c.nodes.push(...add); else { c.nodes.unshift(...add.slice().reverse()); const nb={}; Object.entries(c.b||{}).forEach(([k,v])=>{ nb[+k+add.length]=v; }); c.b=nb; } }
  else { const n={ id:newId(), kind:'path', closed:false, nodes:[{x:P[0][0], y:P[0][1]}, ...add], b:{} }; S.ents.push(n); draft.cont={ e:n.id, end:1 }; }
  draft.pts=[P.at(-1)]; if(!quiet) commit();
}
function closeChain(){ const c=contEnt(); if(c) closeIfEnds(c); draft=null; commit(); }

function down(p, e){
  const pen = e.pointerType!=='touch';
  if(tool==='select'){
    const h=hit(p);
    if(!h){ drag = pen ? { t:'box', a:p, b:p, add:e.shiftKey } : { t:'pan', s:[e.clientX,e.clientY], v:{...view} }; return; }
    drag={ t:'press', h, start:p, undo:clone(S), moved:false, pen, s:[e.clientX,e.clientY], v:{...view} };
    return;
  }
  if(tool==='fillet'){ const h=hit(p); if(h?.t==='node' && canFillet(ent(h.e), h.n)){ drag={ t:'fillet', e:h.e, n:h.n, start:p, undo:clone(S) }; sel=[{t:'node', e:h.e, n:h.n}]; render(); } else toast('Fillet: press on a corner between two straight lines and drag'); return; }
  if(tool==='offset'){ const h=hit(p); const c=h && (h.e ? ent(h.e) : null); if(c && (c.kind==='circle'||c.closed)){ drag={ t:'offset', e:c.id, start:p }; sel=[{t:'ent', e:c.id}]; render(); } else toast('Offset: press on a closed shape and drag out or in'); return; }
  if(tool==='trim'){ const h=hit(p); if(h && (h.t==='seg'||h.t==='rim')){ trimAt(h, p); } return; }
  if(tool==='mirror'){ const h=hit(p);
    if(mirrorStep===1){   // picking what to mirror: tap lines (whole shapes) or the inside of a shape; drag a box on empty space
      if(!h){ drag={ t:'box', a:p, b:p, add:true }; return; }
      if(h.t==='reg'){ outlineEnts(REG[h.k]).forEach(id=>{ if(!wholeSel(id)) sel.push({t:'ent', e:id}); }); }
      else if(h.e){ if(wholeSel(h.e)) sel=sel.filter(s=>s.e!==h.e); else sel.push({t:'ent', e:h.e}); }
      render(); return; }
    if(h?.t==='seg' && segType(ent(h.e),h.s)==='line' && !ent(h.e).spline){ mirrorAcross(h); } else toast('Tap a straight line to mirror across'); return; }
  if(tool==='line'){ const h=hit(p);
    const c=h?.e ? ent(h.e) : null, openEnd = h?.t==='node' && c?.kind==='path' && !c.closed && !c.spline && (h.n===0 || h.n===c.nodes.length-1);
    const onDraftEnd = draft && lastPt() && hyp(p[0]-lastPt()[0], p[1]-lastPt()[1])*view.k<12;
    if(h && !openEnd && !onDraftEnd && (h.t==='node' || h.t==='seg' || h.t==='rim' || h.t==='centre' || h.t==='handle')){
      if(draft) finishDraft(false);
      const hh = hit(p) || h; drag={ t:'press', h:hh, start:p, undo:clone(S), moved:false, pen, s:[e.clientX,e.clientY], v:{...view}, inLine:true }; return; } }
  // drawing tools: the point goes where the pen lifts (drag to place it exactly); rect / circle can also be dragged out
  const sp=snapPt(p, { from:lastPt(), prevDir:prevDir() });
  drag={ t:'draw', a:sp.p, b:sp.p, snap:sp, moved:false, raw:p, raw0:p, hadDraft:!!draft };
  render();
}
function move(p, e){
  if(!drag){ // hover previews
    if(['line','spline','rect','circle','arc'].includes(tool)){ const sp=snapPt(p, { from:lastPt(), prevDir:prevDir() }); hover={ p:sp.p, snap:sp }; render(); }
    else { const h=hit(p); const k=h?JSON.stringify(h):''; if(k!==hover?.k){ hover={k, h}; render(); } }
    return; }
  if(drag.t==='box'){ drag.b=p; render(); return; }
  if(drag.t==='press'){ const d=hyp(p[0]-drag.start[0], p[1]-drag.start[1])*view.k; if(d<5) return; drag.moved=true; beginMove(drag.h, drag.start); if(!drag || drag.t==='pan') return; if(drag.t==='box'){ drag.b=p; render(); return; } }
  if(drag.t==='node'){ const sp=snapPt(p, { skip:{e:drag.e, n:drag.n} }), c=ent(drag.e), n=c.nodes[drag.n], dx=sp.p[0]-n.x, dy=sp.p[1]-n.y;
    n.x=sp.p[0]; n.y=sp.p[1]; if(n.hi) n.hi=[n.hi[0]+dx,n.hi[1]+dy]; if(n.ho) n.ho=[n.ho[0]+dx,n.ho[1]+dy]; hover={ snap:sp }; }
  else if(drag.t==='handle'){ const n=ent(drag.e).nodes[drag.n]; n[drag.h]=snapOn?[Math.round(p[0]/grid)*grid, Math.round(p[1]/grid)*grid]:p; }
  else if(drag.t==='seg'){ const c=ent(drag.e), [a,b]=segEnds(c,drag.s), o=drag.orig, want=[o[0][0]+p[0]-drag.start[0], o[0][1]+p[1]-drag.start[1]], sp=snapPt(want, { skip:{e:drag.e, whole:true} }), dx=sp.p[0]-o[0][0], dy=sp.p[1]-o[0][1];
    a.x=o[0][0]+dx; a.y=o[0][1]+dy; b.x=o[1][0]+dx; b.y=o[1][1]+dy; hover={ snap:sp }; }
  else if(drag.t==='bulge'){ const c=ent(drag.e), [a,b]=segEnds(c,drag.s), d=[b.x-a.x,b.y-a.y], L=hyp(...d); if(L>1e-6){ const s=((p[0]-a.x)*-d[1]+(p[1]-a.y)*d[0])/L; c.b ||= {}; if(Math.abs(s)<4/view.k) delete c.b[drag.s]; else c.b[drag.s]=+Math.max(-6,Math.min(6,2*s/L)).toFixed(5); } }
  else if(drag.t==='rim'){ const c=ent(drag.e), r=hyp(p[0]-c.cx, p[1]-c.cy); c.rad=Math.max(grid, snapOn?Math.round(r/grid)*grid:r); }
  else if(drag.t==='moveSel'){ const ref=drag.ref, want=[ref[0]+p[0]-drag.start[0], ref[1]+p[1]-drag.start[1]], sp=snapPt(want, { skip:{e:drag.ids[0], whole:true} }), dx=sp.p[0]-ref[0], dy=sp.p[1]-ref[1];
    drag.ids.forEach(id=>{ const i=S.ents.findIndex(x=>x.id===id); S.ents[i]=mapAll([drag.orig[id]], ([x,y])=>[x+dx,y+dy])[0]; }); hover={ snap:sp }; }
  else if(drag.t==='fillet'){ const c=ent(drag.e), n=c.nodes[drag.n], r=hyp(p[0]-n.x, p[1]-n.y); n.r = r<grid/2 ? 0 : +(snapOn?Math.round(r/grid)*grid:r).toFixed(4); if(!n.r) delete n.r; }
  else if(drag.t==='offset'){ const c=ent(drag.e), P=entPolyline(c,0.02); let d=Infinity; for(let i=0;i<P.length;i++) d=Math.min(d, distToSeg(p,P[i],P[(i+1)%P.length])); const outside=!inPoly(p,P); drag.dist=(outside?1:-1)*(snapOn?Math.round(d/grid)*grid:d); }
  else if(drag.t==='draw'){
    // the pencil moved: drawing starts right away from where it touched (Shapr3D)
    if(!drag.began && hyp(p[0]-drag.raw0[0], p[1]-drag.raw0[1])*view.k>6){ drag.began=true; drag.moved=true;
      if(tool==='line'){ if(draft && hyp(drag.a[0]-lastPt()[0], drag.a[1]-lastPt()[1])*view.k>12) finishDraft(false); if(!draft) startChain(drag.a, drag.snap); }
      else if(tool==='arc' && !draft) draft={ t:'arc', pts:[drag.a] };
      else if(tool==='spline'){ if(draft) finishDraft(false); drag.free=true; drag.stroke=[drag.a.slice()]; } }
    if(drag.free){ drag.stroke.push(p); const sp=snapPt(p); drag.b=sp.p; drag.snap=sp; drag.raw=p; hover={ p, snap:null }; render(); return; }
    const sp=snapPt(p, { from: tool==='line' ? lastPt() : (tool==='rect'||tool==='circle') ? null : lastPt(), prevDir:prevDir() }); drag.b=sp.p; drag.snap=sp; drag.raw=p; hover={ p:sp.p, snap:sp }; }
  render();
}
/* a press that turned into a drag: what to drag */
function beginMove(h, start){
  const c = h.e ? ent(h.e) : null;
  if(h.t==='node'){ drag={...drag, t:'node', e:h.e, n:h.n}; if(!isSel(h)) sel=[{t:'node', e:h.e, n:h.n}]; }
  else if(h.t==='handle'){ drag={...drag, t:'handle', e:h.e, n:h.n, h:h.h}; }
  else if(h.t==='seg' && (wholeSel(h.e) || (!c.spline && segType(c,h.s)!=='line' && false))){ startMoveSel(start); }
  else if(h.t==='seg' && c.spline){ sel=[{t:'ent', e:h.e}]; startMoveSel(start); }
  else if(h.t==='seg' && segType(c,h.s)==='arc'){ drag={...drag, t:'bulge', e:h.e, s:h.s}; sel=[{t:'seg', e:h.e, s:h.s}]; }
  else if(h.t==='seg'){ const [a,b]=segEnds(c,h.s); drag={...drag, t:'seg', e:h.e, s:h.s, orig:[[a.x,a.y],[b.x,b.y]]}; sel=[{t:'seg', e:h.e, s:h.s}]; }
  else if(h.t==='rim'){ drag={...drag, t:'rim', e:h.e}; sel=[{t:'ent', e:h.e}]; }
  else if(h.t==='centre'){ if(!wholeSel(h.e)) sel=[{t:'ent', e:h.e}]; startMoveSel(start); }
  else if(h.t==='reg'){ drag = drag.pen ? { t:'box', a:start, b:start, add:false } : { t:'pan', s:drag.s, v:drag.v }; }
}
function startMoveSel(start){
  const ids=[...new Set(sel.filter(s=>s.t==='ent').map(s=>s.e))]; if(!ids.length){ drag=null; return; }
  const c=ent(ids[0]), ref = c.kind==='circle' ? [c.cx,c.cy] : [c.nodes[0].x, c.nodes[0].y];
  drag={...drag, t:'moveSel', ids, orig:Object.fromEntries(ids.map(id=>[id, clone(ent(id))])), ref, start};
}
function up(p, e){
  const d=drag; drag=null; if(!d){ return; }
  if(d.t==='box'){ boxSelect(d.a, d.b, d.add); render(); return; }
  if(d.t==='press'){ tapSelect(d.h, e); return; }   // (in the line tool too: it picks what was tapped)
  if(['node','handle','seg','bulge','rim','moveSel','fillet'].includes(d.t)){ hover=null; commit(); return; }
  if(d.t==='offset'){ if(Math.abs(d.dist||0)>1e-6) makeOffset(d.e, d.dist); else render(); return; }
  if(d.t==='draw'){ drawUp(d); return; }
}
function tapSelect(h, e){
  const now=performance.now(), key=JSON.stringify(h), dbl = now-lastTap.t<350 && lastTap.key===key; lastTap={t:now, key};
  if(dbl && (h.t==='seg'||h.t==='rim')){ sel=sel.filter(s=>!(s.e===h.e)); sel.push({t:'ent', e:h.e}); render(); return; }   // double-tap: the whole chain
  const s = h.t==='rim'||h.t==='centre' ? {t:'ent', e:h.e} : h.t==='handle' ? {t:'node', e:h.e, n:h.n} : h;
  toggle(s); render();
}
function boxSelect(a, b, add){
  const x0=Math.min(a[0],b[0]), x1=Math.max(a[0],b[0]), y0=Math.min(a[1],b[1]), y1=Math.max(a[1],b[1]);
  if(!add) sel=[];
  S.ents.forEach(c=>{ const B=bboxAll([c]); if(B.x0>=x0 && B.x1<=x1 && B.y0>=y0 && B.y1<=y1 && !wholeSel(c.id)) sel.push({t:'ent', e:c.id}); });
  REG.forEach((r,k)=>{ const B=bbox(r.outer); if(B.x0>=x0 && B.x1<=x1 && B.y0>=y0 && B.y1<=y1 && !isSel({t:'reg',k})) sel.push({t:'reg', k}); });
}

/* ---------------------------------------------------------------- drawing tools */
function drawUp(d){
  const at=d.b, sp=d.snap;
  // a tap (no drag) on a shape's body, with nothing being drawn: that's picking it — over to Select
  if(!d.moved && !d.hadDraft){ const h=hit(d.raw); if(h?.t==='reg'){ tool='select'; draft=null; sel=[h]; lastTap={t:performance.now(), key:JSON.stringify(h)}; render(); toast('Select'); return; } }
  // a freehand spline stroke: smoothed to a few points it passes through
  if(d.free){ const st=d.stroke; st[st.length-1]=d.b; const pts=simplify(st, 3/view.k, false);
    const closed = pts.length>=4 && hyp(pts[0][0]-pts.at(-1)[0], pts[0][1]-pts.at(-1)[1])*view.k<14; if(closed) pts.pop();
    if(pts.length>=2) addEnt({ kind:'path', spline:true, closed, nodes:pts.map(([x,y])=>({x:+x.toFixed(4), y:+y.toFixed(4)})), b:{} }); else render(); return; }
  if(tool==='line' && !d.moved){
    // a tap: ends the line you're drawing (close it if the tap is on its start) and leaves its end points to drag on from
    if(draft && sp?.kind==='close'){ draft.pts.push(sp.p); flushLine(true); closeChain(); return; }
    if(draft){ finishDraft(false); return; }
    sel=[]; render(); return;
  }
  if(tool==='line' || tool==='spline'){
    if(!draft){ startChain(at, sp); render(); return; }
    const P=draft.pts, last=P.at(-1);
    if(tool==='line'){
      const f=chainStart();
      if(f && hyp(at[0]-f[0], at[1]-f[1])<1e-6){ P.push(at); flushLine(true); closeChain(); return; }   // back to the start: closed (one step)
      if(hyp(at[0]-last[0], at[1]-last[1])<1e-6){ render(); return; }
      P.push(at); typed={f:0,v:['','']};
      // landing on the open end of another line joins them and stops (one step)
      const j=openEndAt(at, draft.cont?.e); flushLine(!!j); if(j){ joinPaths(draft.cont.e, j); draft=null; commit(); }
      return; }
    if(sp?.kind==='close' && P.length>=2){ finishDraft(true); return; }
    if(hyp(at[0]-last[0], at[1]-last[1])<1e-6 || hyp(d.raw[0]-last[0], d.raw[1]-last[1])*view.k<10){ finishDraft(false); return; }   // the last point again: done
    P.push(at); typed={f:0,v:['','']};
    render(); return;
  }
  if(tool==='rect'){
    if(!draft && d.moved){ addRect(d.a, d.b); return; }
    if(!draft){ draft={ t:'rect', a:d.a }; render(); return; }
    addRect(draft.a, at); draft=null; return;
  }
  if(tool==='circle'){
    if(mode.circle==='3pt'){ draft ||= { t:'c3', pts:[] }; draft.pts.push(at); if(draft.pts.length===3){ const c=circle3(...draft.pts); draft=null; if(c) addEnt({ kind:'circle', cx:c[0], cy:c[1], rad:c[2] }); else render(); } else render(); return; }
    if(!draft && d.moved){ addCircle(d.a, d.b); return; }
    if(!draft){ draft={ t:'circle', a:d.a }; render(); return; }
    addCircle(draft.a, at); draft=null; return;
  }
  if(tool==='arc'){
    draft ||= { t:'arc', pts:[] }; draft.pts.push(at);
    if(draft.pts.length===3){ const [a,b,m]=draft.pts; draft=null; const bl=bulgeThrough(a,b,m); if(bl!=null) addEnt({ kind:'path', closed:false, nodes:[{x:a[0],y:a[1]},{x:b[0],y:b[1]}], b:{0:bl} }); else render(); }
    else render();
    return;
  }
}
function startChain(at, sp){
  draft={ t:tool, pts:[at] };
  // starting on the open end of a line carries that line on (Shapr3D)
  if(tool==='line'){ const j=openEndAt(at); if(j) draft.cont=j; }
}
function openEndAt(p, notId){ for(const c of S.ents){ if(c.kind!=='path' || c.closed || c.spline || c.id===notId) continue; const n=c.nodes; if(hyp(n[0].x-p[0],n[0].y-p[1])<1e-6) return {e:c.id, end:0}; const z=n.at(-1); if(hyp(z.x-p[0],z.y-p[1])<1e-6) return {e:c.id, end:1}; } return null; }
function finishDraft(close){
  if(!draft) return;
  if(draft.t==='line' || draft.t==='spline'){
    const P=draft.pts; let pts=P.slice(); if(close && hyp(pts[0][0]-pts.at(-1)[0], pts[0][1]-pts.at(-1)[1])<1e-6) pts.pop();
    if(pts.length>=2 || (draft.cont && pts.length>=2)){
      if(draft.t==='spline'){ S.ents.push({ id:newId(), kind:'path', spline:true, closed:!!close && pts.length>=3, nodes:pts.map(([x,y])=>({x,y})), b:{} }); }
      else if(draft.cont){ const c=ent(draft.cont.e), add=pts.slice(1).map(([x,y])=>({x,y}));
        if(draft.cont.end===1){ c.nodes.push(...add); } else { const n=c.nodes.length; c.nodes.unshift(...add.reverse()); const nb={}; Object.entries(c.b||{}).forEach(([k,v])=>{ nb[+k+add.length]=-(-v); }); c.b=nb; }
        if(close) closeIfEnds(c);
        if(draft.join) joinPaths(c.id, draft.join); }
      else { const c={ id:newId(), kind:'path', closed:!!close && pts.length>=3, nodes:pts.map(([x,y])=>({x,y})), b:{} }; S.ents.push(c); if(draft.join) joinPaths(c.id, draft.join); }
      draft=null; commit(); return; }
  }
  draft=null; render();
}
function closeIfEnds(c){ const a=c.nodes[0], z=c.nodes.at(-1); if(hyp(a.x-z.x,a.y-z.y)<1e-6){ c.nodes.pop(); c.closed=true; } else c.closed=true; }
/* the chain c ends where another open line j begins or ends: one line */
function joinPaths(cid, j){
  const c=ent(cid), o=ent(j.e); if(!c || !o || c===o){ if(c && o===c) closeIfEnds(c); return; }
  let on=o.nodes.slice(), ob={...(o.b||{})};
  if(j.end===1){ on=on.reverse(); const nb={}; const N=on.length; Object.entries(ob).forEach(([k,v])=>{ nb[N-2-(+k)]=-v; }); ob=nb; }
  const base=c.nodes.length-1; on.slice(1).forEach(n=>c.nodes.push(n)); Object.entries(ob).forEach(([k,v])=>{ c.b[base+(+k)]=v; });
  S.ents=S.ents.filter(x=>x.id!==o.id);
  const a=c.nodes[0], z=c.nodes.at(-1); if(hyp(a.x-z.x,a.y-z.y)<1e-6){ c.nodes.pop(); c.closed=true; }
}
function addEnt(c){ c.id=newId(); S.ents.push(c); sel=[]; commit(); }
function addRect(a, b){
  let x0,x1,y0,y1; if(mode.rect==='centre'){ const w=Math.abs(b[0]-a[0]), h=Math.abs(b[1]-a[1]); x0=a[0]-w; x1=a[0]+w; y0=a[1]-h; y1=a[1]+h; }
  else { x0=Math.min(a[0],b[0]); x1=Math.max(a[0],b[0]); y0=Math.min(a[1],b[1]); y1=Math.max(a[1],b[1]); }
  draft=null; if(x1-x0<1e-6 || y1-y0<1e-6){ render(); return; }
  addEnt({ kind:'path', closed:true, nodes:[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}], b:{} });
}
function addCircle(c, p){ const r=hyp(p[0]-c[0], p[1]-c[1]); draft=null; if(r<1e-6){ render(); return; } addEnt({ kind:'circle', cx:c[0], cy:c[1], rad:snapOn?Math.max(grid,Math.round(r/grid)*grid):r }); }
function circle3(a,b,c){ const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1])); if(Math.abs(d)<1e-12) return null; const s=q=>q[0]*q[0]+q[1]*q[1];
  const ux=(s(a)*(b[1]-c[1])+s(b)*(c[1]-a[1])+s(c)*(a[1]-b[1]))/d, uy=(s(a)*(c[0]-b[0])+s(b)*(a[0]-c[0])+s(c)*(b[0]-a[0]))/d; return [ux,uy,hyp(a[0]-ux,a[1]-uy)]; }
/* the bulge of the arc from a to b that passes through m */
function bulgeThrough(a, b, m){ const C=circle3(a,b,m); if(!C) return null; const d=[b[0]-a[0], b[1]-a[1]], L=hyp(...d); if(L<1e-9) return null;
  const side=Math.sign((m[0]-a[0])*-d[1]+(m[1]-a[1])*d[0]) || 1, mc=[(a[0]+b[0])/2,(a[1]+b[1])/2], R=C[2], hc=Math.sqrt(Math.max(0,R*R-L*L/4));
  const cSide=Math.sign((C[0]-a[0])*-d[1]+(C[1]-a[1])*d[0]); const sag = cSide===side ? R+hc : R-hc; return side*2*sag/L; }

/* ---------------------------------------------------------------- fillet, offset, trim, mirror */
function canFillet(c, n){ if(!c || c.kind!=='path' || c.spline) return false; const N=c.nodes.length; if(!c.closed && (n===0 || n===N-1)) return false; return segType(c,(n-1+N)%N)==='line' && segType(c,n)==='line'; }
function makeOffset(id, d){
  const c=ent(id); if(!c) return;
  if(c.kind==='circle'){ if(c.rad+d<=0){ toast('That would shrink it to nothing'); render(); return; } addEnt({ kind:'circle', cx:c.cx, cy:c.cy, rad:+(c.rad+d).toFixed(4) }); toast(`Offset ${fin(Math.abs(d))} ${d>0?'out':'in'}`); return; }
  let P=entPolyline(c, 0.005); if(area(P)<0) P=P.slice().reverse();
  const straight=!c.spline && [...Array(segCount(c)).keys()].every(i=>segType(c,i)==='line') && !c.nodes.some(n=>n.r>0);
  const out=offset([P], d, !straight); if(!out.length){ toast('That would shrink it to nothing'); render(); return; }
  out.forEach(Q=>{ const q=simplify([...Q, Q[0]], 0.002).slice(0,-1); S.ents.push({ id:newId(), kind:'path', closed:true, nodes:q.map(([x,y])=>({x:+x.toFixed(4), y:+y.toFixed(4)})), b:{} }); });
  sel=[]; commit(); toast(`Offset ${fin(Math.abs(d))} ${d>0?'out':'in'}`);
}
/* Trim: the piece of the tapped line between its neighbouring crossings comes out */
function trimAt(h, p){
  const c=ent(h.e), others=S.ents.filter(o=>o.id!==c.id).map(o=>entPolyline(o, 0.005));
  if(c.kind==='circle'){
    const P=[]; for(let k=0;k<=720;k++){ const a=k/720*2*Math.PI; P.push([c.cx+c.rad*Math.cos(a), c.cy+c.rad*Math.sin(a)]); }
    const X=crossings(P, others).map(x=>Math.atan2(x.p[1]-c.cy, x.p[0]-c.cx)).map(a=>(a+2*Math.PI)%(2*Math.PI)).sort((a,b)=>a-b);
    const uniq=X.filter((a,i)=>i===0 || a-X[i-1]>1e-6);
    if(uniq.length<2){ S.ents=S.ents.filter(o=>o.id!==c.id); sel=[]; commit(); return; }
    const at=(Math.atan2(p[1]-c.cy, p[0]-c.cx)+2*Math.PI)%(2*Math.PI); let i=uniq.findIndex(a=>a>at); if(i<0) i=0;
    const a1=uniq[i], a0=uniq[(i-1+uniq.length)%uniq.length];   // remove a0 → a1 (anticlockwise); keep a1 → a0
    let sweep=a0-a1; while(sweep<=0) sweep+=2*Math.PI;
    const s=[c.cx+c.rad*Math.cos(a1), c.cy+c.rad*Math.sin(a1)], e=[c.cx+c.rad*Math.cos(a0), c.cy+c.rad*Math.sin(a0)];
    const parts = sweep>Math.PI*1.5 ? [[a1, a1+sweep/2],[a1+sweep/2, a1+sweep]] : [[a1, a1+sweep]];
    const nodes=[{x:s[0],y:s[1]}], b={};
    parts.forEach(([u,v],k)=>{ nodes.push({x:c.cx+c.rad*Math.cos(v), y:c.cy+c.rad*Math.sin(v)}); b[k]=-Math.tan((v-u)/4); });
    const i0=S.ents.findIndex(o=>o.id===c.id); S.ents[i0]={ id:c.id, kind:'path', closed:false, nodes, b }; sel=[]; commit(); return;
  }
  // a path: the segment's own points, with the crossings along it (other shapes and the rest of this one)
  const i=h.s, N=c.nodes.length, segP=segPolyline(c, i, 0.005);
  if(c.spline){ splitPath(c, i, 0, 1, null); return; }
  const rest=[]; for(let k=0;k<segCount(c);k++){ if(k===i) continue; rest.push(segPolyline(c,k,0.005)); }
  const L=segP.reduce((s,q,k)=>k?s+hyp(q[0]-segP[k-1][0], q[1]-segP[k-1][1]):0,0);
  const X=crossings(segP, others.concat(rest)).map(x=>x.d/L).filter(t=>t>1e-5 && t<1-1e-5).sort((a,b)=>a-b);
  // where along it the tap is
  let acc=0, tap=0, bd=Infinity; for(let k=1;k<segP.length;k++){ const a=segP[k-1], b=segP[k], l=hyp(b[0]-a[0], b[1]-a[1]), d=distToSeg(p,a,b); if(d<bd){ bd=d; const dx=b[0]-a[0], dy=b[1]-a[1], t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(l*l))):0; tap=(acc+t*l)/L; } acc+=l; }
  const t0=[0,...X].filter(t=>t<tap).pop(), t1=[...X,1].find(t=>t>tap);
  splitPath(c, i, t0, t1, segP);
}
/* take segment i of path c out between fractions t0 and t1 of its length */
function splitPath(c, i, t0, t1, segP){
  const N=c.nodes.length, type=segType(c,i), [A,B]=segEnds(c,i);
  const ptAt = t => { if(type==='arc'){ const Ar=bulgeArc([A.x,A.y],[B.x,B.y],c.b[i]); const a=Ar.a0+Ar.sweep*t; return {x:Ar.cx+Ar.R*Math.cos(a), y:Ar.cy+Ar.R*Math.sin(a)}; }
    if(type==='line') return {x:A.x+(B.x-A.x)*t, y:A.y+(B.y-A.y)*t};
    let acc=0; const Ls=segP.map((q,k)=>k?hyp(q[0]-segP[k-1][0],q[1]-segP[k-1][1]):0), L=Ls.reduce((s,v)=>s+v,0); for(let k=1;k<segP.length;k++){ if(acc+Ls[k]>=t*L){ const u=(t*L-acc)/Ls[k]; return {x:segP[k-1][0]+(segP[k][0]-segP[k-1][0])*u, y:segP[k-1][1]+(segP[k][1]-segP[k-1][1])*u}; } acc+=Ls[k]; } return {x:B.x,y:B.y}; };
  const subB = (u,v) => type==='arc' ? Math.tan(4*Math.atan(Math.abs(c.b[i]))*(v-u)/4)*Math.sign(c.b[i]) : undefined;
  // the nodes in order starting after the segment: for a closed path the chain runs B … A; for an open one two chains
  const pieces=[];
  const mk=(nodes, b)=>({ id:newId(), kind:'path', closed:false, nodes:nodes.map(n=>{ const q={...n}; return q; }), b, ...(c.spline?{spline:true}:{}) });
  if(c.closed){
    const order=[]; for(let k=1;k<=N;k++) order.push((i+k)%N);    // B (i+1) … A (i)
    const nodes=[], b={};
    if(t1<1){ nodes.push(ptAt(t1)); const sb=subB(t1,1); if(sb) b[0]=sb; }
    order.forEach((k,idx)=>{ const n={...c.nodes[k]}; if((idx===0 && t1>=1) || (idx===order.length-1 && t0<=0)) delete n.r; nodes.push(n); const seg=k; if(idx<order.length-1 && c.b?.[seg]) b[nodes.length-1]=c.b[seg]; });
    if(t0>0){ const sb=subB(0,t0); if(sb) b[nodes.length-1]=sb; nodes.push(ptAt(t0)); }
    pieces.push(mk(nodes,b));
  } else {
    const n1=[], b1={}; for(let k=0;k<=i;k++){ n1.push({...c.nodes[k]}); if(k<i && c.b?.[k]) b1[k]=c.b[k]; }
    if(t0<=0) delete n1.at(-1).r; if(t0>0){ const sb=subB(0,t0); if(sb) b1[n1.length-1]=sb; n1.push(ptAt(t0)); }
    const n2=[], b2={}; if(t1<1){ n2.push(ptAt(t1)); const sb=subB(t1,1); if(sb) b2[0]=sb; }
    for(let k=i+1;k<N;k++){ const n={...c.nodes[k]}; if(k===i+1 && t1>=1) delete n.r; n2.push(n); if(k<N-1 && c.b?.[k]) b2[n2.length-1]=c.b[k]; }
    if(n1.length>=2) pieces.push(mk(n1,b1)); if(n2.length>=2) pieces.push(mk(n2,b2));
  }
  const idx=S.ents.findIndex(o=>o.id===c.id); S.ents.splice(idx,1,...pieces); sel=[]; commit();
}
function mirrorAcross(h){
  const c=ent(h.e), [a,b]=segEnds(c,h.s), ux=b.x-a.x, uy=b.y-a.y, L=hyp(ux,uy); if(L<1e-9) return;
  const nx=ux/L, ny=uy/L, f=([x,y])=>{ const dx=x-a.x, dy=y-a.y, t=dx*nx+dy*ny; return [a.x+2*t*nx-dx, a.y+2*t*ny-dy]; };
  const ids=[...new Set(sel.filter(s=>s.t==='ent'||s.t==='seg').map(s=>s.e))].filter(id=>id!==h.e || sel.some(s=>s.t==='ent'&&s.e===id));
  if(!ids.length){ toast('Mirror: pick what to mirror first (Select), then the line to mirror across'); return; }
  const copies=mapAll(ids.map(id=>clone(ent(id))), f, true).map(x=>({...x, id:newId()}));
  S.ents.push(...copies); sel=copies.map(x=>({t:'ent', e:x.id})); tool='select'; mirrorStep=1; commit(); toast(`Mirrored ${copies.length} across the line`);
}

/* ---------------------------------------------------------------- keys (typing dimensions, tools, delete) */
function bindKeys(){
  dlg.addEventListener('keydown', e=>{
    e.stopPropagation();   // the app's own shortcuts (full screen, layers, view cube) stay out of the studio
    const inField=/INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    if(e.key===' ' && !inField){ spaceDown=true; e.preventDefault(); return; }
    if(inField) return;
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='a'){ e.preventDefault(); sel=S.ents.map(c=>({t:'ent', e:c.id})); render(); return; }
    const typing = (tool==='line' && draft) || (tool==='rect' && draft) || (tool==='circle' && draft?.t==='circle') || ((tool==='fillet'||tool==='offset') && sel.length===1);
    if(typing && (/^[0-9./'"-]$/.test(e.key) || (/^[mc]$/i.test(e.key) && typed.v[typed.f]))){ typed.v[typed.f]+=e.key; render(); e.preventDefault(); return; }
    if(typing && e.key==='Tab'){ e.preventDefault(); typed.f=typed.f?0:1; render(); return; }
    if(typing && e.key==='Backspace' && typed.v[typed.f]){ typed.v[typed.f]=typed.v[typed.f].slice(0,-1); render(); e.preventDefault(); return; }
    if(e.key==='Enter'){ e.preventDefault(); if(typing && (typed.v[0]||typed.v[1])){ applyTyped(); return; } finishDraft(false); return; }
    if(e.key==='Escape'){ e.preventDefault(); if(editor){ closeEditor(); return; } if(draft){ finishDraft(false); return; } if(sel.length){ sel=[]; render(); } else if(tool!=='select') setTool('select'); return; }
    if((e.key==='Delete'||e.key==='Backspace') && sel.length){ e.preventDefault(); removeSel(); return; }
    if(!e.metaKey && !e.ctrlKey && !e.altKey){ const t=TOOLS.find(x=>x[2].toLowerCase()===e.key.toLowerCase()); if(t) setTool(t[0]); }
  });
  dlg.addEventListener('keyup', e=>{ e.stopPropagation(); if(e.key===' ') spaceDown=false; });
}
function applyTyped(){
  const v0=parseIn(typed.v[0]), v1 = tool==='line' ? parseFloat(typed.v[1]) : parseIn(typed.v[1]); typed={f:0,v:['','']};
  if(tool==='line' && draft){ const last=lastPt(), cur=hover?.p||[last[0]+1,last[1]], ang = isFinite(v1) ? v1*Math.PI/180 : Math.atan2(cur[1]-last[1], cur[0]-last[0]), L = isFinite(v0) ? v0 : hyp(cur[0]-last[0], cur[1]-last[1]);
    draft.pts.push([+(last[0]+L*Math.cos(ang)).toFixed(4), +(last[1]+L*Math.sin(ang)).toFixed(4)]); flushLine(); return; }
  if(tool==='rect' && draft){ const a=draft.a, cur=hover?.p||[a[0]+1,a[1]+1], sx=Math.sign(cur[0]-a[0])||1, sy=Math.sign(cur[1]-a[1])||1;
    const w=isFinite(v0)?v0:Math.abs(cur[0]-a[0]), h=isFinite(v1)?v1:Math.abs(cur[1]-a[1]); addRect(a, mode.rect==='centre' ? [a[0]+w/2, a[1]+h/2] : [a[0]+sx*w, a[1]+sy*h]); return; }
  if(tool==='circle' && draft?.t==='circle' && isFinite(v0)){ const c=draft.a; draft=null; addEnt({ kind:'circle', cx:c[0], cy:c[1], rad:v0/2 }); return; }
  if(tool==='fillet' && sel[0]?.t==='node' && isFinite(v0)){ const c=ent(sel[0].e), n=c.nodes[sel[0].n]; if(canFillet(c, sel[0].n)){ if(v0>0) n.r=v0; else delete n.r; commit(); } return; }
  if(tool==='offset' && sel[0]?.t==='ent' && isFinite(v0)){ makeOffset(sel[0].e, v0); return; }
}
/* the lines that make the outline of a region (a tap inside picks the region; Delete takes its whole outline) */
function outlineEnts(r){
  const ring=r.outer, near=q=>{ for(let i=0;i<ring.length;i++){ if(distToSeg(q, ring[i], ring[(i+1)%ring.length])<0.02) return true; } return false; };
  return S.ents.filter(c=>{ const P=entPolyline(c, 0.02), closed=c.kind==='circle'||c.closed; for(let i=0;i<P.length-(closed?0:1);i++){ const a=P[i], b=P[(i+1)%P.length]; if(near([(a[0]+b[0])/2,(a[1]+b[1])/2])) return true; } return false; }).map(c=>c.id);
}
function deleteShapes(){
  const ids=new Set(sel.filter(s=>s.t==='reg').flatMap(s=>REG[s.k] ? outlineEnts(REG[s.k]) : []));
  sel.filter(s=>s.t==='ent').forEach(s=>ids.add(s.e));
  if(!ids.size) return;
  S.ents=S.ents.filter(c=>!ids.has(c.id)); sel=[]; regKey=''; commit(); toast(`Deleted ${ids.size} line${ids.size>1?'s':''}`);
}
/* take sides out of a line: the runs of sides left over become their own lines */
function removeSegs(c, set){
  if(!c) return; const N=c.nodes.length, S_=segCount(c);
  if(set.size>=S_){ S.ents=S.ents.filter(x=>x.id!==c.id); return; }
  // walk the sides in order, starting just after a removed one (closed) or at the start (open)
  const start = c.closed ? ([...set][0]+1)%N : 0, runs=[]; let cur=null;
  for(let k=0;k<S_;k++){ const i=(start+k)%N;
    if(set.has(i)){ if(cur){ runs.push(cur); cur=null; } continue; }
    if(!cur) cur={ nodes:[{...c.nodes[i]}], b:{} };
    if(c.b?.[i]) cur.b[cur.nodes.length-1]=c.b[i];
    cur.nodes.push({...c.nodes[(i+1)%N]}); }
  if(cur) runs.push(cur);
  const pieces=runs.map(r=>{ delete r.nodes[0].r; delete r.nodes.at(-1).r; return { id:newId(), kind:'path', closed:false, nodes:r.nodes, b:r.b, ...(c.spline?{spline:true}:{}) }; });
  const idx=S.ents.findIndex(x=>x.id===c.id); S.ents.splice(idx,1,...pieces);
}
function removeSel(){
  if(sel.length && sel.every(s=>s.t==='reg' || s.t==='ent')){ deleteShapes(); return; }
  const nodes=sel.filter(s=>s.t==='node'), segs=sel.filter(s=>s.t==='seg'), whole=new Set(sel.filter(s=>s.t==='ent').map(s=>s.e));
  // a picked region: the lines round it stay (regions are areas); deleting it means Not cut
  const regs=sel.filter(s=>s.t==='reg'); regs.forEach(s=>{ const r=REG[s.k]; if(r) r.set.cut='none'; });
  S.regs=REG.map(r=>({ seed:r.seed, ...r.set }));
  nodes.forEach(s=>{ const c=ent(s.e); if(!c || whole.has(c.id)) return; if(c.nodes.length>(c.closed?3:2)){ c.nodes.splice(s.n,1); const nb={}; Object.entries(c.b||{}).forEach(([k,v])=>{ k=+k; if(k<s.n) nb[k]=v; else if(k>s.n) nb[k-1]=v; }); c.b=nb; } else whole.add(c.id); });
  // picked sides: all of them come out in one go (what's left of each line stays as pieces)
  const bySeg={}; segs.forEach(s=>{ if(!whole.has(s.e)) (bySeg[s.e] ||= new Set()).add(s.s); });
  Object.entries(bySeg).forEach(([id,set])=>removeSegs(ent(id), set));
  S.ents=S.ents.filter(c=>!whole.has(c.id)); sel=[]; regKey=''; commit();
}

/* ---------------------------------------------------------------- dimension bubbles you can tap to type */
function openEditor(dim, e){
  const [kind, id, idx]=dim.split(':'), c=ent(id);
  let label='', val=0;
  if(kind==='len'){ label='Length'; val=segLength(c,+idx); }
  else if(kind==='rad'){ label='Radius'; const [a,b]=segEnds(c,+idx); val=bulgeArc([a.x,a.y],[b.x,b.y],c.b[+idx])?.R||0; }
  else if(kind==='dia'){ label='Diameter'; val=2*c.rad; }
  else if(kind==='fil'){ label='Corner radius'; val=c.nodes[+idx].r||0; }
  else return;
  const box=dlg.querySelector('.ss-edit'), r=svg.getBoundingClientRect();
  box.hidden=false; box.style.left=`${Math.min(r.width-200, Math.max(8, e.clientX-r.left-90))}px`; box.style.top=`${Math.max(8, e.clientY-r.top-60)}px`;
  box.innerHTML=`<label><span>${label}</span><input inputmode="decimal" enterkeyhint="done" value="${toU(val)}"><i>${uSign()}</i></label><button class="btn sm ss-ok" type="button">✓ Set</button><button class="btn ghost sm ss-no" type="button" aria-label="Cancel">✕</button>`;
  const inp=box.querySelector('input'); editor={kind, id, idx:+idx}; let done=false;
  const apply=()=>{ if(done) return; done=true; const v=parseIn(inp.value); closeEditor(); if(isFinite(v) && Math.abs(v-val)>1e-9) setDim(kind, id, +idx, v); };
  setTimeout(()=>{ inp.focus(); inp.select(); }, 0);
  inp.onkeydown=ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); apply(); } else if(ev.key==='Escape'){ ev.preventDefault(); done=true; closeEditor(); } };
  box.querySelector('.ss-ok').onpointerdown=ev=>{ ev.preventDefault(); apply(); };
  box.querySelector('.ss-no').onpointerdown=ev=>{ ev.preventDefault(); done=true; closeEditor(); };
  inp.onblur=()=>setTimeout(apply, 120);   // tapping away keeps what you typed
}
function closeEditor(){ editor=null; const b=dlg?.querySelector('.ss-edit'); if(b){ b.hidden=true; b.innerHTML=''; } svg?.focus({preventScroll:true}); }
function setDim(kind, id, i, v){
  const c=ent(id); if(!c) return;
  if(kind==='len' && v>0){ const [a,b]=segEnds(c,i), d=[b.x-a.x,b.y-a.y], L=hyp(...d); if(L>1e-9){ if(segType(c,i)==='arc'){ toast('Set an arc by its radius'); return; } const k=v/L, dx=a.x+d[0]*k-b.x, dy=a.y+d[1]*k-b.y; b.x+=dx; b.y+=dy; } }
  else if(kind==='rad'){ const [a,b]=segEnds(c,i), ch=hyp(b.x-a.x,b.y-a.y); if(v<ch/2-1e-9){ toast(`The smallest arc across ${fin(ch)} has a ${fin(ch/2)} radius`); return; } const sg=Math.sign(c.b[i]||1), big=Math.abs(c.b[i])>1, hc=Math.sqrt(Math.max(0,v*v-ch*ch/4)), s=big?v+hc:v-hc; c.b[i]=sg*2*s/ch; }
  else if(kind==='dia' && v>0) c.rad=v/2;
  else if(kind==='fil'){ // every picked corner gets it (pick all four and type it once)
    const corners=[{e:id, n:i}, ...sel.filter(s=>s.t==='node' && !(s.e===id && s.n===i))];
    corners.forEach(s=>{ const q=ent(s.e); if(q && canFillet(q, s.n)){ if(v>0) q.nodes[s.n].r=v; else delete q.nodes[s.n].r; } }); }
  commit();
}

/* ---------------------------------------------------------------- drawing it */
const pathD = (pts, closed) => pts.length ? 'M'+pts.map(p=>toS(p).map(v=>v.toFixed(1)).join(' ')).join('L')+(closed?'Z':'') : '';
function bubble(p, txt, { cls='', dim=null, dy=0 }={}){ const [x,y]=toS(p); const w=txt.length*7.2+14;
  return `<g class="ss-b${cls?' '+cls:''}" transform="translate(${x.toFixed(1)} ${(y+dy).toFixed(1)})"${dim?` data-dim="${dim}"`:''}><rect x="${-w/2}" y="-11" width="${w}" height="21" rx="10"/><text y="4">${esc(txt)}</text></g>`; }
function segMid(c,i){ const [a,b]=segEnds(c,i); if(segType(c,i)==='arc'){ const d=[b.x-a.x,b.y-a.y], L=hyp(...d), s=c.b[i]*L/2; return [(a.x+b.x)/2-d[1]/L*s, (a.y+b.y)/2+d[0]/L*s]; } return [(a.x+b.x)/2,(a.y+b.y)/2]; }
function gridSVG(){
  const [W,H]=size(); let g=''; const steps=[0.125,0.25,0.5,1,2,3,6,12,24,48]; const minor=steps.find(s=>s*view.k>=12)||48, major=minor<1?1:minor<=3?12:48;
  const [x0,y1]=toW(0,0), [x1,y0]=toW(W,H);
  for(let x=Math.floor(x0/minor)*minor; x<=x1; x+=minor){ const sx=toS([x,0])[0]; const mj=Math.abs(x/major-Math.round(x/major))<1e-6; g+=`<line x1="${sx.toFixed(1)}" y1="0" x2="${sx.toFixed(1)}" y2="${H}" class="${mj?'ss-gM':'ss-g'}${Math.abs(x)<1e-9?' ss-g0':''}"/>`; }
  for(let y=Math.floor(y0/minor)*minor; y<=y1; y+=minor){ const sy=toS([0,y])[1]; const mj=Math.abs(y/major-Math.round(y/major))<1e-6; g+=`<line x1="0" y1="${sy.toFixed(1)}" x2="${W}" y2="${sy.toFixed(1)}" class="${mj?'ss-gM':'ss-g'}${Math.abs(y)<1e-9?' ss-g0':''}"/>`; }
  return g;
}
function render(){
  if(!dlg) return;
  const tol=0.6/view.k; let g=gridSVG(), top='';
  let tight=0;
  // regions under everything: shaded by what they cut, blue when picked
  REG.forEach((r,k)=>{ const on=isSel({t:'reg',k}), cut=r.set.cut, hv = hover?.h?.t==='reg' && hover.h.k===k && tool==='select';
    const d=[r.outer,...r.holes].map(P=>pathD(P,true)).join(' ');
    const cls = cut==='thru' ? 'ss-rt' : cut==='pocket' ? 'ss-rp' : 'ss-rn';
    const op = cut==='pocket' ? ` style="fill-opacity:${Math.min(0.8, 0.16+(+r.set.depth||0)*0.11).toFixed(2)}"` : '';
    g+=`<path d="${d}" fill-rule="evenodd" class="ss-r ${cls}${hv?' hv':''}"${op}/>`;
    if(on) g+=`<path d="${d}" fill-rule="evenodd" class="ss-r ss-rsel"/>`;
    if(cut!=='none'){ tight+=r.tight.length; if(r.tight.length) asCut([r.outer,...r.holes]).forEach(q=>{ g+=`<path d="${pathD(q,true)}" class="ss-cut"/>`; }); r.tight.forEach(p=>{ const [x,y]=toS(p); top+=`<circle cx="${x}" cy="${y}" r="8" class="ss-tight"><title>Tighter than ⅜″: the ¾″ bit leaves a ⅜″ radius here</title></circle>`; }); }
    const tag = cut==='none' ? '' : `${r.set.name?r.set.name+' · ':''}${cut==='thru'?'through':fin(+r.set.depth||0)+' deep'}`;
    if(tag && (on || view.k*Math.sqrt(Math.abs(r.net))>70)) top+=bubble(r.seed, tag, { cls:'ss-tag' });
  });
  // the sketch lines
  S.ents.forEach(c=>{ const whole=wholeSel(c.id), pts=entPolyline(c, tol), closed=c.kind==='circle'||c.closed;
    g+=`<path d="${pathD(pts, closed)}" class="ss-e${whole?' on':''}${c.spline?' sp':''}"/>`;
    if(c.kind==='path') for(let i=0;i<segCount(c);i++){ if(isSel({t:'seg', e:c.id, s:i})){ g+=`<path d="${pathD(c.spline?pts:segPolyline(c,i,tol), false)}" class="ss-e on"/>`; } }
  });
  // points, picked dimensions
  S.ents.forEach(c=>{ const whole=wholeSel(c.id);
    if(c.kind==='circle'){ const [x,y]=toS([c.cx,c.cy]); top+=`<circle cx="${x}" cy="${y}" r="3.5" class="ss-pt${whole?' on':''}"/>`;
      if(whole) top+=bubble([c.cx, c.cy+c.rad], `⌀ ${fin(2*c.rad)}`, { dim:`dia:${c.id}:0`, dy:-16 }); return; }
    c.nodes.forEach((n,ni)=>{ const [x,y]=toS([n.x,n.y]), on=isSel({t:'node', e:c.id, n:ni}), end = tool==='line' && !c.closed && !c.spline && (ni===0 || ni===c.nodes.length-1);
      top+=`<circle cx="${x}" cy="${y}" r="${on?5:end?6.5:3.5}" class="ss-pt${on?' on':''}${end?' end':''}${n.r>0?' fil':''}"/>`;
      if(on && canFillet(c,ni)) top+=bubble([n.x,n.y], `R ${fin(n.r||0)}`, { dim:`fil:${c.id}:${ni}`, dy:-18 });
      if(on) ['hi','ho'].forEach(h=>{ if(n[h]){ const b=toS(n[h]); top+=`<line x1="${x}" y1="${y}" x2="${b[0]}" y2="${b[1]}" class="ss-hl"/><circle cx="${b[0]}" cy="${b[1]}" r="5" class="ss-hd"/>`; } }); });
    if(!c.spline) for(let i=0;i<segCount(c);i++){ if(!(whole || isSel({t:'seg', e:c.id, s:i}))) continue; const t=segType(c,i);
      if(t==='line') top+=bubble(segMid(c,i), fin(segLength(c,i)), { dim:`len:${c.id}:${i}`, dy:-15 });
      else if(t==='arc'){ const [a,b]=segEnds(c,i), A=bulgeArc([a.x,a.y],[b.x,b.y],c.b[i]); if(A) top+=bubble(segMid(c,i), `R ${fin(A.R)}`, { dim:`rad:${c.id}:${i}`, dy:-15 }); } }
  });
  // live: dragging and drawing
  if(drag?.t==='node'){ const c=ent(drag.e), N=c.nodes.length; [(drag.n-1+N)%N, drag.n].forEach(i=>{ if(i<segCount(c) && segType(c,i)==='line') top+=bubble(segMid(c,i), fin(segLength(c,i)), { cls:'live', dy:-15 }); }); }
  if(drag?.t==='seg'){ const c=ent(drag.e), N=c.nodes.length; [(drag.s-1+N)%N, drag.s, (drag.s+1)%N].forEach(i=>{ if(i<segCount(c) && segType(c,i)==='line') top+=bubble(segMid(c,i), fin(segLength(c,i)), { cls:'live', dy:-15 }); }); }
  if(drag?.t==='bulge'){ const c=ent(drag.e), [a,b]=segEnds(c,drag.s), A=bulgeArc([a.x,a.y],[b.x,b.y],c.b?.[drag.s]); if(A) top+=bubble(segMid(c,drag.s), `R ${fin(A.R)}`, { cls:'live', dy:-15 }); }
  if(drag?.t==='rim'){ const c=ent(drag.e); top+=bubble([c.cx, c.cy+c.rad], `⌀ ${fin(2*c.rad)}`, { cls:'live', dy:-16 }); }
  if(drag?.t==='fillet'){ const c=ent(drag.e), n=c.nodes[drag.n]; top+=bubble([n.x,n.y], `R ${fin(n.r||0)}`, { cls:'live', dy:-18 }); }
  if(drag?.t==='offset' && drag.dist){ const c=ent(drag.e); let pr; if(c.kind==='circle') pr=[flatten({kind:'circle',cx:c.cx,cy:c.cy,rad:Math.max(0.01,c.rad+drag.dist)},tol)]; else { let P=entPolyline(c,0.01); if(area(P)<0) P=P.slice().reverse(); pr=offset([P],drag.dist, !(!c.spline && [...Array(segCount(c)).keys()].every(i=>segType(c,i)==='line') && !c.nodes.some(n=>n.r>0))); }
    pr.forEach(q=>{ g+=`<path d="${pathD(q,true)}" class="ss-e ss-prev"/>`; }); top+=bubble(hover?.p||[0,0], `${drag.dist>0?'out':'in'} ${fin(Math.abs(drag.dist))}`, { cls:'live', dy:-20 }); }
  if(drag?.t==='box'){ const [a,b]=[toS(drag.a), toS(drag.b)]; g+=`<rect x="${Math.min(a[0],b[0])}" y="${Math.min(a[1],b[1])}" width="${Math.abs(b[0]-a[0])}" height="${Math.abs(b[1]-a[1])}" class="ss-box"/>`; }
  const cur = drag?.t==='draw' ? drag.b : hover?.p;
  const tv = (i,def,u) => typed.v[i] ? `${typed.v[i]}${u||(/[a-z'"]$/i.test(typed.v[i])?'':uSign())}${typed.f===i?'▏':''}` : (typed.f===i && (typed.v[0]||typed.v[1]) ? '▏' : def);
  if(['line','spline'].includes(tool) && draft && cur){ const P=draft.pts, last=P.at(-1), all=[...P, cur];
    const prev = tool==='spline' ? flatten({kind:'path', spline:true, closed:false, nodes:all.map(([x,y])=>({x,y}))}, tol) : all;
    g+=`<path d="${pathD(prev,false)}" class="ss-e ss-prev"/>`;
    if(tool==='line'){ const L=hyp(cur[0]-last[0], cur[1]-last[1]), ang=((Math.atan2(cur[1]-last[1], cur[0]-last[0])*180/Math.PI)+360)%360;
      top+=bubble([(last[0]+cur[0])/2,(last[1]+cur[1])/2], tv(0, fin(L)), { cls:'live'+(typed.f===0&&typed.v[0]?' typing':''), dy:-16 });
      top+=bubble(last, tv(1, `${Math.round(ang*10)/10}°`, '°'), { cls:'live ang'+(typed.f===1?' typing':''), dy:22 }); } }
  if(tool==='rect' && (draft?.t==='rect' || (drag?.t==='draw' && drag.moved))){ const a=draft?.a||drag.a, b=cur||a; let x0,x1,y0,y1;
    if(mode.rect==='centre'){ const w=Math.abs(b[0]-a[0]), h=Math.abs(b[1]-a[1]); x0=a[0]-w; x1=a[0]+w; y0=a[1]-h; y1=a[1]+h; } else { x0=Math.min(a[0],b[0]); x1=Math.max(a[0],b[0]); y0=Math.min(a[1],b[1]); y1=Math.max(a[1],b[1]); }
    g+=`<path d="${pathD([[x0,y0],[x1,y0],[x1,y1],[x0,y1]],true)}" class="ss-e ss-prev"/>`;
    top+=bubble([(x0+x1)/2, y1], tv(0, fin(x1-x0)), { cls:'live', dy:-16 })+bubble([x1,(y0+y1)/2], tv(1, fin(y1-y0)), { cls:'live', dy:0 }); }
  if(tool==='circle' && (draft?.t==='circle' || (drag?.t==='draw' && drag.moved && mode.circle==='centre'))){ const a=draft?.a||drag.a, b=cur||a, r=hyp(b[0]-a[0], b[1]-a[1]);
    g+=`<path d="${pathD(flatten({kind:'circle',cx:a[0],cy:a[1],rad:Math.max(r,1e-3)},tol),true)}" class="ss-e ss-prev"/>`; const A=toS(a), B=toS(b); g+=`<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" class="ss-hl"/>`;
    top+=bubble(b, tv(0, `⌀ ${fin(2*r)}`), { cls:'live', dy:-18 }); }
  if(tool==='circle' && draft?.t==='c3' && cur){ const P=[...draft.pts, cur]; if(P.length===3){ const C=circle3(...P); if(C) g+=`<path d="${pathD(flatten({kind:'circle',cx:C[0],cy:C[1],rad:C[2]},tol),true)}" class="ss-e ss-prev"/>`; } draft.pts.forEach(p=>{ const [x,y]=toS(p); top+=`<circle cx="${x}" cy="${y}" r="4" class="ss-pt on"/>`; }); }
  if(tool==='arc' && draft?.t==='arc' && cur){ const P=draft.pts;
    if(P.length===1){ g+=`<path d="${pathD([P[0],cur],false)}" class="ss-e ss-prev"/>`; top+=bubble([(P[0][0]+cur[0])/2,(P[0][1]+cur[1])/2], fin(hyp(cur[0]-P[0][0], cur[1]-P[0][1])), { cls:'live', dy:-16 }); }
    if(P.length===2){ const bl=bulgeThrough(P[0],P[1],cur); if(bl!=null){ const pts=flatten({kind:'path',closed:false,nodes:[{x:P[0][0],y:P[0][1]},{x:P[1][0],y:P[1][1]}],b:{0:bl}},tol); g+=`<path d="${pathD(pts,false)}" class="ss-e ss-prev"/>`; const A=bulgeArc(P[0],P[1],bl); if(A) top+=bubble(cur, `R ${fin(A.R)}`, { cls:'live', dy:-18 }); } }
    P.forEach(p=>{ const [x,y]=toS(p); top+=`<circle cx="${x}" cy="${y}" r="4" class="ss-pt on"/>`; }); }
  if(drag?.free){ const st=drag.stroke; g+=`<path d="${pathD(st,false)}" class="ss-e ss-prev"/>`; let L=0; for(let i=1;i<st.length;i++) L+=hyp(st[i][0]-st[i-1][0], st[i][1]-st[i-1][1]); top+=bubble(st.at(-1), `${fin(L)} long`, { cls:'live', dy:-18 }); }
  if(['fillet','offset'].includes(tool) && sel.length===1 && (typed.v[0])) top+=bubble(hover?.p || [view.cx, view.cy], `${tool==='fillet'?'R ':''}${typed.v[0]}″▏`, { cls:'live typing', dy:-22 });
  // the inference: what it snapped to, and the dotted guides
  const sp = drag?.snap || hover?.snap; if(sp && (drag || ['line','spline','rect','circle','arc'].includes(tool))){ const [x,y]=toS(sp.p);
    sp.guides.forEach(gd=>{ const o=toS(gd.from); g+=`<line x1="${o[0]}" y1="${o[1]}" x2="${x}" y2="${y}" class="ss-guide"/>`; });
    if(sp.ray){ const a=toS(sp.ray.from); g+=`<line x1="${a[0]}" y1="${a[1]}" x2="${x+(x-a[0])*3}" y2="${y+(y-a[1])*3}" class="ss-guide"/>`; }
    if(sp.kind && sp.kind!=='grid'){ top+=`<circle cx="${x}" cy="${y}" r="${sp.kind==='close'?9:6}" class="ss-snap ${sp.kind.replace(/\W/g,'')}"/>`; top+=`<text x="${x+10}" y="${y-10}" class="ss-snapt">${esc(sp.kind)}</text>`; } }
  svg.innerHTML=g+top;
  // bars
  dlg.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.tool===tool));
  dlg.querySelector('#ssSnap').setAttribute('aria-pressed', snapOn); dlg.querySelector('#ssUnit').value=unit;
  { const gs=dlg.querySelector('#ssGrid'), G=GRIDS(); if(gs.dataset.u!==unit){ gs.innerHTML=G.map(g=>`<option value="${g}">${fin(g)}</option>`).join(''); gs.dataset.u=unit; if(!G.some(g=>Math.abs(g-grid)<1e-9)) grid=G[1]; } gs.value=String(grid); }
  const nm=dlg.querySelector('#ssName'); if(document.activeElement!==nm) nm.value=S.name||'';
  dlg.querySelector('#ssUndo').disabled=!HIST.canUndo; dlg.querySelector('#ssRedo').disabled=!HIST.canRedo;
  dlg.querySelector('#ssSave').textContent = origin ? 'Save' : 'Save to library'; dlg.querySelector('#ssSaveNew').hidden=!origin;
  subBar(); status(tight); inspector(); library();
}
function subBar(){
  const box=dlg.querySelector('.ss-sub');
  const m = tool==='rect' ? `<div class="seg sm"><button data-mode="rect:corner" aria-pressed="${mode.rect==='corner'}">Corner to corner</button><button data-mode="rect:centre" aria-pressed="${mode.rect==='centre'}">From the centre</button></div>`
          : tool==='circle' ? `<div class="seg sm"><button data-mode="circle:centre" aria-pressed="${mode.circle==='centre'}">Centre &amp; radius</button><button data-mode="circle:3pt" aria-pressed="${mode.circle==='3pt'}">3 points</button></div>`
          : tool==='mirror' ? (mirrorStep===1
              ? `<b class="ss-step">1</b><span>Pick what to mirror: tap lines or inside shapes, or box them · <b>${new Set(sel.filter(s=>s.t==='ent').map(s=>s.e)).size}</b> picked</span><button class="btn sm" data-mstep="2" ${sel.some(s=>s.t==='ent')?'':'disabled'}>Next: the mirror line →</button><button class="btn ghost sm" data-mclear>Clear</button>`
              : `<b class="ss-step">2</b><span>Tap the straight line to mirror across</span><button class="btn ghost sm" data-mstep="1">← Back to picking</button>`) : '';
  box.innerHTML=m; box.hidden=!m;
  box.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{ const [t,v]=b.dataset.mode.split(':'); mode[t]=v; draft=null; render(); });
  box.querySelectorAll('[data-mstep]').forEach(b=>b.onclick=()=>{ mirrorStep=+b.dataset.mstep; render(); });
  box.querySelector('[data-mclear]')?.addEventListener('click',()=>{ sel=[]; render(); });
}
function status(tight){
  const hint = {
    select:'Tap to pick (taps add up), double-tap a line for the whole chain. Drag a point or line to move it. Pencil / mouse on empty space = box select, finger = pan. Two-finger tap undo, three-finger tap redo.',
    line: draft ? 'Drag on from the end to keep going; type the length, Tab = angle, Enter. Tap anywhere to stop (on the start to close it).' : 'Touch and drag to draw. Drag from an end bullet to add on; drag a corner or a line to move it. Tapping inside a shape picks it.',
    rect: draft ? 'Tap the opposite corner, or type W, Tab, H and Enter.' : 'Drag out a rectangle, or tap two corners.',
    circle: mode.circle==='3pt' ? 'Tap three points on the circle.' : draft ? 'Tap the radius, or type the diameter and Enter.' : 'Drag from the centre out, or tap the centre then the edge.',
    arc: draft?.pts?.length===2 ? 'Drag (or tap) to bend it through that point.' : 'Drag from the start to the end, then drag to bend it (or tap 3 points).',
    spline: draft ? 'Tap the next point it passes through; tap the first to close, double-tap or Enter to finish.' : 'Draw it freehand with the pencil (it smooths to a few points you can drag), or tap the points it passes through.',
    fillet: 'Press on a corner and drag to round it, or tap it and type the radius.',
    offset: 'Press on a closed shape and drag out or in, or tap it and type the distance (− for in).',
    trim: 'Tap the piece of a line between two crossings to take it out.',
    mirror: mirrorStep===1 ? 'Pick the lines to mirror, then Next.' : 'Tap the mirror line: a mirrored copy is made.' }[tool];
  const nr=REG.filter(r=>r.set.cut!=='none').length;
  dlg.querySelector('.ss-status').innerHTML=`<span>${hint}</span>${REG.length?`<span>${REG.length} region${REG.length>1?'s':''} · ${nr} cut</span>`:''}${tight?`<span class="ss-warn">${tight} inside corner${tight>1?'s':''} tighter than ⅜″: the ¾″ bit leaves ⅜″ round (dashed red)</span>`:''}`;
}
/* the inspector: what's picked */
function inspector(){
  const box=dlg.querySelector('.ss-insp');
  if(!sel.length || draft){ box.hidden=true; return; }
  box.hidden=false;
  const regs=sel.filter(s=>s.t==='reg').map(s=>REG[s.k]).filter(Boolean), ents=sel.filter(s=>s.t!=='reg');
  const f=(id,label,v)=>`<label class="cw-f"><span>${label}</span><input data-sf="${id}" inputmode="decimal" enterkeyhint="done" value="${toU(v)}"><i>${uSign()}</i></label>`;
  let h='';
  if(regs.length){ const r0=regs[0].set, same=k=>regs.every(r=>r.set[k]===r0[k]), cut=same('cut')?r0.cut:null;
    h+=`<div class="eyebrow">${regs.length>1?regs.length+' regions':'Region'} · ${regs.length===1?`${fin(Math.abs(regs[0].net))} sq in`:''}</div>
      <div class="seg wrap"><button data-cut="none" aria-pressed="${cut==='none'}">Not cut</button><button data-cut="thru" aria-pressed="${cut==='thru'}">Right through</button><button data-cut="pocket" aria-pressed="${cut==='pocket'}">Pocket</button></div>
      ${cut==='pocket'||(!cut&&regs.some(r=>r.set.cut==='pocket'))?`<div class="cw-fs">${f('depth','Depth', same('depth')?+r0.depth||0:+r0.depth||0)}</div><p class="note">Depth from the face it's placed on. As deep as the panel = right through.</p>`:''}
      ${regs.length===1?`<label class="cw-f"><span>Name (optional)</span><input data-sn value="${esc(r0.name||'')}" placeholder="e.g. heat pump head"></label>`:''}
      <div class="row"><button class="btn ghost sm" data-sa="delshape">Delete ${regs.length>1?'these shapes':'this shape'}</button><button class="btn ghost sm" data-sa="pickout">Pick its lines</button></div>
      ${regs.some(r=>r.holes.length)?`<p class="note">The shape${regs.length>1?'s':''} inside ${regs.length>1?'are':'is'} separate regions: tap inside to give ${regs.length>1?'them':'it'} its own depth. It all stays one shape for the CNC.</p>`:''}`; }
  if(ents.length){
    const one=ents.length===1?ents[0]:null, c=one?ent(one.e):null;
    if(regs.length) h+='<hr>';
    const nodesPicked=ents.filter(s=>s.t==='node' && canFillet(ent(s.e), s.n));
    if(!one && nodesPicked.length===ents.length && nodesPicked.length>1){ const r0=ent(nodesPicked[0].e).nodes[nodesPicked[0].n].r||0;
      h+=`<div class="eyebrow">${nodesPicked.length} corners</div><div class="cw-fs">${f('nrAll','Corner radius (all)',r0)}</div><p class="note">Type it, then ✓ or tap away.</p>`; }
    else if(one?.t==='node' && c){ const n=c.nodes[one.n];
      h+=`<div class="eyebrow">Point</div><div class="cw-fs">${f('nx','X',n.x)}${f('ny','Y',n.y)}${canFillet(c,one.n)?f('nr','Corner radius',n.r||0):''}</div>`; }
    else if(one?.t==='seg' && c && !c.spline){ const t=segType(c,one.s);
      h+=`<div class="eyebrow">${t==='arc'?'Arc':t==='curve'?'Curve':'Line'}</div><div class="seg"><button data-sa="straight" aria-pressed="${t==='line'}">Straight</button><button data-sa="arc" aria-pressed="${t==='arc'}">Arc</button></div>`; }
    else if(one?.t==='ent' && c?.kind==='circle'){ h+=`<div class="eyebrow">Circle</div><div class="cw-fs">${f('cd','Diameter',2*c.rad)}${f('cx','Centre X',c.cx)}${f('cy','Centre Y',c.cy)}</div>`; }
    else { const B=bboxAll(ents.map(s=>ent(s.e)).filter(Boolean)); h+=`<div class="eyebrow">${ents.length>1?ents.length+' picked':c?.spline?'Spline':'Lines'}</div><p class="note">${fin(B.w)} × ${fin(B.h)}</p>`; }
    h+=`<div class="row"><button class="btn ghost sm" data-sa="dup">Duplicate</button><button class="btn ghost sm" data-sa="mir">Mirror</button><button class="btn ghost sm" data-sa="flip">Flip</button><button class="btn ghost sm" data-sa="del">Delete</button></div>`;
  }
  box.innerHTML=h;
  box.querySelectorAll('[data-cut]').forEach(b=>b.onclick=()=>{ regs.forEach(r=>{ r.set.cut=b.dataset.cut; if(r.set.cut==='pocket' && !(r.set.depth>0)) r.set.depth=1; r.tight = r.set.cut==='none'?[]:tightSpots(r); }); S.regs=REG.map(r=>({seed:r.seed, ...r.set})); HIST.track(); render(); });
  box.querySelector('[data-sn]')?.addEventListener('change', e=>{ regs[0].set.name=e.target.value.trim(); S.regs=REG.map(r=>({seed:r.seed, ...r.set})); HIST.track(); render(); });
  box.querySelectorAll('[data-sf]').forEach(i=>i.onchange=()=>{ const v=parseIn(i.value); if(!isFinite(v)) return render(); setVal(i.dataset.sf, v, regs, ents); });
  box.querySelectorAll('[data-sa]').forEach(b=>b.onclick=()=>act(b.dataset.sa, ents));
}
function setVal(k, v, regs, ents){
  if(k==='depth'){ regs.forEach(r=>{ r.set.depth=v; }); S.regs=REG.map(r=>({seed:r.seed, ...r.set})); HIST.track(); render(); return; }
  const one=ents[0], c=ent(one.e);
  if(k==='nx'||k==='ny'){ const n=c.nodes[one.n], d = k==='nx' ? [v-n.x,0] : [0,v-n.y]; n.x+=d[0]; n.y+=d[1]; if(n.hi) n.hi=[n.hi[0]+d[0],n.hi[1]+d[1]]; if(n.ho) n.ho=[n.ho[0]+d[0],n.ho[1]+d[1]]; }
  else if(k==='nr'){ const n=c.nodes[one.n]; if(v>0) n.r=v; else delete n.r; }
  else if(k==='nrAll'){ ents.forEach(s=>{ const q=ent(s.e); if(q && canFillet(q,s.n)){ if(v>0) q.nodes[s.n].r=v; else delete q.nodes[s.n].r; } }); }
  else if(k==='cd'){ if(v>0) c.rad=v/2; } else if(k==='cx') c.cx=v; else if(k==='cy') c.cy=v;
  commit();
}
function act(a, ents){
  const ids=[...new Set(ents.map(s=>s.e))];
  if(a==='del'){ removeSel(); return; }
  if(a==='delshape'){ deleteShapes(); return; }
  if(a==='pickout'){ const ids=new Set(sel.filter(s=>s.t==='reg').flatMap(s=>REG[s.k]?outlineEnts(REG[s.k]):[])); sel=[...ids].map(e=>({t:'ent', e})); render(); return; }
  if(a==='dup'){ const copies=ids.map(id=>mapAll([clone(ent(id))], ([x,y])=>[x+grid*8, y-grid*8])[0]).map(x=>({...x, id:newId()})); S.ents.push(...copies); sel=copies.map(x=>({t:'ent', e:x.id})); }
  else if(a==='mir'||a==='flip'){ const list=ids.map(id=>ent(id)), m=mirrorAll(list, a==='mir', a==='flip'); m.forEach(x=>{ const i=S.ents.findIndex(o=>o.id===x.id); S.ents[i]=x; }); }
  else if(a==='straight'||a==='arc'){ const s=ents[0], c=ent(s.e); c.b ||= {}; delete c.b[s.s]; const [p,q]=segEnds(c,s.s); delete p.ho; delete q.hi; if(a==='arc') c.b[s.s]=0.4142; }
  commit();
}
/* ---------------------------------------------------------------- library: open, delete; save */
function library(){
  const box=dlg.querySelector('.ss-lib'); box.hidden=!libOpen; if(!libOpen) return;
  box.innerHTML=`<div class="eyebrow">Shape library · ${SHAPELIB.length}${sharedShapes()?' · shared':' · this browser'}</div>
    <button class="btn ghost sm" data-ln>＋ New sketch</button>
    <div class="ss-libl">${SHAPELIB.map(s=>`<div class="ss-li"><button class="ss-lo" data-lo="${esc(s.id)}">${shapeThumb(s,56)}<span><b>${esc(s.name)}</b><small>${esc(s.id)} · ${fin(s.w||0)} × ${fin(s.h||0)}</small></span></button>${canSave()?`<button class="linkbtn" data-ld="${esc(s.id)}">Delete</button>`:''}</div>`).join('') || '<p class="note">Nothing saved yet.</p>'}</div>`;
  box.querySelector('[data-ln]').onclick=()=>openShapeStudio({});
  box.querySelectorAll('[data-lo]').forEach(b=>b.onclick=()=>openShapeStudio({ id:b.dataset.lo }));
  box.querySelectorAll('[data-ld]').forEach(b=>b.onclick=async()=>{ if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to delete'; return; }
    try{ await deleteShape(b.dataset.ld); if(origin===b.dataset.ld) origin=null; render(); toast('Deleted from the shape library'); }catch(e){ toast(`Couldn't delete: ${e.message||e}`); } });
}
async function save(asNew){
  finishDraft(false);
  if(!canSave()){ toast('Viewers can look but not save.'); return; }
  const name=(S.name||'').trim(); if(!name){ toast('Give the shape a name first'); dlg.querySelector('#ssName').focus(); return; }
  syncRegions();
  const r4=P=>P.map(([x,y])=>[+x.toFixed(4), +y.toFixed(4)]);
  // the outlines that get cut, worked out finer (0.004″) than on screen; each takes its region's setting
  const fine=arrangement(S.ents.filter(e=>e.kind==='circle' || e.nodes?.length>=2), 0.004);
  fine.forEach(f=>{ const p=interiorPoint(f), r=REG.find(g=>inRegion(p,g)); f.set=r?r.set:{cut:'none'}; });
  const regs=fine.filter(r=>r.set.cut!=='none').map(r=>({ outer:r4(r.outer), holes:r.holes.map(r4), cut:r.set.cut, depth:r.set.cut==='pocket'?+r.set.depth:0, name:r.set.name||'' }));
  if(!regs.length){ toast('Nothing is cut yet: tap a region and choose Right through or Pocket'); return; }
  const shape={ id:(!asNew && origin) ? origin : nextShapeId(), name, regs, sketch:{ ents:S.ents, regs:S.regs } };
  try{ const { shape:s, shared }=await saveShape(shape); origin=s.id; S.id=s.id; HIST.track(); render();
    toast(`${s.id} “${s.name}” saved to the shape library${shared?' (for the whole team)':' (in this browser)'}. Place it from the wall or floor / ceiling / roof builder: Add shape.`); }
  catch(e){ toast(`Couldn't save: ${e.message||e}`); }
}
/* ⋯ menu → Shape studio */
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bShapeS')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bShapeS'; b.textContent='Shape studio (sketch)';
    pop.insertBefore(b, document.getElementById('bUpload')); b.onclick=()=>{ pop.hidden=true; openShapeStudio(); }; } }
export { openShapeStudio };
