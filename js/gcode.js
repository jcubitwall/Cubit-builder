/* Cubit Builder — gcode.js : writes ShopSabre .tap files exactly the way the shop's VCarve post does.

   Post: "ShopSabre ATC Arc (inch) (*.tap)" (Vectric post library). Its templates are copied below
   (HEADER, RAPID, FEED, ARC, NEW_SEGMENT, TOOLCHANGE, FOOTER): X/Y/Z/F are only written when they change,
   and a value that isn't written leaves its space, as VCarve does. CRLF line ends, 4 decimals.

   Learned from the shop's own files (Kya24 LP-X, Oct 2026), all inches:
     · Job = one SIP panel, X across the 48″ width, Y along the 96″ length, origin at the panel's lower-left.
     · Z = 0 is the TABLE (spoilboard), not the top of the panel. Top of panel = Z thickness.
       Through cuts go to Z −0.05; 3″ box pockets go to Z (thickness − 3).
     · Safe Z (home Z) = thickness + 1. Rapid down to thickness + 0.2, then plunge at 150 ipm. Feed 180 ipm.
     · Tool 13 = ¾″ 2-flute end mill ("SIP panel cutter"), 10 000 rpm.
     · Part outlines and through holes: two passes, Z 0.125 then Z −0.05. Single cut lines: one pass.
     · Pockets: offset rings 0.3″ apart, from the middle out, counter-clockwise (climb).
       Profiles and holes run conventional (parts counter-clockwise outside, holes clockwise inside).
     · Two-sided panels: file "a" (E = exterior face up) then file "b" (I = interior face up). Flipping
       mirrors X across the 48″ width: x on one face = 48 − x on the other.

   A job: { thick, tool?, ops:[ op… ] }, ops in cutting order. Each op may name its toolpath (`tp`); a new
   toolpath name starts a new segment (S / F XY / F Z again), as in VCarve.
     { kind:'line',   pts:[[x,y],…], z? }                    tool centre on the line (already offset)
     { kind:'pocket', x0,y0,x1,y1, z }                        the finished pocket (tool kept inside)
     { kind:'hole',   x0,y0,x1,y1, z?, passes? }              rectangular through-hole (tool inside)
     { kind:'circlePocket', cx,cy, d, z }                    round recess, cleared from the middle out
     { kind:'circle', cx,cy, d, z?, passes?, bridge? }        round through-hole (tool inside); bridge = material
                                                              left at the bottom (open hole, plug stays put)
     { kind:'part',   x0,y0,x1,y1, passes? }                  cut a part out (tool outside, round corners)
     { kind:'loop',   pts:[[x,y],…], z?, passes? }            any drawn outline: the tool centre follows pts (already
                                                              offset inside the cut), closed, in passes
     { kind:'rings',  rings:[[[x,y],…],…], z }                any drawn pocket: clearing rings (tool centres), inner first;
                                                              lifts between rings that are far apart
*/
const TOOLS = { 13: { name:'End mill ¾″ (SIP panel cutter)', d:0.75, rpm:10000, feed:180, plunge:150, step:0.3 } };
const THRU = -0.05, SKIN = 0.125;
const f4 = v => (Math.abs(v)<5e-5 ? 0 : v).toFixed(4);

