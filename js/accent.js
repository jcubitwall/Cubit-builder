/* Cubit Builder — accent.js : ACP accent walls (on request, usually a wall by an entry or a focal point).
   An exterior wall can be faced with 4 mm ACP instead of the Rando Rib siding: 4′ × 10′ sheets, one of 8 colours
   (5 solids, 3 woodgrains: the woodgrains run plumb, so their sheets are never turned), in one of 3 looks:
     board  vertical boards; the sheet joints fall on a board line
     geo    random straight lines across the whole wall, angles kept apart so nothing reads as a pattern; plumb joints
     hex    pointy-top hexagons, sized so a sheet holds whole columns: the sheets meet along hexagon edges (zigzag)
   Neighbouring sheets overlap ½″ (the next one over the last); the ½″ bit cuts every line: 3 mm deep in that overlap, 1.5 mm deep for every other reveal, and the
   screws go in the reveals (every ~16″). The ACP stops at the brick molds around windows and doors.
   Kept with the home: MODELS[k].accents = { '<wall key>': { pattern, colour, size, seed } }.
   In the 3D, the side panel (Exterior wall → Accent wall) and Sheets → Accent walls (elevation, sheets, DXF for the
   CNC). All in inches; x along the wall from its left end seen from outside, y up from the wall base. */
import { MODELS, saveCustomModels } from './data.js';
import { state, save, wkey, pickFor } from './state.js';
import { sidingSpan, WALL_BASE } from './config.js';
import { slotsFor } from './layout.js';
import { bodyWall } from './panels.js';
import { checkpoint } from './history.js';
import { ensureDraft } from './pods.js';
import { wallLayout, SIDING_TRIM } from './sidinglayout.js';
import { onLibSettings } from './libsettings.js';

const LIB = { sheet:{ w:48, h:120 }, groove:{ w:0.5, joint:3, reveal:1.5, overlap:0.5 }, screws:{ every:16, fromEnd:2 }, colours:[], patterns:[] };
let loaded=null;
function loadACP(){ return loaded ||= fetch('data/acp.json').then(r=>r.ok?r.json():null).then(j=>{ if(j) Object.assign(LIB, j); return LIB; }).catch(()=>LIB); }
loadACP().then(()=>applyACP());
function applyACP(ls=LS){ if(!ls) return; LIB.groove.overlap=ls('acp','overlap'); LIB.screws={ ...LIB.screws, every:ls('acp','screwEvery'), fromEnd:ls('acp','screwFromEnd') }; }
let LS=null; onLibSettings(ls=>{ LS=ls; applyACP(ls); });
const MOLD = 1.5, EPS = 1e-6;
const colourOf = id => LIB.colours.find(c=>c.id===id) || LIB.colours[0] || { id:'black', name:'Matte black', hex:'#151617' };
const patternOf = id => LIB.patterns.find(p=>p.id===id) || { id, name:id, size:null };

/* ---- what the team picked ---- */
const accents = (k=state.model) => MODELS[k]?.accents || {};
const accentOf = (s, k=state.model) => s && s.type==='ext' ? accents(k)[wkey(s)] || null : null;
function setAccent(s, a){   // a: { pattern, colour, size, seed } or null to take it off
  checkpoint(); const k=ensureDraft(), m=MODELS[k]; m.accents = { ...(m.accents||{}) };
  if(a) m.accents[wkey(s)] = { pattern:a.pattern||'board', colour:a.colour||'black', size:a.size??patternOf(a.pattern||'board').size, seed:a.seed ?? Math.floor(Math.random()*1e6) };
  else delete m.accents[wkey(s)];
  if(m.custom) saveCustomModels(); save(); return k;
}

