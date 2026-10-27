/* Cubit Builder — shape-studio.js : a full-screen vector drawing tool for any shape to cut into a panel.

   Tools (top bar, or keys V L R C P):
     Select     tap a corner, a side, a handle or inside an outline; drag to move it (empty space pans)
     Line       tap (or press-drag-release) for each corner; tap the first corner again to close it;
                type a length and press Enter to place the next corner exactly that far along
     Rectangle  drag from corner to corner          Circle  drag from the centre out
     Curve      tap for a sharp corner, press and drag for a smooth curve point (Bézier handles)
   Everything snaps (corners first, then lines up with other corners, then the angle, then the grid) and shows
   its measurements while it moves. Pick a corner to type its corner radius (a true arc); drag the round handle
   in the middle of a straight side to bow it into an arc. Each closed outline is one region: right through, or
   a pocket with its own depth. Inside corners tighter than ⅜″ (the ¾″ bit) show red, with the outline the bit
   really leaves dashed. Save puts the shape in the Shape library; walls and floors / ceilings / roofs place it
   from their builders (Add shape), where it can be mirrored and flipped. */
import { flatten, area, bbox, bboxAll, segCount, segType, segLength, bulgeArc, fillet, asCut, tightCorners, mapAll, mirrorAll, R_BIT } from './geom2d.js';
import { SHAPELIB, shapeById, nextShapeId, saveShape, deleteShape, sharedShapes } from './shapes.js';
import { makeHistory } from './local-history.js';
import { canSave } from './role.js';
import { toast } from './sidebar.js';
import { fin } from './format.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const hyp = Math.hypot;
const GRIDS = [0.0625, 0.125, 0.25, 0.5, 1];
let S=null, dlg=null, svg=null, tool='select', sel=null, view={cx:12, cy:8, k:24}, snapOn=true, grid=0.125, origin=null;
let drawing=null, preview=null, drag=null, typed='', libOpen=false, hover=null;
const HIST = makeHistory(()=>S, v=>{ S=v; sel=null; drawing=null; });
let uid=1; const newId = () => 'c'+Date.now().toString(36)+(uid++);

/* ---------------------------------------------------------------- opening */
function openShapeStudio({ id=null }={}){
  const src = id ? shapeById(id) : null;
  S = src ? { id:src.id, name:src.name, contours:clone(src.contours) } : { id:null, name:'', contours:[] };
  origin = src ? src.id : null; tool='select'; sel=null; drawing=null; preview=null; typed=''; libOpen=false;
  ensure(); HIST.reset();
  if(!dlg.open) dlg.showModal();
  requestAnimationFrame(()=>{ fit(); render(); });
}
function ensure(){
  if(dlg) return;
  dlg=document.createElement('dialog'); dlg.className='ss-dlg'; dlg.setAttribute('aria-label','Shape studio');
  dlg.innerHTML=`<div class="ss">
    <header class="ss-bar">
      <button class="btn ghost sm" id="ssClose" aria-label="Close">✕</button>
      <input id="ssName" class="ss-name" placeholder="Name this shape" aria-label="Shape name">
      <div class="seg ss-tools" role="toolbar" aria-label="Tools">
        <button data-tool="select" title="Select (V)">↖ Select</button><button data-tool="line" title="Line (L)">╱ Line</button><button data-tool="rect" title="Rectangle (R)">▭ Rect</button><button data-tool="circle" title="Circle (C)">◯ Circle</button><button data-tool="curve" title="Curve (P)">∿ Curve</button></div>
      <span class="spacer"></span>
      <button class="btn ghost sm" id="ssSnap" aria-pressed="true" title="Snap to corners, lines and the grid">Snap</button>
      <select id="ssGrid" aria-label="Grid">${GRIDS.map(g=>`<option value="${g}">${fin(g)}</option>`).join('')}</select>
      <span class="hist-btns"><button class="btn ghost sm" id="ssUndo" aria-label="Undo" title="Undo">↶</button><button class="btn ghost sm" id="ssRedo" aria-label="Redo" title="Redo">↷</button></span>
      <button class="btn ghost sm" id="ssFit" title="Fit the drawing to the screen">Fit</button>
      <button class="btn ghost sm" id="ssMir" title="Mirror the whole drawing left ↔ right">Mirror</button><button class="btn ghost sm" id="ssFlip" title="Flip the whole drawing top ↔ bottom">Flip</button>
      <button class="btn ghost sm" id="ssLib">Library</button>
      <button class="btn ghost sm" id="ssSaveNew" hidden>Save as new</button><button class="btn sm" id="ssSave">Save</button>
    </header>
    <div class="ss-stage"><svg class="ss-svg" tabindex="0" aria-label="Drawing"></svg>
      <div class="ss-insp" hidden></div><div class="ss-lib" hidden></div>
      <div class="ss-status"></div></div></div>`;
  document.body.appendChild(dlg);
  svg=dlg.querySelector('.ss-svg');
  const $=s=>dlg.querySelector(s);
  $('#ssClose').onclick=()=>dlg.close();
  $('#ssName').oninput=e=>{ S.name=e.target.value; };
  $('#ssName').onchange=()=>HIST.track();
  dlg.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  $('#ssSnap').onclick=()=>{ snapOn=!snapOn; render(); };
  $('#ssGrid').onchange=e=>{ grid=+e.target.value; render(); };
  $('#ssUndo').onclick=()=>{ if(HIST.undo()) render(); };
  $('#ssRedo').onclick=()=>{ if(HIST.redo()) render(); };
  $('#ssFit').onclick=()=>{ fit(); render(); };
  $('#ssMir').onclick=()=>{ S.contours=mirrorAll(S.contours,true,false); commit(); };
  $('#ssFlip').onclick=()=>{ S.contours=mirrorAll(S.contours,false,true); commit(); };
  $('#ssLib').onclick=()=>{ libOpen=!libOpen; render(); };
  $('#ssSave').onclick=()=>save(false);
  $('#ssSaveNew').onclick=()=>save(true);
  bindPointer(); bindKeys();
  new ResizeObserver(()=>{ if(dlg.open) render(); }).observe(svg);
}
function setTool(t){ svg?.focus({preventScroll:true}); finishDrawing(); tool=t; sel=null; preview=null; typed=''; render(); }
function commit(){ HIST.track(); render(); }