/* the post: turns moves into lines, only writing what changed */
function post(T, safe){
  const out=[], st={X:null,Y:null,Z:null,F:null};
  const w = (k,v,force) => { const s=f4(v); if(!force && st[k]===s) return ''; st[k]=s; return k+s; };
  const fF = v => { const s=v.toFixed(1); if(st.F===s) return ''; st.F=s; return 'F'+s; };
  const L = s => out.push(s);
  return {
    out, L,
    header(tool){ ['G90',`G0 Z${f4(safe)}`,'G0 X0.0000 Y0.0000','M5',`T${tool}`,`S${T.rpm}`,'M50','M3','g4 x 4',
      `G0 Z${f4(safe)}`,'G0 X0.0000 Y0.0000',`F${T.feed} XY`,`F${T.plunge} Z`].forEach(L); },
    segment(){ [`S${T.rpm}`,`F${T.feed} XY`,`F${T.plunge} Z`].forEach(L); st.F=null; },
    rapid(x,y,z,force){ const a=x==null?'':w('X',x,force), b=y==null?'':w('Y',y,force), c=z==null?'':w('Z',z,force);
      if(a||b||c) L(`G0 ${a} ${b} ${c}`); },
    feed(x,y,z,f){ const a=x==null?'':w('X',x), b=y==null?'':w('Y',y), c=z==null?'':w('Z',z), F=fF(f);
      if(a||b||c) L(F ? `G1 ${a} ${b} ${c} ${F}` : `G1 ${a} ${b} ${c}`); },
    arc(cw,x,y,i,j,f){ const a=w('X',x), b=w('Y',y), F=fF(f), g=cw?'G2':'G3';
      L(F ? `${g} ${a} ${b} I${f4(i)} J${f4(j)} ${F}` : `${g} ${a} ${b} I${f4(i)} J${f4(j)}`); },
    footer(){ [`G0 Z${f4(safe)}`,'G0 X0.0000 Y0.0000','M5','m51'].forEach(L); },
  };
}

