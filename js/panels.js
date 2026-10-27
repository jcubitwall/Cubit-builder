/* Cubit Builder — panels.js */
import { FT, H, PW, NOTCH } from './config.js';
import { expandWallShapes, expandLayerShapes } from './shapes.js';

/* ============================================================ panel geometry (shared by 3D + 2D) */
/* Walls are measured in inches from the LEFT END SEEN FROM OUTSIDE (x = 0) to L.
   Panels: 4′ × 8′ SIPs. Full panels start at panel 1 — the left end seen from INSIDE, which is the
   RIGHT end seen from outside — and the last panel (leftmost from outside) is cut to fit. */
const wallLen = w => w.L ?? w.len*FT;
const panelCount = w => Math.max(1, Math.ceil(wallLen(w)/PW - 1e-6));
function panelSpans(w){
  const L=wallLen(w), n=panelCount(w);
  return [...Array(n)].map((_,k)=>{ const j=n-k; return [Math.max(0, L-j*PW), L-(j-1)*PW]; });   // k = 0 is the leftmost from outside
}
function panelAt(w, x){
  const sp=panelSpans(w); const k=sp.findIndex(([a,b])=>x>=a-1e-6 && x<b-1e-6);
  return k>=0 ? k : (x<=0 ? 0 : sp.length-1);
}
/* The wall as built in its slot. Short end walls run straight through, corner to corner; long walls butt
   between them, so they lose the end walls' thickness at each pod corner (slot.trim = [left, right] in
   inches, seen from outside). Wall data is stored edge-to-edge; this shifts and clips it to the real wall. */
function bodyWall(slot, w){
  if(!w || w.fitted) return w;
  const tl=slot?.trim?.[0]||0, tr=slot?.trim?.[1]||0, full=w.len*FT, L=full-tl-tr;
  // shapes from the Shape studio become ordinary cuts first (exact outlines with their tool paths)
  if(w.shapes?.length){ const X=expandWallShapes(w); w={ ...w, openings:[...(w.openings||[]), ...X.openings], inside:[...(w.inside||[]), ...X.inside], outside:[...(w.outside||[]), ...X.outside] }; }
  const clip = o => {
    if(isShaped(o)){   // exact shapes move, they're never squared off
      const x0=o.x-tl; if(x0+o.w<=0 || x0>=L) return null;
      return {...mapX(o, x=>x-tl), x:x0}; }
    const x0=Math.max(0,o.x-tl), x1=Math.min(L,o.x+o.w-tl); return x1-x0>0.5 ? {...o, x:x0, w:x1-x0} : null; };
  // the end walls run to the pod corners, where a 1¾″ × 1¾″ notch for the steel spine comes out of the outside face
  const notch = slot && slot.short && slot.corner ? [slot.corner[0]?NOTCH:0, slot.corner[1]?NOTCH:0] : [0,0];
  return { ...w, L, trim:[tl,tr], notch, fitted:true,
    openings: w.openings.map(o=>clip({...o, key:o.key ?? `${o.kind}@${Math.round(o.x)}`})).filter(Boolean),
    inside: (w.inside||[]).map(b=>({...mapX(b, x=>x-tr), x:b.x-tr})).filter(b=>b.x>0 && b.x<L),     // inside items are measured from the inside-left = outside-right end
    outside: (w.outside||[]).map(b=>({...mapX(b, x=>x-tl), x:b.x-tl})).filter(b=>b.x>0 && b.x<L) };
}
/* Cuts exactly as drawn in the STEP file — round holes, chase slots and any other outline ('poly': its `path`,
   plus `tool`, the ¾″ bit's centre paths) — never squared off. Their outline in inches (wall or layer coords). */