/* ---------------------------------------------------------------- view: world inches (y up) ⇄ screen px */
const size = () => [svg.clientWidth||800, svg.clientHeight||600];
const toS = ([x,y]) => { const [W,H]=size(); return [W/2+(x-view.cx)*view.k, H/2-(y-view.cy)*view.k]; };
const toW = (sx,sy) => { const [W,H]=size(); return [view.cx+(sx-W/2)/view.k, view.cy-(sy-H/2)/view.k]; };
function fit(){
  const [W,H]=size(), B = S.contours.length ? bboxAll(S.contours) : {x0:0,y0:0,x1:24,y1:16,w:24,h:16};
  const w=Math.max(B.w,6), h=Math.max(B.h,4); view.k=Math.max(2, Math.min(200, Math.min((W-120)/w, (H-160)/h)));
  view.cx=(B.x0+B.x1)/2; view.cy=(B.y0+B.y1)/2;
}
const evW = e => { const r=svg.getBoundingClientRect(); return toW(e.clientX-r.left, e.clientY-r.top); };

/* ---------------------------------------------------------------- snapping */
function snapPt(p, { skip=null, from=null }={}){
  const tol=12/view.k, guides=[]; let q=p.slice(), kind=null;
  if(!snapOn) return { p:q, kind, guides };
  // 1. corners, circle centres, side midpoints
  let best=null;
  S.contours.forEach((c,ci)=>{
    if(c.kind==='circle'){ if(!(skip && skip.c===ci)) { const d=hyp(c.cx-p[0], c.cy-p[1]); if(d<tol && (!best||d<best.d)) best={d, p:[c.cx,c.cy], kind:'centre'}; } return; }
    c.nodes.forEach((n,ni)=>{ if(skip && skip.c===ci && skip.n===ni) return; const d=hyp(n.x-p[0], n.y-p[1]); if(d<tol && (!best||d<best.d)) best={d, p:[n.x,n.y], kind:(drawing && drawing.c===ci && ni===0)?'close':'corner'}; });
    for(let i=0;i<segCount(c);i++){ if(segType(c,i)!=='line') continue; const a=c.nodes[i], b=c.nodes[(i+1)%c.nodes.length]; if(skip && skip.c===ci && (skip.n===i || skip.n===(i+1)%c.nodes.length)) continue;
      const m=[(a.x+b.x)/2,(a.y+b.y)/2], d=hyp(m[0]-p[0], m[1]-p[1]); if(d<tol*0.8 && (!best||d<best.d)) best={d, p:m, kind:'middle'}; }
  });
  if(best) return { p:best.p, kind:best.kind, guides };
  // 2. line up with other corners (and the start of this line)
  const pts=[]; S.contours.forEach((c,ci)=>{ if(c.kind==='circle') pts.push([c.cx,c.cy]); else c.nodes.forEach((n,ni)=>{ if(!(skip && skip.c===ci && skip.n===ni)) pts.push([n.x,n.y]); }); });
  let gx=null, gy=null;
  pts.forEach(o=>{ const dx=Math.abs(o[0]-p[0]), dy=Math.abs(o[1]-p[1]); if(dx<8/view.k && (!gx||dx<gx.d)) gx={d:dx, o}; if(dy<8/view.k && (!gy||dy<gy.d)) gy={d:dy, o}; });
  // 3. the angle from the last corner: every 15°
  if(from && !gx && !gy){ const dx=p[0]-from[0], dy=p[1]-from[1], L=hyp(dx,dy); if(L>1e-6){ const a=Math.atan2(dy,dx), s=Math.PI/12, as=Math.round(a/s)*s;
    if(Math.abs(a-as)<0.07){ const Lg=Math.max(grid, Math.round(L/grid)*grid); return { p:[from[0]+Lg*Math.cos(as), from[1]+Lg*Math.sin(as)], kind:'angle', guides }; } } }
  // 4. the grid
  q=[Math.round(p[0]/grid)*grid, Math.round(p[1]/grid)*grid];
  if(gx){ q[0]=gx.o[0]; guides.push({x:gx.o[0], from:gx.o}); }
  if(gy){ q[1]=gy.o[1]; guides.push({y:gy.o[1], from:gy.o}); }
  return { p:q, kind:guides.length?'guide':'grid', guides };
}

