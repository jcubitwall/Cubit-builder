/* Cubit Builder — tap.js : ShopSabre G-code (.tap) for every SIP panel of the home on screen.

   Follows the shop's own VCarve jobs (Kya24 LP-X, Oct 2026) — see docs/CNC.md:
     · Double-sided job, 48 × 96, Z zero = machine bed, XY datum = lower-left, flipped side to side.
     · X across the panel seen from the face that is up, 0 at the left; Y up the wall, 0 at the bottom.
     · One file per side: "<n>-aE_<panel>_Sip-<t>.tap" (exterior up, cut first), then "<n>-bI_…" (interior up).
       A panel with cuts on one face only gets a single "<n>-I_…" or "<n>-E_…". n = panel order (wall A, B, C, D…,
       panel 1 → n within each wall).
     · Openings are cut at the rough opening, one pass right through, the tool inside the opening; a side of
       the opening that lies on a panel edge isn't cut, the cut runs out to that edge.
     · A panel cut to width is trimmed last in the interior pass: one line ⅜″ outside the finished edge,
       from Y −1/16 to 96 1/16. Its factory edge stays on the joint side.
     · Boxes: 3″ pockets on the face they belong to. Vents: rectangular through-holes, two passes.
     · Einspine corner (end walls): from the exterior face, a ¾″ slot 1″–1¾″ in from the corner edge, down to
       Z 0.53 (leaves the inside skin). Taken from the shop's A and C wall files; still to be confirmed.
*/
import { MODELS } from './data.js';
import { H } from './config.js';
import { homePlans, faceShort } from './labels.js';
import { wallLen, panelSpans, handOf } from './panels.js';
import { state } from './state.js';
import { gcode, TOOLS, SKIN, THRU } from './gcode.js';
import { cncSettings, zip } from './cnc.js';
import { fin } from './format.js';
import { bool, boolTree, toolRings, area } from './geom2d.js';

const BLANK = 48, R = TOOLS[13].d/2;
const SLOT = { in:1.375, z:0.53, over:0.1875 };
const TRIM_OVER = 0.0625, DEPTH = 3, SNAP = 0.25;
const BOX = { outlet:{w:2.375,h:3.625}, switch:{w:2.375,h:3.625}, double:{w:4.125,h:3.625}, light:{w:2.375,h:3.625}, other:{w:2.375,h:3.625} };
const thickOf = plan => +(plan.w.t || (plan.slot.type==='int' ? 4.5 : 6.5));
const tName = t => (Math.round(t*10)/10).toString();

/* the opening's cut, in face coords (u across from the left, v up), clipped to the panel 0..W */
function openingCut(u0,u1,v0,v1,W){
  const open={ l:u0<=SNAP, r:u1>=W-SNAP, b:v0<=SNAP, t:v1>=H-SNAP };
  const L=Math.max(u0,0)+R, Rr=Math.min(u1,W)-R, B=Math.max(v0,0)+R, T=Math.min(v1,H)-R;
  if(!open.l && !open.r && !open.b && !open.t)        // closed: up the left, across the top, down the right, back
    return [[[L,B],[L,T],[Rr,T],[Rr,B],[L,B]]];
  // sides clockwise from the left: left (B→T), top (L→R), right (T→B), bottom (R→L); drop the ones on a panel edge
  const sides=[ ['l',[L,B],[L,T]], ['t',[L,T],[Rr,T]], ['r',[Rr,T],[Rr,B]], ['b',[Rr,B],[L,B]] ];
  if(open.l && open.r && open.b && open.t) return [];          // the whole panel is the opening
  const k0 = sides.findIndex((s,i)=>open[s[0]] && !open[sides[(i+1)%4][0]]);   // start just after an open side
  const chains=[]; let cur=null;
  for(let j=1;j<=4;j++){ const s=sides[(k0+j)%4];
    if(open[s[0]]){ if(cur){ chains.push(cur); cur=null; } continue; }
    if(!cur) cur=[s[1]]; cur.push(s[2]); }
  if(cur) chains.push(cur);
  // run each chain's ends out to the panel edge it meets
  return chains.map(c=>{ const a=c.slice(); a[0]=extend(a[0],a[1],open,{L,Rr,B,T,W}); const n=a.length-1; a[n]=extend(a[n],a[n-1],open,{L,Rr,B,T,W}); return a; });
}
/* move an end point out to the panel edge, along its own segment */
function extend(p, q, open, {L,Rr,B,T,W}){
  const [x,y]=p, vertical=Math.abs(p[0]-q[0])<1e-9;
  if(vertical){ if(Math.abs(y-B)<1e-9 && open.b) return [x,0]; if(Math.abs(y-T)<1e-9 && open.t) return [x,H]; }
  else { if(Math.abs(x-L)<1e-9 && open.l) return [0,y]; if(Math.abs(x-Rr)<1e-9 && open.r) return [W,y]; }
  return p;
}