const isShaped = o => o.shape==='round' || o.shape==='slot' || o.shape==='poly';
function shapeOf(o){   // {circle:[cx,cy,r]} · {slot:[[x,y],[x,y]], r} · {poly:[[x,y],…]}
  if(o.shape==='round'){ const d=o.d||o.dia||o.w; return { circle:[o.x+o.w/2, (o.y??o.z)+(o.h??o.d)/2, d/2] }; }
  if(o.shape==='slot') return { slot:o.ends, r:(o.sw||0.75)/2 };
  if(o.shape==='poly') return { poly:o.path };
  const y=o.y??o.z, h=o.h??o.d;   // a plain rectangle
  return { poly:[[o.x,y],[o.x+o.w,y],[o.x+o.w,y+h],[o.x,y+h],[o.x,y]] };
}
/* closed outline points (inches) of a shape */
function outlinePts(S, seg=40){
  const P=[];
  if(S.poly){ const Q=S.poly.map(p=>[p[0],p[1]]); const a=Q[0], b=Q[Q.length-1]; if(a[0]!==b[0]||a[1]!==b[1]) Q.push([a[0],a[1]]); return Q; }
  if(S.circle){ const [cx,cy,r]=S.circle; for(let i=0;i<=seg;i++){ const a=i/seg*Math.PI*2; P.push([cx+r*Math.cos(a), cy+r*Math.sin(a)]); } return P; }
  const [[x1,y1],[x2,y2]]=S.slot, r=S.r, ang=Math.atan2(y2-y1,x2-x1), n=seg/2;
  for(let i=0;i<=n;i++){ const a=ang+Math.PI/2+i/n*Math.PI; P.push([x1+r*Math.cos(a), y1+r*Math.sin(a)]); }
  for(let i=0;i<=n;i++){ const a=ang-Math.PI/2+i/n*Math.PI; P.push([x2+r*Math.cos(a), y2+r*Math.sin(a)]); }
  P.push(P[0]); return P;
}
/* moves (or mirrors) the drawn points of an item along the wall: f maps x → x (its own x is set by the caller) */
function mapX(o, f){
  const m=P=>P.map(([x,y])=>[+f(x).toFixed(4),y]);
  return {...o, ...(o.ends?{ends:m(o.ends)}:{}), ...(o.path?{path:m(o.path)}:{}), ...(o.islands?{islands:o.islands.map(m)}:{}), ...(o.tool?{tool:o.tool.map(m)}:{})};
}
/* a face item (box, pocket, round recess, chase…) as an outline in face coords; toX maps its x to the face's x.
   Items are placed by their centre. null = an old-style marker with no drawn size (plug/switch symbol). */
function faceShape(b, toX){
  if(b.shape==='round') return outlinePts({circle:[toX(b.x), b.y, (b.d||b.dia)/2]});
  if(b.shape==='slot') return outlinePts({slot:b.ends.map(([x,y])=>[toX(x),y]), r:(b.sw||0.75)/2});
  if(b.shape==='poly') return outlinePts({poly:b.path.map(([x,y])=>[toX(x),y])});
  if(b.w && b.h){ const x=toX(b.x), a=b.w/2, c=b.h/2; return [[x-a,b.y-c],[x+a,b.y-c],[x+a,b.y+c],[x-a,b.y+c],[x-a,b.y-c]]; }
  return null;
}
/* A round hole / slot that runs over a panel joint is cut exactly on both panels: each panel gets its part of the
   curve as a notch in its edge, never a square. clipStrip keeps the part of a closed outline between x=a and x=b. */
const crossesJoint = o => (o.shape==='round' || o.shape==='slot' || o.shape==='poly');
function clipStrip(P, a, b){
  const clip=(pts, inside, cut)=>{ const out=[]; for(let i=0;i<pts.length;i++){ const p=pts[i], q=pts[(i+1)%pts.length], pi=inside(p), qi=inside(q);
      if(pi) out.push(p); if(pi!==qi) out.push(cut(p,q)); } return out; };
  const atX = X => (p,q)=>{ const t=(X-p[0])/(q[0]-p[0]); return [X, p[1]+t*(q[1]-p[1])]; };
  let Q=P.slice(0,-1); Q=clip(Q, p=>p[0]>=a, atX(a)); if(Q.length) Q=clip(Q, p=>p[0]<=b, atX(b)); return Q;
}
/* the outline of a panel piece a..b × y0..y1 with the parts of joint-crossing shapes taken out of its side edges.
   null when a shape can't be notched this way (it reaches across the whole piece, or past its top or bottom). */
