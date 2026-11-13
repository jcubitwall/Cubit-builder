/* Cubit Builder — sidinglayout.js : how the siding (Rando Rib, data/siding.json) goes on every exterior wall, piece
   by piece, so the crew can follow it without thinking. Version 2 (Nov 2026): standard trims with play built in.

   The panel, seen from outside: the RIB END on one edge, the long flat and END FLANGE on the other. Each panel's
   rib end laps over the next panel's flange. Cover: 33″ full, pulled back anywhere to 31¾″, or hopped a rib
   (30–30½″). Nothing between 30½″ and 31¾″.

   Every run of siding sits between two edges, and each kind of edge gives some PLAY (how far from the edge the
   siding may stop; negative = tucked under it):
     C  Einspine corner: the SAME standard corner trim on every outside corner, screwed on so it comes off to reach
        the spine. Legs TR.corner.leg; the siding stops TR.corner.clear clear of the corner (the spine and its notch)
        and runs at least TR.corner.lap under the leg.
     I  inside corner (where one pod's wall meets another pod's side): the standard inside corner trim.
     J  joint between two pods in line: a CONNECTOR bent to suit that joint (they can vary): its width is whatever
        the two runs leave, TR.joint.clear to TR.joint.max each side, plus the ¾″ gap and a lap each side.
     M  brick mold (1½″ outside each window / door): the rib end butts it, tucking up to TR.mold.tuck into the J-trim.
     X  between two openings the runs go out from each brick mold (rib ends at both) and meet under a standard
        JOINER (flat batten TR.joiner.w wide), which hides a gap of 0 to w − 2 laps between the two flange ends.
   A run is closed with whole panels wherever the play allows (fewest hopped ribs). Where it can't, the last piece is
   a RIP: a stock panel cut down its length, cut edge hidden under the trim (corner, connector, inside corner or
   joiner, in that order of preference) and the lapping edge kept. No pieces bent to order but the connectors.
   Panels go up at a nominal TR.nom cover so each one still has play either way for the crew.
   A strip too narrow for siding (under TR.ripMin) gets black ACM full height instead.
   Above and below each opening: matte black ACM (4 mm), the brick mold's width plus ACM_LAP each side under the siding.
   All in inches; x along the wall from its left end seen from outside, y up from the wall base. */
import { SIDINGLIB } from './data.js';
import { sidingSpan, WALL_BASE } from './config.js';
import { slotsFor } from './layout.js';
import { bodyWall } from './panels.js';
import { pickFor, state } from './state.js';

const MOLD = 1.5;          // brick mold, each side and top and bottom of the opening
const ACM_LAP = 1.5;       // the ACM above / below an opening runs this far under the siding each side
const TR = {
  corner: { leg:4, clear:2, lap:1, name:'Einspine corner trim', note:'the same on every outside corner · screwed, comes off to reach the spine' },
  inside: { leg:3, clear:0.75, lap:1, name:'Inside corner trim', note:'the same on every inside corner' },
  joint:  { clear:2, max:6, lap:1, gap:0.75, name:'Pod joint connector', note:'bent to suit each joint: width below' },
  mold:   { tuck:0.5, name:'J-trim at the brick mold', note:'sides of every window and door; the rib end butts it' },
  joiner: { w:6, lap:1, name:'Joiner (flat batten)', note:'standard, where two runs meet between openings' },
  nom: 32.5, ripMin: 3, saw: 0.25,
};
const FILL_MIN = TR.ripMin;
const EPS = 1e-6;
const profile = () => SIDINGLIB.find(x=>x.id==='rando-rib') || SIDINGLIB[0] || null;
/* where the siding may stop, measured in from an edge of kind t: [least, most] (negative = tucked under it) */
const PLAY = t => t==='C' ? [TR.corner.clear, TR.corner.leg-TR.corner.lap] : t==='I' ? [TR.inside.clear, TR.inside.leg-TR.inside.lap]
  : t==='J' ? [TR.joint.clear, TR.joint.max] : t==='M' ? [-TR.mold.tuck, 0] : [0, 0];
