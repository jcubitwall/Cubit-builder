/* Cubit Builder — framing.js : the lumber inside the SIP walls and the LVL rims of the floor and roof cassettes,
   cut to size for the home on screen.

   Walls (2×6 in the 6½″ exterior walls, 2×4 in the 4½″ interior walls), in the wall's own inches: x from the
   left end seen from outside, y up from the bottom of the 96″ panel.
   · Bottom plate: single, fastened to the FLOOR first; the wall is set down over it (recessed into the bottom of
     the panels). Stops at doors, patio doors and cased openings. Its two top corners are bevelled ¾″.
   · Top plate: single, fastened to the CEILING; it locks into the top of the walls as the ceiling is lowered.
     Runs the full length of the wall (splice anywhere). Its two bottom corners are bevelled ¾″.
   · End stud: one at each end of the wall, between the plates (93″), for the long SIP screws.
   · Jacks: one each side of every window and door, the height of the opening (sides only, no headers, no
     sill or head pieces). A door's jacks sit on the bottom plate.
   · Splines: two ½″ OSB splines (one near each face) at every panel joint, between the plates. Where an
     opening's edge falls on the joint its jack takes the joint for the height of the opening; the splines
     still run below and above it. Each spline is stapled to the panel already standing (left, as the crew
     sees the wall) on the edge that meets the next panel; the last panel carries none.
   Floors and roofs: 1⅞″ LVL rim, 9¼″ in the floor and 11⅞″ in the roof, four pieces per pod touching only at
   the inside corners, leaving a 1⅞″ square at each outside corner for the Einspine. */
import { FRAME, H, FT, SPINE_SCREWS } from './config.js';
import { panelSpans, wallLen, bodyWall } from './panels.js';
import { slotsFor, podList } from './layout.js';
import { pickFor, state } from './state.js';
import { panelPlan } from './labels.js';
import { packStock } from './deckframe.js';

const SNAP = 0.25;
const fmtIn = v => { const n=Math.round(v*16); const w=Math.floor(n/16), f=n%16, g=(a,b)=>b?g(b,a%b):a, d=g(f,16); return (w?w:'')+(f?`${w?' ':''}${f/d}/${16/d}`:'')+'″'; };
const isFloorOpening = o => o.kind!=='vent' && o.kind!=='window' && o.y < 1.6;

/* A pod corner where both walls have an opening right up against the corner (full-height windows or doors on
   both sides) has no SIP left to hold it: a 6½″ × 6½″ post fills the corner square instead, between the plates,
   notched for the Einspine. It belongs to the end wall (the one that runs through the corner). */