function gcode(job){
  const tool=job.tool||13, T=TOOLS[tool], r=T.d/2, safe=job.thick+1, near=job.thick+0.2;
  const P=post(T, safe);
  P.header(tool);
  let tp, first=true;
  const lineTo = (x,y) => P.feed(x,y,null,T.feed);
  const arcTo = (cw,x,y,i,j) => P.arc(cw,x,y,i,j,T.feed);
  const plunge = z => P.feed(null,null,z,T.plunge);
  const down = (x,y,z,newSeg) => {
    if(first){ P.rapid(x,y,null); P.L(`G0   Z${f4(safe)}`); first=false; }   // after the header Z is written again
    else if(newSeg) P.rapid(x,y,safe,true);
    else P.rapid(x,y,null);
    P.rapid(null,null,near); plunge(z);
  };
  for(const op of job.ops){
    const newSeg = !first && op.tp!==tp; if(newSeg) P.segment(); tp=op.tp;
    if(op.kind==='line'){
      down(op.pts[0][0], op.pts[0][1], op.z??THRU, newSeg);
      op.pts.slice(1).forEach(([x,y])=>lineTo(x,y));
    }
    else if(op.kind==='pocket'){
      const a=[op.x0+r, op.y0+r, op.x1-r, op.y1-r], rings=[];
      for(let k=0;;k++){ const R=[a[0]+k*T.step, a[1]+k*T.step, a[2]-k*T.step, a[3]-k*T.step];
        if(R[2]-R[0] < -1e-6 || R[3]-R[1] < -1e-6) break; rings.unshift(R); if(R[2]-R[0] < 1e-6 || R[3]-R[1] < 1e-6) break; }
      rings.forEach((R,i)=>{
        if(i===0) down(R[2], R[1], op.z, newSeg); else lineTo(R[2], R[1]);
        lineTo(R[2], R[3]); lineTo(R[0], R[3]); lineTo(R[0], R[1]); lineTo(R[2], R[1]);
      });
    }
    else if(op.kind==='hole'){
      const R=[op.x0+r, op.y0+r, op.x1-r, op.y1-r], zs=op.passes||[SKIN, op.z??THRU];
      zs.forEach((z,i)=>{ if(i) plunge(z); else down(R[0], R[1], z, newSeg);
        lineTo(R[0],R[3]); lineTo(R[2],R[3]); lineTo(R[2],R[1]); lineTo(R[0],R[1]); });
    }
    else if(op.kind==='circlePocket'){
      // round recess: rings 0.3″ apart from the middle out, then the finished size
      const R=op.d/2-r; const rings=[]; for(let k=R; k>1e-3; k-=T.step) rings.unshift(k);
      if(!rings.length){ down(op.cx, op.cy, op.z, newSeg); }
      rings.forEach((rr,i)=>{ const sx=op.cx, sy=op.cy-rr;
        if(i===0){ down(op.cx, op.cy, op.z, newSeg); lineTo(sx, sy); } else lineTo(sx, sy);
        arcTo(true, op.cx-rr, op.cy, 0, rr); arcTo(true, op.cx, op.cy+rr, rr, 0); arcTo(true, op.cx+rr, op.cy, 0, -rr); arcTo(true, op.cx, op.cy-rr, -rr, 0); });
    }
    else if(op.kind==='circle' && op.bridge){
      // round hole with a bridge of material left at the bottom so the plug can't fly: clockwise from the
      // left end of the gap, over the top, to the right end (as in the shop's D4 vent)
      const rr=op.d/2-r, a=Math.asin(Math.min(1,(op.bridge+T.d)/2/rr)), zs=op.passes||[op.z??THRU];
      const at = t => [op.cx+rr*Math.cos(t), op.cy+rr*Math.sin(t)];
      const stops=[-Math.PI/2-a, -Math.PI, Math.PI/2, 0, -Math.PI/2+a].map((t,i)=>i===1?Math.PI:t);
      zs.forEach((z,i)=>{ const s0=at(stops[0]);
        if(i) plunge(z); else down(s0[0], s0[1], z, newSeg);
        let cur=s0;
        [at(Math.PI), at(Math.PI/2), at(0), at(stops[4])].forEach(q=>{ arcTo(true, q[0], q[1], op.cx-cur[0], op.cy-cur[1]); cur=q; });
        if(zs.length>1 && i<zs.length-1){ P.rapid(null,null,near); P.rapid(s0[0],s0[1],null); } });
    }
    else if(op.kind==='circle'){
      const rr=op.d/2-r, zs=op.passes||[op.z??THRU];
      zs.forEach((z,i)=>{ if(i) plunge(z); else down(op.cx, op.cy-rr, z, newSeg);
        arcTo(true, op.cx-rr, op.cy, 0, rr); arcTo(true, op.cx, op.cy+rr, rr, 0);
        arcTo(true, op.cx+rr, op.cy, 0, -rr); arcTo(true, op.cx, op.cy-rr, -rr, 0); });
    }
    else if(op.kind==='loop'){
      const zs=op.passes||[SKIN, op.z??THRU], Q=op.pts;
      zs.forEach((z,i)=>{ if(i) plunge(z); else down(Q[0][0], Q[0][1], z, newSeg);
        Q.slice(1).forEach(([x,y])=>lineTo(x,y)); if(Math.hypot(Q[0][0]-Q[Q.length-1][0],Q[0][1]-Q[Q.length-1][1])>1e-6) lineTo(Q[0][0],Q[0][1]); });
    }
    else if(op.kind==='rings'){
      let last=null;
      op.rings.forEach((Q,i)=>{
        if(i===0) down(Q[0][0], Q[0][1], op.z, newSeg);
        else if(Math.hypot(Q[0][0]-last[0], Q[0][1]-last[1]) > T.step*2){ P.rapid(null,null,near); P.rapid(Q[0][0],Q[0][1],null); plunge(op.z); }
        else lineTo(Q[0][0], Q[0][1]);
        Q.slice(1).forEach(([x,y])=>lineTo(x,y)); last=Q[Q.length-1]; });
    }
    else if(op.kind==='part'){
      const {x0,y0,x1,y1}=op, zs=op.passes||[SKIN, THRU];
      zs.forEach((z,i)=>{ if(i) plunge(z); else down(x0, y0-r, z, newSeg);
        lineTo(x1, y0-r); arcTo(false, x1+r, y0, 0, r);
        lineTo(x1+r, y1); arcTo(false, x1, y1+r, -r, 0);
        lineTo(x0, y1+r); arcTo(false, x0-r, y1, 0, -r);
        lineTo(x0-r, y0); arcTo(false, x0, y0-r, r, 0); });
    }
    P.rapid(null,null,safe);
  }
  P.footer();
  return P.out.join('\r\n')+'\r\n';
}
/* the same panel seen from the other face (after the flip) */
const flipX = (x, W=48) => W-x;
export { gcode, TOOLS, flipX, THRU, SKIN };