/* ---- geometry helpers ---- */
function rng(seed){ let s=(seed>>>0)||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
/* a segment with the rectangles taken out of it: the pieces left */
function clipOut(a, b, rects){
  let parts=[[0,1]];
  rects.forEach(r=>{ const dx=b[0]-a[0], dy=b[1]-a[1]; let t0=0, t1=1;
    for(const [p,q] of [[-dx,a[0]-r.x0],[dx,r.x1-a[0]],[-dy,a[1]-r.y0],[dy,r.y1-a[1]]]){
      if(Math.abs(p)<EPS){ if(q<0){ t0=1; t1=0; break; } continue; }
      const t=q/p; if(p<0){ if(t>t0) t0=t; } else { if(t<t1) t1=t; } }
    if(t1-t0<=EPS) return;
    parts=parts.flatMap(([u,v])=>{ if(t1<=u||t0>=v) return [[u,v]]; const out=[]; if(t0>u) out.push([u,t0]); if(t1<v) out.push([t1,v]); return out; }); });
  const at=t=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
  return parts.filter(([u,v])=>v-u>EPS).map(([u,v])=>[at(u),at(v)]).filter(([p,q])=>Math.hypot(q[0]-p[0],q[1]-p[1])>0.25);
}
/* clip a segment to the box x0..x1, y0..y1 (Liang–Barsky); null if nothing is left */
function clipBox(a, b, x0, x1, y0, y1){
  const dx=b[0]-a[0], dy=b[1]-a[1]; let t0=0, t1=1;
  for(const [p,q] of [[-dx,a[0]-x0],[dx,x1-a[0]],[-dy,a[1]-y0],[dy,y1-a[1]]]){
    if(Math.abs(p)<EPS){ if(q<0) return null; continue; }
    const t=q/p; if(p<0){ if(t>t0) t0=t; } else { if(t<t1) t1=t; } }
  if(t1-t0<=EPS) return null;
  return [[a[0]+dx*t0, a[1]+dy*t0],[a[0]+dx*t1, a[1]+dy*t1]];
}

/* ---- the layout of one accent wall ---- */
function molds(w, L){
  const out=[];
  (w.openings||[]).filter(o=>(o.w||o.d||0)>=1).forEach(o=>{ const ow=o.w||o.d, oh=o.h||o.d, x=(w.trim?.[0]||0)+o.x;
    out.push({ x0:Math.max(0,x-MOLD), x1:Math.min(L,x+ow+MOLD), y0:o.y-MOLD, y1:o.y+oh+MOLD, kind:o.kind, round:o.shape==='round' }); });
  return out;
}
/* lines: [{a,b,kind:'joint'|'reveal'}]; sheets: [{ i, x0, x1, outline:[[x,y]...] }] (outline in wall coordinates) */
function accentLayout(s, a=accentOf(s)){
  if(!s || !a) return null;
  const w=bodyWall(s, pickFor(s)); if(!w) return null;
  const LW=s.len*12, S=sidingSpan(s.pod?.lv||0), y0=S.bottom-WALL_BASE, y1=S.top-WALL_BASE, H=y1-y0;
  // the ACP stops short of the wall's ends like the siding does: under the corner trim (clear of the Einspine), the
  // inside corner trim or the pod joint connector; the pattern is laid out on that width and moved back after
  const ends=(()=>{ try{ return wallLayout(s)?.ends||['C','C']; }catch(e){ return ['C','C']; } })();
  const clr=e=> e==='I' ? SIDING_TRIM.inside.clear : e==='J' ? SIDING_TRIM.joint.clear : SIDING_TRIM.corner.clear;
  const XA=clr(ends[0]), XB=LW-clr(ends[1]), L=XB-XA;
  const holesW=molds(w, LW), holes=holesW.map(h=>({ ...h, x0:h.x0-XA, x1:h.x1-XA })), SW=LIB.sheet.w, R=rng(a.seed||1), raw=[];
  const P=patternOf(a.pattern), size=a.size ?? P.size;
  let sheets=[];
  // neighbouring sheets overlap OV (½″) at each joint, the joint's 3 mm groove in that overlap: a sheet covers SW − OV
  const OV=LIB.groove.overlap??0.5;
  const plumbSheets=(pitch=SW-OV)=>{ for(let x=0, i=0; x<L-0.01; x+=pitch, i++){ const x1=Math.min(L, x+pitch), a=i?x-OV/2:0, b=x1<L-0.01?x1+OV/2:L;
    sheets.push({ i, x0:a, x1:b, outline:[[a,y0],[b,y0],[b,y1],[a,y1]] }); if(x1<L-0.01) raw.push({ a:[x1,y0], b:[x1,y1], kind:'joint' }); } };
  if(a.pattern==='board'){
    const bw=size||(SW-OV)/12; plumbSheets(Math.max(1, Math.floor((SW-OV)/bw+1e-6))*bw);   // the joint lands on a board line
    for(let x=bw; x<L-0.01; x+=bw) if(!raw.some(l=>Math.abs(l.a[0]-x)<0.01)) raw.push({ a:[x,y0], b:[x,y1], kind:'reveal', board:true });
  } else if(a.pattern==='geo'){
    plumbSheets(L/Math.max(1, Math.ceil((L-OV)/(SW-OV)-1e-6)));   // even sheets, no sliver at the end
    // random lines from edge to edge of the wall; angles kept apart, ends kept apart, nothing near plumb or level
    const n=Math.max(4, Math.round(L/16)), lines=[], ends=[];
    const edgePt=(e,t)=> e===0 ? [t*L, y0] : e===1 ? [L, y0+t*H] : e===2 ? [L-t*L, y1] : [0, y1-t*H];
    for(let tries=0; lines.length<n && tries<4000; tries++){
      const e0=Math.floor(R()*4); let e1=Math.floor(R()*4); if(e1===e0) e1=(e0+1+Math.floor(R()*3))%4;
      const p=edgePt(e0, 0.05+R()*0.9), q=edgePt(e1, 0.05+R()*0.9), dx=q[0]-p[0], dy=q[1]-p[1], len=Math.hypot(dx,dy);
      if(len < Math.min(H, L)*0.55) continue;
      const ang=Math.atan2(dy,dx), deg=((ang*180/Math.PI)%180+180)%180;
      if(Math.abs(deg-90)<9 || deg<7 || deg>173) continue;                          // not near plumb (the joints) or level
      if(lines.some(l=>{ const d=Math.abs(((l.deg-deg)%180+180)%180); return Math.min(d,180-d)<8; })) continue;   // no near-parallels
      if([p,q].some(e=>ends.some(f=>Math.hypot(e[0]-f[0],e[1]-f[1])<9))) continue;  // ends spread out
      if(raw.some(l=>l.kind==='joint' && [p,q].some(e=>Math.abs(e[0]-l.a[0])<4))) continue;   // don't end right at a joint
      lines.push({ deg }); ends.push(p,q); raw.push({ a:p, b:q, kind:'reveal' });
    }
  } else if(a.pattern==='hex'){
    // pointy-top hexagons hw wide; side s = hw/√3; rows 1.5 s apart, odd rows shifted hw/2
    const hw=size||19, sd=hw/Math.sqrt(3), cols=Math.max(1, Math.floor((SW-OV-hw/2)/hw+1e-6)), per=cols*hw;   // a sheet holds `cols` columns + the zig
    const r0=Math.floor(-1), rN=Math.ceil(H/(1.5*sd))+1;
    const segs=new Map(), key=(p,q)=>{ const k=[p,q].map(v=>v.map(c=>c.toFixed(2)).join(',')).sort().join('|'); return k; };
    const seamAt = x => { const k=Math.round(x/per); return Math.abs(x-k*per)<0.01 || Math.abs(x-(k*per+hw/2))<0.01; };
    for(let r=r0; r<=rN; r++){ const cy=y0+r*1.5*sd, off=(r&1)?hw/2:0;
      for(let c=-1; c*hw<L+hw; c++){ const cx=c*hw+off+hw/2;
        const v=[...Array(6)].map((_,i)=>{ const t=Math.PI/2+i*Math.PI/3; return [cx+sd*Math.cos(t), cy+sd*Math.sin(t)]; });
        for(let i=0;i<6;i++){ const p=v[i], q=v[(i+1)%6], k=key(p,q); if(segs.has(k)) continue; segs.set(k, [p,q]); } } }
    // the joint: from each seam at x = k·per, the zigzag up the hexagon edges between x = k·per and k·per + hw/2
    const isSeamSeg=(p,q)=>{ for(let k=1; k*per<L-0.01; k++){ const X=k*per;
      const on=v=>Math.abs(v[0]-X)<0.01 || Math.abs(v[0]-(X+hw/2))<0.01;
      if(on(p) && on(q)) return true; } return false; };
    segs.forEach(([p,q])=>{ const c=clipBox(p,q,0,L,y0,y1); if(c) raw.push({ a:c[0], b:c[1], kind:isSeamSeg(p,q)?'joint':'reveal' }); });
    // the sheets: between neighbouring zigzags
    const zig=(X)=>{ const pts=[]; for(let r=r0; r<=rN; r++){ const cy=y0+r*1.5*sd, x=(r&1)?X+hw/2:X; pts.push([x,cy-sd/2],[x,cy+sd/2]); } return pts.map(([x,y])=>[x,Math.min(Math.max(y,y0),y1)]); };
    for(let k=0, i=0; k*per<L-0.01; k++, i++){
      const sh=(P,d)=>P.map(([x,y])=>[x+d,y]);   // each zigzag edge runs OV/2 past the joint line: the two sheets overlap there
      const left=k===0 ? [[0,y0],[0,y1]] : sh(zig(k*per),-OV/2), right=(k+1)*per<L-0.01 ? sh(zig((k+1)*per),OV/2) : [[L,y0],[L,y1]];
      const outline=[...right.map(([x,y])=>[Math.min(x,L),y]), ...left.slice().reverse().map(([x,y])=>[Math.max(x,0),y])];
      const xs=outline.map(p=>p[0]); sheets.push({ i, x0:Math.min(...xs), x1:Math.max(...xs), outline, zig:true }); }
  }
  // take the openings out of every line; the rest of each line stays
  const lines=raw.flatMap(l=>clipOut(l.a, l.b, holes).map(([p,q])=>({ ...l, a:p, b:q })));
  // screws in the reveals: every ~16″, kept clear of the ends; on a board wall only every 16″ across
  const SC=LIB.screws, screws=[];
  const revs = a.pattern==='board' ? lines.filter(l=>l.kind==='reveal' && Math.abs(((l.a[0]+SC.every/2)%SC.every)-SC.every/2)<(size||4)/2+0.01) : lines.filter(l=>l.kind==='reveal');
  revs.filter(l=>a.pattern!=='hex' || Math.abs(l.a[0]-l.b[0])<0.01).forEach(l=>{ const len=Math.hypot(l.b[0]-l.a[0], l.b[1]-l.a[1]); if(len<2*SC.fromEnd+0.5) return;
    if(len<SC.every){ screws.push([(l.a[0]+l.b[0])/2, (l.a[1]+l.b[1])/2]); return; }
    const n=Math.max(1, Math.ceil((len-2*SC.fromEnd)/SC.every)), step=(len-2*SC.fromEnd)/n;
    for(let i=0;i<=n;i++){ const t=(SC.fromEnd+i*step)/len; screws.push([l.a[0]+(l.b[0]-l.a[0])*t, l.a[1]+(l.b[1]-l.a[1])*t]); } });
  sheets.forEach(sh=>{ sh.w=Math.round((sh.x1-sh.x0)*16)/16; });
  // back to the wall's own x
  const mv=p=>[p[0]+XA, p[1]];
  lines.forEach(l=>{ l.a=mv(l.a); l.b=mv(l.b); }); sheets.forEach(sh=>{ sh.x0+=XA; sh.x1+=XA; sh.outline=sh.outline.map(mv); });
  for(let i=0;i<screws.length;i++) screws[i]=mv(screws[i]);
  const area=(L*H - holes.reduce((s,h)=>s+(h.x1-h.x0)*Math.max(0,Math.min(h.y1,y1)-Math.max(h.y0,y0)),0))/144;
  return { s, a, P, colour:colourOf(a.colour), L:LW, XA, XB, ends, H, y0, y1, holes:holesW, lines, sheets, screws, area,
    jointFt:lines.filter(l=>l.kind==='joint').reduce((t,l)=>t+Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]),0)/12,
    revealFt:lines.filter(l=>l.kind==='reveal').reduce((t,l)=>t+Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]),0)/12 };
}
const accentWalls = (k=state.model) => slotsFor(k).filter(s=>s.type==='ext' && accentOf(s,k)).map(s=>accentLayout(s, accentOf(s,k))).filter(Boolean);