/* a round hole / slot exactly as drawn. `U` maps the wall's x (from the outside-left; for face items the item's
   own x convention) to the face that is up. Through holes cut right through (a bridge is left in holes 4″ and up so the
   plug stays put, as in the shop's D4 vent); recesses are cleared to their depth. */
function shapedOp(ops, o, U, t, z, W, warn, item=false){
  if(z<=0.0625+1e-6) z=THRU;   // a pocket as deep as the wall (or within 1/16″ of it) is a hole right through
  const tool=TOOLS[13].d, thru=z<=THRU+1e-6;
  const what = o.shape==='round' ? `${item&&!thru?'recess':'hole'} ⌀ ${fin(o.d||o.dia)}` : o.shape==='slot' ? `${item?'chase':'slot'} ${fin(o.sw)} wide`
             : o.shape==='poly' ? `${thru?'shaped cut':'shaped pocket'} ${fin(o.w||0)} × ${fin(o.h||0)}` : `${o.kind==='box'?'box':'pocket'} ${fin(o.w)} × ${fin(o.h)}`;
  if(o.shape==='poly'){
    // any other outline: the ¾″ bit follows the paths worked out from the drawing (profile inside a through cut,
    // clearing rings for a pocket); a cut narrower than the bit can't be made with it
    let rings=(o.tool||[]).map(r=>r.map(([x,y])=>[U(x), y]));
    if(!rings.length){ warn.push(`${what} is narrower than the ¾″ bit: not cut`); return; }
    // drawn in the Shape studio: holes run clockwise, pockets climb (counter-clockwise), whichever face is up; arcs go back in as G2/G3
    if(o.key && String(o.key).startsWith('shape')){ rings=rings.map(r=>(area(r)<0)===thru ? r : r.slice().reverse());
      if(thru) rings.forEach(pts=>ops.push({tp:'shaped', kind:'loop', pts, what:o.name?`${o.name} (through)`:what, waste:null, arcs:true}));
      else ops.push({tp:'pockets', kind:'rings', rings, z, what:o.name?`${o.name} (${fin(t-z)} pocket)`:what, arcs:true});
      return; }
    if(thru) rings.forEach(pts=>ops.push({tp:'shaped', kind:'loop', pts, what, waste:null}));
    else ops.push({tp:'pockets', kind:'rings', rings, z, what});
    return;
  }
  if(o.shape==='rect' || (!o.shape && o.w && o.h)){   // a box or pocket at its drawn size (placed by its centre)
    const c=U(o.x);
    if(Math.min(o.w,o.h) < tool-0.01){ warn.push(`${what} is narrower than the ¾″ bit: not cut`); return; }
    if(thru){ ops.push({tp:'holes', kind:'hole', x0:c-o.w/2, x1:c+o.w/2, y0:o.y-o.h/2, y1:o.y+o.h/2, z, what:what+' (right through)', waste:[c-o.w/2+0.4, c+o.w/2-0.4, o.y-o.h/2+0.4, o.y+o.h/2-0.4]}); return; }
    ops.push({tp: o.kind==='box'?'boxes':'pockets', kind:'pocket', x0:c-o.w/2, x1:c+o.w/2, y0:o.y-o.h/2, y1:o.y+o.h/2, z, what});
    return;
  }
  if(o.shape==='round'){
    const d=o.d||o.dia, cx = item ? U(o.x) : U(o.x+o.w/2), cy = item ? o.y : o.y+o.h/2;
    if(d < tool-0.01){ warn.push(`${what} is smaller than the ¾″ bit`); return; }
    if(z<=THRU+1e-6){
      if(d <= tool+0.06) ops.push({tp:'holes', kind:'line', pts:[[cx,cy],[cx,cy]], z, what, waste:null});
      else ops.push({tp:'holes', kind:'circle', cx, cy, d, z, bridge: d>=4 ? 0.5 : 0, what, waste:[cx-d/2+0.4, cx+d/2-0.4, cy-d/2+0.4, cy+d/2-0.4]});
    } else ops.push({tp:'recesses', kind:'circlePocket', cx, cy, d, z, what});
    return;
  }
  // slot: the bit runs along its centre line (a ¾″ slot is one pass; wider ones are flagged for now)
  const ends=(o.ends||[]).map(([x,y])=>[U(x), y]); if(ends.length<2) return;
  if(Math.abs((o.sw||tool)-tool)>0.07) warn.push(`${what}: only ¾″ slots are cut as drawn so far; this one is cut ¾″`);
  ops.push({tp: z<=THRU+1e-6?'holes':'chases', kind:'line', pts:ends, z, what});
}
/* a round opening that runs over a panel joint: on this panel the bit follows its part of the circle (tool inside the
   hole, clockwise like any hole) and carries on past the panel edge by its own radius, so the curve is cut right to
   the edge and the piece drops out. One pass right through, like the openings. */
