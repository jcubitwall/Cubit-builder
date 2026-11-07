/* Cubit Builder — slope.js : a pocket whose depth changes along a path (the Shape studio's "Sloped").

   slope = { pts:[[x,y],…] (2 or more: the path, start → end), d0 (depth at the start), d1 (depth at the end) }
   (older ones have just a / b: a straight path from a to b.)
   The depth at any point of the pocket is the depth at the nearest point of the path, running evenly with the length
   along it from d0 to d1: a channel that bends keeps sloping round its bends, the same depth straight across it.

   centreLine(outer, holes) finds the path down the middle of a drawn pocket by itself: the pocket rasterised, thinned
   to a one-cell skeleton, and the longest run through that skeleton, smoothed. */
const slopePts = sl => sl?.pts?.length>=2 ? sl.pts : (sl?.a && sl?.b ? [sl.a, sl.b] : []);
const len2 = (a,b) => Math.hypot(b[0]-a[0], b[1]-a[1]);
/* where p falls along the path: { s (length from the start), L (whole length), q (nearest point) } */
function along(pts, p){
  let best=null, acc=0;
  for(let i=0;i<pts.length-1;i++){ const a=pts[i], b=pts[i+1], dx=b[0]-a[0], dy=b[1]-a[1], l2=dx*dx+dy*dy, l=Math.sqrt(l2);
    const t=l2<1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2)), q=[a[0]+dx*t, a[1]+dy*t], d=len2(p,q);
    if(!best || d<best.d-1e-9) best={ d, s:acc+l*t, q }; acc+=l; }
  return best ? { ...best, L:acc } : { d:0, s:0, L:0, q:p };
}
/* the depth at point p */
function slopeDepth(sl, p){
  const pts=slopePts(sl); if(pts.length<2) return +sl?.d0||0;
  const A=along(pts, p), f=A.L>1e-9 ? A.s/A.L : 0;
  return +sl.d0 + (+sl.d1 - +sl.d0)*f;
}
/* the same slope with every point moved by f([x,y]) → [x,y] (placing, mirroring, flipping) */
const mapSlope = (sl, f) => { const pts=slopePts(sl).map(f); const o={ ...sl, pts }; delete o.a; delete o.b; return o; };
const slopeLength = sl => { const P=slopePts(sl); let L=0; for(let i=0;i<P.length-1;i++) L+=len2(P[i],P[i+1]); return L; };

