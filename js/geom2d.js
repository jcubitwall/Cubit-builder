/* Cubit Builder — geom2d.js : the geometry behind the Shape studio and the cuts it makes. Inches, y up.

   A drawing is a list of contours:
     { kind:'path', nodes:[{ x, y, r?, hi?:[x,y], ho?:[x,y] }], b:{ i: bulge }, closed }
        segment i runs from node i to node i+1 (and the last back to the first when closed):
          · a curve (cubic Bézier) when node i has a handle out (ho) or node i+1 a handle in (hi)
          · an arc when b[i] is set: the bulge = 2 × sagitta / chord, + bulging to the LEFT of the way it runs
          · otherwise a straight line
        r on a node = corner radius, a true arc between two straight segments (cut as an arc)
     { kind:'circle', cx, cy, rad }
   plus what it cuts: cut 'thru' | 'pocket', depth, and a name.
   The ¾″ bit (R = ⅜″) can't make an inside corner tighter than ⅜″: asCut() shows what it really leaves and
   tightCorners() lists the corners. toolRings() works out the bit's paths (Clipper offsets, js/vendor/clipper.js);
   fitArcs() turns runs of points along a circle back into G2/G3 arcs for the G-code. */
const R_BIT = 0.375, STEP = 0.3, SCALE = 10000;
const CL = () => globalThis.ClipperLib;
const hyp = (x,y) => Math.hypot(x,y);
const sub = (a,b) => [a[0]-b[0], a[1]-b[1]];
const norm = v => { const l=hyp(v[0],v[1])||1; return [v[0]/l, v[1]/l]; };
const P = n => [n.x, n.y];

