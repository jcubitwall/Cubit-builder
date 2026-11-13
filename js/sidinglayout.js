/* Cubit Builder — sidinglayout.js : how the siding panels (Rando Rib, data/siding.json) are laid out on every
   exterior wall, and the filler pieces and trims that finish it.

   The panel (looking at it from outside): the RIB END on one edge, and the LONG FLAT on the wall with the END
   FLANGE on the other. Each panel's rib end laps over the next panel's flange end.

   Coverage (what one panel adds along the wall):
     • full cover 33″; a panel can be pulled back anywhere down to 31¾″ (coverMin)
     • pulled back further it hops the rib, and then settles anywhere from 30½″ down to 30″ (hop)
     • nothing between 30½″ and 31¾″
   Rules:
     • start at an Einspine corner with the long flat and end flange; the rib end points away from the corner
     • the rib end butts the window / door brick mold, 1½″ outside the opening on each side, top and bottom
     • between two brick molds both edges must be rib ends: two runs meet in the middle on a filler
     • where whole panels can't make the width exactly, a filler piece (bent to the same look) takes up the rest;
       it is never narrower than FILL_MIN — panels are pulled back to make room for it
   Above and below each opening (between its brick-mold sides) there is NO metal siding: a matte black aluminium
   composite (ACM) panel fills it. All in inches; x along the wall from its left end seen from outside, y up from the wall base. */
import { SIDINGLIB } from './data.js';
import { sidingSpan, WALL_BASE } from './config.js';
import { slotsFor } from './layout.js';
import { bodyWall } from './panels.js';
import { pickFor } from './state.js';

const MOLD = 1.5;        // brick mold, each side and top and bottom of the opening
const FILL_MIN = 3;      // the narrowest filler worth bending
const EPS = 1e-6;
const profile = () => SIDINGLIB.find(x=>x.id==='rando-rib') || SIDINGLIB[0] || null;