function roundOverJoint(ops, o, U, W, warn){
  const d=o.d||o.dia||o.w, cx=U(o.x+o.w/2), cy=o.y+o.h/2, rr=d/2-R, lo=-R, hi=W+R, N=192;
  const at = t => [cx+rr*Math.cos(t), cy+rr*Math.sin(t)], ok = p => p[0]>=lo-1e-9 && p[0]<=hi+1e-9;
  // walk the circle clockwise; keep the runs inside lo..hi, ending exactly on lo / hi
  const runs=[]; let cur=null;
  const edgeX = (p,q) => { const X = (p[0]<lo||q[0]<lo) ? lo : hi, t=(X-p[0])/(q[0]-p[0]); return [X, p[1]+t*(q[1]-p[1])]; };
  // start where the circle is off this panel, so every run is whole
  let t0=0; for(let i=0;i<N;i++){ if(!ok(at(-i/N*Math.PI*2))){ t0=-i/N*Math.PI*2; break; } }
  for(let i=0;i<=N;i++){ const p=at(t0-i/N*Math.PI*2);
    if(ok(p)){ if(!cur){ const q=at(t0-(i-1)/N*Math.PI*2); cur=[i?edgeX(q,p):p]; } cur.push(p); }
    else if(cur){ cur.push(edgeX(cur[cur.length-1], p)); runs.push(cur); cur=null; } }
  if(cur) runs.push(cur);
  const what=`round ${o.kind==='window'?'window opening':'hole'} ⌀ ${fin(d)} (over the panel joint)`;
  const waste=[Math.max(cx-d/2,0), Math.min(cx+d/2,W), cy-d/2, cy+d/2];
  runs.forEach((pts,i)=>ops.push({tp:'openings', kind:'line', pts:pts.map(([x,y])=>[+x.toFixed(4),+y.toFixed(4)]), what, waste: i===0 ? waste : null}));
  const part=Math.min(cx+d/2,W)-Math.max(cx-d/2,0); if(part<TOOLS[13].d+0.0625) warn.push(`${what}: the part on this panel is narrower than the bit`);
}
/* a drawn outline through the panel that runs over a panel joint: on this panel, its part (out to ¾″ past the edge)
   is cut with the bit ⅜″ inside it, so the cut reaches right to the edge and the piece drops out */