/* ---- 3D ---- */
const TEX=new Map();
function woodTexture(C){
  if(TEX.has(C.id)) return TEX.get(C.id);
  const c=document.createElement('canvas'); c.width=256; c.height=1024; const g=c.getContext('2d'), R=rng(C.id.length*977);
  g.fillStyle=C.hex; g.fillRect(0,0,256,1024);
  for(let i=0;i<90;i++){ let x=R()*256; const w=0.6+R()*2.2, a=0.08+R()*0.22; g.strokeStyle=C.grain; g.globalAlpha=a; g.lineWidth=w; g.beginPath(); g.moveTo(x,0);
    for(let y=0;y<=1024;y+=32){ x+= (R()-0.5)*3; g.lineTo(x,y); } g.stroke(); }
  g.globalAlpha=1;
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/2, 1/6); t.anisotropy=4; TEX.set(C.id, t); return t;
}
/* the accent wall's face and its grooves, in the wall group's coordinates (feet; tl = where the group starts) */
function accentMeshes(s, tl=0){
  const A=accentLayout(s); if(!A) return [];
  const FT=12, C=A.colour, z=0.16/FT, out=[];
  const xa=A.XA/FT, xb=A.XB/FT, sh=new THREE.Shape(); sh.moveTo(xa,A.y0/FT); sh.lineTo(xb,A.y0/FT); sh.lineTo(xb,A.y1/FT); sh.lineTo(xa,A.y1/FT); sh.lineTo(xa,A.y0/FT);
  A.holes.forEach(h=>{ const p=new THREE.Path(), y0=Math.max(h.y0,A.y0)/FT, y1=Math.min(h.y1,A.y1)/FT; if(y1-y0<0.01) return;
    p.moveTo(h.x0/FT,y0); p.lineTo(h.x0/FT,y1); p.lineTo(h.x1/FT,y1); p.lineTo(h.x1/FT,y0); p.lineTo(h.x0/FT,y0); sh.holes.push(p); });
  const geo=new THREE.ShapeGeometry(sh);
  const mat=new THREE.MeshStandardMaterial({ color:C.wood?0xffffff:new THREE.Color(C.hex), map:C.wood?woodTexture(C):null, roughness:C.metal?0.45:0.6, metalness:C.metal?0.2:0.05, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3 });
  const face=new THREE.Mesh(geo, mat); face.position.z=z; face.userData.accent=true; out.push(face);
  const dark=new THREE.Color(C.hex).multiplyScalar(C.wood?0.35:0.45), gm=new THREE.MeshStandardMaterial({ color:dark, roughness:0.9, metalness:0, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-5 });
  A.lines.forEach(l=>{ const len=Math.hypot(l.b[0]-l.a[0], l.b[1]-l.a[1]); if(len<0.2) return;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(len/FT, LIB.groove.w/FT), gm);
    m.position.set((l.a[0]+l.b[0])/2/FT, (l.a[1]+l.b[1])/2/FT, z+0.002); m.rotation.z=Math.atan2(l.b[1]-l.a[1], l.b[0]-l.a[0]); m.userData.accent=true; out.push(m); });
  // the corner trims / connector over the two ends, as on a sided wall
  const TRx=SIDING_TRIM, tm=new THREE.MeshStandardMaterial({ color:0x3b3f43, roughness:0.5, metalness:0.3, side:THREE.DoubleSide });
  const leg=e=> e==='C' ? TRx.corner.leg : e==='I' ? TRx.inside.leg : TRx.joint.clear+TRx.joint.lap;
  [[0, leg(A.ends[0])],[A.L-leg(A.ends[1]), A.L]].forEach(([a,b])=>{ const m=new THREE.Mesh(new THREE.BoxGeometry((b-a)/FT, (A.y1-A.y0)/FT, 0.04/FT), tm); m.position.set((a+b)/2/FT, (A.y0+A.y1)/2/FT, z+0.3/FT); m.userData.accent=true; out.push(m); });
  out.forEach(m=>{ m.position.x-=tl/FT; });
  return out;
}