/* ---------------------------------------------------------------- segments and flattening */
function segCount(c){ return c.kind==='circle' ? 1 : c.closed ? c.nodes.length : c.nodes.length-1; }
function segType(c, i){ const n=c.nodes, a=n[i], b=n[(i+1)%n.length]; if(a.ho || b.hi) return 'curve'; if(c.b && c.b[i]) return 'arc'; return 'line'; }
function arcPts(cx, cy, R, a0, sweep, tol, out){
  const st = R>tol ? 2*Math.acos(Math.max(-1, 1-tol/R)) : 0.5, n=Math.max(2, Math.ceil(Math.abs(sweep)/Math.max(st,0.01)));
  for(let k=1;k<=n;k++){ const a=a0+sweep*k/n; out.push([cx+R*Math.cos(a), cy+R*Math.sin(a)]); }
}
/* an arc from p0 to p1 with bulge b: { cx, cy, R, a0, sweep } (sweep + = counter-clockwise) */
function bulgeArc(p0, p1, b){
  const d=sub(p1,p0), c=hyp(d[0],d[1]); if(c<1e-9 || !b) return null;
  const nL=[-d[1]/c, d[0]/c], s=Math.abs(b)*c/2, th=4*Math.atan(Math.abs(b)), R=c/(2*Math.sin(th/2)), sg=Math.sign(b);
  const m=[(p0[0]+p1[0])/2, (p0[1]+p1[1])/2], cx=m[0]+nL[0]*sg*(s-R), cy=m[1]+nL[1]*sg*(s-R);
  const a0=Math.atan2(p0[1]-cy, p0[0]-cx);
  // bulging left of p0→p1 = turning clockwise around the centre? left bulge: centre is to the right, so the arc runs clockwise
  const sweep = -sg*th;
  return { cx, cy, R, a0, sweep };
}
/* the corner-radius fillet at node i, when both its segments are straight: { A, B, cx, cy, R, a0, sweep } */
function fillet(c, i){
  const n=c.nodes, N=n.length, node=n[i]; if(!(node.r>0) || c.kind!=='path') return null;
  if(!c.closed && (i===0 || i===N-1)) return null;
  const ip=(i-1+N)%N, inx=(i+1)%N;
  if(segType(c, ip)!=='line' || segType(c, i)!=='line') return null;
  const p=P(n[ip]), q=P(node), r=P(n[inx]);
  const l1=hyp(...sub(q,p)), l2=hyp(...sub(r,q)); if(l1<1e-6||l2<1e-6) return null;
  const u1=norm(sub(q,p)), u2=norm(sub(r,q));
  const cosPhi=-(u1[0]*u2[0]+u1[1]*u2[1]), phi=Math.acos(Math.max(-1,Math.min(1,cosPhi)));   // the angle at the corner
  if(phi>Math.PI-1e-4 || phi<1e-4) return null;
  // the neighbours' own fillets take their share of each side
  let t=node.r/Math.tan(phi/2); const lim1=l1*(n[ip].r>0?0.5:1), lim2=l2*(n[inx].r>0?0.5:1); t=Math.min(t, lim1, lim2);
  const R=t*Math.tan(phi/2), A=[q[0]-u1[0]*t, q[1]-u1[1]*t], B=[q[0]+u2[0]*t, q[1]+u2[1]*t];
  const bis=norm([-u1[0]+u2[0], -u1[1]+u2[1]]), dc=R/Math.sin(phi/2), cx=q[0]+bis[0]*dc, cy=q[1]+bis[1]*dc;
  const a0=Math.atan2(A[1]-cy, A[0]-cx), a1=Math.atan2(B[1]-cy, B[0]-cx);
  const turn=u1[0]*u2[1]-u1[1]*u2[0];   // + = turning left = counter-clockwise
  let sw=a1-a0; if(turn>0){ while(sw<0) sw+=2*Math.PI; } else { while(sw>0) sw-=2*Math.PI; }
  return { A, B, cx, cy, R, a0, sweep:sw, t };
}
/* the contour as points (closed: the first point isn't repeated) */
function flatten(c, tol=0.01){
  if(c.kind==='circle'){ const out=[]; arcPts(c.cx, c.cy, c.rad, 0, 2*Math.PI, tol, out); out.pop(); return out; }
  const n=c.nodes, N=n.length; if(N<2) return n.map(P);
  const F=n.map((_,i)=>fillet(c,i)), out=[];
  const start = i => F[i] ? F[i].B : P(n[i]), end = i => F[i] ? F[i].A : P(n[i]);
  if(!c.closed || !F[0]) out.push(start(0)); else out.push(F[0].B);
  const S=segCount(c);
  for(let i=0;i<S;i++){
    const j=(i+1)%N, p0=start(i), p1=end(j), t=segType(c,i);
    if(t==='line') out.push(p1);
    else if(t==='arc'){ const A=bulgeArc(p0,p1,c.b[i]); if(A) arcPts(A.cx,A.cy,A.R,A.a0,A.sweep,tol,out); else out.push(p1); }
    else { const c1=n[i].ho||p0, c2=n[j].hi||p1, len=hyp(...sub(c1,p0))+hyp(...sub(c2,c1))+hyp(...sub(p1,c2)), k=Math.max(4, Math.min(200, Math.ceil(len/Math.max(tol*20,0.05))));
      for(let s=1;s<=k;s++){ const u=s/k, v=1-u; out.push([v*v*v*p0[0]+3*v*v*u*c1[0]+3*v*u*u*c2[0]+u*u*u*p1[0], v*v*v*p0[1]+3*v*v*u*c1[1]+3*v*u*u*c2[1]+u*u*u*p1[1]]); } }
    if(F[j] && (c.closed || j<N-1)){ const f=F[j]; arcPts(f.cx,f.cy,f.R,f.a0,f.sweep,tol,out); }
  }
  if(c.closed){ const a=out[0], z=out[out.length-1]; if(hyp(a[0]-z[0],a[1]-z[1])<1e-7) out.pop(); }
  return out;
}
const area = pts => { let s=0; for(let i=0;i<pts.length;i++){ const a=pts[i], b=pts[(i+1)%pts.length]; s+=a[0]*b[1]-b[0]*a[1]; } return s/2; };
function bbox(pts){ let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; pts.forEach(([x,y])=>{ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }); return {x0,y0,x1,y1,w:x1-x0,h:y1-y0}; }
function bboxAll(cs){ const pts=cs.flatMap(c=>flatten(c,0.02)); return pts.length ? bbox(pts) : {x0:0,y0:0,x1:0,y1:0,w:0,h:0}; }
/* length of segment i (as drawn, before corner radii) */
function segLength(c, i){ const n=c.nodes, N=n.length, p0=P(n[i]), p1=P(n[(i+1)%N]), t=segType(c,i);
  if(t==='line') return hyp(...sub(p1,p0));
  if(t==='arc'){ const A=bulgeArc(p0,p1,c.b[i]); return A ? Math.abs(A.sweep)*A.R : hyp(...sub(p1,p0)); }
  const pts=flatten({kind:'path', nodes:[{...n[i], hi:undefined, r:0},{...n[(i+1)%N], ho:undefined, r:0}], closed:false}, 0.005);
  let s=0; for(let k=1;k<pts.length;k++) s+=hyp(...sub(pts[k],pts[k-1])); return s; }