function notchedOutline(a, b, y0, y1, shapes){
  const E=1e-6, L=[], R=[];
  for(const S of shapes){
    const C=clipStrip(outlinePts(S, 96), a, b); if(C.length<3) continue;
    const onL=p=>Math.abs(p[0]-a)<E, onR=p=>Math.abs(p[0]-b)<E;
    const l=C.filter(onL).length>=2, r=C.filter(onR).length>=2;
    if(l && r) return null; if(!l && !r) continue;
    if(C.some(p=>p[1]<y0-E || p[1]>y1+E)) return null;
    const on = l ? onL : onR, n=C.length, i0=C.findIndex((p,i)=>on(p) && !on(C[(i+1)%n])); if(i0<0) continue;
    let chain=[], j=(i0+1)%n; while(!on(C[j])){ chain.push(C[j]); j=(j+1)%n; }
    let e0=C[i0], e1=C[j];
    if(l ? e0[1]<e1[1] : e0[1]>e1[1]){ chain.reverse(); [e0,e1]=[e1,e0]; }   // left: top → bottom · right: bottom → top
    (l?L:R).push({ e0, e1, chain });
  }
  if(!L.length && !R.length) return false;
  const out=[[a,y0],[b,y0]];
  R.sort((p,q)=>p.e0[1]-q.e0[1]).forEach(d=>out.push(d.e0, ...d.chain, d.e1));
  out.push([b,y1],[a,y1]);
  L.sort((p,q)=>q.e0[1]-p.e0[1]).forEach(d=>out.push(d.e0, ...d.chain, d.e1));
  return out;
}
function panelCells(w, k){
  const [X0,X1]=panelSpans(w)[k], xs=new Set([X0,X1]), ys=new Set([0,H]);
  // round holes and slots inside one panel are cut out of the cell exactly (scene3d); the rest split the cells
  const ops = w.openings.filter(o=>o.x<X1 && o.x+o.w>X0 && !(isShaped(o) && o.x>=X0 && o.x+o.w<=X1) && !crossesJoint(o));
  ops.forEach(o=>{ xs.add(Math.max(X0,o.x)); xs.add(Math.min(X1,o.x+o.w)); ys.add(o.y); ys.add(Math.min(H,o.y+o.h)); });
  const X=[...xs].sort((a,b)=>a-b), Y=[...ys].sort((a,b)=>a-b), out=[];
  for(let i=0;i<X.length-1;i++){
    let run=null;
    for(let j=0;j<Y.length-1;j++){
      const cx=(X[i]+X[i+1])/2, cy=(Y[j]+Y[j+1])/2;
      const hole = ops.some(o=>cx>o.x&&cx<o.x+o.w&&cy>o.y&&cy<o.y+o.h);
      if(!hole){ if(run) run[3]=Y[j+1]; else run=[X[i],X[i+1],Y[j],Y[j+1]]; }
      else if(run){ out.push(run); run=null; }
    }
    if(run) out.push(run);
  }
  return out;
}
// physical panel number for the k-th panel counted from the exterior-left end.
// Default order: panel 1 is the left end when you face the INTERIOR side.
const panelNum = (n,k,rev) => rev ? k+1 : n-k;

