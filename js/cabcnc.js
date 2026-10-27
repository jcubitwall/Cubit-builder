/* Cubit Builder — cabcnc.js : cabinet parts → nested sheets → ShopSabre programs (.TAP), Mozaik style.

   1. Every cabinet part with machining (part.cnc) is nested on 48 × 96 sheets: free rectangles (best short side
      fit), parts turned 90° when they fit better (PET has no grain), 9/16″ between parts, 1/8″ trimmed off each edge.
   2. Each sheet gets one program, side A, with the face named on every part up (good face down). Order, as Mozaik:
        T7  5 mm drill   shelf pins, plate marks, runner holes, handle holes (through)
        T11 35 mm        hinge cups;   T8 8 mm   hinge dowel holes
        T2  ½″           dados and grooves (two passes for the width, ramped in over 1″)
        T14 ¼″           drawer-box dados and tongue rabbets (two depths when deep)
        T1  ⅜″           outlines last: a skim pass leaving 0.04″ on the big parts, then every part through
                         (Z −0.005), climb … ramped in along an edge over 9/16″, corners round the bit
      If a part ever has side-B cuts (its other face), that sheet gets a side-B program too, cut FIRST, with the
      sheet turned over (X mirrored), so the cut-throughs are always in the last program.
   3. Z0 is the spoilboard; the top of the sheet is the thickness MEASURED for this run (asked for every time).
   The tools, speeds and feeds are the shop's (CAB_CNC, the same tool table as the walls: "WALLS TOOLSET"). */
import { partsOf, itemDef, settings, MM } from './casework.js';

const CAB_CNC = {
  sheet:[48,96], trim:0.125, gap:0.5625, onionArea:150, onion:0.04, thru:-0.005, safe:1.0, start:12,
  tools:{
    drill5:{ T:7,  name:'5MM',            dia:5*MM,  S:8000,  plunge:60 },
    cup35: { T:11, name:'35MM',           dia:35*MM, S:9000,  plunge:75 },
    drill8:{ T:8,  name:'8MM',            dia:8*MM,  S:18000, plunge:60 },
    half:  { T:2,  name:'5CarbideCutter', dia:0.5,   S:20000, plunge:300, feed:400, step:0.5 },
    quart: { T:14, name:'25CUTTER',       dia:0.25,  S:17000, plunge:120, feed:300, step:0.3 },
    prof:  { T:1,  name:'375CUTTER',      dia:0.375, S:19000, plunge:120, feed:400, onionFeed:500 } },
  ramp:1.0, leadIn:0.5625, overlap:0.125,
};
const f4 = v => (Math.abs(v)<5e-5?0:v).toFixed(4);

/* ---------------------------------------------------------------- the parts of a job */
/* items: [{ it, label }] → [{ part, label, U, V }] one per piece */
function jobParts(items){
  const out=[];
  items.forEach(({it,label})=>partsOf(it).filter(p=>p.cnc && !p.hw && !p.solid).forEach(p=>out.push({ p, label:`${label} ${p.name}`, U:p.cnc.U, V:p.cnc.V })));
  return out;
}