function polyOverJoint(ops, o, U, W, warn){
  const pts=o.path.map(([x,y])=>[U(x), y]), clip=[[-2*R,-1],[W+2*R,-1],[W+2*R,H+1],[-2*R,H+1]];
  const isl=(o.islands||[]).map(I=>I.map(([x,y])=>[U(x), y]));
  const parts=boolTree(bool([pts],[clip],'inter'), isl, 'diff'); let n=0;
  parts.forEach(P=>toolRings([P.outer, ...P.holes],true).forEach(r=>{ const xs=r.map(p=>p[0]), ys=r.map(p=>p[1]);
    ops.push({tp:'shaped', kind:'loop', pts:r, what:`${o.name||'shaped cut'} (over the panel joint)`, arcs:true, passes:[THRU], waste: n++===0 ? [Math.max(0,Math.min(...xs)), Math.min(W,Math.max(...xs)), Math.min(...ys), Math.max(...ys)] : null}); }));
  if(!n) warn.push(`${o.name||'shaped cut'}: its part on this panel is narrower than the bit`);
}
/* move every op of a file sideways (inches along X) */
function shiftOps(ops, dx){
  const P=q=>[q[0]+dx, q[1]];
  ops.forEach(o=>{ if(o.pts) o.pts=o.pts.map(P); if(o.rings) o.rings=o.rings.map(r=>r.map(P));
    if(o.x0!=null){ o.x0+=dx; o.x1+=dx; } if(o.cx!=null) o.cx+=dx; if(o.waste) o.waste=[o.waste[0]+dx, o.waste[1]+dx, o.waste[2], o.waste[3]]; });
}
function tapPlan(){
  const S=cncSettings(), plans=homePlans(), files=[], blank=[], m=MODELS[state.model];
  const boxSize = k => S.gBoxes?.[k] || BOX[k] || BOX.other;
  const safe = x => String(x).replace(/[^\w .+-]+/g,'').trim();
  plans.forEach(plan=>{
    const w=plan.w, L=wallLen(w), t=thickOf(plan), spans=panelSpans(w);
    // cut in stacking order: the panel that goes on the BOTTOM of the pile is cut first, so the first panel
    // the assemblers need (stack 1) comes off the machine last and sits on top
    const folder = `${safe(plan.slot.pod.label)}/Wall ${plan.slot.letter}`;
    let n=0;
    plan.seq.slice().sort((a,b)=>b.stack-a.stack).forEach(p=>{
      const [x0,x1]=spans[p.k], W=p.width, warn=[];
      const u = xo => x1-xo;                          // wall x (from outside-left) → interior face u
      const I=[], E=[];
      // features made by hand (marked, or too small for the bit) stay off the CNC: listed for the crew instead
      const byHand=[], cnc = (f, face) => { const hm=handOf(f); if(!hm) return true;
        const sz = f.shape==='round' ? `⌀ ${fin(f.d||f.dia)}` : f.w&&(f.h??f.d) ? `${fin(f.w)} × ${fin(f.h??f.d)}` : f.shape||f.kind;
        byHand.push(`${f.kind||'cut'} ${sz}${f.depth?`, ${fin(f.depth)} deep`:''} on the ${face} face${hm==='auto'?' (smaller than the bit)':''}`); return false; };
      p={...p, intCuts:p.intCuts.filter(f=>cnc(f,'room')), extCuts:p.extCuts.filter(f=>cnc(f,'outside')), through:p.through.filter(f=>cnc(f,'room'))};
      byHand.forEach(b=>warn.push(`BY HAND: ${b}`));
      // boxes, interior face (b.x measured from the inside-left)
      p.intCuts.filter(b=>b.shape).forEach(b=>shapedOp(I, b, xo=>u(L-xo), t, t-(b.depth||DEPTH), W, warn, true));
      // a pocket on the outside face that goes the whole way through is cut with the other holes, room face up
      p.extCuts.filter(b=>b.shape).forEach(b=>{ const z=t-(b.depth||DEPTH);
        if(z<=0.0625+1e-6) shapedOp(I, b, xo=>u(xo), t, z, W, warn, true); else shapedOp(E, b, xo=>BLANK-u(xo), t, z, W, warn, true); });
      p.intCuts.filter(b=>!b.shape).forEach(b=>{ const s=boxSize(b.kind), c=u(L-b.x);
        I.push({tp:'boxes', kind:'pocket', x0:c-s.w/2, x1:c+s.w/2, y0:b.y-s.h/2, y1:b.y+s.h/2, z:t-DEPTH, what:b.kind}); });
      // boxes, exterior face (mirror across the blank)
      p.extCuts.filter(b=>!b.shape).forEach(b=>{ const s=boxSize(b.kind), c=BLANK-u(b.x);
        E.push({tp:'boxes', kind:'pocket', x0:c-s.w/2, x1:c+s.w/2, y0:b.y-s.h/2, y1:b.y+s.h/2, z:t-DEPTH, what:b.kind}); });
      // Einspine corner slot(s), exterior face
      if(p.notch){
        const corners=[]; if(w.notch?.[0] && x0<=0.01) corners.push(W); if(w.notch?.[1] && x1>=L-0.01) corners.push(0);
        corners.forEach(cu=>{ const us = cu===0 ? SLOT.in : W-SLOT.in, X=BLANK-us;
          E.push({tp:'einspine', kind:'line', pts:[[X,0],[X,H+SLOT.over]], z:SLOT.z, what:'Einspine slot'}); });
      }
      // openings and vents (interior face, right through)
      p.through.forEach(o=>{
        const a=u(o.x+o.w), b=u(o.x), u0=Math.min(a,b), u1=Math.max(a,b), v0=o.y, v1=o.y+o.h;
        if(u1<=0 || u0>=W) return;
        if(o.shape==='round' || o.shape==='slot' || o.shape==='poly'){
          if(o.shape==='round' && (u0<-0.01 || u1>W+0.01)){ roundOverJoint(I, o, u, W, warn); return; }
          if(o.shape==='poly' && (u0<-0.01 || u1>W+0.01) && o.path && globalThis.ClipperLib){ polyOverJoint(I, o, u, W, warn); return; }
          if(o.shape==='poly' && (u0<-0.01 || u1>W+0.01)){ warn.push(`shaped cut ${fin(o.w)} × ${fin(o.h)} runs over a panel joint: not cut, check the drawing`); return; }
          shapedOp(I, o, u, t, THRU, W, warn); return; }
        if(o.kind==='vent' && u0>SNAP && u1<W-SNAP){ I.push({tp:'vents', kind:'hole', x0:u0, x1:u1, y0:v0, y1:v1, what:'vent', waste:[u0,u1,v0,v1]}); return; }
        const waste=[Math.max(u0,0), Math.min(u1,W), Math.max(v0,0), Math.min(v1,H)];   // the piece that should drop out
        openingCut(u0,u1,v0,v1,W).forEach((pts,i)=>I.push({tp:'openings', kind:'line', pts, what:`${o.kind} ${fin(o.w)} × ${fin(o.h)}`, waste: i===0 ? waste : null}));
        const part=Math.min(u1,W)-Math.max(u0,0); if(part<TOOLS[13].d+0.0625) warn.push(`${o.kind} part on this panel is narrower than the bit`);
        if(u0>SNAP && u0<1) warn.push(`${o.kind} leaves only ${fin(u0)} to the left edge`);
        if(u1<W-SNAP && W-u1<1) warn.push(`${o.kind} leaves only ${fin(W-u1)} to the right edge`);
      });
      // trim to width last (factory edge on the joint side, at u = 0)
      if(p.cut && p.cutEnd!=='right') I.push({tp:'trim', kind:'line', pts:[[W+R,-TRIM_OVER],[W+R,H+TRIM_OVER]], what:`trim to ${fin(W)}`, waste: W+2*R<BLANK-0.1 ? [W+2*R, BLANK, 0, H] : null});
      // cut at its RIGHT end (seen from outside: the stretch's cut panel is on that side): the factory edge is the left
      // end, so on the blank everything moves over and the trim runs on the other side
      if(p.cut && p.cutEnd==='right'){ const off=BLANK-W; shiftOps(I, off); shiftOps(E, -off);
        I.push({tp:'trim', kind:'line', pts:[[off-R,-TRIM_OVER],[off-R,H+TRIM_OVER]], what:`trim to ${fin(W)}`, waste: off-2*R>0.1 ? [0, off-2*R, 0, H] : null}); }
      const base=`${p.code}_Sip-${tName(t)}`;
      const sides = E.length && I.length ? [['aE',E],['bI',I]] : E.length ? [['E',E]] : [['I',I]];
      n++; const nn=String(n).padStart(2,'0');
      if(!E.length && !I.length){                                    // nothing for the CNC: a note keeps its place in the pile
        blank.push({ pod:plan.slot.pod.i, letter:plan.slot.letter, panel:p.code, path:`${folder}/${nn}-NO CNC_${p.code}.txt`, stack:p.stack, of:plan.n,
          text:`Panel ${p.code} (${plan.slot.pod.label}, Wall ${plan.slot.letter}): no CNC work.\r\nPut a ${p.cut?fin(W)+' wide (trim on the saw)':'full 48"'} x 96" ${tName(t)}" SIP panel on the pile here, ${faceShort(plan.slot,plan.assembly)} face up. Label it on that face.\r\nStack position ${p.stack} of ${plan.n} (1 = top).\r\n` });
        return; }
      // after the last pass the panel goes on the pile with the face the assemblers see up (their label goes on it)
      const asm=faceShort(plan.slot, plan.assembly), lastFace=/E/.test(sides[sides.length-1][0]) ? 'ext' : 'int';
      const after = lastFace===plan.assembly ? `stack as cut, ${asm} face up` : `FLIP so the ${asm} face is up, then stack`;
      sides.forEach(([side,ops],si)=>{
        files.push({ after: si===sides.length-1 ? after : 'flip side to side, cut the next file', flip: si===sides.length-1 && lastFace!==plan.assembly, labelFace:asm, pod:plan.slot.pod.i, letter:plan.slot.letter, n, side, name:`${nn}-${side}_${base}.tap`, path:`${folder}/${nn}-${side}_${base}.tap`, stack:p.stack, of:plan.n, panel:p.code, wall:`${plan.slot.pod.label} · Wall ${plan.slot.letter}`, thick:t, width:W,
          ops, warn, text: gcode({thick:t, ops}) });
      });
    });
  });
  return { files, blank, home:m.name, model:state.model };
}