const REACH = 2;   // an opening edge within 2″ of the corner (past the end wall's thickness) counts as up against it
function opensAtEnd(slot, end){
  const w=bodyWall(slot, pickFor(slot)); if(!w) return false;
  const L=wallLen(w), lim=(slot.short ? (slot.type==='int'?4.5:6.5) : 0)+REACH;
  return w.openings.some(o=>o.kind!=='vent' && (end===0 ? o.x<=lim : L-(o.x+o.w)<=lim));
}
function cornerPost(slot, end){
  if(!slot.corner?.[end] || !slot.short) return false;
  const c = end===0 ? slot.p0n : slot.p1n, same=(a,b)=>Math.abs(a[0]-b[0])<1e-6 && Math.abs(a[1]-b[1])<1e-6;
  const other = slotsFor(state.model).find(q=>q.id!==slot.id && q.pod.i===slot.pod.i && ((q.corner?.[0] && same(q.p0n,c)) || (q.corner?.[1] && same(q.p1n,c))));
  if(!other) return false;
  const oe = other.corner?.[0] && same(other.p0n,c) ? 0 : 1;
  return opensAtEnd(slot, end) && opensAtEnd(other, oe);
}
function wallFraming(slot, w0){
  const w=bodyWall(slot, w0); if(!w) return null;
  const L=wallLen(w), P=FRAME.plate, lum=slot.type==='int' ? FRAME.int : FRAME.ext, t=FRAME.ply;
  const out=[], add=(kind, x0, x1, y0, y1, note='', extra={})=>{ if(x1-x0>0.01 && y1-y0>0.01) out.push({kind, x0, x1, y0, y1, len: kind.endsWith('plate') ? x1-x0 : y1-y0, note, lumber:lum.name, ...extra}); };
  // the Einspine notch at a pod corner (end walls only): the plates are notched around it too
  const [nl,nr]=w.notch||[0,0], wt=(slot.type==='int'?4.5:6.5), zc0=(wt-lum.d)/2;   // lumber sits zc0 in from the outer face
  const pn=(a,b)=>{ const n=[]; if(nl && a<0.01) n.push('left'); if(nr && b>L-0.01) n.push('right'); return n; };
  const notchTxt=ends=>ends.length?` · notch ${fmtIn(nl||nr)} × ${fmtIn((nl||nr)-zc0)} at the ${ends.join(' and ')} end${ends.length>1?'s':''} for the Einspine`:'';
  // plates
  add('Top plate', 0, L, H-P, H, 'on the ceiling · full length, splice anywhere · bevel 2 bottom corners ¾″'+notchTxt(pn(0,L)), {notch:pn(0,L)});
  let segs=[[0,L]];
  w.openings.filter(isFloorOpening).forEach(o=>{ segs=segs.flatMap(([a,b])=>{ const c=o.x, d=o.x+o.w; if(d<=a||c>=b) return [[a,b]]; const r=[]; if(c>a) r.push([a,c]); if(d<b) r.push([d,b]); return r; }); });
  segs.forEach(([a,b])=>add('Bottom plate', a, b, 0, P, 'on the floor · stops at doors · bevel 2 top corners ¾″'+notchTxt(pn(a,b)), {notch:pn(a,b)}));
  // corner posts (this wall runs through a corner with openings against it on both sides), and the long wall
  // that meets such a corner, which then needs no end stud or jack there
  const wt0=(slot.type==='int'?4.5:6.5), posts=[cornerPost(slot,0), cornerPost(slot,1)];
  const meets=[0,1].map(e=>{ if(slot.short || !slot.corner?.[e]) return false;
    const c=e===0?slot.p0n:slot.p1n, same=(a,b)=>Math.abs(a[0]-b[0])<1e-6&&Math.abs(a[1]-b[1])<1e-6;
    const q=slotsFor(state.model).find(q=>q.short && q.pod.i===slot.pod.i && ((q.corner?.[0]&&same(q.p0n,c))||(q.corner?.[1]&&same(q.p1n,c))));
    return q ? cornerPost(q, q.corner?.[0]&&same(q.p0n,c)?0:1) : false; });
  const postZone=[]; if(posts[0]) postZone.push([0,wt0]); if(posts[1]) postZone.push([L-wt0,L]);
  posts.forEach((p,e)=>{ if(!p) return; const [a,b]=e===0?[0,wt0]:[L-wt0,L];
    add('Corner post', a, b, P, H-P, `${e===0?'left':'right'} end · openings against the corner on both walls · notch ${fmtIn(nl||nr||1.75)} × ${fmtIn(nl||nr||1.75)} for the Einspine`, {zf:[0,wt0], lumber:`${fmtIn(wt0)} × ${fmtIn(wt0)} post`, post:true}); });
  // jacks
  const jacks=[];
  w.openings.filter(o=>o.kind!=='vent').forEach(o=>{
    const y0=Math.max(o.y, isFloorOpening(o) ? P : 0), y1=Math.min(o.y+o.h, H-P);
    const name = o.kind==='window' ? 'window' : o.kind==='patio' ? 'patio door' : o.kind==='opening' ? 'cased opening' : 'door';
    [[o.x-t, o.x, 'left'], [o.x+o.w, o.x+o.w+t, 'right']].forEach(([a,b,side])=>{
      const x0=Math.max(0,a), x1=Math.min(L,b); if(x1-x0<0.5) return;
      if(postZone.some(([u,v])=>x0<v+0.1 && x1>u-0.1)) return;                 // the corner post is this jack
      if((meets[0] && x0<REACH+0.1) || (meets[1] && x1>L-REACH-0.1)) return;  // against a corner post
      jacks.push({x0,x1}); add('Jack', x0, x1, y0, y1, `${name} ${side} side, opening ${o.w.toFixed(2)} wide`);
    });
  });
  // end studs; at a pod corner the end wall wraps the Einspine notch with two pieces so every Dynobite screw
  // through either face of the spine lands in wood: a full stud just inboard of the notch, and a stud ripped
  // to fit behind the notch at the very end of the wall (from the notch back to the inside of the core)
  [[nl, nl+t, 'left end', 0], [L-nr-t, L-nr, 'right end', L-t]].forEach(([a,b,side,cx])=>{
    if(jacks.some(j=>j.x0<b-0.1 && j.x1>a+0.1)) return;
    if(posts[side==='left end'?0:1] || meets[side==='left end'?0:1]) return;   // a corner post takes this end
    const n = side==='left end' ? nl : nr;
    add('End stud', a, b, P, H-P, side+(n?' · just inboard of the Einspine notch':''));
    if(n){ const z0=n, z1=wt-zc0, rip=z1-z0;
      add('Corner stud', cx, cx+t, P, H-P, `${side} · behind the Einspine notch · rip a ${lum.name} to ${fmtIn(rip)}`, {zf:[z0,z1], rip}); }
  });
  // splines at each panel joint, between the plates, minus openings at or over the joint
  const plan=panelPlan(slot, w0), spans=panelSpans(w), joints=spans.slice(0,-1).map(s=>s[1]);
  const byK=k=>plan.panels.find(p=>p.k===k);
  const splines=[];
  joints.forEach((jx,i)=>{
    const left=byK(i), right=byK(i+1);                     // left / right of the joint seen from outside
    // the panel that's already standing when the crew reaches this joint carries the splines
    const first = left.order < right.order ? left : right, second = first===left ? right : left;
    let ys=[[P, H-P]];
    w.openings.filter(o=>o.x-SNAP<=jx && o.x+o.w+SNAP>=jx).forEach(o=>{ ys=ys.flatMap(([a,b])=>{ const c=o.y, d=o.y+o.h; if(d<=a||c>=b) return [[a,b]]; const r=[]; if(c>a) r.push([a,c]); if(d<b) r.push([d,b]); return r; }); });
    ys.filter(([a,b])=>b-a>0.5).forEach(([a,b])=>['outside face','inside face'].forEach(face=>{
      const sp={kind:'Spline', x0:jx-FRAME.spline.w/2, x1:jx+FRAME.spline.w/2, y0:a, y1:b, len:b-a, face, joint:jx, carrier:first.code, receiver:second.code, lumber:'½″ OSB'};
      out.push({...sp, note:`${face} · stapled to ${first.code}, ${second.code} slides on`}); splines.push(sp); }));
  });
  return { slot, w, L, lumber:lum, pieces:out, plan, joints };
}
/* LVL rim boards for every pod: floor (9¼″) and roof (11⅞″), outside length minus the two 1⅞″ corner squares */
function podRims(){
  const t=FRAME.lvl.t;
  return podList(state.model).map(p=>{ const long=p.len*FT-2*t, short=96-2*t;
    return { pod:p, pieces:[['Floor rim LVL', FRAME.lvl.floor, long, 2], ['Floor rim LVL', FRAME.lvl.floor, short, 2], ['Roof rim LVL', FRAME.lvl.roof, long, 2], ['Roof rim LVL', FRAME.lvl.roof, short, 2]] }; });
}
function homeFraming(){
  return slotsFor(state.model).map(s=>{ const w=pickFor(s); return w ? wallFraming(s,w) : null; }).filter(Boolean);
}
/* whole-home takeoff: cut list by material and what to buy */
function framingTakeoff(walls=homeFraming(), rims=podRims()){
  const groups={};   // material → {cuts: Map name|len → n, all: []}
  const put=(mat, name, len, n=1)=>{ const g=(groups[mat] ||= {cuts:{}, all:[]}); const k=name+'|'+len.toFixed(3); (g.cuts[k] ||= {name, len, n:0}).n+=n; for(let i=0;i<n;i++) g.all.push(len); };
  walls.forEach(W=>W.pieces.forEach(p=>put(p.kind==='Spline' ? '½″ OSB splines, 3½″ wide' : p.lumber, p.kind, p.len)));
  rims.forEach(R=>R.pieces.forEach(([name,h,len,n])=>put(`LVL 1⅞″ × ${h===FRAME.lvl.floor?'9¼″':'11⅞″'}`, name, len, n)));
  const out=Object.entries(groups).map(([mat,g])=>{
    const cuts=Object.values(g.cuts).sort((a,b)=>a.name.localeCompare(b.name)||b.len-a.len);
    let buy='';
    if(/^2×/.test(mat)){
      // lengths over 16′ (top plates on long walls) are bought as 16′ plus the rest; the splice can go anywhere
      const parts=g.all.flatMap(l=>{ const r=[]; let x=l; while(x>192+1e-6){ r.push(192); x-=192; } r.push(x); return r; });
      const st=packStock(parts, FRAME.stock); buy=Object.entries(st.byLen).sort((a,b)=>+a[0]-+b[0]).map(([ft,n])=>`${n} × ${ft}′`).join(' · ');
    } else if(/OSB/.test(mat)){
      // ripped from 4 × 8 sheets along the 8′ length: 13 strips of 3½″ per sheet (⅛″ kerf)
      const st=packStock(g.all, [8]), strips=st.boards.length, sheets=Math.ceil(strips/13);
      buy=`${strips} strips of 3½″ × 8′ → ${sheets} sheet${sheets===1?'':'s'} of 4 × 8 × ½″ OSB`;
    } else {
      const lf=g.all.reduce((a,b)=>a+b,0)/12; buy=`${g.all.length} pieces · ${lf.toFixed(1)} linear ft (order lengths to suit; longest piece ${(Math.max(...g.all)/12).toFixed(2)}′)`;
    }
    return { mat, cuts, pieces:g.all.length, buy };
  });
  // Einspines: one at every pod corner; Dynobite screws through each spine into the corner wood
  const spines=rims.length*4, S=SPINE_SCREWS, wallN=S.wallSides*(Math.ceil(H/S.wallEvery)-1), per=S.perLVL*S.lvlEnds+wallN;
  out.push({ mat:`Einspine screws (${S.size})`, cuts:[{name:`per Einspine: ${S.perLVL} into each of the ${S.lvlEnds} LVL ends + ${wallN} up the wall (1 per side every 2′)`, len:0, n:per}], pieces:spines*per, buy:`${spines*per} screws · ${per} per Einspine × ${spines} Einspines (4 per pod)`, fastener:true });
  const order=m=>/^LVL/.test(m)?0:/2×6/.test(m)?1:/2×4/.test(m)?2:/OSB/.test(m)?3:4;
  return out.sort((a,b)=>order(a.mat)-order(b.mat));
}
/* where the plates go on each pod's floor (bottom plates) and ceiling (top plates), in plan feet: each plate's
   outer edge sits ½″ in from the wall's outer face (behind the ⁷⁄₁₆″ OSB, centred in the foam core) */