/* ---------------------------------------------------------------- hit testing */
function segPts(c, i){ const n=c.nodes, j=(i+1)%n.length; return flatten({kind:'path', nodes:[{...n[i], r:0, hi:undefined}, {...n[j], r:0, ho:undefined}], b:{0:c.b?.[i]}, closed:false}, 0.5/view.k); }
function distSeg(p, a, b){ const dx=b[0]-a[0], dy=b[1]-a[1], L=dx*dx+dy*dy; let t=L? ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L : 0; t=Math.max(0,Math.min(1,t)); return hyp(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy); }
function inside(p, pts){ let c=false; for(let i=0,j=pts.length-1;i<pts.length;j=i++){ const a=pts[i], b=pts[j]; if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; }
function midHandle(c, i){ const n=c.nodes, a=n[i], b=n[(i+1)%n.length], t=segType(c,i);
  if(t==='line') return [(a.x+b.x)/2,(a.y+b.y)/2];
  if(t==='arc'){ const d=[b.x-a.x, b.y-a.y], L=hyp(...d), s=c.b[i]*L/2; return [(a.x+b.x)/2-d[1]/L*s, (a.y+b.y)/2+d[0]/L*s]; }
  return null; }
function hit(p){
  const tol=12/view.k;
  const sc = sel && S.contours[sel.c];
  if(sc && sc.kind==='path'){
    // handles of the picked corner, then side-middle handles of the picked outline
    if(sel.n!=null){ const n=sc.nodes[sel.n]; for(const h of ['hi','ho']) if(n?.[h] && hyp(n[h][0]-p[0], n[h][1]-p[1])<tol) return { t:'handle', c:sel.c, n:sel.n, h }; }
    for(let i=0;i<segCount(sc);i++){ const m=midHandle(sc,i); if(m && hyp(m[0]-p[0], m[1]-p[1])<tol*0.9) return { t:'mid', c:sel.c, seg:i }; }
  }
  if(sc && sc.kind==='circle'){ const d=hyp(sc.cx-p[0], sc.cy-p[1]); if(Math.abs(d-sc.rad)<tol) return { t:'rim', c:sel.c }; }
  for(let ci=S.contours.length-1; ci>=0; ci--){ const c=S.contours[ci]; if(c.kind!=='path') continue;
    for(let ni=0; ni<c.nodes.length; ni++){ const n=c.nodes[ni]; if(hyp(n.x-p[0], n.y-p[1])<tol) return { t:'node', c:ci, n:ni }; } }
  for(let ci=S.contours.length-1; ci>=0; ci--){ const c=S.contours[ci];
    if(c.kind==='circle'){ const d=hyp(c.cx-p[0], c.cy-p[1]); if(Math.abs(d-c.rad)<tol*0.7) return { t:'rim', c:ci }; continue; }
    for(let i=0;i<segCount(c);i++){ const q=segPts(c,i); for(let k=1;k<q.length;k++) if(distSeg(p,q[k-1],q[k])<tol*0.6) return { t:'seg', c:ci, seg:i }; } }
  // inside an outline: the smallest one
  let best=null; S.contours.forEach((c,ci)=>{ if(c.kind==='path' && !c.closed) return; const pts=flatten(c, 0.05); if(inside(p, pts)){ const a=Math.abs(area(pts)); if(!best||a<best.a) best={a, ci}; } });
  if(best) return { t:'body', c:best.ci };
  return null;
}

/* ---------------------------------------------------------------- pointer: draw, pick, drag, pan, pinch */
const pointers=new Map(); let pinch=null;
function bindPointer(){
  svg.addEventListener('pointerdown', e=>{
    e.preventDefault(); svg.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); svg.focus({preventScroll:true});
    if(pointers.size===2){ const [a,b]=[...pointers.values()]; pinch={ d:hyp(a[0]-b[0],a[1]-b[1]), mid:[(a[0]+b[0])/2,(a[1]+b[1])/2], k:view.k, cx:view.cx, cy:view.cy }; drag=null; preview=null; render(); return; }
    if(e.button===1 || e.altKey || spaceDown){ drag={ t:'pan', s:[e.clientX,e.clientY], v:{...view} }; return; }
    down(evW(e), e);
  });
  svg.addEventListener('pointermove', e=>{
    if(pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if(pinch && pointers.size>=2){ const [a,b]=[...pointers.values()], d=hyp(a[0]-b[0],a[1]-b[1]), mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      view.k=Math.max(1, Math.min(400, pinch.k*d/pinch.d)); view.cx=pinch.cx-(mid[0]-pinch.mid[0])/view.k; view.cy=pinch.cy+(mid[1]-pinch.mid[1])/view.k; render(); return; }
    if(drag?.t==='pan'){ view.cx=drag.v.cx-(e.clientX-drag.s[0])/view.k; view.cy=drag.v.cy+(e.clientY-drag.s[1])/view.k; render(); return; }
    move(evW(e), e);
  });
  const end = e => { pointers.delete(e.pointerId); if(pinch){ if(pointers.size<2) pinch=null; return; } if(drag?.t==='pan'){ drag=null; return; } up(evW(e), e); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', e=>{ pointers.delete(e.pointerId); pinch=null; drag=null; preview=null; render(); });
  svg.addEventListener('wheel', e=>{ e.preventDefault();
    if(e.ctrlKey || Math.abs(e.deltaY)>=40 && !e.deltaX){ const p=evW(e), f=Math.exp(-e.deltaY*(e.ctrlKey?0.01:0.0015)); view.k=Math.max(1, Math.min(400, view.k*f)); const q=evW(e); view.cx+=p[0]-q[0]; view.cy+=p[1]-q[1]; }
    else { view.cx+=e.deltaX/view.k; view.cy-=e.deltaY/view.k; }
    render(); }, { passive:false });
  svg.addEventListener('dblclick', e=>{ if(tool==='line'||tool==='curve'){ finishDrawing(); commit(); } else { const h=hit(evW(e)); if(h?.t==='mid' || h?.t==='seg'){ const c=S.contours[h.c]; if(c.b) delete c.b[h.seg]; const a=c.nodes[h.seg], b=c.nodes[(h.seg+1)%c.nodes.length]; delete a.ho; delete b.hi; commit(); } } });
}
let spaceDown=false;
function down(p, e){
  typed=''; const last = drawing ? S.contours[drawing.c].nodes.at(-1) : null;
  if(tool==='select'){
    const h=hit(p);
    if(!h){ sel=null; drag={ t:'pan', s:[e.clientX,e.clientY], v:{...view} }; render(); return; }
    if(h.t==='node'){ sel={c:h.c, n:h.n}; drag={ t:'node', ...h, start:p }; }
    else if(h.t==='handle'){ drag={ t:'handle', ...h }; }
    else if(h.t==='mid'){ sel={c:h.c, seg:h.seg}; drag={ t:'mid', ...h }; }
    else if(h.t==='seg'){ sel={c:h.c, seg:h.seg}; drag={ t:'body', c:h.c, start:p, orig:clone(S.contours[h.c]) }; }
    else if(h.t==='rim'){ sel={c:h.c}; drag={ t:'rim', c:h.c }; }
    else { sel={c:h.c}; drag={ t:'body', c:h.c, start:p, orig:clone(S.contours[h.c]) }; }
    render(); return;
  }
  const sp=snapPt(p, { from: last ? [last.x,last.y] : null });
  if(tool==='rect'||tool==='circle'){ drag={ t:tool, a:sp.p, b:sp.p }; preview={ snap:sp }; render(); return; }
  // line / curve: the corner goes where the finger lifts; a press-drag on the curve tool pulls handles
  drag={ t:tool, a:sp.p, b:sp.p, snap:sp }; preview={ p:sp.p, snap:sp }; render();
}
function move(p, e){
  const last = drawing ? S.contours[drawing.c].nodes.at(-1) : null;
  if(!drag){
    if(tool==='line'||tool==='curve'){ const sp=snapPt(p, { from:last?[last.x,last.y]:null }); preview={ p:sp.p, snap:sp }; render(); }
    else if(tool==='rect'||tool==='circle'){ preview={ snap:snapPt(p) }; render(); }
    else { const h=hit(p); const nh=h?`${h.t}:${h.c}:${h.n??h.seg??''}`:null; if(nh!==hover){ hover=nh; svg.style.cursor = h ? (h.t==='body'||h.t==='seg'?'move':'pointer') : 'grab'; } }
    return;
  }
  const c = drag.c!=null ? S.contours[drag.c] : null;
  if(drag.t==='node'){ const sp=snapPt(p, { skip:{c:drag.c, n:drag.n} }), n=c.nodes[drag.n], dx=sp.p[0]-n.x, dy=sp.p[1]-n.y;
    n.x=sp.p[0]; n.y=sp.p[1]; if(n.hi) n.hi=[n.hi[0]+dx, n.hi[1]+dy]; if(n.ho) n.ho=[n.ho[0]+dx, n.ho[1]+dy]; preview={ snap:sp }; }
  else if(drag.t==='handle'){ const n=c.nodes[drag.n], q=snapOn ? [Math.round(p[0]/grid)*grid, Math.round(p[1]/grid)*grid] : p; n[drag.h]=q;
    const o=drag.h==='hi'?'ho':'hi'; if(n.smooth && n[o]){ const L=hyp(n[o][0]-n.x, n[o][1]-n.y), d=[n.x-q[0], n.y-q[1]], l=hyp(...d)||1; n[o]=[n.x+d[0]/l*L, n.y+d[1]/l*L]; } }
  else if(drag.t==='mid'){ const a=c.nodes[drag.seg], b=c.nodes[(drag.seg+1)%c.nodes.length], d=[b.x-a.x, b.y-a.y], L=hyp(...d);
    if(L>1e-6){ const s=((p[0]-a.x)*-d[1]+(p[1]-a.y)*d[0])/L; c.b ||= {}; const bv=2*s/L; if(Math.abs(s)<4/view.k) delete c.b[drag.seg]; else c.b[drag.seg]=+Math.max(-6,Math.min(6,bv)).toFixed(5); } }
  else if(drag.t==='rim'){ c.rad=Math.max(grid, snapOn ? Math.round(hyp(p[0]-c.cx, p[1]-c.cy)/grid)*grid : hyp(p[0]-c.cx, p[1]-c.cy)); }
  else if(drag.t==='body'){ const o=drag.orig, ref = o.kind==='circle' ? [o.cx,o.cy] : [o.nodes[0].x, o.nodes[0].y];
    const want=[ref[0]+p[0]-drag.start[0], ref[1]+p[1]-drag.start[1]], sp=snapPt(want, { skip:{c:drag.c, n:o.kind==='circle'?-1:0} });
    let dx=sp.p[0]-ref[0], dy=sp.p[1]-ref[1]; if(o.kind==='circle' && sp.kind==='centre'){ /* fine */ }
    S.contours[drag.c]=mapAll([o], ([x,y])=>[x+dx, y+dy])[0]; preview={ snap:sp }; }
  else if(drag.t==='rect'||drag.t==='circle'){ const sp=snapPt(p); drag.b=sp.p; preview={ snap:sp }; }
  else if(drag.t==='line'){ const sp=snapPt(p, { from:last?[last.x,last.y]:null }); drag.b=sp.p; preview={ p:sp.p, snap:sp }; }
  else if(drag.t==='curve'){ drag.b=p; preview={ p:drag.a, snap:drag.snap, handle:p }; }
  render();
}
function up(p){
  const d=drag; drag=null;
  if(!d){ return; }
  if(d.t==='node'||d.t==='handle'||d.t==='mid'||d.t==='rim'||d.t==='body'){ preview=null; commit(); return; }
  if(d.t==='rect'){ const [a,b]=[d.a,d.b]; preview=null; if(Math.abs(a[0]-b[0])>grid/2 && Math.abs(a[1]-b[1])>grid/2){
      const x0=Math.min(a[0],b[0]), x1=Math.max(a[0],b[0]), y0=Math.min(a[1],b[1]), y1=Math.max(a[1],b[1]);
      S.contours.push({ id:newId(), kind:'path', closed:true, nodes:[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}], b:{}, cut:'pocket', depth:1, name:'' }); sel={c:S.contours.length-1}; commit(); } else render(); return; }
  if(d.t==='circle'){ const r=hyp(d.b[0]-d.a[0], d.b[1]-d.a[1]); preview=null; if(r>grid/2){ S.contours.push({ id:newId(), kind:'circle', cx:d.a[0], cy:d.a[1], rad:snapOn?Math.max(grid,Math.round(r/grid)*grid):r, cut:'pocket', depth:1, name:'' }); sel={c:S.contours.length-1}; commit(); } else render(); return; }
  if(d.t==='line' || d.t==='curve'){
    const at = d.t==='line' ? d.b : d.a, pulled = d.t==='curve' && hyp(d.b[0]-d.a[0], d.b[1]-d.a[1])>6/view.k;
    addPoint(at, pulled ? d.b : null, d.t==='line' ? preview?.snap : d.snap);
  }
}
/* the next corner of the outline being drawn (closing it on its first corner) */
function addPoint(at, handle, sp){
  if(!drawing){ S.contours.push({ id:newId(), kind:'path', closed:false, nodes:[], b:{}, cut:'pocket', depth:1, name:'' }); drawing={ c:S.contours.length-1 }; }
  const c=S.contours[drawing.c];
  if(c.nodes.length>=2 && hyp(at[0]-c.nodes[0].x, at[1]-c.nodes[0].y)<1e-6){ if(handle){ const f=c.nodes[0]; f.hi=[2*f.x-handle[0], 2*f.y-handle[1]]; f.ho=handle; f.smooth=true; } c.closed=true; sel={c:drawing.c}; drawing=null; preview=null; commit(); return; }
  const prev=c.nodes.at(-1); if(prev && hyp(at[0]-prev.x, at[1]-prev.y)<1e-6) { render(); return; }
  const n={ x:at[0], y:at[1] }; if(handle){ n.ho=handle; n.hi=[2*at[0]-handle[0], 2*at[1]-handle[1]]; n.smooth=true; }
  c.nodes.push(n); preview=null; HIST.track(); render();
}
function finishDrawing(){
  if(!drawing) return; const c=S.contours[drawing.c];
  if(c && c.nodes.length<2) S.contours.splice(drawing.c,1); else if(c) sel={c:drawing.c};
  drawing=null; preview=null;
}
/* ---------------------------------------------------------------- keys */
function bindKeys(){
  dlg.addEventListener('keydown', e=>{
    const inField=/INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    if(e.key===' ' && !inField){ spaceDown=true; e.preventDefault(); return; }
    if(inField) return;
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); if(e.shiftKey ? HIST.redo() : HIST.undo()) render(); return; }
    if(drawing && /^[0-9./-]$/.test(e.key)){ typed+=e.key; render(); return; }
    if(drawing && e.key==='Backspace'){ if(typed){ typed=typed.slice(0,-1); } else { const c=S.contours[drawing.c]; c.nodes.pop(); if(!c.nodes.length){ S.contours.splice(drawing.c,1); drawing=null; } } render(); e.preventDefault(); return; }
    if(e.key==='Enter'){ e.preventDefault(); if(drawing && typed){ placeTyped(); return; } finishDrawing(); commit(); return; }
    if(e.key==='Escape'){ e.preventDefault(); if(drawing){ finishDrawing(); commit(); } else if(sel){ sel=null; render(); } return; }
    if((e.key==='Delete'||e.key==='Backspace') && sel){ removeSel(); return; }
    const k={v:'select', l:'line', r:'rect', c:'circle', p:'curve'}[e.key.toLowerCase()]; if(k && !e.metaKey && !e.ctrlKey){ setTool(k); }
  });
  dlg.addEventListener('keyup', e=>{ if(e.key===' ') spaceDown=false; });
}
function parseIn(s){ s=String(s).trim(); const m=s.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/); if(!m || (!m[1] && !m[2])) return NaN; return (m[1]?+m[1]:0)+(m[2]?(+m[2])/(+m[3]):0); }
/* typed length while drawing: the next corner that far along the direction the cursor shows */
function placeTyped(){
  const L=parseIn(typed); typed=''; const c=S.contours[drawing.c], last=c.nodes.at(-1);
  if(!(L>0) || !last){ render(); return; }
  const to = preview?.p || [last.x+1, last.y], d=[to[0]-last.x, to[1]-last.y], l=hyp(...d)||1;
  addPoint([+(last.x+d[0]/l*L).toFixed(4), +(last.y+d[1]/l*L).toFixed(4)], null, null);
}
function removeSel(){
  const c=S.contours[sel.c]; if(!c) return;
  if(sel.n!=null && c.kind==='path' && c.nodes.length>(c.closed?3:2)){ c.nodes.splice(sel.n,1); const nb={}; Object.entries(c.b||{}).forEach(([k,v])=>{ k=+k; if(k<sel.n) nb[k]=v; else if(k>sel.n) nb[k-1]=v; }); c.b=nb; sel={c:sel.c}; }
  else { S.contours.splice(sel.c,1); sel=null; }
  commit();
}