/* ---------------------------------------------------------------- nesting (max rects, best short side fit) */
function nest(pieces, o=CAB_CNC){
  const [SW,SL]=o.sheet, g=o.gap, BW=SW-2*o.trim+g, BL=SL-2*o.trim+g;
  const todo=pieces.map((q,i)=>({...q, i})).sort((a,b)=>b.U*b.V-a.U*a.V || Math.max(b.U,b.V)-Math.max(a.U,a.V));
  const sheets=[], tooBig=[];
  const newSheet=()=>{ const s={ free:[{x:0,y:0,w:BW,h:BL}], placed:[] }; sheets.push(s); return s; };
  const fits=(f,w,h)=>w<=f.w+1e-9 && h<=f.h+1e-9;
  function place(s, q){
    let best=null;
    for(const r of [0,1]){ const w=(r?q.V:q.U)+g, h=(r?q.U:q.V)+g;
      s.free.forEach(f=>{ if(!fits(f,w,h)) return; const ss=Math.min(f.w-w,f.h-h), ls=Math.max(f.w-w,f.h-h);
        if(!best || ss<best.ss-1e-9 || (Math.abs(ss-best.ss)<1e-9 && ls<best.ls)) best={x:f.x,y:f.y,w,h,r,ss,ls}; }); }
    if(!best) return false;
    const R={x:best.x,y:best.y,w:best.w,h:best.h};
    // split every free rect that overlaps the placed one
    const nf=[]; s.free.forEach(f=>{
      if(R.x>=f.x+f.w-1e-9 || R.x+R.w<=f.x+1e-9 || R.y>=f.y+f.h-1e-9 || R.y+R.h<=f.y+1e-9){ nf.push(f); return; }
      if(R.x>f.x+1e-9) nf.push({x:f.x,y:f.y,w:R.x-f.x,h:f.h});
      if(R.x+R.w<f.x+f.w-1e-9) nf.push({x:R.x+R.w,y:f.y,w:f.x+f.w-R.x-R.w,h:f.h});
      if(R.y>f.y+1e-9) nf.push({x:f.x,y:f.y,w:f.w,h:R.y-f.y});
      if(R.y+R.h<f.y+f.h-1e-9) nf.push({x:f.x,y:R.y+R.h,w:f.w,h:f.y+f.h-R.y-R.h}); });
    s.free=nf.filter((a,i)=>!nf.some((b,j)=>j!==i && a.x>=b.x-1e-9 && a.y>=b.y-1e-9 && a.x+a.w<=b.x+b.w+1e-9 && a.y+a.h<=b.y+b.h+1e-9 && (j<i || a.x!==b.x || a.y!==b.y || a.w!==b.w || a.h!==b.h)));
    s.placed.push({ ...q, x:o.trim+best.x, y:o.trim+best.y, r:best.r });
    return true;
  }
  todo.forEach(q=>{
    if(Math.min(q.U,q.V)>SW-2*o.trim || Math.max(q.U,q.V)>SL-2*o.trim){ tooBig.push(q); return; }
    if(!sheets.some(s=>place(s,q))) place(newSheet(),q);
  });
  sheets.forEach(s=>{ const used=s.placed.reduce((a,q)=>a+q.U*q.V,0); s.yield=used/(SW*SL); delete s.free; });
  return { sheets, tooBig };
}
/* part (u,v) → sheet (X across the 48″, Y along the 96″) */
const toSheet = (q, u, v) => q.r ? [q.x + v, q.y + (q.U - u)] : [q.x + u, q.y + v];

/* ---------------------------------------------------------------- the outline round the bit */
/* an outline of square corners, offset outward by the bit radius: straight runs, arcs round the outside corners.
   returns [{x,y}] with arc segments marked { arc:{cx,cy} } on the point they end at; traversed clockwise. */
function offsetPath(pts, r){
  let P=pts.slice(); const area=P.reduce((a,p,i)=>{ const q=P[(i+1)%P.length]; return a+p[0]*q[1]-q[0]*p[1]; },0)/2;
  if(area>0) P.reverse();                                     // clockwise (y up)
  P=P.filter((p,i)=>{ const a=P[(i-1+P.length)%P.length], b=P[(i+1)%P.length]; return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>1e-9; });
  const n=P.length, nrm=(a,b)=>{ const dx=b[0]-a[0], dy=b[1]-a[1], l=Math.hypot(dx,dy); return [-dy/l, dx/l]; };   // left of travel = outside for CW
  const segs=[];
  for(let i=0;i<n;i++){ const a=P[i], b=P[(i+1)%n], c=P[(i+2)%n], n1=nrm(a,b), n2=nrm(b,c);
    const d1=[b[0]-a[0],b[1]-a[1]], d2=[c[0]-b[0],c[1]-b[1]], cross=d1[0]*d2[1]-d1[1]*d2[0];
    segs.push({ i, a, b, n1, n2, convex: cross<0 }); }
  // corner points: for each vertex b (end of edge i), where the offset edges meet
  const out=[];
  segs.forEach((s,k)=>{ const prev=segs[(k-1+n)%n];
    // start of offset edge k
    const st = prev.convex ? [s.a[0]+s.n1[0]*r, s.a[1]+s.n1[1]*r] : [s.a[0]+(prev.n1[0]+s.n1[0])*r, s.a[1]+(prev.n1[1]+s.n1[1])*r];
    const en = s.convex ? [s.b[0]+s.n1[0]*r, s.b[1]+s.n1[1]*r] : [s.b[0]+(s.n1[0]+s.n2[0])*r, s.b[1]+(s.n1[1]+s.n2[1])*r];
    out.push({ st, en, convex:s.convex, corner:s.b, nextStart: s.convex ? [s.b[0]+s.n2[0]*r, s.b[1]+s.n2[1]*r] : en });
  });
  return out;   // edges in order: each runs st→en, then (if convex) an arc round `corner` to nextStart
}