/* ---------------------------------------------------------------- Clipper: offsets and booleans */
const toCl = pts => pts.map(([x,y])=>({X:Math.round(x*SCALE), Y:Math.round(y*SCALE)}));
const fromCl = path => path.map(p=>[p.X/SCALE, p.Y/SCALE]);
function offset(paths, delta, round=true){
  const C=CL(); if(!C) return [];
  const co=new C.ClipperOffset(2, 0.002*SCALE); co.AddPaths(paths.map(toCl), round?C.JoinType.jtRound:C.JoinType.jtMiter, C.EndType.etClosedPolygon);
  const out=new C.Paths(); co.Execute(out, delta*SCALE); return out.map(fromCl).filter(p=>p.length>2);
}
function bool(subj, clip, op){
  const C=CL(); if(!C) return subj;
  const c=new C.Clipper(); c.AddPaths(subj.map(toCl), C.PolyType.ptSubject, true); c.AddPaths(clip.map(toCl), C.PolyType.ptClip, true);
  const out=new C.Paths(); c.Execute({ union:C.ClipType.ctUnion, diff:C.ClipType.ctDifference, inter:C.ClipType.ctIntersection }[op], out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return out.map(fromCl).filter(p=>p.length>2);
}
/* booleans keeping holes apart: [{ outer, holes:[…] }] (for 3D shapes) */
function boolTree(subj, clip, op){
  const C=CL(); if(!C) return subj.map(o=>({outer:o, holes:[]}));
  const c=new C.Clipper(); c.AddPaths(subj.map(toCl), C.PolyType.ptSubject, true); if(clip.length) c.AddPaths(clip.map(toCl), C.PolyType.ptClip, true);
  const tree=new C.PolyTree(); c.Execute({ union:C.ClipType.ctUnion, diff:C.ClipType.ctDifference, inter:C.ClipType.ctIntersection }[op], tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return C.JS.PolyTreeToExPolygons(tree).map(e=>({ outer:e.outer.map(p=>[p.X/SCALE,p.Y/SCALE]), holes:e.holes.map(h=>h.map(p=>[p.X/SCALE,p.Y/SCALE])) }));
}
/* what the ¾″ bit really leaves of a pocket / hole outline (inside corners rounded to ⅜″) */
const asCut = (pts, R=R_BIT) => offset(offset([pts], -R), R);
/* the bit's paths, tool centres: a through cut = the loops ⅜″ inside the outline; a pocket = rings from the middle
   out, 0.3″ apart, the last one ⅜″ inside the outline (the finish pass). Holes run clockwise, pockets climb. */
function toolRings(outline, thru, R=R_BIT, step=STEP){
  const first=offset([outline], -R); if(!first.length) return [];
  const cw = p => area(p)<0 ? p : p.slice().reverse(), ccw = p => area(p)>0 ? p : p.slice().reverse(), close = p => [...p, p[0]];
  if(thru) return first.map(p=>close(cw(p)));
  const rings=[]; for(let k=0;k<400;k++){ const o=k? offset([outline], -(R+k*step)) : first; if(!o.length) break; o.forEach(p=>rings.push(close(ccw(p)))); }
  return rings.reverse();
}
/* corners the bit can't make: inside corners of the cut (convex corners of the outline) with a radius under ⅜″ */
function tightCorners(c, R=R_BIT){
  if(c.kind!=='path' || !c.closed || c.nodes.length<3) return [];
  const n=c.nodes, N=n.length, pts=flatten(c,0.02), orient=Math.sign(area(pts))||1, out=[];
  for(let i=0;i<N;i++){
    const node=n[i], prev=n[(i-1+N)%N], next=n[(i+1)%N];
    const din = norm(sub(P(node), node.hi || (c.b && c.b[(i-1+N)%N] ? P(prev) : prev.ho || P(prev))));
    const dout = norm(sub(node.ho || (c.b && c.b[i] ? P(next) : next.hi || P(next)), P(node)));
    const cross=din[0]*dout[1]-din[1]*dout[0], dot=din[0]*dout[0]+din[1]*dout[1];
    if(cross*orient>1e-6 && dot<0.999 && !((node.r||0)>=R-1e-6)) out.push(i);
  }
  return out;
}
/* ---------------------------------------------------------------- moving, mirroring, turning */
function mapContour(c, f, flips){
  if(c.kind==='circle'){ const [cx,cy]=f([c.cx,c.cy]); return {...c, cx, cy}; }
  const m=v=>v?f(v):undefined;
  const nodes=c.nodes.map(n=>{ const [x,y]=f([n.x,n.y]); const o={...n, x, y}; if(n.hi) o.hi=m(n.hi); if(n.ho) o.ho=m(n.ho); return o; });
  const b={}; Object.entries(c.b||{}).forEach(([k,v])=>{ b[k]=flips?-v:v; });
  return {...c, nodes, b};
}
const mapAll = (cs, f, flips=false) => cs.map(c=>mapContour(c, f, flips));
/* mirror left ↔ right (mx) and / or top ↔ bottom (my) inside the drawing's own box */
function mirrorAll(cs, mx, my){ if(!mx && !my) return cs; const B=bboxAll(cs); return mapAll(cs, ([x,y])=>[mx?B.x0+B.x1-x:x, my?B.y0+B.y1-y:y], mx!==my); }
/* move so the box's lower-left corner is at 0,0 */
function normalize(cs){ const B=bboxAll(cs); return mapAll(cs, ([x,y])=>[+(x-B.x0).toFixed(4), +(y-B.y0).toFixed(4)]); }

/* ---------------------------------------------------------------- arcs back for the G-code */
function circle3(a,b,c){
  const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1])); if(Math.abs(d)<1e-12) return null;
  const s=q=>q[0]*q[0]+q[1]*q[1], ux=(s(a)*(b[1]-c[1])+s(b)*(c[1]-a[1])+s(c)*(a[1]-b[1]))/d, uy=(s(a)*(c[0]-b[0])+s(b)*(a[0]-c[0])+s(c)*(b[0]-a[0]))/d;
  return [ux,uy,hyp(a[0]-ux,a[1]-uy)];
}
/* a polyline → [{ k:'L', p } | { k:'A', p, c:[cx,cy], cw }] — runs of 4+ points on one circle (within tol) become arcs */
function fitArcs(pts, tol=0.0015){
  const out=[]; let i=0;
  while(i<pts.length-1){
    let best=-1, bc=null;
    for(let j=i+3;j<pts.length;j++){
      const m=pts[(i+j)>>1], C=circle3(pts[i], m, pts[j]); if(!C || C[2]>500) break;
      let ok=true, turn=0, swept=0;
      for(let k=i;k<j && ok;k++){ const a=pts[k], b=pts[k+1], mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        swept+=Math.abs(Math.atan2((a[0]-C[0])*(b[1]-C[1])-(a[1]-C[1])*(b[0]-C[0]), (a[0]-C[0])*(b[0]-C[0])+(a[1]-C[1])*(b[1]-C[1]))); if(swept>1.5*Math.PI) ok=false;
        if(Math.abs(hyp(b[0]-C[0],b[1]-C[1])-C[2])>tol) ok=false;
        // the chord's sag must match the circle's too (no corners hidden between points)
        const sag=C[2]-hyp(mid[0]-C[0],mid[1]-C[1]), L=hyp(b[0]-a[0],b[1]-a[1]), want=C[2]-Math.sqrt(Math.max(0,C[2]*C[2]-L*L/4));
        if(Math.abs(sag-want)>tol) ok=false;
        const cr=(a[0]-C[0])*(b[1]-C[1])-(a[1]-C[1])*(b[0]-C[0]); if(turn===0) turn=Math.sign(cr); else if(Math.sign(cr)!==turn) ok=false;
        if(L>C[2]) ok=false; }
      if(!ok) break; best=j; bc=C;
    }
    if(best>0){ const a=pts[i], b=pts[i+1], cr=(a[0]-bc[0])*(b[1]-bc[1])-(a[1]-bc[1])*(b[0]-bc[0]);
      out.push({k:'A', p:pts[best], c:[bc[0],bc[1]], cw:cr<0}); i=best; }
    else { out.push({k:'L', p:pts[i+1]}); i++; }
  }
  return out;
}
export { R_BIT, flatten, area, bbox, bboxAll, segCount, segType, segLength, bulgeArc, fillet, offset, bool, boolTree, asCut, toolRings, tightCorners, mapAll, mirrorAll, normalize, fitArcs };