/* n panels and k of them hopped: the widths they can cover */
const band = (P, n, k) => [k*P.hop[0] + (n-k)*P.coverMin, k*P.hop[1] + (n-k)*P.cover];
/* fit a width W with whole panels; covers = each panel's cover, in order; filler = what's left for a filler */
function fit(W, P){
  if(W < 0.01) return { covers:[], filler:0 };
  for(let n=1; n<=Math.ceil(W/P.hop[0]); n++){
    for(let k=0; k<=n; k++){ const [lo,hi]=band(P,n,k); if(W>=lo-EPS && W<=hi+EPS){
      const t = hi-lo>EPS ? (W-lo)/(hi-lo) : 1;     // pull every panel back by the same share
      const covers=[...Array(n)].map((_,i)=> i<k ? P.hop[0]+t*(P.hop[1]-P.hop[0]) : P.coverMin+t*(P.cover-P.coverMin));
      return { covers:covers.map(c=>Math.round(c*1000)/1000), filler:0, hops:k }; } }
  }
  // no whole-panel answer: full panels and a filler, the filler at least FILL_MIN (panels pulled back to make room)
  let n=Math.floor(W/P.cover), fill=W-n*P.cover;
  if(fill < FILL_MIN-EPS && n>0){ const need=FILL_MIN-fill;
    if(n*(P.cover-P.coverMin) >= need-EPS){ const c=P.cover-need/n; return { covers:Array(n).fill(Math.round(c*1000)/1000), filler:FILL_MIN, hops:0 }; }
    n--; fill=W-n*P.cover; }
  return { covers:Array(n).fill(P.cover), filler:Math.round(fill*1000)/1000, hops:0 };
}
/* one stretch between two edges: 'C' an Einspine corner, 'M' a brick mold, 'F' free (above / below an opening) */
function stretch(x0, x1, a, b, P){
  const W=x1-x0;
  if(a==='M' && b==='M' && W > P.cover+EPS){   // rib ends both sides: two runs from the molds meet on a filler in the middle
    const half=fit(W/2, P), h2=fit(W-W/2, P);
    // join the two leftovers into one middle filler where possible
    const f=half.filler+h2.filler;
    return { x0, x1, W, ends:[a,b], covers:[...half.covers, ...h2.covers], nLeft:half.covers.length, filler:f, fillerAt:'middle', hops:(half.hops||0)+(h2.hops||0), split:true };
  }
  const r=fit(W, P);
  // above / below an opening: what whole panels can't cover is ripped from a stock panel (no bent filler needed)
  if(a==='F' && r.filler>0.01){ r.rip=r.filler; r.filler=0; }
  return { x0, x1, W, ends:[a,b], ...r, fillerAt:r.filler ? (a==='C'&&b==='C' ? 'far corner' : 'between panels') : null,
    flange: a==='C' ? 'left' : b==='C' ? 'right' : a==='M' ? 'right' : 'left' };
}
/* the brick-mold outlines of a wall's openings (merged where they overlap) */
function molds(w, L){
  const out=[];
  (w.openings||[]).filter(o=>o.kind!=='vent' && (o.w||o.d||0)>=3).forEach(o=>{
    const ow=o.w||o.d, oh=o.h||o.d, x=(w.trim?.[0]||0)+o.x;
    out.push({ x0:Math.max(0,x-MOLD), x1:Math.min(L,x+ow+MOLD), y0:o.y-MOLD, y1:o.y+oh+MOLD, kind:o.kind, w:ow, h:oh }); });
  out.sort((p,q)=>p.x0-q.x0);
  const M=[]; out.forEach(m=>{ const l=M[M.length-1]; if(l && m.x0<=l.x1+EPS){ l.x1=Math.max(l.x1,m.x1); l.y0=Math.min(l.y0,m.y0); l.y1=Math.max(l.y1,m.y1); l.n++; } else M.push({ ...m, n:1 }); });
  return M;
}
/* one exterior wall (an ext slot): its stretches, the pieces above / below each opening, and its trims */
function wallLayout(s, P=profile()){
  if(!P) return null;
  const w=bodyWall(s, pickFor(s)); if(!w) return null;
  const L=s.len*12, S=sidingSpan(s.pod?.lv||0), y0=S.bottom-WALL_BASE, y1=S.top-WALL_BASE, H=y1-y0;
  const M=molds(w, L), full=[], cols=[];
  let x=0, at='C';
  M.forEach(m=>{ if(m.x0-x>0.01) full.push(stretch(x, m.x0, at, 'M', P));
    const below=Math.max(0, m.y0-y0), above=Math.max(0, y1-m.y1);
    cols.push({ m, below, above, fit:stretch(m.x0, m.x1, 'F', 'F', P) });
    x=m.x1; at='M'; });
  if(L-x>0.01) full.push(stretch(x, L, at, 'C', P));
  return { s, L, H, y0, y1, full, cols, molds:M };
}
/* the whole home: panels by length, fillers, custom pieces and trims */
function homeSiding(k){
  const P=profile(); if(!P) return null;
  const walls=slotsFor(k).filter(s=>s.type==='ext').map(s=>wallLayout(s,P)).filter(Boolean);
  const cut={}, fills={}, acm={}, add=(o,key,v)=>{ (o[key] ||= { ...v, n:0 }).n++; };
  const r16=v=>Math.round(v*16)/16;
  walls.forEach(Wl=>{
    Wl.full.forEach(st=>{ st.covers.forEach(c=>add(cut, r16(Wl.H)+'', { len:r16(Wl.H), what:'full height' }));
      if(st.filler>0.01) add(fills, r16(st.filler)+'×'+r16(Wl.H), { w:r16(st.filler), len:r16(Wl.H), at:st.fillerAt }); });
    // above and below every opening: no metal siding, a matte black aluminium composite (ACM) panel the brick mold's width
    Wl.cols.forEach(c=>[['above',c.above],['below',c.below]].forEach(([where,h])=>{ if(h<0.5) return;
      const w=r16(c.m.x1-c.m.x0); add(acm, w+'×'+r16(h), { w, h:r16(h), where }); }));
  });
  // trims: corners from where the exterior walls meet, J-trim and head flashing at every brick mold
  const pts={};
  walls.forEach(Wl=>{ const s=Wl.s; [s.p0,s.p1].forEach(p=>{ const key=`${s.pod.lv||0}|${p[0].toFixed(2)},${p[1].toFixed(2)}`; (pts[key] ||= { H:Wl.H, at:[] }).at.push(s); }); });
  const corner={ out:{n:0,len:0}, ins:{n:0,len:0}, joint:{n:0,len:0} };
  Object.values(pts).forEach(c=>{
    const [a,b]=c.at;
    const kind = !b ? 'ins' : (Math.abs(a.n[0]*b.n[0]+a.n[1]*b.n[1])>0.5 ? 'joint' : a.pod===b.pod ? 'out' : 'ins');
    corner[kind].n++; corner[kind].len=Math.max(corner[kind].len, c.H); });
  let jLen=0, head=[], nOpen=0;
  walls.forEach(Wl=>Wl.molds.forEach(m=>{ nOpen+=m.n; const mw=m.x1-m.x0, mh=Math.min(m.y1,Wl.y1)-Math.max(m.y0,Wl.y0), door=m.y0<=Wl.y0+0.01;
    jLen += 2*mh + (door?0:mw); head.push(r16(mw+2)); }));
  const runs=walls.reduce((a,Wl)=>a+Wl.L,0);
  const panels=Object.values(cut).sort((a,b)=>b.len-a.len), fillers=Object.values(fills).sort((a,b)=>b.w-a.w);
  const nPanels=panels.reduce((a,p)=>a+p.n,0);
  const lb = panels.reduce((a,p)=>a+p.n*p.len/12*P.lbPerFt*(p.rip?p.rip/P.cover:1),0) + fillers.reduce((a,f)=>a+f.n*f.len*f.w*(P.developed/P.cover)*P.t*P.steel,0);
  const hops=walls.reduce((a,Wl)=>a+Wl.full.reduce((b,st)=>b+(st.hops||0),0),0);
  const headBy={}; head.forEach(l=>{ (headBy[l] ||= { len:l, n:0 }).n++; });
  const acmPieces=Object.values(acm).sort((a,b)=>b.w*b.h-a.w*a.h), acmArea=acmPieces.reduce((a,p)=>a+p.n*p.w*p.h,0);
  return { P, walls, panels, fillers, nPanels, hops, lb, runs, nOpen, acm:acmPieces, acmSheets:Math.ceil(acmArea*1.15/(48*96)-1e-9),
    trims:[ corner.out.n && { n:corner.out.n, what:'Outside corner trim (Einspine corner)', len:r16(corner.out.len) },
            corner.ins.n && { n:corner.ins.n, what:'Inside corner trim', len:r16(corner.ins.len) },
            corner.joint.n && { n:corner.joint.n, what:'Joint trim where two pods’ walls meet in line', len:r16(corner.joint.len) },
            nOpen && { n:1, what:'J-trim at brick molds (sides and sills), total', len:r16(jLen) },
            ...Object.values(headBy).map(h=>({ n:h.n, what:'Head drip flashing over brick mold (1″ past each side)', len:h.len })) ].filter(Boolean) };
}
export { MOLD, FILL_MIN, fit, stretch, wallLayout, homeSiding, profile as sidingProfile };