function readmeTap(tp){
  return [
`CUBIT BUILDER - SHOPSABRE G-CODE (.tap)`,
`Home: ${tp.home}`,
`Made: ${new Date().toISOString().slice(0,16).replace('T',' ')}   Files: ${tp.files.length}   Panels: ${new Set(tp.files.map(f=>f.panel)).size}`,
``,
`Post: ShopSabre ATC Arc (inch). Tool 13 (3/4" end mill), 10000 rpm, feed 180, plunge 150.`,
`Set up as the shop's VCarve jobs: double sided, 48 x 96, Z ZERO = MACHINE BED, XY datum lower-left,`,
`flip side to side. X across the panel seen from the face that is up, Y up the wall (0 = bottom).`,
``,
`FOLDERS: home / pod / wall. Within a wall, files are numbered in CUT ORDER = stacking order: 01 is cut first`,
`and goes on the bottom of the pile; the last file is the first panel the assemblers need (stack 1, on top).`,
`A panel with no CNC work has a NO CNC note at its place in the order instead of a .tap file.`,
``,
`STACKING + LABELS: every panel goes on the pile with the face the assemblers see on the upright table UP,`,
`and its label goes on that face. When the last file is cut with the other face up, FLIP the panel before`,
`stacking (manifest.csv, after_cutting). Assembly always starts at the LEFT (squaring edge).`,
``,
`<n>-aE_...  exterior face up, cut first      <n>-bI_...  flip side to side, interior face up`,
`<n>-I_...   interior face up only           <n>-E_...   exterior face up only`,
``,
`Openings are cut at the rough opening. A panel cut to width is trimmed last; its factory edge stays at X0.`,
`Einspine corner slots follow the shop's A / C wall files (3/4" slot 1" to 1 3/4" from the corner, Z 0.53).`,
``,
`No CNC work: ${tp.blank.map(b=>b.panel).join(', ')||'none'} (a NO CNC note keeps each one's place in the pile)`,
``,
`TEST BEFORE CUTTING: air cut first (Z raised), then a scrap panel, then a real one.`,
  ].join('\r\n')+'\r\n';
}
function manifestTap(tp){
  const rows=[['file','panel','wall','side','stack_position_top_is_1','after_cutting','label_on_face','thickness','width','operations','warnings']];
  tp.files.forEach(f=>rows.push([f.path, f.panel, f.wall, f.side, `${f.stack} of ${f.of}`, f.after, f.labelFace, f.thick, +f.width.toFixed(4), f.ops.map(o=>o.what).join(' | '), f.warn.join(' | ')]));
  return rows.map(r=>r.map(v=>/[",\n]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:String(v)).join(',')).join('\r\n')+'\r\n';
}
/* pick: null = whole home, or {pod}, {pod, letter}, {panel} */
const inScope = (f, pick) => !pick || (pick.panel ? f.panel===pick.panel : f.pod===pick.pod && (pick.letter==null || f.letter===pick.letter));
function tapZip(tp=tapPlan(), pick=null){
  const safe = x => String(x).replace(/[^\w .+-]+/g,'').trim();
  return zip([{name:'README.txt', text:readmeTap(tp)}, {name:'manifest.csv', text:manifestTap({...tp, files:tp.files.filter(f=>inScope(f,pick))})}, ...[...tp.files, ...tp.blank].filter(f=>inScope(f,pick)).map(f=>({name:safe(tp.home)+'/'+f.path, text:f.text})).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))]);
}

/* toolpath preview of one .tap: feed moves in colour by depth, rapids dashed */
function tapSVG(text, thick){
  const s=6, pad=26, X=x=>pad+(x+2)*s, Y=y=>pad+(98-y)*s;
  let g=`<svg viewBox="0 0 ${52*s+pad*2} ${100*s+pad*2}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Toolpath preview">`;
  g+=`<rect x="${X(0)}" y="${Y(96)}" width="${48*s}" height="${96*s}" fill="#f4efe6" stroke="#9aa09a"/>`;
  let p={X:0,Y:0,Z:thick+1};
  text.split(/\r?\n/).forEach(line=>{
    const m=line.match(/^G([0-3])\b(.*)/i); if(!m) return;
    const gc=+m[1], v={}; (m[2].match(/[XYZIJ]-?[\d.]+/gi)||[]).forEach(t=>v[t[0].toUpperCase()]=+t.slice(1));
    const q={X:v.X??p.X, Y:v.Y??p.Y, Z:v.Z??p.Z};
    const cut=q.Z<thick, col = q.Z<=0 ? '#c0392b' : q.Z<1 ? '#7a3fb0' : '#2f8a57';
    if(gc===0){ if(q.X!==p.X||q.Y!==p.Y) g+=`<line x1="${X(p.X)}" y1="${Y(p.Y)}" x2="${X(q.X)}" y2="${Y(q.Y)}" stroke="#bbb" stroke-width=".8" stroke-dasharray="3 3"/>`; }
    else if(gc===1){ if(q.X!==p.X||q.Y!==p.Y) g+=`<line x1="${X(p.X)}" y1="${Y(p.Y)}" x2="${X(q.X)}" y2="${Y(q.Y)}" stroke="${cut?col:'#bbb'}" stroke-width="${cut?TOOLS[13].d*s:1}" stroke-linecap="round" opacity=".75"/>`; }
    else { const r=Math.hypot(v.I||0,v.J||0); g+=`<path d="M${X(p.X)} ${Y(p.Y)} A${r*s} ${r*s} 0 0 ${gc===2?0:1} ${X(q.X)} ${Y(q.Y)}" fill="none" stroke="${col}" stroke-width="${TOOLS[13].d*s}" stroke-linecap="round" opacity=".75"/>`; }
    p=q;
  });
  g+=`<circle cx="${X(0)}" cy="${Y(0)}" r="4" fill="#fff" stroke="#d0661f" stroke-width="2"/><text x="${X(0)+6}" y="${Y(0)+16}" font-size="10" fill="#d0661f">X0 Y0</text>`;
  return g+'</svg>';
}
export { inScope, tapPlan, tapZip, tapSVG, openingCut, manifestTap };
