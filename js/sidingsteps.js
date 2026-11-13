/* Cubit Builder — sidingsteps.js : the order the crew puts a wall's siding up in, one step per piece.
   Shared by the install guide pages (Sheets → Siding install guide) and the 3D step-through (Install steps).
   Per wall: the black ACM and J-trim at each opening first, then each run left to right, its pieces from the
   rib-end side back (each new rib end laps the flange already up), the joiner, then the trims at the two ends.
   Every step names the 3D pieces it puts up (userData.sk from sidingmesh.js). */
import { MOLD, ACM_LAP, SIDING_TRIM as TR } from './sidinglayout.js';
import { fin } from './format.js';

const f2 = v => fin(Math.round(v*16)/16);
const EDGE = { C:'the Einspine corner', I:'the inside corner', J:'the pod joint', M:'the brick mold', X:'the joiner' };
function wallSteps(Wl, Sc){
  const steps=[], len=Math.round(Wl.H*16)/16, mark=Sc?.mark||{}, S=Sc?.S;
  const pm=mark['P|'+len]||'P';
  Wl.cols.forEach((c,ci)=>{ const keys=[]; if(c.below>0.5) keys.push(`a|${ci}|below`); if(c.above>0.5) keys.push(`a|${ci}|above`);
    const w=c.m.x1-c.m.x0+2*ACM_LAP;
    steps.push({ kind:'acm', keys, x0:c.m.x0, x1:c.m.x1, title:`Opening ${f2(c.m.x0+MOLD)} → ${f2(c.m.x1-MOLD)}: black ACM and J-trim`,
      text:`${c.below>0.5?`ACM ${f2(w)} × ${f2(c.below)} below`:''}${c.below>0.5&&c.above>0.5?' and ':''}${c.above>0.5?`ACM ${f2(w)} × ${f2(c.above)} above`:''}, against the wall, ${f2(ACM_LAP)} past the brick mold each side. Then J-trim up both sides of the brick mold and the drip flashing over the head.` }); });
  Wl.runs.forEach((R,ri)=>{ if(R.narrow) steps.push({ kind:'acm', keys:[`n|${ri}`], x0:R.x0, x1:R.x1, title:`Strip ${f2(R.x0)} → ${f2(R.x1)}: black ACM, full height`, text:`Too narrow for siding: ACM ${f2(R.W)} wide, full height, against the wall.` }); });
  let n=0;
  Wl.runs.forEach((R,ri)=>{
    if(R.narrow || R.connectorOnly) return;
    if(R.joinerOnly){ steps.push({ kind:'trim', keys:[`j|${ri}`], x0:R.x0, x1:R.x1, title:'Joiner only', text:`Between the two brick molds (${f2(R.W)}): the joiner, centred.` }); return; }
    const idx=R.pieces.map((p,pi)=>({ p, pi }));
    let order;
    if(R.split) order=[...idx.filter(o=>!o.p.ribR).sort((a,b)=>a.p.x0-b.p.x0), ...idx.filter(o=>o.p.ribR).sort((a,b)=>b.p.x0-a.p.x0)];
    else order=R.ribsRight ? idx.sort((a,b)=>b.p.x0-a.p.x0) : idx.sort((a,b)=>a.p.x0-b.p.x0);
    order.forEach(({p,pi},k)=>{ n++;
      const m = p.kind==='panel' ? pm : (mark['R|'+Math.round(p.w*16)/16+'|'+p.keeps+'|'+len]||'R');
      const ribX=p.ribR ? p.x1 : p.x0, dir=p.ribR ? 'right' : 'left';
      const firstOfSide = R.split ? (k===0 || (p.ribR && !order[k-1].p.ribR)) : k===0;
      let where;
      if(firstOfSide){ const e=R.split ? 'M' : (R.ribsRight ? R.ends[1] : R.ends[0]);
        where = e==='M' ? `rib end against the brick mold (tuck up to ${f2(TR.mold.tuck)} into the J-trim)` : `${p.kind==='rip'?'cut edge':'edge'} ${f2(R.ribsRight ? R.d[1] : R.d[0])} in from the wall's ${R.ribsRight?'right':'left'} end, under the ${e==='C'?'corner trim':e==='I'?'inside corner trim':'connector'} to come`; }
      else where=`rib end laps over the flange of the one before`;
      const cut = p.kind==='rip' ? ` Cut ${f2(p.w)} showing from a stock ${pm}, keep the ${p.keeps==='rib'?'rib end':'flange end'}; the cut edge goes under ${EDGE[p.cutAt]||'the trim'}.` : (p.hop ? ' Hopped a rib.' : ` Cover ${f2(p.cover)}.`);
      steps.push({ kind:p.kind, keys:[`p|${ri}|${pi}`], x0:p.x0, x1:p.x1, n, mark:m, ribR:p.ribR, ribX, piece:p,
        title:`${n}. ${m}${p.kind==='rip'?` rip ${f2(p.w)}`:''} · rib end ${dir}`, text:`${where}. Rib-end mark ${f2(ribX)} from the left end.${cut}` }); });
    if(R.joiner) steps.push({ kind:'trim', keys:[`j|${ri}`], x0:R.joiner.x-TR.joiner.w/2, x1:R.joiner.x+TR.joiner.w/2, title:'Joiner', text:`Standard ${TR.joiner.w}″ joiner over the gap between the two runs (gap ${f2(R.joiner.gap)}), centred at ${f2(R.joiner.x)}.` });
  });
  const endTrim=(e,side)=>{ const R=side==='L' ? Wl.runs[0] : Wl.runs[Wl.runs.length-1], d=R?.d ? (side==='L'?R.d[0]:R.d[1]) : 0;
    if(e==='C') return { title:`Corner trim, ${side==='L'?'left':'right'} end`, text:`The standard Einspine corner trim (${TR.corner.leg}″ legs). Screws only: it comes off to reach the spine.` };
    if(e==='I') return { title:`Inside corner trim, ${side==='L'?'left':'right'} end`, text:`The standard inside corner trim (${TR.inside.leg}″ legs).` };
    const j=S?.joints?.find(j=>j.walls.includes(Wl.s.label)), jm=j ? (mark['J|'+j.w+'|'+j.len]||'J') : 'J';
    return { title:`Pod joint connector ${jm}, ${side==='L'?'left':'right'} end`, text:`Connector ${jm}${j?` (${f2(j.w)} face)`:''}: on this side the siding stops ${f2(d)} from the pod's end. Put it up once both pods' siding is on.` }; };
  [['L',Wl.ends[0]],['R',Wl.ends[1]]].forEach(([side,e])=>{ const t=endTrim(e,side); steps.push({ kind:'trim', keys:[side==='L'?'tL':'tR'], x0:side==='L'?0:Wl.L-4, x1:side==='L'?4:Wl.L, ...t }); });
  return steps;
}
export { wallSteps };