function platesByPod(walls=homeFraming()){
  const by={};
  walls.forEach(W=>{ const s=W.slot, r=[s.n[1],-s.n[0]], tl=(W.w.trim?.[0]||0)/FT, base=[s.p0[0]+r[0]*tl, s.p0[1]+r[1]*tl];
    const inset=(FRAME.osb+((s.type==='int'?4.5:6.5)-2*FRAME.osb-W.lumber.d)/2)/FT, d=W.lumber.d/FT;
    W.pieces.filter(p=>/plate/.test(p.kind)).forEach(p=>{
      const a=[base[0]+r[0]*p.x0/FT-s.n[0]*inset, base[1]+r[1]*p.x0/FT-s.n[1]*inset], b=[base[0]+r[0]*p.x1/FT-s.n[0]*(inset+d), base[1]+r[1]*p.x1/FT-s.n[1]*(inset+d)];
      const rect=[Math.min(a[0],b[0]), Math.min(a[1],b[1]), Math.max(a[0],b[0]), Math.max(a[1],b[1])];
      ((by[s.pod.i] ||= {pod:s.pod, floor:[], ceiling:[]})[p.kind==='Bottom plate'?'floor':'ceiling']).push({rect, len:p.len, wall:s.letter, lumber:W.lumber.name, ax: Math.abs(r[0])>0.5 ? 'x' : 'z'});
    }); });
  return Object.values(by).sort((a,b)=>a.pod.i-b.pod.i);
}
export { platesByPod, wallFraming, homeFraming, podRims, framingTakeoff, isFloorOpening };