/* ---------------------------------------------------------------- writing G-code */
function program({ title, file, mat, t, placed, side }){
  const o=CAB_CNC, Tl=o.tools, L=[], z=v=>f4(v);
  L.push('(Cubit Builder output for ShopSabre with ATC)','(Units INCH)',`(${file})`,`(${mat} T=${t.toFixed(3)} W=${o.sheet[0]} L=${o.sheet[1]})`, side==='B' ? '(SIDE B: cut FIRST, sheet turned over)' : '(Load Face Down)','(WALLS TOOLSET )','G90',`G0 Z${f4(o.start)}`);
  let cur=null;
  const tool=k=>{ const tl=Tl[k]; if(cur===k) return tl; cur=k; L.push('M5',`T${tl.T}`,`(${tl.name})`,`S${tl.S}`,'M3','g4 x 4','M50',`G0 Z${f4(o.start)}`); return tl; };
  const X = (q,u,v) => { let [x,y]=toSheet(q,u,v); if(side==='B') x=o.sheet[0]-x; return [x,y]; };
  const opsOf = q => q.p.cnc.ops.filter(op=>(op.side||'A')===side);
  // 1. holes
  const drills=[['drill5', op=>op.k!=='cup' && Math.abs(op.d-5*MM)<0.01], ['cup35', op=>op.k==='cup'], ['drill8', op=>op.k!=='cup' && Math.abs(op.d-8*MM)<0.01]];
  drills.forEach(([k,test])=>{ const hs=[]; placed.forEach(q=>opsOf(q).filter(op=>op.u!=null && test(op)).forEach(op=>hs.push({ q, op })));
    if(!hs.length) return; const tl=tool(k);
    // nearest-neighbour order
    let at=[0,0]; const left=hs.map(h=>({...h, xy:X(h.q,h.op.u,h.op.v)}));
    while(left.length){ let bi=0, bd=1e9; left.forEach((h,i)=>{ const d=Math.hypot(h.xy[0]-at[0],h.xy[1]-at[1]); if(d<bd){ bd=d; bi=i; } });
      const h=left.splice(bi,1)[0], zt = h.op.thru ? -0.02 : t-h.op.depth;
      L.push(`G0 X${f4(h.xy[0])} Y${f4(h.xy[1])} Z${f4(o.safe)}`, `G1 Z${z(zt)} F${tl.plunge}.0`, `G0 Z${f4(o.safe)}`); at=h.xy; } });
  // 2. dados, grooves, rabbets
  [['half','½″'],['quart','¼″']].forEach(([k,tname])=>{ const rs=[]; placed.forEach(q=>opsOf(q).filter(op=>op.u0!=null && (op.tool||'½″')===tname).forEach(op=>rs.push({q,op})));
    if(!rs.length) return; const tl=tool(k), b=tl.dia;
    rs.forEach(({q,op})=>{ const c=q.p.cnc, alongU=(op.u1-op.u0)>=(op.v1-op.v0);
      const [a0,a1,s0,s1,amax,smax] = alongU ? [op.v0,op.v1,op.u0,op.u1,c.V,c.U] : [op.u0,op.u1,op.v0,op.v1,c.U,c.V];
      const w=a1-a0, lines=[]; if(w<=b+1e-6) lines.push((a0+a1)/2, (a0+a1)/2); else { const n=Math.max(2, Math.ceil((w-b)/(0.8*b))+1); for(let i=0;i<n;i++) lines.push(a0+b/2+(w-b)*i/(n-1)); if(lines.length%2) lines.push(lines[lines.length-1]); }
      const p0 = s0<=0.001 ? 0 : s0+b/2, p1 = s1>=smax-0.001 ? smax : s1-b/2;     // runs off an edge: to the edge; stopped: the bit's end
      const pt=(a,s)=>alongU ? X(q,s,a) : X(q,a,s);
      const levels=op.depth>tl.step+1e-6 ? [op.depth*0.8, op.depth] : [op.depth];
      levels.forEach(dep=>{ const zt=t-dep, len=Math.abs(p1-p0), ramp=Math.min(o.ramp, len/2), dirS=Math.sign(p1-p0)||1;
        const [sx,sy]=pt(lines[0],p0), [rx,ry]=pt(lines[0],p0+dirS*ramp);
        L.push(`G0 X${f4(sx)} Y${f4(sy)} Z${f4(o.safe)}`, `G1 Z${z(t)} F${tl.plunge}.0`, `G1 X${f4(rx)} Y${f4(ry)} Z${z(zt)} F${tl.feed}.0`);
        lines.forEach((a,i)=>{ const from=i%2?p1:p0, to=i%2?p0:p1; if(i>0){ const [x,y]=pt(a,from); L.push(`G1 X${f4(x)} Y${f4(y)}`); } const [x,y]=pt(a,to); L.push(`G1 X${f4(x)} Y${f4(y)}`); });
        const [bx,by]=pt(lines[0],p0); L.push(`G1 X${f4(bx)} Y${f4(by)}`, `G1 X${f4(rx)} Y${f4(ry)}`, `G0 Z${f4(o.safe)}`); });
    }); });
  // 3. outlines (side A only): skim the big parts, then every part through (small ones first)
  if(side==='A'){ const tl=tool('prof'), r=tl.dia/2;
    const loop=(q, zt, feed)=>{ const E=offsetPath(q.p.cnc.outline, r).map(e=>({...e, st:X(q,...e.st), en:X(q,...e.en), corner:X(q,...e.corner), nextStart:X(q,...e.nextStart)}));
      // turning a part 90° or mirroring keeps a closed loop; we go round it in the order given (clockwise on the part)
      let k=0, best=-1; E.forEach((e,i)=>{ const l=Math.hypot(e.en[0]-e.st[0], e.en[1]-e.st[1]); if(l>best){ best=l; k=i; } });
      const e0=E[k], dx=e0.en[0]-e0.st[0], dy=e0.en[1]-e0.st[1], l=Math.hypot(dx,dy), ux=dx/l, uy=dy/l;
      const S=[e0.st[0]+ux*Math.max(0,(l-o.leadIn)/2), e0.st[1]+uy*Math.max(0,(l-o.leadIn)/2)], R=[S[0]+ux*o.leadIn, S[1]+uy*o.leadIn];
      L.push(`G0 X${f4(S[0])} Y${f4(S[1])} Z${f4(o.safe)}`, `G1 Z${z(t)} F${tl.plunge}.0`, `G1 X${f4(R[0])} Y${f4(R[1])} Z${z(zt)} F${tl.plunge}.0`);
      const cw = side==='B' ? 'G3' : 'G2';
      for(let j=0;j<E.length;j++){ const e=E[(k+j)%E.length];
        if(j>0) L.push(`G1 X${f4(e.st[0])} Y${f4(e.st[1])}${j===1?` F${feed}.0`:''}`);
        L.push(`G1 X${f4(e.en[0])} Y${f4(e.en[1])}${j===0?` F${feed}.0`:''}`);
        if(e.convex){ const ns=e.nextStart; L.push(`${cw} X${f4(ns[0])} Y${f4(ns[1])} I${f4(e.corner[0]-e.en[0])} J${f4(e.corner[1]-e.en[1])}`); } }
      L.push(`G1 X${f4(e0.st[0])} Y${f4(e0.st[1])}`, `G1 X${f4(R[0]+ux*o.overlap)} Y${f4(R[1]+uy*o.overlap)}`, `G0 Z${f4(o.safe)}`); };
    placed.filter(q=>q.U*q.V>=o.onionArea).forEach(q=>loop(q, o.onion, tl.onionFeed));
    placed.slice().sort((a,b)=>a.U*a.V-b.U*b.V).forEach(q=>loop(q, o.thru, tl.feed)); }
  L.push(`G0 Z${f4(o.start)}`, 'G0 X0.0000 Y0.0000', 'M5');
  return L.join('\n')+'\n';
}