/* ============================================================ thumbnails (exterior elevation) */
function thumbSVG(w){
  const L=wallLen(w), s=150/Math.max(L,96*1.6), Wd=L*s, Hd=H*s;
  let g=`<svg viewBox="-2 -2 ${Wd+4} ${Hd+4}" aria-hidden="true"><rect x="0" y="0" width="${Wd}" height="${Hd}" fill="#e8d3ad" stroke="#5b4a33" stroke-width=".8"/>`;
  panelSpans(w).slice(1).forEach(([a])=>{ g+=`<line x1="${a*s}" y1="0" x2="${a*s}" y2="${Hd}" stroke="#5b4a33" stroke-width=".4" stroke-dasharray="2 2"/>`; });
  const X=w.shapes?.length ? expandWallShapes(w) : {openings:[], outside:[], inside:[]};
  const fill=o=>o.kind==='window'?'#8fc3ea':o.kind==='patio'?'#a9d4f2':o.kind==='opening'||o.kind==='shape'?'#ffffff':o.kind==='vent'?'#555':'#6b4a2f';
  const path=(P,cls)=>`<path d="M${P.map(([x,y])=>`${(x*s).toFixed(2)} ${((H-y)*s).toFixed(2)}`).join('L')}Z" ${cls}/>`;
  // openings exactly as drawn: round windows round, drawn shapes their own outline (islands left standing)
  [...w.openings, ...X.openings].forEach(o=>{ const st=`fill="${fill(o)}" stroke="#2c2c2c" stroke-width=".6"`;
    if(isShaped(o)){ const P=outlinePts(shapeOf(o)); g+= o.islands?.length ? `<path d="${[P,...o.islands].map(Q=>'M'+Q.map(([x,y])=>`${(x*s).toFixed(2)} ${((H-y)*s).toFixed(2)}`).join('L')+'Z').join(' ')}" fill-rule="evenodd" ${st}/>` : path(P, st); }
    else g+=`<rect x="${o.x*s}" y="${(H-o.y-o.h)*s}" width="${o.w*s}" height="${o.h*s}" ${st}/>`; });
  // boxes and pockets on the outside face (as seen in the drawing, from outside), lighter for the inside face
  [[[...(w.outside||[]), ...X.outside], x=>x, '#3b3f42'], [[...(w.inside||[]), ...X.inside], x=>L-x, 'none']].forEach(([items, toX, col])=>items.forEach(b=>{
    const P=faceShape(b, toX); if(!P) return; g+=path(P, `fill="${col}" stroke="#3b3f42" stroke-width=".4" ${col==='none'?'stroke-dasharray="1.5 1"':''}`); }));
  return g+'</svg>';
}

/* a floor / ceiling layer's holes plus the four corner spine notches (unless the scan already has one there) */
function layerHoles(L){
  const len=L.len*FT, wid=96, n=NOTCH, holes=(L.holes||[]).concat(L.shapes?.length ? expandLayerShapes(L) : []);
  [[0,0],[len-n,0],[0,wid-n],[len-n,wid-n]].forEach(([x,z])=>{
    const cx=x+n/2, cz=z+n/2;
    if(!holes.some(h=>cx>h.x-0.01 && cx<h.x+h.w+0.01 && cz>h.z-0.01 && cz<h.z+h.d+0.01)) holes.push({x,z,w:n,d:n,notch:true});
  });
  return holes;
}
/* made by hand, not by the CNC: marked so (hand), or too small for the ¾″ bit ('auto') */
function handOf(f){
  if(f.hand) return 'mark';
  if(f.light) return null;
  const bit=0.749;
  if(f.shape==='poly' && Array.isArray(f.tool) && !f.tool.length) return 'auto';
  if(f.shape==='round' && (f.d||f.dia||f.w) < bit) return 'auto';
  if(f.shape==='slot' && (f.sw||0.75) < bit) return 'auto';
  if((!f.shape || f.shape==='rect') && f.w && (f.h??f.d) && Math.min(f.w, f.h??f.d) < bit) return 'auto';
  return null;
}
export { crossesJoint, clipStrip, notchedOutline, handOf, isShaped, shapeOf, outlinePts, mapX, faceShape, layerHoles, panelCells, panelCount, panelNum, thumbSVG, wallLen, panelSpans, panelAt, bodyWall };