/* ---- CNC: one DXF per wall, each sheet laid out on its own (inches; layers OUTLINE, JOINT_3MM, REVEAL_1_5MM, SCREWS) ---- */
function accentDXF(A){
  const L=[], gap=6; let ox=0;
  const ent=(...a)=>L.push(...a.map(String));
  const line=(layer,p,q)=>ent(0,'LINE',8,layer,10,p[0].toFixed(4),20,p[1].toFixed(4),30,0,11,q[0].toFixed(4),21,q[1].toFixed(4),31,0);
  const poly=(layer,pts)=>{ ent(0,'LWPOLYLINE',8,layer,90,pts.length,70,1); pts.forEach(p=>ent(10,p[0].toFixed(4),20,p[1].toFixed(4))); };
  const circ=(layer,p,r)=>ent(0,'CIRCLE',8,layer,10,p[0].toFixed(4),20,p[1].toFixed(4),30,0,40,r);
  const text=(layer,p,h,t)=>ent(0,'TEXT',8,layer,10,p[0].toFixed(4),20,p[1].toFixed(4),30,0,40,h,1,t);
  const inSheet=(sh,p)=>{ // inside the sheet's outline (ray cast)
    let c=false; const o=sh.outline; for(let i=0,j=o.length-1;i<o.length;j=i++){ const [xi,yi]=o[i],[xj,yj]=o[j]; if(((yi>p[1])!==(yj>p[1])) && p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi) c=!c; } return c; };
  A.sheets.forEach(sh=>{
    const dx=ox-sh.x0, dy=-A.y0, T=p=>[p[0]+dx, p[1]+dy];
    poly('OUTLINE', sh.outline.map(T));
    A.holes.forEach(h=>{ const x0=Math.max(h.x0, sh.x0), x1=Math.min(h.x1, sh.x1), y0=Math.max(h.y0, A.y0), y1=Math.min(h.y1, A.y1);
      if(x1-x0>0.25 && y1-y0>0.25 && inSheet(sh,[(x0+x1)/2,(y0+y1)/2])) poly('OUTLINE', [[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(T)); });
    A.lines.forEach(l=>{ const m=[(l.a[0]+l.b[0])/2,(l.a[1]+l.b[1])/2];
      if(l.kind==='joint'){ // a joint is cut on both sheets' edges: the ½″ groove sits half on each
        const near=sh.outline.some((p,i)=>{ const q=sh.outline[(i+1)%sh.outline.length]; return Math.hypot((p[0]+q[0])/2-m[0],(p[1]+q[1])/2-m[1])<0.5; }) || inSheet(sh,m);
        if(near) line('JOINT_3MM', T(l.a), T(l.b)); }
      else if(inSheet(sh,m)) line('REVEAL_1_5MM', T(l.a), T(l.b)); });
    A.screws.forEach(p=>{ if(inSheet(sh,p)) circ('SCREWS', T(p), 0.09); });
    text('LABEL', [ox+1, -4], 1.5, `${A.s.label} sheet ${sh.i+1} of ${A.sheets.length} - ${A.colour.name} - ${A.P.name}`);
    ox += (sh.x1-sh.x0) + gap; });
  return ['0','SECTION','2','HEADER','9','$INSUNITS','70','1','0','ENDSEC','0','SECTION','2','ENTITIES',...L,'0','ENDSEC','0','EOF'].join('\n');
}
export { LIB as ACPLIB, loadACP, colourOf as acpColour, patternOf as acpPattern, accents, accentOf, setAccent, accentLayout, accentWalls, accentMeshes, accentDXF };