/* ---------------------------------------------------------------- the whole job */
const safeName = s => String(s).replace(/[^\w .+-]+/g,'').replace(/\s+/g,' ').trim() || 'Cabinets';
function cabinetJob(items, { job='Cubit Home', t }={}){
  const S=settings(), mat=S.mat.name, tt = t ?? S.mat.t;
  const pieces=jobParts(items), { sheets, tooBig }=nest(pieces);
  const files=[];
  sheets.forEach((s,i)=>{ const base=`${safeName(job)} ${safeName(mat)} S${String(i+1).padStart(2,'0')}R01`;
    const hasB=s.placed.some(q=>q.p.cnc.ops.some(op=>op.side==='B'));
    if(hasB) files.push({ sheet:i, side:'B', name:`${base}-B first.TAP`, text:program({ file:`${base}-B first.TAP`, mat, t:tt, placed:s.placed, side:'B' }) });
    files.push({ sheet:i, side:'A', name:`${base}.TAP`, text:program({ file:`${base}.TAP`, mat, t:tt, placed:s.placed, side:'A' }) }); });
  return { job, mat, t:tt, sheets, tooBig, files, pieces };
}
/* parts list (Mozaik-like): one line per piece with its sheet and place */
function jobCSV(J){
  const rows=[['Sheet','Part','Cut width (in)','Cut length (in)','X','Y','Turned']];
  J.sheets.forEach((s,i)=>s.placed.forEach(q=>rows.push([i+1, q.label, q.U.toFixed(3), q.V.toFixed(3), q.x.toFixed(3), q.y.toFixed(3), q.r?'yes':'no'])));
  return rows.map(r=>r.map(v=>/[",]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:v).join(',')).join('\n');
}
async function jobZip(J){
  const { zip } = await import('./cnc.js');
  const readme=[`${J.job} · ${J.mat} · measured ${J.t.toFixed(3)}″`, '',
    `${J.sheets.length} sheet${J.sheets.length>1?'s':''} of ${CAB_CNC.sheet[0]} × ${CAB_CNC.sheet[1]}, ${J.pieces.length} parts.`,
    'Each sheet: load it GOOD FACE DOWN and run S##R01.TAP. If a sheet also has a "-B first" program, run that one first with the sheet the other way up, then turn it over and run the main one: the cut-throughs are always last.',
    'Z0 is the spoilboard. The programs are for the thickness above: if the sheets measure differently, make them again.',
    'Tools (WALLS TOOLSET): T7 5 mm drill · T11 35 mm · T8 8 mm · T2 ½″ · T14 ¼″ · T1 ⅜″.'].join('\n');
  return zip([{ name:'README.txt', text:readme }, { name:'parts.csv', text:jobCSV(J) }, ...J.files.map(f=>({ name:f.name, text:f.text }))]);
}
/* a sheet as a picture: parts, their labels, holes and dados */
function sheetSVG(s, { px=420 }={}){
  const [SW,SL]=CAB_CNC.sheet, k=px/SL, W=SL*k, H=SW*k;   // drawn landscape: Y (96″) to the right, X (48″) up
  const P=(x,y)=>[y*k, H-x*k];
  let g=`<svg viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" class="cc-sheet"><rect x="0" y="0" width="${W}" height="${H}" class="cc-board"/>`;
  s.placed.forEach(q=>{ const c=q.p.cnc, pts=c.outline.map(([u,v])=>P(...toSheet(q,u,v)));
    g+=`<polygon points="${pts.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ')}" class="cc-part"><title>${q.label} ${q.U.toFixed(3)} × ${q.V.toFixed(3)}</title></polygon>`;
    c.ops.forEach(op=>{ if(op.u!=null){ const [x,y]=P(...toSheet(q,op.u,op.v)); g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(0.8,op.d/2*k).toFixed(1)}" class="cc-hole"/>`; }
      else { const a=P(...toSheet(q,op.u0,op.v0)), b=P(...toSheet(q,op.u1,op.v1)); g+=`<rect x="${Math.min(a[0],b[0]).toFixed(1)}" y="${Math.min(a[1],b[1]).toFixed(1)}" width="${Math.abs(b[0]-a[0]).toFixed(1)}" height="${Math.abs(b[1]-a[1]).toFixed(1)}" class="cc-dado"/>`; } });
    const cx=pts.reduce((a,p)=>a+p[0],0)/pts.length, cy=pts.reduce((a,p)=>a+p[1],0)/pts.length, rot=(q.r? (q.V>q.U) : (q.V>q.U)) && false;
    g+=`<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" class="cc-lab" text-anchor="middle">${q.label.replace(/</g,'')}</text>`; });
  return g+'</svg>';
}
export { CAB_CNC, cabinetJob, jobZip, jobCSV, sheetSVG, nest, offsetPath, jobParts };