/* ---------------------------------------------------------------- the centre line, found by itself */
function inPolyXY(P, x, y){ let c=false; for(let i=0,j=P.length-1;i<P.length;j=i++){ const [xi,yi]=P[i], [xj,yj]=P[j]; if(((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi) c=!c; } return c; }
function centreLine(outer, holes=[]){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; outer.forEach(([x,y])=>{ x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y); });
  const span=Math.max(x1-x0, y1-y0), h=Math.max(0.03, Math.min(0.25, span/320)), W=Math.ceil((x1-x0)/h)+3, H=Math.ceil((y1-y0)/h)+3;
  const X=i=>x0+(i-1)*h, Y=j=>y0+(j-1)*h, M=new Uint8Array(W*H);
  for(let j=0;j<H;j++) for(let i=0;i<W;i++){ const x=X(i), y=Y(j); M[j*W+i] = inPolyXY(outer,x,y) && !holes.some(Hh=>inPolyXY(Hh,x,y)) ? 1 : 0; }
  // Zhang–Suen thinning: the pocket worn down from both sides to a line one cell wide, down its middle
  const at=(i,j)=>M[j*W+i];
  let changed=true, guard=0;
  while(changed && guard++<2000){ changed=false;
    for(const step of [0,1]){ const kill=[];
      for(let j=1;j<H-1;j++) for(let i=1;i<W-1;i++){ if(!at(i,j)) continue;
        const p=[at(i,j-1),at(i+1,j-1),at(i+1,j),at(i+1,j+1),at(i,j+1),at(i-1,j+1),at(i-1,j),at(i-1,j-1)];
        const B=p.reduce((a,v)=>a+v,0); if(B<2||B>6) continue;
        let A=0; for(let k=0;k<8;k++) if(!p[k] && p[(k+1)%8]) A++; if(A!==1) continue;
        if(step===0 ? (p[0]*p[2]*p[4]===0 && p[2]*p[4]*p[6]===0) : (p[0]*p[2]*p[6]===0 && p[0]*p[4]*p[6]===0)) kill.push(j*W+i); }
      kill.forEach(k=>{ M[k]=0; }); if(kill.length) changed=true; } }
  // the longest run through the skeleton: farthest cell from any cell, then farthest from that, and the way between
  const cells=[]; for(let k=0;k<W*H;k++) if(M[k]) cells.push(k); if(cells.length<2) return null;
  const N8=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  const bfs=start=>{ const dist=new Map([[start,0]]), prev=new Map(), q=[start]; let far=start;
    for(let n=0;n<q.length;n++){ const k=q[n], i=k%W, j=(k/W)|0;
      for(const [di,dj] of N8){ const ii=i+di, jj=j+dj; if(ii<0||jj<0||ii>=W||jj>=H) continue; const kk=jj*W+ii; if(!M[kk] || dist.has(kk)) continue;
        dist.set(kk, dist.get(k)+Math.hypot(di,dj)); prev.set(kk,k); q.push(kk); if(dist.get(kk)>dist.get(far)) far=kk; } }
    return { far, prev }; };
  const A=bfs(cells[0]).far, R=bfs(A), path=[]; for(let k=R.far; k!=null; k=R.prev.get(k)){ path.push([X(k%W), Y((k/W)|0)]); if(k===A) break; }
  if(path.length<2) return null;
  const S=simplify(path.reverse(), h*1.6);
  // run each end on to the pocket's edge (the skeleton stops half a width short of it)
  const toEdge=(p, q)=>{ const d=[p[0]-q[0], p[1]-q[1]], l=Math.hypot(...d)||1, u=[d[0]/l, d[1]/l]; let best=null;
    [outer, ...holes].forEach(P=>P.forEach((a,i)=>{ const b=P[(i+1)%P.length], e=[b[0]-a[0], b[1]-a[1]], den=u[0]*e[1]-u[1]*e[0]; if(Math.abs(den)<1e-12) return;
      const t=((a[0]-p[0])*e[1]-(a[1]-p[1])*e[0])/den, s2=((a[0]-p[0])*u[1]-(a[1]-p[1])*u[0])/den; if(t>1e-6 && s2>=-1e-9 && s2<=1+1e-9 && (best==null || t<best)) best=t; }));
    return best!=null && best<span ? [p[0]+u[0]*best, p[1]+u[1]*best] : p; };
  if(S.length>=2){ S[0]=toEdge(S[0], S[1]); S[S.length-1]=toEdge(S[S.length-1], S[S.length-2]); }
  return S.map(([x,y])=>[+x.toFixed(4), +y.toFixed(4)]);
}
/* Douglas–Peucker */
function simplify(P, tol){
  if(P.length<3) return P;
  const keep=new Uint8Array(P.length); keep[0]=keep[P.length-1]=1;
  const st=[[0,P.length-1]];
  while(st.length){ const [a,b]=st.pop(); let md=0, mi=-1; const [ax,ay]=P[a], [bx,by]=P[b], L=Math.hypot(bx-ax,by-ay)||1e-12;
    for(let i=a+1;i<b;i++){ const d=Math.abs((bx-ax)*(ay-P[i][1])-(ax-P[i][0])*(by-ay))/L; if(d>md){ md=d; mi=i; } }
    if(md>tol){ keep[mi]=1; st.push([a,mi],[mi,b]); } }
  return P.filter((_,i)=>keep[i]);
}
export { slopePts, slopeDepth, mapSlope, slopeLength, centreLine, along };