/* ---------------------------------------------------------------- drawing it */
const pathD = (pts, closed) => pts.length ? 'M'+pts.map(p=>toS(p).map(v=>v.toFixed(1)).join(' ')).join('L')+(closed?'Z':'') : '';
function label(p, txt, cls='ss-m', dy=0){ const [x,y]=toS(p); return `<g class="${cls}" transform="translate(${x.toFixed(1)} ${(y+dy).toFixed(1)})"><rect x="${-txt.length*3.6-6}" y="-10" width="${txt.length*7.2+12}" height="19" rx="9"/><text y="4">${esc(txt)}</text></g>`; }
function segLabel(c, i, cls){ const n=c.nodes, a=n[i], b=n[(i+1)%n.length], t=segType(c,i), L=segLength(c,i), m=midHandle(c,i)||[(a.x+b.x)/2,(a.y+b.y)/2];
  let txt=fin(L); if(t==='arc'){ const A=bulgeArc([a.x,a.y],[b.x,b.y],c.b[i]); if(A) txt+=` · R ${fin(A.R)}`; } return label(m, txt, cls, -14); }
function grid_(){
  const [W,H]=size(); let g=''; const steps=[0.125,0.25,0.5,1,2,3,6,12,24,48]; const minor=steps.find(s=>s*view.k>=10)||48, major=minor<1?1:minor<=3?12:48;
  const [x0,y1]=toW(0,0), [x1,y0]=toW(W,H);
  for(let x=Math.floor(x0/minor)*minor; x<=x1; x+=minor){ const sx=toS([x,0])[0]; const mj=Math.abs(x/major-Math.round(x/major))<1e-6; g+=`<line x1="${sx.toFixed(1)}" y1="0" x2="${sx.toFixed(1)}" y2="${H}" class="${mj?'ss-gM':'ss-g'}${Math.abs(x)<1e-9?' ss-g0':''}"/>`; }
  for(let y=Math.floor(y0/minor)*minor; y<=y1; y+=minor){ const sy=toS([0,y])[1]; const mj=Math.abs(y/major-Math.round(y/major))<1e-6; g+=`<line x1="0" y1="${sy.toFixed(1)}" x2="${W}" y2="${sy.toFixed(1)}" class="${mj?'ss-gM':'ss-g'}${Math.abs(y)<1e-9?' ss-g0':''}"/>`; }
  return g;
}
function render(){
  if(!dlg?.open && !dlg) return;
  const tol=0.6/view.k; let g=grid_(), top='', tight=0;
  S.contours.forEach((c,ci)=>{
    const pts=flatten(c, tol), closed=c.kind==='circle'||c.closed, on=sel&&sel.c===ci;
    const cls = !closed ? 'ss-open' : c.cut==='thru' ? 'ss-thru' : 'ss-pk';
    const shade = closed && c.cut!=='thru' ? ` style="fill-opacity:${Math.min(0.85, 0.18+(+c.depth||0)*0.12).toFixed(2)}"` : '';
    g+=`<path d="${pathD(pts, closed)}" class="ss-c ${cls}${on?' on':''}"${shade}/>`;
    if(closed){
      // what the ¾″ bit really leaves, where it differs
      const tc = c.kind==='path' ? tightCorners(c) : []; tight+=tc.length;
      if(tc.length || (c.kind==='path' && c.nodes.some(n=>n.hi||n.ho))){ asCut(pts).forEach(q=>{ g+=`<path d="${pathD(q,true)}" class="ss-cut"/>`; }); }
      tc.forEach(i=>{ const n=c.nodes[i], [x,y]=toS([n.x,n.y]); top+=`<circle cx="${x}" cy="${y}" r="9" class="ss-tight"><title>Tighter than ⅜″: the ¾″ bit leaves a ⅜″ radius here</title></circle>`; });
      if(c.name || (on && closed)){ const B=bbox(pts); top+=label([(B.x0+B.x1)/2,(B.y0+B.y1)/2], `${c.name?c.name+' · ':''}${c.cut==='thru'?'through':fin(+c.depth||0)+' deep'}`, 'ss-m ss-name'); }
    }
    if(c.kind==='path'){
      c.nodes.forEach((n,ni)=>{ const [x,y]=toS([n.x,n.y]), pk=on&&sel.n===ni;
        if(n.r>0 && fillet(c,ni)){ top+=`<circle cx="${x}" cy="${y}" r="3" class="ss-rad"/>`; }
        top+=`<rect x="${x-5}" y="${y-5}" width="10" height="10" class="ss-node${pk?' on':''}${n.smooth?' smooth':''}"/>`; });
      if(on){
        for(let i=0;i<segCount(c);i++){ const m=midHandle(c,i); if(m){ const [x,y]=toS(m); top+=`<circle cx="${x}" cy="${y}" r="5.5" class="ss-mid"><title>Drag to bow this side into an arc</title></circle>`; } top+=segLabel(c,i,'ss-m ss-dim'); }
        if(sel.n!=null){ const n=c.nodes[sel.n]; ['hi','ho'].forEach(h=>{ if(n?.[h]){ const a=toS([n.x,n.y]), b=toS(n[h]); top+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="ss-hl"/><circle cx="${b[0]}" cy="${b[1]}" r="5" class="ss-hd"/>`; } }); }
      }
    } else if(on){ const [x,y]=toS([c.cx,c.cy]); top+=`<circle cx="${x}" cy="${y}" r="3" class="ss-node"/>`+label([c.cx, c.cy+c.rad], `⌀ ${fin(2*c.rad)}`, 'ss-m ss-dim', -14); }
  });
  // live measurements while drawing / dragging
  if(drag && (drag.t==='node')){ const c=S.contours[drag.c], N=c.nodes.length; [ (drag.n-1+N)%N, drag.n ].forEach(i=>{ if(i<segCount(c)) top+=segLabel(c,i,'ss-m ss-live'); }); }
  if(drag && (drag.t==='mid')){ top+=segLabel(S.contours[drag.c], drag.seg, 'ss-m ss-live'); }
  if(drag && drag.t==='rim'){ const c=S.contours[drag.c]; top+=label([c.cx, c.cy+c.rad], `⌀ ${fin(2*c.rad)}`, 'ss-m ss-live', -14); }
  if(drag && drag.t==='rect'){ const [a,b]=[drag.a,drag.b], q=[[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]]]; g+=`<path d="${pathD(q,true)}" class="ss-c ss-prev"/>`;
    top+=label([(a[0]+b[0])/2, Math.max(a[1],b[1])], `${fin(Math.abs(b[0]-a[0]))}`, 'ss-m ss-live', -14)+label([Math.max(a[0],b[0]), (a[1]+b[1])/2], `${fin(Math.abs(b[1]-a[1]))}`, 'ss-m ss-live'); }
  if(drag && drag.t==='circle'){ const r=hyp(drag.b[0]-drag.a[0], drag.b[1]-drag.a[1]); g+=`<path d="${pathD(flatten({kind:'circle',cx:drag.a[0],cy:drag.a[1],rad:r},tol),true)}" class="ss-c ss-prev"/>`;
    const [x,y]=toS(drag.a), [bx,by]=toS(drag.b); g+=`<line x1="${x}" y1="${y}" x2="${bx}" y2="${by}" class="ss-hl"/>`; top+=label(drag.b, `⌀ ${fin(2*r)}`, 'ss-m ss-live', -16); }
  if(drawing || ((tool==='line'||tool==='curve') && preview)){
    const c=drawing?S.contours[drawing.c]:null, last=c?.nodes.at(-1), p=preview?.p;
    if(last && p){ const tmp={kind:'path', nodes:[{...last, r:0, hi:undefined}, {x:p[0], y:p[1], hi: preview.handle ? [2*p[0]-preview.handle[0], 2*p[1]-preview.handle[1]] : undefined}], b:{}, closed:false};
      g+=`<path d="${pathD(flatten(tmp,tol),false)}" class="ss-c ss-prev"/>`;
      const L=hyp(p[0]-last.x, p[1]-last.y), ang=Math.round(Math.atan2(p[1]-last.y, p[0]-last.x)*180/Math.PI*10)/10;
      top+=label([(last.x+p[0])/2,(last.y+p[1])/2], typed ? `${typed}″ ⏎` : `${fin(L)} · ${ang}°`, 'ss-m ss-live', -14); }
    if(preview?.handle){ const a=toS(preview.p), b=toS(preview.handle); top+=`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="ss-hl"/><circle cx="${b[0]}" cy="${b[1]}" r="5" class="ss-hd"/>`; }
  }
  // snap marks and guides
  const sp=preview?.snap; if(sp){ const [x,y]=toS(sp.p);
    sp.guides.forEach(gd=>{ const o=toS(gd.from); g+=`<line x1="${o[0]}" y1="${o[1]}" x2="${x}" y2="${y}" class="ss-guide"/>`; });
    if(sp.kind && sp.kind!=='grid') top+=`<circle cx="${x}" cy="${y}" r="${sp.kind==='close'?10:7}" class="ss-snap ${sp.kind}"/>`;
    if(sp.kind==='close') top+=label(sp.p, 'close', 'ss-m ss-live', 20); }
  svg.innerHTML=g+top;
  // bars
  dlg.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.tool===tool));
  dlg.querySelector('#ssSnap').setAttribute('aria-pressed', snapOn);
  dlg.querySelector('#ssGrid').value=String(grid);
  const nm=dlg.querySelector('#ssName'); if(document.activeElement!==nm) nm.value=S.name||'';
  dlg.querySelector('#ssUndo').disabled=!HIST.canUndo; dlg.querySelector('#ssRedo').disabled=!HIST.canRedo;
  dlg.querySelector('#ssSave').textContent = origin ? 'Save' : 'Save to library'; dlg.querySelector('#ssSaveNew').hidden=!origin;
  const open=S.contours.filter(c=>c.kind==='path' && !c.closed).length - (drawing?1:0);
  const hint = { select:'Tap a corner, side or outline. Drag empty space to pan, pinch or scroll to zoom. Double-tap a side to straighten it.',
    line:drawing?'Tap the next corner, or type a length and press Enter. Tap the first corner to close it; Enter or double-tap ends it open.':'Tap where the outline starts.',
    rect:'Drag from corner to corner.', circle:'Drag from the centre out.', curve:'Tap for a sharp corner; press and drag for a smooth curve. Tap the first point to close.' }[tool];
  dlg.querySelector('.ss-status').innerHTML=`<span>${hint}</span>${tight?`<span class="ss-warn">${tight} inside corner${tight>1?'s':''} tighter than ⅜″: the ¾″ bit leaves ⅜″ round (dashed red)</span>`:''}${open>0?`<span class="ss-warn">${open} outline${open>1?'s are':' is'} open: only closed outlines are cut</span>`:''}`;
  inspector(); library();
}
/* ---------------------------------------------------------------- the inspector: what's picked, in inches */
function inspector(){
  const box=dlg.querySelector('.ss-insp'), c=sel && S.contours[sel.c];
  if(!c || drawing){ box.hidden=true; return; }
  box.hidden=false;
  const f=(id,label,v,extra='')=>`<label class="cw-f"><span>${label}</span><input data-sf="${id}" inputmode="decimal" value="${Math.round(v*1000)/1000}" ${extra}><i>″</i></label>`;
  const closed=c.kind==='circle'||c.closed;
  let h=`<div class="eyebrow">${c.kind==='circle'?'Circle':closed?'Outline':'Open line'}${sel.n!=null?` · corner ${sel.n+1}`:sel.seg!=null?` · side ${sel.seg+1}`:''}</div>`;
  if(sel.n!=null && c.kind==='path'){ const n=c.nodes[sel.n], fl=fillet(c, sel.n), can = !!fl || segType(c,(sel.n-1+c.nodes.length)%c.nodes.length)==='line' && segType(c,sel.n)==='line';
    h+=`<div class="cw-fs">${f('nx','X',n.x)}${f('ny','Y',n.y)}${can?f('nr','Corner radius',n.r||0):''}</div>
      ${!can?'<p class="note">A corner radius goes between two straight sides.</p>':fl && Math.abs(fl.R-(n.r||0))>0.001?`<p class="note">Room for ${fin(fl.R)} here.</p>`:''}
      <div class="row"><button class="btn ghost sm" data-sa="smooth">${n.hi||n.ho?'Make it sharp':'Make it a curve'}</button><button class="btn ghost sm" data-sa="delnode">Remove corner</button></div>`; }
  else if(sel.seg!=null && c.kind==='path'){ const t=segType(c, sel.seg);
    h+=`<div class="cw-fs">${t==='line'?f('sl','Length',segLength(c,sel.seg)):`<p class="note">${t==='arc'?'Arc':'Curve'} · ${fin(segLength(c,sel.seg))} long</p>`}</div>
      <div class="seg wrap"><button data-sa="straight" aria-pressed="${t==='line'}">Straight</button><button data-sa="arc" aria-pressed="${t==='arc'}">Arc</button><button data-sa="curveSeg" aria-pressed="${t==='curve'}">Curve</button></div>
      ${t==='arc'?`<div class="cw-fs">${f('sr','Radius', bulgeArc([c.nodes[sel.seg].x,c.nodes[sel.seg].y],[c.nodes[(sel.seg+1)%c.nodes.length].x,c.nodes[(sel.seg+1)%c.nodes.length].y],c.b[sel.seg])?.R||0)}</div>`:''}`; }
  else if(c.kind==='circle'){ h+=`<div class="cw-fs">${f('cd','Diameter',2*c.rad)}${f('cx','Centre X',c.cx)}${f('cy','Centre Y',c.cy)}</div>`; }
  else { const B=bboxAll([c]); h+=`<p class="note">${fin(B.w)} × ${fin(B.h)}</p>${!closed?'<div class="row"><button class="btn ghost sm" data-sa="close">Close it</button></div>':''}`; }
  if(closed){
    h+=`<div class="ss-region"><label class="cw-f"><span>Name (optional)</span><input data-sn value="${esc(c.name||'')}" placeholder="e.g. heat pump head"></label>
      <div class="seg"><button data-cut="thru" aria-pressed="${c.cut==='thru'}">Right through</button><button data-cut="pocket" aria-pressed="${c.cut!=='thru'}">Pocket</button></div>
      ${c.cut!=='thru'?`<div class="cw-fs">${f('depth','Depth',+c.depth||0)}</div><p class="note">Pocket depth from the face it's placed on. As deep as the panel = right through.</p>`:''}</div>`;
  }
  h+=`<div class="row"><button class="btn ghost sm" data-sa="dup">Duplicate</button><button class="btn ghost sm" data-sa="mir">Mirror</button><button class="btn ghost sm" data-sa="flip">Flip</button><button class="btn ghost sm" data-sa="del">Delete</button></div>`;
  box.innerHTML=h;
  box.querySelectorAll('[data-sf]').forEach(i=>i.onchange=()=>{ const v=parseIn(i.value); if(isFinite(v)) setVal(i.dataset.sf, v); else render(); });
  box.querySelectorAll('[data-sa]').forEach(b=>b.onclick=()=>act(b.dataset.sa));
  box.querySelectorAll('[data-cut]').forEach(b=>b.onclick=()=>{ c.cut=b.dataset.cut; if(c.cut!=='thru' && !(c.depth>0)) c.depth=1; commit(); });
  box.querySelector('[data-sn]')?.addEventListener('change', e=>{ c.name=e.target.value.trim(); commit(); });
}
function setVal(k, v){
  const c=S.contours[sel.c]; if(!c) return;
  if(k==='nx'||k==='ny'){ const n=c.nodes[sel.n], d = k==='nx' ? [v-n.x,0] : [0,v-n.y]; n.x+=d[0]; n.y+=d[1]; if(n.hi) n.hi=[n.hi[0]+d[0], n.hi[1]+d[1]]; if(n.ho) n.ho=[n.ho[0]+d[0], n.ho[1]+d[1]]; }
  else if(k==='nr'){ const n=c.nodes[sel.n]; if(v>0) n.r=v; else delete n.r; }
  else if(k==='sl'){ const a=c.nodes[sel.seg], j=(sel.seg+1)%c.nodes.length, b=c.nodes[j], d=[b.x-a.x, b.y-a.y], L=hyp(...d); if(L>1e-6 && v>0){ const nx=a.x+d[0]/L*v, ny=a.y+d[1]/L*v, dx=nx-b.x, dy=ny-b.y; b.x=nx; b.y=ny; if(b.hi) b.hi=[b.hi[0]+dx,b.hi[1]+dy]; if(b.ho) b.ho=[b.ho[0]+dx,b.ho[1]+dy]; } }
  else if(k==='sr'){ const a=c.nodes[sel.seg], b=c.nodes[(sel.seg+1)%c.nodes.length], ch=hyp(b.x-a.x,b.y-a.y); if(v>=ch/2){ const sg=Math.sign(c.b[sel.seg]||1), s=v-Math.sqrt(v*v-ch*ch/4); c.b[sel.seg]=sg*2*s/ch; } else toast(`The smallest arc across ${fin(ch)} has a ${fin(ch/2)} radius`); }
  else if(k==='cd'){ if(v>0) c.rad=v/2; } else if(k==='cx') c.cx=v; else if(k==='cy') c.cy=v;
  else if(k==='depth'){ c.depth=v; }
  commit();
}
function act(a){
  const c=S.contours[sel.c]; if(!c) return;
  if(a==='del'){ S.contours.splice(sel.c,1); sel=null; }
  else if(a==='delnode'){ removeSel(); return; }
  else if(a==='dup'){ const d=mapAll([clone(c)], ([x,y])=>[x+grid*8, y-grid*8])[0]; d.id=newId(); S.contours.push(d); sel={c:S.contours.length-1}; }
  else if(a==='mir'||a==='flip'){ S.contours[sel.c]=mirrorAll([c], a==='mir', a==='flip')[0]; }
  else if(a==='close'){ c.closed=true; }
  else if(a==='smooth'){ const n=c.nodes[sel.n], N=c.nodes.length;
    if(n.hi||n.ho){ delete n.hi; delete n.ho; delete n.smooth; }
    else { const p=c.nodes[(sel.n-1+N)%N], q=c.nodes[(sel.n+1)%N], d=[q.x-p.x, q.y-p.y], L=hyp(...d)||1, k=Math.min(hyp(n.x-p.x,n.y-p.y), hyp(q.x-n.x,q.y-n.y))/3;
      n.hi=[n.x-d[0]/L*k, n.y-d[1]/L*k]; n.ho=[n.x+d[0]/L*k, n.y+d[1]/L*k]; n.smooth=true; delete n.r; } }
  else if(a==='straight'||a==='arc'||a==='curveSeg'){ const i=sel.seg, a0=c.nodes[i], b0=c.nodes[(i+1)%c.nodes.length]; c.b ||= {}; delete c.b[i]; delete a0.ho; delete b0.hi;
    if(a==='arc') c.b[i]=0.4142;   // a quarter circle to start
    if(a==='curveSeg'){ const d=[b0.x-a0.x, b0.y-a0.y]; a0.ho=[a0.x+d[0]/3-d[1]/4, a0.y+d[1]/3+d[0]/4]; b0.hi=[a0.x+2*d[0]/3-d[1]/4, a0.y+2*d[1]/3+d[0]/4]; } }
  commit();
}
/* ---------------------------------------------------------------- the library: open, delete */
function library(){
  const box=dlg.querySelector('.ss-lib'); box.hidden=!libOpen; if(!libOpen) return;
  const thumb=s=>{ const B=bboxAll(s.contours), k=56/Math.max(B.w,B.h,1); return `<svg viewBox="-2 -2 60 60" width="60" height="60">${s.contours.map(c=>{ const pts=flatten(c,0.05); const closed=c.kind==='circle'||c.closed; return `<path d="${'M'+pts.map(([x,y])=>`${((x-B.x0)*k).toFixed(1)} ${(56-(y-B.y0)*k).toFixed(1)}`).join('L')}${closed?'Z':''}" class="${c.cut==='thru'?'ss-thru':'ss-pk'}"/>`; }).join('')}</svg>`; };
  box.innerHTML=`<div class="eyebrow">Shape library · ${SHAPELIB.length}${sharedShapes()?' · shared':' · this browser'}</div>
    <button class="btn ghost sm" data-ln>＋ New drawing</button>
    <div class="ss-libl">${SHAPELIB.map(s=>`<div class="ss-li"><button class="ss-lo" data-lo="${esc(s.id)}">${thumb(s)}<span><b>${esc(s.name)}</b><small>${esc(s.id)} · ${fin(s.w||0)} × ${fin(s.h||0)}</small></span></button>${canSave()?`<button class="linkbtn" data-ld="${esc(s.id)}">Delete</button>`:''}</div>`).join('') || '<p class="note">Nothing saved yet.</p>'}</div>`;
  box.querySelector('[data-ln]').onclick=()=>openShapeStudio({});
  box.querySelectorAll('[data-lo]').forEach(b=>b.onclick=()=>openShapeStudio({ id:b.dataset.lo }));
  box.querySelectorAll('[data-ld]').forEach(b=>b.onclick=async()=>{ if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Tap again to delete'; return; }
    try{ await deleteShape(b.dataset.ld); if(origin===b.dataset.ld) origin=null; render(); toast('Deleted from the shape library'); }catch(e){ toast(`Couldn't delete: ${e.message||e}`); } });
}
async function save(asNew){
  finishDrawing();
  if(!canSave()){ toast('Viewers can look but not save.'); return; }
  const name=(S.name||'').trim(); if(!name){ toast('Give the shape a name first'); dlg.querySelector('#ssName').focus(); return; }
  const cut=S.contours.filter(c=>c.kind==='circle'||c.closed); if(!cut.length){ toast('Nothing to cut yet: close an outline or draw a circle'); return; }
  const shape={ id: (!asNew && origin) ? origin : nextShapeId(), name, contours:S.contours.filter(c=>!(c.kind==='path' && c.nodes.length<2)) };
  try{ const { shape:s, shared }=await saveShape(shape); origin=s.id; S.id=s.id; HIST.track(); render();
    toast(`${s.id} “${s.name}” saved to the shape library${shared?' (for the whole team)':' (in this browser)'}. Place it from the wall or floor / ceiling / roof builder: Add shape.`); }
  catch(e){ toast(`Couldn't save: ${e.message||e}`); }
}
/* ⋯ menu → Shape studio */
{ const pop=document.getElementById('morePop');
  if(pop && !document.getElementById('bShapeS')){ const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.id='bShapeS'; b.textContent='Shape studio (draw)';
    pop.insertBefore(b, document.getElementById('bUpload')); b.onclick=()=>{ pop.hidden=true; openShapeStudio(); }; } }
export { openShapeStudio };