const RIP_PREF = { J:0, X:1, I:2, C:3, M:9 };
const r16 = v => Math.round(v*16)/16;

/* whole panels for a width anywhere in [lo, hi]: n panels, k of them hopped (fewest hops, then fewest panels) */
function wholeFit(lo, hi, P){
  for(let n=1; n<=Math.ceil(hi/P.hop[0])+1; n++) for(let k=0; k<=n; k++){
    const a=k*P.hop[0]+(n-k)*P.coverMin, b=k*P.hop[1]+(n-k)*P.cover;
    if(a<=hi+EPS && b>=lo-EPS){
      const S=Math.min(Math.max((Math.max(a,lo)+Math.min(b,hi))/2, a), b), t=b-a>EPS ? (S-a)/(b-a) : 1;
      const covers=[...Array(n)].map((_,i)=> i<k ? P.hop[0]+t*(P.hop[1]-P.hop[0]) : P.coverMin+t*(P.cover-P.coverMin));
      return { covers, hops:k, S, play:Math.min(b,hi)-Math.max(a,lo) }; } }
  return null;
}
/* one run between x0 and x1 with edges t0, t1: its pieces, left to right */
function planRun(x0, x1, t0, t1, P){
  const W=x1-x0, split=t0==='M' && t1==='M';
  const p0=PLAY(t0), p1=PLAY(t1), gMax=split ? TR.joiner.w-2*TR.joiner.lap : 0;
  const lo=W-p0[1]-p1[1]-gMax, hi=W-p0[0]-p1[0];
  const R={ x0, x1, W, ends:[t0,t1], split, pieces:[], hops:0, rip:null, narrow:false };
  if(split && W<=gMax+EPS){ R.joinerOnly=true; R.gap=W; return R; }
  if(hi < TR.ripMin){ R.narrow=true; return R; }
  // the ribs point at a brick mold; otherwise the flange end goes to the Einspine corner (or the left end)
  const ribsRight = split ? null : t1==='M' ? true : t0==='M' ? false : t0==='C' ? true : t1==='C' ? false : true;
  const fit=wholeFit(Math.max(lo,0), hi, P);
  let covers, ripW=0, ripAt=null;
  if(fit){ covers=fit.covers; R.hops=fit.hops; R.play=fit.play; }
  else {   // a rip at the best trimmed edge; the rest at the nominal cover
    const S=W-(p0[0]+p0[1])/2-(p1[0]+p1[1])/2-gMax/2;
    if(S < TR.ripMin){   // too little for a rip: a joint's connector widens to cover it, otherwise black ACM full height
      if(!split && (t0==='J' || t1==='J')){ const dj=W-(t0==='J' ? (p1[0]+p1[1])/2 : (p0[0]+p0[1])/2);
        R.d = t0==='J' ? [dj, (p1[0]+p1[1])/2] : [(p0[0]+p0[1])/2, dj]; R.connectorOnly=true; R.play=0; return R; }
      R.narrow=true; return R; }
    let n=Math.max(0, Math.floor((S-TR.ripMin)/TR.nom)); ripW=S-n*TR.nom;
    covers=Array(n).fill(TR.nom); ripAt = split ? 'X' : (RIP_PREF[t0]<=RIP_PREF[t1] ? 'L' : 'R');
    R.play=(hi-lo)+n*(P.cover-P.coverMin);
  }
  // where the siding stops at each edge: the middle of its play, the leftover going to the more flexible edge
  const S=covers.reduce((a,c)=>a+c,0)+ripW;
  let d0=(p0[0]+p0[1])/2, d1=(p1[0]+p1[1])/2, gap=0;
  if(split){ gap=W-S-d0-d1; if(gap<0){ d0+=gap/2; d1+=gap/2; gap=0; } if(gap>gMax){ const e=(gap-gMax)/2; d0+=e; d1+=e; gap=gMax; } }
  else { let left=W-S-d0-d1; const flex0=t0==='J'||t0==='I', flex1=t1==='J'||t1==='I';
    if(flex0 && !flex1) d0+=left; else if(flex1 && !flex0) d1+=left; else { d0+=left/2; d1+=left/2; } }
  R.d=[d0,d1]; R.gap=gap;
  // the pieces: laid from the rib-end edge back towards the flange edge (each new rib end laps the last flange)
  const piece=(a,b,ribR,kind,extra={})=>R.pieces.push({ kind, x0:a, x1:b, w:b-a, ribR, ...extra });
  const lay=(from, cs, ribR)=>{ let x=from; cs.forEach(c=>{ if(ribR){ piece(x-c, x, true, 'panel', { cover:c, hop:c<P.coverMin-EPS }); x-=c; } else { piece(x, x+c, false, 'panel', { cover:c, hop:c<P.coverMin-EPS }); x+=c; } }); return x; };
  if(split){
    const nL=Math.ceil(covers.length/2), a=lay(x0+d0, covers.slice(0,nL), false);
    const b=lay(x1-d1, covers.slice(nL).reverse(), true);
    if(ripW>0.01){ piece(b-ripW, b, true, 'rip', { keeps:'rib', cutAt:'joiner' }); }
    R.joiner={ x:(a+(b-ripW))/2, gap:(b-ripW)-a };
  } else if(ribsRight){
    let x=x1-d1;
    if(ripAt==='R'){ piece(x-ripW, x, true, 'rip', { keeps:'flange', cutAt:t1 }); x-=ripW; }
    x=lay(x, covers, true);
    if(ripAt==='L'){ piece(x-ripW, x, true, 'rip', { keeps:'rib', cutAt:t0 }); }
  } else {
    let x=x0+d0;
    if(ripAt==='L'){ piece(x, x+ripW, false, 'rip', { keeps:'flange', cutAt:t0 }); x+=ripW; }
    x=lay(x, covers, false);
    if(ripAt==='R'){ piece(x, x+ripW, false, 'rip', { keeps:'rib', cutAt:t1 }); }
  }
  R.pieces.sort((a,b)=>a.x0-b.x0);
  R.ribsRight=ribsRight; R.rip=ripW>0.01 ? { w:ripW, at:ripAt } : null;
  R.start = split ? 'both brick molds, working towards the middle' : ribsRight ? (t1==='M'?'the brick mold':'the right end') : (t0==='M'?'the brick mold':'the left end');
  return R;
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
/* what each end of an exterior wall meets: C Einspine corner, J another pod's wall in line, I another pod's side */
function endKinds(s, ext){
  const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<0.2;
  const P=s.pod, corner=q=>[[P.x,P.z],[P.x1,P.z],[P.x,P.z1],[P.x1,P.z1]].some(c=>Math.hypot(c[0]-q[0],c[1]-q[1])<0.05);
  const kind=(pt, ptn)=>{
    if(!corner(ptn)) return 'I';
    if(ext.some(o=>o!==s && o.pod!==s.pod && (near(o.p0,pt)||near(o.p1,pt)) && Math.abs(o.n[0]*s.n[0]+o.n[1]*s.n[1])>0.9)) return 'J';
    return ext.some(o=>o!==s && o.pod===s.pod && (near(o.p0,pt)||near(o.p1,pt))) ? 'C' : 'I'; };
  return [kind(s.p0, s.p0n), kind(s.p1, s.p1n)];
}
/* one exterior wall (an ext slot): its runs and the black ACM above / below each opening */
function wallLayout(s, P=profile(), ext=null){
  if(!P) return null;
  const w=bodyWall(s, pickFor(s)); if(!w) return null;
  ext ||= slotsFor(state.model).filter(x=>x.type==='ext');
  const L=s.len*12, S=sidingSpan(s.pod?.lv||0), y0=S.bottom-WALL_BASE, y1=S.top-WALL_BASE, H=y1-y0;
  const [e0,e1]=endKinds(s, ext.includes(s) ? ext : [...ext, s]);
  const M=molds(w, L), runs=[], cols=[];
  let x=0, at=e0;
  M.forEach(m=>{ if(m.x0-x>0.01) runs.push(planRun(x, m.x0, at, 'M', P));
    cols.push({ m, below:Math.max(0, m.y0-y0), above:Math.max(0, y1-m.y1) });
    x=m.x1; at='M'; });
  if(L-x>0.01) runs.push(planRun(x, L, at, e1, P));
  return { s, L, H, y0, y1, ends:[e0,e1], runs, full:runs, cols, molds:M };
}
/* the whole home: every piece, the stock panels to buy (rips paired out of one panel where they fit), the trims */
function homeSiding(k){
  const P=profile(); if(!P) return null;
  const ext=slotsFor(k).filter(s=>s.type==='ext');
  const walls=ext.map(s=>wallLayout(s,P,ext)).filter(Boolean);
  const add=(o,key,v)=>{ (o[key] ||= { ...v, n:0 }).n++; };
  const full={}, acm={}, rips=[];
  let hops=0, joiners=0, narrow=0;
  walls.forEach(Wl=>{ const len=r16(Wl.H);
    Wl.runs.forEach(R=>{ hops+=R.hops; if(R.split) joiners++;
      if(R.narrow){ narrow++; add(acm, r16(R.W)+'×'+len+'|side', { w:r16(R.W), h:len, where:'beside', note:'too narrow for siding: full height' }); }
      R.pieces.forEach(p=>{ if(p.kind==='panel') add(full, len, { len, what:'full height' }); else rips.push({ w:r16(p.w), keeps:p.keeps, len, wall:Wl.s.label }); }); });
    Wl.cols.forEach(c=>[['above',c.above],['below',c.below]].forEach(([where,h])=>{ if(h<0.5) return;
      const w=r16(c.m.x1-c.m.x0+2*ACM_LAP); add(acm, w+'×'+r16(h)+'|'+where, { w, h:r16(h), where }); })); });
  // rips: one stock panel can give a rib-end rip and a flange-end rip when they fit side by side
  const lapEdge=P.w-P.cover, mat=r=>r.w+lapEdge;
  const R=rips.slice().sort((a,b)=>b.w-a.w), used=new Set(), stockRips=[];
  R.forEach((a,i)=>{ if(used.has(i)) return; used.add(i);
    const j=R.findIndex((b,jj)=>!used.has(jj) && b.keeps!==a.keeps && b.len===a.len && mat(a)+mat(b)+TR.saw<=P.w);
    if(j>=0){ used.add(j); stockRips.push([a,R[j]]); } else stockRips.push([a]); });
  const ripBy={}; rips.forEach(r=>add(ripBy, r.w+'|'+r.keeps+'|'+r.len, { w:r.w, keeps:r.keeps, len:r.len }));
  // trims: one corner trim per Einspine corner, one inside trim per inside corner, a connector per joint
  const pts={};
  walls.forEach(Wl=>{ const s=Wl.s; [[s.p0,0],[s.p1,1]].forEach(([p,e])=>{ const key=`${s.pod.lv||0}|${Math.round(p[0]*8)/8},${Math.round(p[1]*8)/8}`;
    const R=e===0 ? Wl.runs[0] : Wl.runs[Wl.runs.length-1], d=R ? (e===0 ? R.d?.[0] : R.d?.[1]) ?? 0 : 0;
    (pts[key] ||= { H:Wl.H, kind:Wl.ends[e], sides:[] }).sides.push({ wall:s.label, d, kind:Wl.ends[e] }); }); });
  // joints pair across the ¾″ gap: their two ends are 0.0625′ apart, so match them by nearness
  const P2=Object.entries(pts), seen=new Set(), corners=[], insides=[], joints=[];
  P2.forEach(([key,c],i)=>{ if(seen.has(key)) return; seen.add(key);
    if(c.kind==='J'){ const [lv,xy]=key.split('|'), [x,z]=xy.split(',').map(Number);
      const m=P2.find(([k2,c2])=>!seen.has(k2) && c2.kind==='J' && k2.startsWith(lv+'|') && (()=>{ const [x2,z2]=k2.split('|')[1].split(',').map(Number); return Math.hypot(x2-x,z2-z)<0.2; })());
      if(m){ seen.add(m[0]); c.sides.push(...m[1].sides); }
      const w=r16(c.sides.reduce((a,sd)=>a+sd.d,0)+TR.joint.gap*(c.sides.length>1?1:0)+2*TR.joint.lap);
      joints.push({ len:r16(c.H), w, walls:c.sides.map(sd=>sd.wall) }); }
    else if(c.kind==='C') corners.push({ len:r16(c.H), walls:c.sides.map(sd=>sd.wall) });
    else insides.push({ len:r16(c.H), walls:c.sides.map(sd=>sd.wall) }); });
  // outside corners: both walls' ends land on the same corner key (the spine), so they're counted once
  let jLen=0, head=[], nOpen=0;
  walls.forEach(Wl=>Wl.molds.forEach(m=>{ nOpen+=m.n; const mw=m.x1-m.x0, mh=Math.min(m.y1,Wl.y1)-Math.max(m.y0,Wl.y0);
    jLen += 2*mh; head.push(r16(mw+2)); }));
  const headBy={}; head.forEach(l=>{ (headBy[l] ||= { len:l, n:0 }).n++; });
  const jointBy={}; joints.forEach(j=>add(jointBy, j.w+'|'+j.len, { w:j.w, len:j.len }));
  const panels=Object.values(full).sort((a,b)=>b.len-a.len);
  // stock to buy: the full panels plus one per rip pair / single rip (by length)
  const stock={}; panels.forEach(p=>{ (stock[p.len] ||= { len:p.len, n:0 }).n+=p.n; }); stockRips.forEach(g=>{ (stock[g[0].len] ||= { len:g[0].len, n:0 }).n++; });
  const nPanels=panels.reduce((a,p)=>a+p.n,0), nStock=Object.values(stock).reduce((a,p)=>a+p.n,0);
  const lb=Object.values(stock).reduce((a,p)=>a+p.n*p.len/12*P.lbPerFt,0);
  const acmPieces=Object.values(acm).sort((a,b)=>b.w*b.h-a.w*a.h), acmArea=acmPieces.reduce((a,p)=>a+p.n*p.w*p.h,0);
  const runs=walls.reduce((a,Wl)=>a+Wl.L,0);
  const trims=[
    corners.length && { n:corners.length, what:TR.corner.name, len:r16(Math.max(...corners.map(c=>c.len))), std:true, note:TR.corner.note, legs:`${TR.corner.leg}″ × ${TR.corner.leg}″` },
    insides.length && { n:insides.length, what:TR.inside.name, len:r16(Math.max(...insides.map(c=>c.len))), std:true, note:TR.inside.note, legs:`${TR.inside.leg}″ × ${TR.inside.leg}″` },
    joiners && { n:joiners, what:TR.joiner.name, len:r16(walls[0]?.H||0), std:true, note:TR.joiner.note, legs:`${TR.joiner.w}″ wide` },
    ...Object.values(jointBy).sort((a,b)=>a.w-b.w).map(j=>({ n:j.n, what:`${TR.joint.name}, ${j.w}″ face`, len:j.len, w:j.w, joint:true, note:'bent to suit' })),
    nOpen && { n:1, what:`${TR.mold.name} (sides), total`, len:r16(jLen), std:true },
    ...Object.values(headBy).map(h=>({ n:h.n, what:'Head drip flashing over brick mold (1″ past each side)', len:h.len, std:true })) ].filter(Boolean);
  return { P, TR, walls, panels, rips:Object.values(ripBy).sort((a,b)=>b.w-a.w), stockRips, stock:Object.values(stock), nStock,
    fillers:[], nPanels, nRips:rips.length, hops, joiners, narrow, lb, runs, nOpen, corners, insides, joints,
    acm:acmPieces, acmSheets:Math.ceil(acmArea*1.15/(48*96)-1e-9), trims };
}
export { ACM_LAP, MOLD, FILL_MIN, TR as SIDING_TRIM, planRun, wallLayout, homeSiding, profile as sidingProfile };
