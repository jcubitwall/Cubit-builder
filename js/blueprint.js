/* Cubit Builder — blueprint.js : a professional, Cubit-branded drawing set for any home.

   Every sheet is one SVG on an ARCH C page (24″ × 18″ landscape = 1728 × 1296 pt), drawn from the home itself:
     A01 Cover & general notes   A11 Foundation plan        A12 Floor plan          A13 Pod & wall key plan
     E11 Electrical plan         P11 Plumbing plan          A21 Exterior elevations A31 Building section
     A61 Window & door schedules A91 3D views
   Each sheet carries the same title block down the right side (notes, revisions, the Cubit logo and company,
   project, drawing title, date, scale, drawn / checked by, drawing number). Plans and elevations are drawn to a
   real architectural scale, the largest of 1/2, 3/8, 1/4, 3/16, 1/8″ = 1′-0″ that fits.
   The same SVGs are previewed on screen and turned into the PDF (blueprint-ui.js, with svg2pdf). Text is set in
   Oswald (fonts/), a condensed drafting face; only ASCII quotes are used so the PDF font has every glyph. */
import { FT, H, T, TI, GAP, POD, SIDE_NAME, LAYER_KINDS, FLOOR_BUILD, FRAME, WALL_BASE, ICF, SCREW_MAX } from './config.js';
import { MODELS } from './data.js';
import { state, pickFor, pickLayer, foundationOf } from './state.js';
import { slotsFor, podList, layerSlotsFor, layoutOffsets, deckList } from './layout.js';
import { bodyWall, wallLen, panelSpans } from './panels.js';
import { unitFor, pairOf, doorOwner, symbol, TYPES } from './units.js';
import { ceilingFrame, lightsIn } from './lights.js';
import { itemDef } from './casework.js';
import { nameOf } from './names.js';
import { northVec, getBearing, compass } from './orient.js';
import { fin } from './format.js';

/* ------------------------------------------------------------------ page, colours, text */
const PW=1728, PH=1296, M=36, TBW=296;               // page, border margin, title block width
const TBX=PW-M-TBW;                                   // title block left edge
const AREA={ x0:M+24, y0:M+24, x1:TBX-24, y1:PH-M-24 };   // where drawings go
const INK='#1d1d1b', BLUE='#16428a', WALL='#76712f', GREY='#8a8f98', FURN='#7c86a6', RED='#c0392b', GREEN='#2f8a57';
const FONT='Oswald';
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ascii = s => String(s??'').replace(/[′‘’]/g,"'").replace(/[″“”]/g,'"').replace(/×/g,'x').replace(/[–—]/g,'-').replace(/⌀/g,'DIA. ').replace(/[^\x20-\x7E\n]/g,'');
const f1 = v => (+v).toFixed(1);
function tx(x, y, s, { size=10, anchor='start', weight='normal', fill=INK, rot=0, italic=false, cls='' }={}){
  const tr = rot ? ` transform="rotate(${f1(rot)} ${f1(x)} ${f1(y)})"` : '';
  return `<text x="${f1(x)}" y="${f1(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${italic?' font-style="italic"':''}${tr}${cls?` class="${cls}"`:''}>${esc(ascii(s))}</text>`;
}
const line = (x1,y1,x2,y2,w=0.6,c=INK,dash='') => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${c}" stroke-width="${w}"${dash?` stroke-dasharray="${dash}"`:''}/>`;
const rect = (x,y,w,h,{fill='none', stroke=INK, sw=0.6, dash='', rx=0}={}) => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}"${rx?` rx="${rx}"`:''} fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash?` stroke-dasharray="${dash}"`:''}/>`;
const poly = (pts, {fill='none', stroke=INK, sw=0.6, dash='', close=true}={}) => `<${close?'polygon':'polyline'} points="${pts.map(p=>f1(p[0])+','+f1(p[1])).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${dash?` stroke-dasharray="${dash}"`:''}/>`;
const circ = (x,y,r,{fill='none', stroke=INK, sw=0.6}={}) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
/* rough text width for Oswald (condensed): used to wrap and to fit */
const textW = (s, size) => String(s).length*size*0.47;
function wrap(s, width, size){
  const out=[]; String(s).split('\n').forEach(par=>{ let cur='';
    par.split(/\s+/).forEach(w=>{ if(!w) return; const t=cur?cur+' '+w:w; if(textW(t,size)>width && cur){ out.push(cur); cur=w; } else cur=t; });
    out.push(cur); });
  return out;
}
/* 7'-4 3/4" */
function ftin(v){ const n=Math.round(Math.abs(v)*16), ft=Math.floor(n/192), r=(n-ft*192)/16; return `${v<0?'-':''}${ft}'-${r>0 && r<1 ? '0 ' : ''}${fin(r)}`; }
const SCALES = [[36,'1/2" = 1\'-0"'],[27,'3/8" = 1\'-0"'],[18,'1/4" = 1\'-0"'],[13.5,'3/16" = 1\'-0"'],[9,'1/8" = 1\'-0"'],[6,'1/12" = 1\'-0"'],[4.5,'1/16" = 1\'-0"']];
const pickScale = (wFt, hFt, availW, availH, max=27) => SCALES.find(([k])=>k<=max && wFt*k<=availW && hFt*k<=availH) || SCALES[SCALES.length-1];

/* ------------------------------------------------------------------ settings (company, notes, per home) */
const KEY='cubit-blueprints';
const COMPANY0 = { name:'Cubit', tagline:'Modular SIP pod homes', address:'', phone:'', email:'', web:'', assoc:'' };
const NOTES0 = {
  block:
`1 By starting construction from these drawings, the owner and builder accept every note on every sheet.
2 All work to conform to the National Building Code of Canada and the bylaws of the authority having jurisdiction, which take precedence.
3 Verify all dimensions, information and specifications before starting work. Written dimensions take precedence over scaled ones.
4 Cubit is not responsible for changes made on site or for conditions not shown on these drawings.
5 The owner is responsible for siting the home on the property and for compliance with zoning and lot conditions.
6 Footings, ground screws and their loading to be confirmed by the supplier or an engineer.
7 Room dimensions are to the inside face of the SIPs.
8 These drawings are the property of Cubit and may not be copied or distributed without written permission.`,
  general:
`ALL WORK MUST CONFORM TO THE NATIONAL BUILDING CODE OF CANADA AND ALL PROVINCIAL AND MUNICIPAL BYLAWS HAVING JURISDICTION.
CONTRACTORS TO VERIFY ALL DIMENSIONS BEFORE STARTING ANY WORK. WRITTEN DIMENSIONS TAKE PRECEDENCE OVER SCALED MEASUREMENTS.
CUBIT PODS ARE BUILT OFF SITE FROM STRUCTURAL INSULATED PANELS (SIPS): {T} EXTERIOR WALLS, {TI} WALLS BETWEEN PODS, A DOUBLE SIP FLOOR CASSETTE AND A DOUBLE SIP CEILING / ROOF CASSETTE.
PODS ARE SET {GAP} APART. EVERY JOINT BETWEEN PODS IS SEALED WITH COMPRESSION SEALS AS PER THE CUBIT ASSEMBLY SHEETS.
EVERY POD CORNER HAS A FULL HEIGHT 1 1/2" x 1 1/2" STEEL SPINE WITH A 3/4" LIFTING NUT AT THE TOP.
{FOUNDATION}
SMOKE ALARMS (HARD WIRED C/W BATTERY BACKUP) AND CO ALARMS AS PER NBC 9.10.19 AND 9.32.3.9.
ELECTRICAL, PLUMBING AND MECHANICAL ROUGH-INS RUN IN THE FLOOR AND CEILING CASSETTES AND THE WALL CHASES. JUNCTIONS ARE PREPPED AT THE HATCHES FOR POD-TO-POD CONNECTIONS.
GRADES SHOWN ON ELEVATIONS ARE FOR PERMIT PURPOSES ONLY. GRADES TO BE DETERMINED ON SITE BY THE PROJECT MANAGER IN COMPLIANCE WITH SITE GRADING PLANS.
FINISH GRADE TO SLOPE AWAY FROM THE HOME. PROVIDE A CLEAR, VENTILATED SPACE UNDER THE POD FRAMES.
SOFFIT AND WALL PROTECTION AS REQUIRED WHERE THE HOME IS WITHIN 1.2 M OF A PROPERTY LINE.
ONCE THE PLANS ARE APPROVED BY THE OWNER THEY ARE FINAL. CHANGES AFTER APPROVAL ARE AT THE OWNER'S COST.
CONTRACTORS ARE RESPONSIBLE FOR CLEANUP OF THE JOB SITE.`,
  liability:
`CUBIT AND ITS REPRESENTATIVES SHALL NOT BE LIABLE TO THE CUSTOMER OR ANY THIRD PARTY FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR ANY LOSS, ARISING OUT OF OR RELATING TO THE CONSTRUCTION OR LATER PERFORMANCE OF THE BUILDING. IN ANY EVENT, CUBIT'S TOTAL LIABILITY, IF ANY, SHALL NOT EXCEED THE AMOUNT PAID BY THE CUSTOMER UNDER THIS CONTRACT, AS AMENDED.`,
  roof:
`ROOFING MEMBRANE / FINISH AS SPECIFIED
ROOF SIP {RF} (OSB / FOAM CORE / OSB)
1 7/8" x 11 7/8" LVL RIM ALL ROUND
INTERIOR CEILING SIP {CI} (OSB / FOAM CORE / OSB)
CEILING FINISH AS SPECIFIED`,
  wall:
`EXTERIOR CLADDING AS SPECIFIED
APPROVED HOUSE WRAP
{T} EXTERIOR SIP (OSB / FOAM CORE / OSB)
2x6 PLATES TOP AND BOTTOM, RECESSED IN THE PANEL
OSB SPLINES AT EVERY PANEL JOINT
INTERIOR FINISH AS SPECIFIED`,
  floor:
`FINISH FLOORING AS SPECIFIED
INTERIOR FLOOR SIP {FI}
1 1/2" SERVICE GAP, 2x4 BLOCKING AT PANEL JOINTS
EXTERIOR FLOOR SIP {FE}
1 7/8" x 9 1/2" LVL RIMS ALL ROUND
2 MM ACM UNDERSIDE
2" x 3" STEEL TUBE FRAME`,
};
function loadBP(){ let s={}; try{ s=JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){}
  return { company:{...COMPANY0, ...(s.company||{})}, notes:{...NOTES0, ...(s.notes||{})}, homes:s.homes||{} }; }
function saveBP(bp){ try{ localStorage.setItem(KEY, JSON.stringify(bp)); }catch(e){} }
function homeInfo(bp, k=state.model){
  const m=MODELS[k]||{}, h=bp.homes[k]||{};
  return { project:h.project || m.name || 'Cubit home', client:h.client||'', site:h.site||'', drawn:h.drawn||'', checked:h.checked||'',
    date:h.date || new Date().toISOString().slice(0,10), revs:(h.revs||[]).slice(0,6), sheets:h.sheets||null };
}
const fillVars = (s, F) => s.replace(/\{(\w+)\}/g, (_,k)=>F[k] ?? '');
function noteVars(k=state.model){
  const conc = foundationOf(k)==='concrete';
  return { T:fin(T), TI:fin(TI), GAP:fin(GAP*FT), RF:fin(LAYER_KINDS.roof.t), CI:fin(LAYER_KINDS['ceiling-int'].t), FI:fin(LAYER_KINDS['floor-int'].t), FE:fin(LAYER_KINDS['floor-ext'].t),
    FOUNDATION: conc ? `FOUNDATION: ${ICF.footW}" x ${ICF.footT}" CONCRETE FOOTING UNDER ONE COURSE OF ICF, ${ICF.core}" CORE (${ICF.coreShared}" UNDER POD JOINTS). FOOTING DEPTH, BEARING AND REINFORCING TO BE CONFIRMED BY AN ENGINEER.`
      : `FOUNDATION: GROUND SCREWS NO MORE THAN ${SCREW_MAX}'-0" APART, CORNERS ALWAYS. SCREW SIZE, DEPTH AND LOADING TO BE DETERMINED BY THE SUPPLIER.` };
}

/* ------------------------------------------------------------------ the home, in plan (feet) */
const PLAN_KINDS = new Set(['window','door','patio','opening']);
function homeModel(k=state.model){
  const m=MODELS[k]; const OFF=layoutOffsets(k);
  const pods=podList(k).map((p,i)=>{ const x=p.x+OFF.pods[i].ox, z=p.z+OFF.pods[i].oz; return {...p, x, z, x1:x+p.w, z1:z+p.d, name:nameOf('p:'+i, k)}; });
  const decks=deckList(k).map(d=>{ const x=d.x+OFF.decks[d.k].ox, z=d.z+OFF.decks[d.k].oz; return {...d, x, z, x1:x+d.w, z1:z+d.d}; });
  const slots=slotsFor(k);
  const walls=slots.map(s=>{ const w=bodyWall(s, pickFor(s)); if(!w) return null;
    const d=[s.n[1],-s.n[0]], mm=[-s.n[0],-s.n[1]], t=(w.t||(s.type==='int'?TI:T))/FT;
    const tl=(w.trim?.[0]||0)/FT, tr=(w.trim?.[1]||0)/FT, L=wallLen(w)/FT;
    const S=[s.p0[0]+d[0]*tl, s.p0[1]+d[1]*tl];
    const at=(a,inset=0)=>[S[0]+d[0]*a+mm[0]*inset, S[1]+d[1]*a+mm[1]*inset];
    const ops=(w.openings||[]).filter(o=>PLAN_KINDS.has(o.kind)).map(o=>{ const pr=pairOf(s,o); const owner = pr ? doorOwner(s,o).id===s.id : true;
      return { o, a:o.x/FT, b:(o.x+o.w)/FT, ur: owner ? unitFor(s,o) : null, pr, owner }; });
    return { s, w, d, m:mm, n:s.n, t, S, L, at, ops, code:`${s.pod.i+1}${s.letter}`, name:nameOf('w:'+s.id, k) };
  }).filter(Boolean);
  const ceil=layerSlotsFor(k).filter(l=>l.kind==='ceiling-int');
  const toWOf = i => { const ls=ceil.find(l=>l.pod.i===i); return ls ? ceilingFrame(ls).toW : null; };
  const items=(state.furniture?.[k]||[]).map(it=>{ const toW=toWOf(it.pod), def=itemDef(it.k); if(!toW || !def) return null;
    const a=(it.a||0)*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
    const f=(lx,lz)=>{ const u=it.u+(lx*ca+lz*sa)/FT, v=it.v+(-lx*sa+lz*ca)/FT; return toW(u*FT, v*FT); };   // item inches: lx from its middle, lz from its back → plan feet
    return { it, def, cat:def.cat, f };
  }).filter(Boolean);
  const lights=ceil.flatMap(ls=>{ const L=pickLayer(ls), toW=ceilingFrame(ls).toW; let pts=[]; try{ pts=lightsIn(L, ls, k); }catch(e){}
    return pts.map(p=>({ p:toW(p.x,p.z), pod:ls.pod.i })); });
  const B=pods.map(p=>[p.x,p.z,p.x1,p.z1]).concat(decks.map(d=>[d.x,d.z,d.x1,d.z1]));
  const bb={ x0:Math.min(...B.map(b=>b[0])), z0:Math.min(...B.map(b=>b[1])), x1:Math.max(...B.map(b=>b[2])), z1:Math.max(...B.map(b=>b[3])) };
  const hb={ x0:Math.min(...pods.map(p=>p.x)), z0:Math.min(...pods.map(p=>p.z)), x1:Math.max(...pods.map(p=>p.x1)), z1:Math.max(...pods.map(p=>p.z1)) };
  return { k, m, pods, decks, walls, items, lights, bb, hb, slots };
}
/* interior size of a pod (inches): along its length and across, between the inside faces of its walls */
function podInterior(H_, p){
  const ws=H_.walls.filter(w=>w.s.pod.i===p.i), tOf = side => Math.max(0, ...ws.filter(w=>w.s.side===side).map(w=>w.t*FT));
  const ix = p.w*FT - tOf('W') - tOf('E'), iz = p.d*FT - tOf('S') - tOf('N');
  return { ix, iz, cx: p.x + (tOf('W') + ix/2)/FT, cz: p.z + (tOf('S') + iz/2)/FT };
}

/* ------------------------------------------------------------------ plan drawing (page points) */
function planXf(bb, box, k){
  const w=(bb.x1-bb.x0)*k, h=(bb.z1-bb.z0)*k, ox=box.x0+(box.x1-box.x0-w)/2, oy=box.y0+(box.y1-box.y0-h)/2;
  const X=x=>ox+(x-bb.x0)*k, Y=z=>oy+(z-bb.z0)*k;
  return { k, X, Y, P:p=>[X(p[0]),Y(p[1])], ox, oy, w, h };
}
const ang = (a,b) => Math.atan2(b[1]-a[1], b[0]-a[0])*180/Math.PI;
const upright = d => { let a=d; while(a>90) a-=180; while(a<=-90) a+=180; return a; };

/* walls with their openings; opts: { fill, light (paler, for E / P sheets), labels, doors } */
function drawWalls(H_, xf, o={}){
  const { P, k } = xf; const fill = o.light ? '#b9b68f' : WALL, sw=o.light?0.5:0.8;
  let g='', lab='';
  H_.walls.forEach(W=>{
    const cuts=W.ops.map(q=>[Math.max(0,q.a),Math.min(W.L,q.b)]).sort((a,b)=>a[0]-b[0]);
    let x=0; const segs=[];
    cuts.forEach(([a,b])=>{ if(a>x+1e-3) segs.push([x,a]); x=Math.max(x,b); }); if(W.L>x+1e-3) segs.push([x,W.L]);
    segs.forEach(([a,b])=>{ g+=poly([W.at(a),W.at(b),W.at(b,W.t),W.at(a,W.t)].map(P), {fill, stroke:INK, sw}); });
    W.ops.forEach(q=>{ const {o:op}=q, a=Math.max(0,q.a), b=Math.min(W.L,q.b), t=W.t;
      const jamb = x => line(...P(W.at(x)), ...P(W.at(x,t)), 0.6);
      if(op.kind==='window'){
        g+=poly([W.at(a),W.at(b),W.at(b,t),W.at(a,t)].map(P), {fill:'#fff', stroke:INK, sw:0.5});
        const mid=t/2, gl=0.5/FT;
        g+=line(...P(W.at(a,mid-gl)), ...P(W.at(b,mid-gl)), 0.5)+line(...P(W.at(a,mid+gl)), ...P(W.at(b,mid+gl)), 0.5);
      } else if(op.kind==='opening'){
        g+=jamb(a)+jamb(b)+line(...P(W.at(a)), ...P(W.at(b)), 0.5, INK, '4 3')+line(...P(W.at(a,t)), ...P(W.at(b,t)), 0.5, INK, '4 3');
      } else if(op.kind==='patio'){
        g+=jamb(a)+jamb(b); const mid=t/2, off=0.8/FT, h=(b-a)/2, ov=1/FT;
        if(q.owner){ g+=line(...P(W.at(a,mid-off)), ...P(W.at(a+h+ov,mid-off)), 1.1)+line(...P(W.at(b-h-ov,mid+off)), ...P(W.at(b,mid+off)), 1.1); }
      } else if(op.kind==='door'){
        g+=jamb(a)+jamb(b);
        if(q.owner && o.doors!==false){
          const hand = q.ur?.hand || 'L', swing = q.ur?.swing || 'in';
          const face = swing==='out' ? 0 : t, dir = swing==='out' ? -1 : 1;     // inward = along m
          const hx = hand==='R' ? b : a, ox_ = hand==='R' ? a : b, wd=b-a;
          const Hp=W.at(hx,face), Op=W.at(ox_,face), Tp=W.at(hx, face+dir*wd);
          const [hX,hY]=P(Hp), [oX,oY]=P(Op), [tX,tY]=P(Tp), r=wd*k;
          const cr=(tX-hX)*(oY-hY)-(tY-hY)*(oX-hX);
          g+=line(hX,hY,tX,tY,1.1)+`<path d="M${f1(tX)} ${f1(tY)} A${f1(r)} ${f1(r)} 0 0 ${cr>0?1:0} ${f1(oX)} ${f1(oY)}" fill="none" stroke="${INK}" stroke-width="0.45" stroke-dasharray="3 2"/>`;
        }
      }
      // size label: outside an exterior wall, on the owner's side of a wall between pods
      if(o.labels!==false && q.owner && op.kind!=='opening'){
        const u=q.ur?.unit, txt = u ? `${fin(u.w)} x ${fin(u.h)}` : `${fin(op.w)} x ${fin(op.h)}`;
        const mid=W.at((a+b)/2, W.s.type==='int' ? W.t + 9/k*1.0 + 0.9 : -(9/k) );
        const [mx,my]=P(mid); const ro=upright(ang(P(W.at(a)),P(W.at(b))));
        lab+=tx(mx, my+3, txt+(u?'':' R.O.'), { size:7.5, anchor:'middle', fill:BLUE, rot:ro, weight:'bold' });
      }
    });
  });
  return g+lab;
}
/* cabinets, fixtures, appliances, furniture: simple plan symbols in each item's own frame (inches) */
function itemSVG(I, xf, { tone=FURN, sw=0.5, label=true, only=null }={}){
  const { it, def, cat } = I; if(only && !only(I)) return '';
  const k=xf.k/FT;   // pt per inch
  const O=xf.P(I.f(0,0)), Ux=xf.P(I.f(1,0)), Uz=xf.P(I.f(0,1));
  const mtx=`matrix(${[(Ux[0]-O[0]),(Ux[1]-O[1]),(Uz[0]-O[0]),(Uz[1]-O[1]),O[0],O[1]].map(v=>v.toFixed(4)).join(' ')})`;
  const W=it.w, D=it.d, x0=-W/2, s=sw/k, R=(x,y,w,h,ex='')=>`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="none" stroke="${tone}" stroke-width="${s.toFixed(3)}"${ex}/>`;
  const E=(cx,cy,rx,ry)=>`<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="none" stroke="${tone}" stroke-width="${s.toFixed(3)}"/>`;
  const L=(a,b,c,d,dash=false)=>`<line x1="${f1(a)}" y1="${f1(b)}" x2="${f1(c)}" y2="${f1(d)}" stroke="${tone}" stroke-width="${s.toFixed(3)}"${dash?` stroke-dasharray="${(3/k).toFixed(2)} ${(2/k).toFixed(2)}"`:''}/>`;
  const dash=` stroke-dasharray="${(4/k).toFixed(2)} ${(2.5/k).toFixed(2)}"`;
  let g='';
  const kk=it.k||'', nm=(def.name||'').toLowerCase();
  if(cat==='upper' || /^HD/.test(kk)) g+=R(x0,0,W,D,dash);
  else if(cat==='bath'){
    if(/^WC/.test(kk)){ g+=R(x0+1,0,W-2,7)+E(0,7+(D-7)/2,W/2-1,(D-7)/2); }
    else if(/^LV/.test(kk)){ g+=E(0,D/2,W/2,D/2-1)+E(0,D/2+1,W/2-3,D/2-4); }
    else if(/^BT|^TS/.test(kk)){ g+=R(x0,0,W,D)+`<rect x="${f1(x0+3)}" y="${f1(3)}" width="${f1(W-6)}" height="${f1(D-6)}" rx="${f1(Math.min(8,D/3))}" fill="none" stroke="${tone}" stroke-width="${s.toFixed(3)}"/>`+E(x0+8,D/2,1.5,1.5); }
    else { g+=R(x0,0,W,D)+L(x0,0,x0+W,D)+L(x0+W,0,x0,D)+E(0,D/2,2,2); }
  }
  else if(cat==='sink'){ const two=/-2-/.test(kk); g+=R(x0,0,W,D);
    if(two){ const a=W*0.5-1.5; g+=`<rect x="${f1(x0+1.5)}" y="1.5" width="${f1(a)}" height="${f1(D-3)}" rx="2" fill="none" stroke="${tone}" stroke-width="${s.toFixed(3)}"/><rect x="${f1(x0+W-1.5-a)}" y="1.5" width="${f1(a)}" height="${f1(D-3)}" rx="2" fill="none" stroke="${tone}" stroke-width="${s.toFixed(3)}"/>`; }
    else g+=`<rect x="${f1(x0+1.5)}" y="1.5" width="${f1(W-3)}" height="${f1(D-3)}" rx="2" fill="none" stroke="${tone}" stroke-width="${s.toFixed(3)}"/>`; }
  else if(cat==='appliance'){ g+=R(x0,0,W,D);
    if(/^RG/.test(kk)){ const r=Math.min(W,D)/7; [[-1,1],[1,1],[-1,-1],[1,-1]].forEach(([a,b])=>{ g+=E(a*W/4.4, D/2+b*D/4.4, r, r); }); }
    else if(/^WD/.test(kk)) g+=E(0,D/2,W/2-3,W/2-3); }
  else if(cat==='furniture'){
    if(kk==='BED'){ g+=R(x0,0,W,D)+R(x0+2,2,W/2-3,12)+R(1,2,W/2-3,12)+L(x0,22,x0+W,22); }
    else if(kk==='SOFA' || kk==='CHAIR'){ g+=R(x0,0,W,D)+L(x0,8,x0+W,8)+L(x0+5,8,x0+5,D)+L(x0+W-5,8,x0+W-5,D); }
    else g+=R(x0,0,W,D);
  }
  else if(cat==='counter'){ g+=R(x0,0,W,D); }
  else g+=R(x0,0,W,D)+L(x0,D-0.6,x0+W,D-0.6);
  let out=`<g transform="${mtx}">${g}</g>`;
  if(label){ const short = cat==='appliance' ? (/^FR/.test(kk)?'REF':/^RG/.test(kk)?'RANGE':/^DW/.test(kk)?'DW':/^WD/.test(kk)?'W/D':'') : ['base','upper','tall','linen','vanity','wardrobe'].includes(cat) ? `${kk}${Math.round(W)}` : '';
    if(short && W*k>18){ const c=xf.P(I.f(0,D/2)); out+=tx(c[0], c[1]+2.5, short, { size:6.2, anchor:'middle', fill:tone }); } }
  return out;
}
/* dimension chain: points along one axis, at a fixed offset line; extension lines start at `from` */
function chain(vals, at, from, horiz, { col=BLUE, size=7.5, tick=3.2, min=0.02, k=18, label=v=>ftin(v*FT) }={}){
  const v=[...vals].sort((a,b)=>a-b).filter((x,i,a)=>i===0 || x-a[i-1]>min); if(v.length<2) return '';
  let g='';
  const P=(u)=>horiz?[u,at]:[at,u];
  g+=line(...P(v[0]), ...P(v[v.length-1]), 0.5, col);
  v.forEach(u=>{ const [x,y]=P(u); const f=from(u);
    g+= horiz ? line(x, f+(at>f?2:-2), x, at+(at>f?4:-4), 0.35, col) : line(f+(at>f?2:-2), y, at+(at>f?4:-4), y, 0.35, col);
    g+=line(x-tick, y+tick, x+tick, y-tick, 0.9, col); });
  for(let i=0;i+1<v.length;i++){ const a=v[i], b=v[i+1], len=(b-a)/k; const txt=label(len); const room=(b-a)>textW(txt,size)+4;
    const [mx,my]=P((a+b)/2);
    if(horiz) g+=tx(mx, my-3, txt, { size: room?size:size*0.8, anchor:'middle', fill:col });
    else g+=tx(mx-3, my, txt, { size: room?size:size*0.8, anchor:'middle', fill:col, rot:-90 });
  }
  return g;
}
/* the three chains round a plan: opening centres on the outside walls, pods, overall */
function planDims(H_, xf, { openings=true }={}){
  const { X, Y, k } = xf, hb=H_.hb; let g='';
  const sides=[
    { side:'S', horiz:true,  base:Y(hb.z0), dir:-1, lo:hb.x0, hi:hb.x1, pv:p=>[p.x,p.x1], pos:p=>X(p) },
    { side:'N', horiz:true,  base:Y(hb.z1), dir: 1, lo:hb.x0, hi:hb.x1, pv:p=>[p.x,p.x1], pos:p=>X(p) },
    { side:'W', horiz:false, base:X(hb.x0), dir:-1, lo:hb.z0, hi:hb.z1, pv:p=>[p.z,p.z1], pos:p=>Y(p) },
    { side:'E', horiz:false, base:X(hb.x1), dir: 1, lo:hb.z0, hi:hb.z1, pv:p=>[p.z,p.z1], pos:p=>Y(p) } ];
  sides.forEach(sd=>{
    const at = i => sd.base + sd.dir*(36 + i*20);
    const face = (u) => sd.base + sd.dir*4;
    // pods: their faces on this side (merge the 3/4" joint into one tick)
    const podPts=[...new Set(H_.pods.flatMap(sd.pv).map(v=>+v.toFixed(4)))];
    g+=chain([sd.lo,sd.hi].map(sd.pos), at(2), face, sd.horiz, { k });
    if(podPts.length>2) g+=chain(podPts.map(sd.pos), at(1), face, sd.horiz, { k, min:1.2/FT*k });
    if(openings){
      const pts=[sd.lo, sd.hi];
      H_.walls.filter(W=>W.s.type==='ext' && W.s.side===sd.side).forEach(W=>W.ops.forEach(q=>{ if(!q.owner) return; const c=W.at((q.a+q.b)/2); pts.push(sd.horiz?c[0]:c[1]); }));
      if(pts.length>2) g+=chain(pts.map(sd.pos), at(0), face, sd.horiz, { k, min:1.5/FT*k });
    }
  });
  return g;
}
/* room labels: the pod's name (or Pod n) and its inside size */
function roomLabels(H_, xf, { dims=true }={}){
  let g=''; H_.pods.forEach(p=>{ const I=podInterior(H_, p), [x,y]=xf.P([I.cx, I.cz]);
    const nm=(p.name || p.label).toUpperCase();
    const a=p.alongX ? ftin(I.ix) : ftin(I.iz), b=p.alongX ? ftin(I.iz) : ftin(I.ix);
    g+=tx(x, y-2, nm, { size:12, anchor:'middle', weight:'bold', fill:BLUE });
    if(dims) g+=tx(x, y+11, `${a} X ${b}`, { size:9, anchor:'middle', fill:BLUE });
  }); return g;
}
function northArrow(x, y, k=state.model){
  const [nx,nz]=northVec(k), a=Math.atan2(nx,-nz)*180/Math.PI;
  return `<g transform="rotate(${f1(a)} ${f1(x)} ${f1(y)})">${circ(x,y,20,{stroke:INK,sw:0.8})}<polygon points="${x},${y-26} ${x+8},${y+10} ${x},${y+4} ${x-8},${y+10}" fill="${INK}"/>${tx(x, y-30, 'N', {size:11, anchor:'middle', weight:'bold'})}</g>`;
}
function scaleBar(x, y, k){
  const ft = k>=18 ? [0,2,4,8] : k>=9 ? [0,4,8,16] : [0,8,16,32]; let g='';
  for(let i=0;i+1<ft.length;i++) g+=rect(x+ft[i]*k, y, (ft[i+1]-ft[i])*k, 5, { fill: i%2? '#fff' : INK, sw:0.6 });
  ft.forEach(f=>{ g+=tx(x+f*k, y+15, `${f}'`, { size:7, anchor:'middle' }); });
  return g;
}
/* view title under a drawing:  (1/A21) FRONT ELEVATION  with the scale */
function viewTitle(x, y, num, sheet, title, scale){
  return circ(x, y-4, 11, {stroke:BLUE, sw:0.9})+line(x-11, y-4, x+11, y-4, 0.6, BLUE)+tx(x, y-7, num, {size:7.5, anchor:'middle', fill:BLUE, weight:'bold'})+tx(x, y+5, sheet, {size:6.5, anchor:'middle', fill:BLUE})
    + tx(x+18, y, title, {size:15, weight:'bold', fill:BLUE}) + line(x+18, y+3, x+18+textW(title,15)*1.04, y+3, 0.9, BLUE)
    + (scale ? tx(x+18, y+16, `SCALE: ${scale}`, {size:8, fill:BLUE}) : '');
}
/* elevation / section markers on a plan: a bubble with a triangle pointing at what it looks at */
function marker(x, y, dir, num, sheet){
  const a=Math.atan2(dir[1],dir[0])*180/Math.PI;
  return `<g transform="rotate(${f1(a)} ${f1(x)} ${f1(y)})"><polygon points="${x+19},${y} ${x+3},${y-12} ${x+3},${y+12}" fill="${BLUE}"/></g>`+circ(x,y,11,{fill:'#fff',stroke:BLUE,sw:0.9})+line(x-11,y,x+11,y,0.6,BLUE)+tx(x,y-2.5,num,{size:7,anchor:'middle',fill:BLUE,weight:'bold'})+tx(x,y+8.5,sheet,{size:6,anchor:'middle',fill:BLUE});
}
function elevMarkers(H_, xf){
  const { X, Y } = xf, hb=H_.hb, cx=(hb.x0+hb.x1)/2, cz=(hb.z0+hb.z1)/2, o=118;
  return marker(X(cx), Y(hb.z0)-o, [0,1], '1', 'A21') + marker(X(hb.x1)+o, Y(cz), [-1,0], '2', 'A21') + marker(X(cx), Y(hb.z1)+o, [0,-1], '3', 'A21') + marker(X(hb.x0)-o, Y(cz), [1,0], '4', 'A21');
}
function sectionLine(H_, xf){
  const p=H_.pods[0]; if(!p) return ''; const { X, Y } = xf, hb=H_.hb;
  if(p.alongX){ const x=X(p.x+p.w*0.62); return line(x, Y(hb.z0)-86, x, Y(hb.z1)+86, 0.8, BLUE, '14 4 3 4')+marker(x, Y(hb.z0)-98, [1,0], '1', 'A31')+marker(x, Y(hb.z1)+98, [1,0], '1', 'A31'); }
  const y=Y(p.z+p.d*0.62); return line(X(hb.x0)-86, y, X(hb.x1)+86, y, 0.8, BLUE, '14 4 3 4')+marker(X(hb.x0)-98, y, [0,1], '1', 'A31')+marker(X(hb.x1)+98, y, [0,1], '1', 'A31');
}
const deckSVG = (H_, xf) => H_.decks.map(d=>{ const [x0,y0]=xf.P([d.x,d.z]), [x1,y1]=xf.P([d.x1,d.z1]); let g=rect(x0,y0,x1-x0,y1-y0,{fill:'#f6f2ea', stroke:INK, sw:0.6});
  const n=Math.floor(((d.alongX?d.d:d.w)*FT)/5.6); for(let i=1;i<n;i++){ const t=i*5.6/FT; g+= d.alongX ? line(x0, y0+t*xf.k, x1, y0+t*xf.k, 0.2, GREY) : line(x0+t*xf.k, y0, x0+t*xf.k, y1, 0.2, GREY); }
  return g+tx((x0+x1)/2, (y0+y1)/2+3, `DECK ${d.k+1}`, {size:8, anchor:'middle', fill:GREY}); }).join('');

/* ------------------------------------------------------------------ title block */
let LOGO='brand/cubit-logo.png';
const setLogo = u => { LOGO=u; };
function titleBlock(ctx, sh){
  const { bp, info } = ctx, C=bp.company, x=TBX, w=TBW; let y=M, g='';
  g+=rect(M, M, PW-2*M, PH-2*M, { sw:1.2 })+line(x, M, x, PH-M, 1.2);
  const row = (h, fn) => { const y0=y; g+=fn(y0, h); y+=h; g+=line(x, y, x+w, y, 0.9); };
  // notes
  row(268, (y0)=>{ let s=tx(x+10, y0+16, 'GENERAL NOTES:', {size:8.5, weight:'bold'})+line(x+10, y0+18, x+72, y0+18, 0.5);
    let yy=y0+30; wrap(ascii(bp.notes.block), w-24, 6.6).forEach(l=>{ if(yy<y0+264){ s+=tx(x+12, yy, l, {size:6.6}); yy+=8.6; } }); return s; });
  // revisions
  row(222, (y0)=>{ let s=tx(x+6, y0+15, 'REV #', {size:7.5, weight:'bold'})+tx(x+46, y0+15, 'GENERAL REVISIONS', {size:7.5, weight:'bold'})+tx(x+w-28, y0+15, 'DATE', {size:7.5, weight:'bold', anchor:'middle'});
    s+=line(x+38, y0, x+38, y0+222, 0.6)+line(x+w-58, y0, x+w-58, y0+222, 0.6)+line(x, y0+24, x+w, y0+24, 0.6);
    for(let i=0;i<6;i++){ const yy=y0+24+i*33; if(i) s+=line(x, yy, x+w, yy, 0.4); const r=info.revs[i]||{};
      s+=tx(x+19, yy+20, String(i+1), {size:8, anchor:'middle', weight:'bold'});
      if(r.text) s+=tx(x+44, yy+20, String(r.text).toUpperCase().slice(0,44), {size:7});
      if(r.date) s+=tx(x+w-29, yy+20, r.date, {size:7, anchor:'middle'}); }
    return s; });
  // Cubit: logo and company
  row(250, (y0)=>{ const lw=w-50, lh=lw*521/1400; let s=`<image x="${f1(x+25)}" y="${f1(y0+22)}" width="${f1(lw)}" height="${f1(lh)}" href="${LOGO}" preserveAspectRatio="xMidYMid meet"/>`;
    let yy=y0+34+lh+12; if(C.tagline){ s+=tx(x+w/2, yy, C.tagline.toUpperCase(), {size:9, anchor:'middle', weight:'bold'}); yy+=16; }
    [C.address, [C.phone, C.email].filter(Boolean).join('  |  '), C.web].filter(Boolean).forEach(l=>{ wrap(l, w-24, 8).forEach(ll=>{ s+=tx(x+w/2, yy, ll, {size:8, anchor:'middle'}); yy+=11; }); });
    if(C.assoc) s+=tx(x+w/2, y0+244, `IN ASSOCIATION WITH ${C.assoc}`.toUpperCase(), {size:7, anchor:'middle', fill:GREY});
    return s; });
  // project information
  row(108, (y0)=>{ const L=[['CLIENT', info.client], ['SITE', info.site], ['MODEL', ctx.model], ['PODS', ctx.podsText], ['FLOOR AREA', ctx.areaText]];
    let s=''; L.forEach(([a,b],i)=>{ const yy=y0+16+i*19; s+=tx(x+10, yy, a+':', {size:7.5, weight:'bold'})+tx(x+82, yy, String(b||'-').toUpperCase().slice(0,40), {size:8}); }); return s; });
  const field = (h, label, val, size=13) => row(h, y0=>tx(x+10, y0+14, label, {size:7.5, weight:'bold'})+tx(x+w/2, y0+h-12, val, {size, anchor:'middle', weight:'bold'}));
  field(56, 'PROJECT NAME:', info.project.toUpperCase());
  field(56, 'DRAWING TITLE:', sh.title.toUpperCase());
  row(58, y0=>line(x+w*0.55, y0, x+w*0.55, y0+58, 0.9)+tx(x+10, y0+14, 'DATE:', {size:7.5, weight:'bold'})+tx(x+w*0.275, y0+40, fmtDate(info.date), {size:9.5, anchor:'middle', weight:'bold'})
    +tx(x+w*0.55+8, y0+14, 'SCALE:', {size:7.5, weight:'bold'})+tx(x+w*0.775, y0+40, sh.scale||'AS NOTED', {size:9.5, anchor:'middle', weight:'bold'}));
  row(40, y0=>tx(x+10, y0+24, 'DRAWN BY:', {size:7.5, weight:'bold'})+tx(x+w*0.62, y0+25, (info.drawn||'').toUpperCase(), {size:9.5, anchor:'middle', weight:'bold'}));
  row(40, y0=>tx(x+10, y0+24, 'CHECKED BY:', {size:7.5, weight:'bold'})+tx(x+w*0.62, y0+25, (info.checked||'').toUpperCase(), {size:9.5, anchor:'middle', weight:'bold'}));
  const rest=PH-M-y; g+=tx(x+10, y+16, 'DRAWING #:', {size:7.5, weight:'bold'})+tx(x+w*0.62, y+rest/2+16, sh.no, {size:40, anchor:'middle', weight:'bold'});
  g+=tx(x+10, PH-M-8, `SHEET ${sh.i+1} OF ${ctx.count}`, {size:6.5, fill:GREY});
  return g;
}
function fmtDate(d){ const t=new Date(d+'T12:00:00'); if(isNaN(t)) return d; return t.toLocaleDateString('en-CA', { year:'numeric', month:'long', day:'numeric' }).toUpperCase(); }

/* ------------------------------------------------------------------ sheets */
function sheetSVG(ctx, sh, body){
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" class="bp-sheet"><rect width="${PW}" height="${PH}" fill="#fff"/>${body}${titleBlock(ctx, sh)}</svg>`;
}
/* A01: cover, sheet index, project data, general notes, liability */
function sCover(ctx, sh){
  const { bp, H_ } = ctx, N=fillVars(bp.notes.general, noteVars()).split('\n').filter(s=>s.trim()); let g='';
  const x0=AREA.x0+10, colW=(AREA.x1-AREA.x0-60)/2;
  g+=tx(x0, AREA.y0+40, ctx.info.project.toUpperCase(), {size:34, weight:'bold'});
  g+=tx(x0, AREA.y0+64, `${ctx.model} · ${ctx.podsText} · ${ctx.areaText}`.toUpperCase(), {size:12, fill:BLUE});
  // hero picture
  const img=ctx.renders?.[0]; const hx=x0+colW+60, hw=colW, hh=hw*0.6, hy=AREA.y0+10;
  if(img) g+=`<image x="${f1(hx)}" y="${f1(hy)}" width="${f1(hw)}" height="${f1(hh)}" href="${img}" preserveAspectRatio="xMidYMid slice"/>`+rect(hx,hy,hw,hh,{sw:0.6});
  // general notes
  let y=AREA.y0+110; g+=tx(x0, y, 'GENERAL NOTES', {size:17, weight:'bold', fill:BLUE})+line(x0, y+4, x0+120, y+4, 1, BLUE); y+=30;
  N.forEach((n,i)=>{ const L=wrap(`${i+1}: ${n}`, colW, 9.5); L.forEach((l,j)=>{ g+=tx(x0+(j?12:0), y, l, {size:9.5, weight:'bold', fill:BLUE}); y+=13; }); y+=8; });
  // sheet index + project data, then liability
  let y2=hy+hh+40, x2=hx;
  g+=tx(x2, y2, 'DRAWING LIST', {size:17, weight:'bold', fill:BLUE})+line(x2, y2+4, x2+110, y2+4, 1, BLUE); y2+=26;
  ctx.list.forEach(s=>{ g+=tx(x2, y2, s.no, {size:10, weight:'bold', fill:BLUE})+tx(x2+46, y2, s.title.toUpperCase(), {size:10, fill:BLUE})+tx(x2+hw, y2, s.scale||'', {size:8.5, anchor:'end', fill:GREY}); y2+=15; });
  y2+=20; g+=tx(x2, y2, 'PROJECT DATA', {size:17, weight:'bold', fill:BLUE})+line(x2, y2+4, x2+110, y2+4, 1, BLUE); y2+=24;
  const conc=foundationOf(ctx.k)==='concrete';
  [['Model', ctx.model], ['Pods', `${H_.pods.length} (${ctx.podsText})`], ['Gross floor area', ctx.areaText], ['Clear ceiling height', ftin(LAYER_KINDS['ceiling-int'].z - WALL_BASE)],
   ['Walls', `${fin(T)} exterior SIP, ${fin(TI)} between pods`], ['Foundation', conc?'Concrete footing + ICF':'Ground screws'], ['North', `${Math.round(getBearing(ctx.k))} deg (${compass(getBearing(ctx.k))})`], ['Decks', H_.decks.length ? H_.decks.map(d=>`${d.L.w}' x ${d.L.d}'`).join(', ') : 'none']]
    .forEach(([a,b])=>{ g+=tx(x2, y2, a.toUpperCase()+':', {size:9.5, weight:'bold', fill:BLUE})+tx(x2+130, y2, String(b).toUpperCase(), {size:9.5, fill:BLUE}); y2+=14; });
  y2+=24; g+=tx(x2, y2, 'LIABILITY', {size:17, weight:'bold', fill:BLUE})+line(x2, y2+4, x2+70, y2+4, 1, BLUE); y2+=24;
  wrap(ascii(bp.notes.liability), hw, 9).forEach(l=>{ if(y2<AREA.y1) { g+=tx(x2, y2, l, {size:9, weight:'bold', fill:BLUE}); y2+=12.5; } });
  return g;
}
/* a plan sheet: fits the home with room for the dimension chains and markers */
function planFit(ctx, extra=150, max=27){
  const hb=ctx.H_.bb, wF=hb.x1-hb.x0, hF=hb.z1-hb.z0;
  const [k, label]=pickScale(wF, hF, AREA.x1-AREA.x0-2*extra, AREA.y1-AREA.y0-2*extra-40, max);
  return { xf:planXf(hb, { x0:AREA.x0, y0:AREA.y0, x1:AREA.x1, y1:AREA.y1-40 }, k), label };
}
function planFurniture(ctx, xf, opts){ return ctx.H_.items.map(I=>itemSVG(I, xf, opts)).join(''); }
function sFloor(ctx, sh){
  const { H_ } = ctx, { xf, label } = planFit(ctx); sh.scale=label;
  let g=deckSVG(H_, xf)+planFurniture(ctx, xf)+drawWalls(H_, xf)+roomLabels(H_, xf)+planDims(H_, xf)+elevMarkers(H_, xf)+sectionLine(H_, xf);
  g+=northArrow(AREA.x1-40, AREA.y0+40)+scaleBar(AREA.x0+10, AREA.y1-14, xf.k)+viewTitle(AREA.x0+(AREA.x1-AREA.x0)/2-90, AREA.y1-10, '1', sh.no, 'MAIN LEVEL FLOOR PLAN', label);
  return g;
}
/* A13: pods numbered, every wall's code (1A, 1B …) and a wall schedule */
function sKey(ctx, sh){
  const { H_ } = ctx; const hb=H_.bb, wF=hb.x1-hb.x0, hF=hb.z1-hb.z0;
  const tableW=430, [k,label]=pickScale(wF, hF, AREA.x1-AREA.x0-tableW-200, AREA.y1-AREA.y0-200, 27); sh.scale=label;
  const xf=planXf(hb, { x0:AREA.x0, y0:AREA.y0, x1:AREA.x1-tableW-40, y1:AREA.y1-40 }, k);
  let g=deckSVG(H_, xf)+drawWalls(H_, xf, { light:true, labels:false, doors:false });
  H_.pods.forEach(p=>{ const [x,y]=xf.P([(p.x+p.x1)/2,(p.z+p.z1)/2]); g+=circ(x,y,17,{fill:'#fff',stroke:INK,sw:1.2})+tx(x,y+6,String(p.i+1),{size:17,anchor:'middle',weight:'bold'})+tx(x,y+30,`${POD[p.t].len}' POD`,{size:8,anchor:'middle',fill:GREY}); });
  H_.walls.forEach(W=>{ const c=W.at(W.L/2, W.t/2), [x,y]=xf.P(c), inward=W.s.type==='int';
    const o=xf.P(W.at(W.L/2, inward ? W.t+0.9 : -0.9)); g+=rect(o[0]-13,o[1]-8,26,16,{fill:inward?'#fff':BLUE, stroke:BLUE, sw:0.8, rx:3})+tx(o[0],o[1]+4,W.code,{size:9,anchor:'middle',weight:'bold',fill:inward?BLUE:'#fff'}); });
  g+=northArrow(AREA.x0+40, AREA.y0+40)+viewTitle(AREA.x0+40, AREA.y1-10, '1', sh.no, 'POD & WALL KEY PLAN', label);
  // wall schedule
  const tx0=AREA.x1-tableW, cols=[['WALL',40],['NAME',120],['TYPE',62],['LENGTH',62],['PANELS',50],['LIBRARY WALL',96]];
  let y=AREA.y0+20; g+=tx(tx0, y, 'WALL SCHEDULE', {size:13, weight:'bold', fill:BLUE}); y+=10;
  const rowH=Math.min(16, (AREA.y1-y-30)/(H_.walls.length+1));
  let cx=tx0; g+=rect(tx0, y, tableW, rowH, {fill:'#eef2f8', stroke:BLUE, sw:0.6}); cols.forEach(([c,wd])=>{ g+=tx(cx+4, y+rowH-4.5, c, {size:Math.min(8, rowH*0.55), weight:'bold', fill:BLUE}); cx+=wd; }); y+=rowH;
  H_.walls.forEach(W=>{ const vals=[W.code, W.name||'-', W.s.type==='int'?'BETWEEN PODS':'EXTERIOR', ftin(W.L*FT), String(panelSpans(W.w).length), W.w.mirrorOf||W.w.id];
    let cx2=tx0; g+=rect(tx0, y, tableW, rowH, {stroke:BLUE, sw:0.3}); vals.forEach((v,i)=>{ g+=tx(cx2+4, y+rowH-4.5, String(v).toUpperCase().slice(0, Math.floor(cols[i][1]/4.3)), {size:Math.min(7.5, rowH*0.52), fill:BLUE}); cx2+=cols[i][1]; }); y+=rowH; });
  g+=tx(tx0, y+14, 'WALL CODE = POD NUMBER + WALL LETTER (A, B, C, D CLOCKWISE). PANEL LABELS USE THE SAME CODE.', {size:7, fill:GREY});
  return g;
}
/* E11: lights, plugs, switches, data, outside lights; legend with counts */
const ELEC = {
  outlet:(x,y,s,ext)=>circ(x,y,4.2*s,{fill:'#fff',stroke:RED,sw:0.8})+line(x-1.4*s,y-2.2*s,x-1.4*s,y+2.2*s,0.8,RED)+line(x+1.4*s,y-2.2*s,x+1.4*s,y+2.2*s,0.8,RED)+(ext?tx(x,y-6*s,'WP',{size:5.5*s,anchor:'middle',fill:RED}):''),
  switch:(x,y,s)=>tx(x,y+3*s,'S',{size:9*s,anchor:'middle',fill:RED,weight:'bold'}),
  data:(x,y,s)=>`<polygon points="${f1(x)},${f1(y-4*s)} ${f1(x+4*s)},${f1(y+3*s)} ${f1(x-4*s)},${f1(y+3*s)}" fill="#fff" stroke="${RED}" stroke-width="0.8"/>`,
  light:(x,y,s)=>circ(x,y,4.5*s,{fill:'#fff',stroke:RED,sw:0.8})+line(x-3.2*s,y-3.2*s,x+3.2*s,y+3.2*s,0.6,RED)+line(x+3.2*s,y-3.2*s,x-3.2*s,y+3.2*s,0.6,RED),
  pot:(x,y,s)=>circ(x,y,3.6*s,{fill:'#fff',stroke:RED,sw:0.8})+circ(x,y,1.2*s,{fill:RED,stroke:RED,sw:0.3}),
  box:(x,y,s)=>rect(x-3*s,y-3*s,6*s,6*s,{stroke:RED,sw:0.7}),
};
function wallBoxes(H_){
  const out=[]; H_.walls.forEach(W=>{
    (W.w.inside||[]).forEach(b=>{ if(b.x==null) return; const p=W.at(W.L-b.x, W.t+0.45); out.push({ b, p, ext:false, W }); });
    if(W.s.type==='ext') (W.w.outside||[]).forEach(b=>{ if(b.x==null) return; const p=W.at(b.x, -0.45); out.push({ b, p, ext:true, W }); });
  }); return out;
}
function sElectrical(ctx, sh){
  const { H_ } = ctx, { xf, label } = planFit(ctx); sh.scale=label;
  let g=deckSVG(H_, xf)+planFurniture(ctx, xf, { tone:'#b7bccb', label:false })+drawWalls(H_, xf, { light:true, labels:false })+roomLabels(H_, xf, { dims:false });
  const s=Math.max(0.8, Math.min(1.3, xf.k/18)), cnt={};
  H_.lights.forEach(L=>{ const [x,y]=xf.P(L.p); g+=ELEC.pot(x,y,s); cnt.pot=(cnt.pot||0)+1; });
  wallBoxes(H_).forEach(({b,p,ext})=>{ const [x,y]=xf.P(p); const kind=b.kind;
    if(kind==='outlet'){ g+=ELEC.outlet(x,y,s,ext); cnt[ext?'wp':'outlet']=(cnt[ext?'wp':'outlet']||0)+1; }
    else if(kind==='switch'){ g+=ELEC.switch(x,y,s); cnt.switch=(cnt.switch||0)+1; }
    else if(kind==='data'){ g+=ELEC.data(x,y,s); cnt.data=(cnt.data||0)+1; }
    else if(kind==='light'){ g+=ELEC.light(x,y,s); cnt.xl=(cnt.xl||0)+1; }
    else if(kind==='box'){ g+=ELEC.box(x,y,s); cnt.box=(cnt.box||0)+1; } });
  g+=elevMarkers(H_, xf)+northArrow(AREA.x1-40, AREA.y0+40)+scaleBar(AREA.x0+10, AREA.y1-14, xf.k)+viewTitle(AREA.x0+(AREA.x1-AREA.x0)/2-90, AREA.y1-10, '1', sh.no, 'MAIN LEVEL ELECTRICAL PLAN', label);
  // legend
  const LG=[['pot','pot',`4" POT LIGHT (CEILING)`],['outlet','outlet','DUPLEX RECEPTACLE'],['wp','outlet','EXTERIOR WP RECEPTACLE'],['switch','switch','SWITCH'],['data','data','DATA / COMMS'],['xl','light','EXTERIOR WALL LIGHT'],['box','box','JUNCTION / DEVICE BOX']].filter(([c])=>cnt[c]);
  let lx=AREA.x0+10, ly=AREA.y0+20; g+=rect(lx-6, ly-14, 250, 30+LG.length*18+44, {fill:'#fff', stroke:BLUE, sw:0.6})+tx(lx, ly, 'ELECTRICAL LEGEND', {size:11, weight:'bold', fill:BLUE}); ly+=20;
  LG.forEach(([c,sym,t])=>{ g+=ELEC[sym](lx+8, ly-3, 1.2, c==='wp')+tx(lx+24, ly, t, {size:8.5, fill:BLUE})+tx(lx+236, ly, String(cnt[c]), {size:8.5, anchor:'end', weight:'bold', fill:BLUE}); ly+=18; });
  wrap('CIRCUITING, PANEL SCHEDULE AND CABLE SIZES BY THE ELECTRICIAN UNLESS SHOWN ON E-SERIES SHEETS. ALL WORK TO THE CANADIAN ELECTRICAL CODE.', 236, 7).forEach(l=>{ g+=tx(lx, ly+2, l, {size:7, fill:GREY}); ly+=9; });
  return g;
}
/* P11: fixtures in blue with drain sizes */
const DRAIN = I => { const k=I.it.k||'', c=I.cat;
  if(c==='bath' && /^WC/.test(k)) return ['3" DIA. DRAIN','TOILET'];
  if(c==='bath' && /^(SH|TS|BT|LPG-SH)/.test(k)) return ['2" DIA. DRAIN', /^BT/.test(k)?'TUB':/^TS/.test(k)?'TUB / SHOWER':'SHOWER'];
  if(c==='bath' && /^LV/.test(k)) return ['1 1/2" DIA. DRAIN','LAVATORY'];
  if(c==='sink') return [/LAU/.test(k)?'2" DIA. DRAIN':'1 1/2" DIA. DRAIN', /LAU/.test(k)?'LAUNDRY TUB':'SINK'];
  if(c==='vanity' && /^VD$/.test(k)) return ['1 1/2" DIA. DRAIN','VANITY SINK'];
  if(c==='appliance' && /^DW/.test(k)) return ['TO SINK TRAP','DISHWASHER'];
  if(c==='appliance' && /^WD/.test(k)) return ['2" DIA. DRAIN (STANDPIPE)','WASHER'];
  return null; };
function sPlumbing(ctx, sh){
  const { H_ } = ctx, { xf, label } = planFit(ctx); sh.scale=label;
  let g=deckSVG(H_, xf)+planFurniture(ctx, xf, { tone:'#b7bccb', label:false, only:I=>!DRAIN(I) })+drawWalls(H_, xf, { light:true, labels:false })+roomLabels(H_, xf, { dims:false });
  const fx=H_.items.filter(I=>DRAIN(I)); const cnt={};
  fx.forEach((I,i)=>{ g+=itemSVG(I, xf, { tone:BLUE, sw:0.9, label:false });
    const [d, what]=DRAIN(I); cnt[what]=(cnt[what]||0)+1;
    const c=xf.P(I.f(0, I.it.d/2)), sgn = i%2 ? 1 : -1, lx=c[0]+sgn*60, ly=c[1]-36-(i%3)*12;
    g+=circ(c[0],c[1],2.2,{fill:BLUE,stroke:BLUE})+line(c[0],c[1],lx,ly,0.5,BLUE)+line(lx,ly,lx+sgn*8,ly,0.5,BLUE)
      +tx(lx+sgn*10, ly-1.5, d, {size:7.5, weight:'bold', fill:BLUE, anchor:sgn>0?'start':'end'})+tx(lx+sgn*10, ly+8, `(${what})`, {size:6.5, fill:BLUE, anchor:sgn>0?'start':'end'}); });
  g+=elevMarkers(H_, xf)+northArrow(AREA.x1-40, AREA.y0+40)+scaleBar(AREA.x0+10, AREA.y1-14, xf.k)+viewTitle(AREA.x0+(AREA.x1-AREA.x0)/2-90, AREA.y1-10, '1', sh.no, 'MAIN LEVEL PLUMBING PLAN', label);
  let lx=AREA.x0+10, ly=AREA.y0+20; const rows=Object.entries(cnt);
  g+=rect(lx-6, ly-14, 250, 34+Math.max(1,rows.length)*15+52, {fill:'#fff', stroke:BLUE, sw:0.6})+tx(lx, ly, 'PLUMBING FIXTURES', {size:11, weight:'bold', fill:BLUE}); ly+=18;
  if(!rows.length){ g+=tx(lx, ly, 'NO FIXTURES PLACED IN THIS HOME YET', {size:8.5, fill:BLUE}); ly+=15; }
  rows.forEach(([w,n])=>{ g+=tx(lx, ly, w, {size:8.5, fill:BLUE})+tx(lx+236, ly, String(n), {size:8.5, anchor:'end', weight:'bold', fill:BLUE}); ly+=15; });
  wrap('DRAINS AND SUPPLIES RUN IN THE 1 1/2" FLOOR SERVICE GAP. VENTING, TRAP ARMS AND FINAL ROUTING BY THE PLUMBER TO THE NATIONAL PLUMBING CODE. SUPPLIES 1/2" PEX HOT AND COLD UNLESS NOTED.', 236, 7).forEach(l=>{ g+=tx(lx, ly+4, l, {size:7, fill:GREY}); ly+=9; });
  return g;
}
/* A11: foundation */
function sFoundation(ctx, sh){
  const { H_ } = ctx, { xf, label } = planFit(ctx, 150); sh.scale=label; const conc=foundationOf(ctx.k)==='concrete';
  let g='';
  if(conc){ let C=null; try{ C=ctx.concrete(); }catch(e){}
    if(C){
      try{ if(C.band && C.off){ C.band(C.off.foot0, C.off.foot1).forEach(b=>{ g+=poly(b.outer.map(xf.P),{stroke:INK, sw:0.6, dash:'6 3'})+poly(b.inner.map(xf.P),{stroke:INK, sw:0.6, dash:'6 3'}); });
        C.band(C.off.foamOut, C.off.foamIn).forEach(b=>{ g+=poly(b.outer.map(xf.P),{fill:'#e3e3e3', stroke:INK, sw:0.9})+poly(b.inner.map(xf.P),{fill:'#fff', stroke:INK, sw:0.9}); }); } }catch(e){}
      try{ C.loops.forEach((l,i)=>{ const pts=l.map(e=>xf.P(e.p)); g+=poly(pts,{stroke:INK, sw:1.4}); }); }catch(e){}
      (C.sections||[]).forEach(s=>{ const r=s.rect; if(!r) return; const [x0,y0]=xf.P([r[0],r[1]]), [x1,y1]=xf.P([r[2],r[3]]); g+=rect(x0,y0,x1-x0,y1-y0,{fill:'#e9e9e9', stroke:INK, sw:0.8}); });
    }
    g+=tx(AREA.x0+10, AREA.y0+20, `${ICF.footW}" x ${ICF.footT}" CONCRETE FOOTING UNDER ONE COURSE OF ICF (${ICF.core}" CORE). SEE CONCRETE SHEET FOR SECTION AND TAKE-OFF.`, {size:9, fill:BLUE, weight:'bold'});
  }
  // the steel frames: 2" x 3" tube in 8' x 8' sections under every pod
  H_.pods.forEach(p=>{ const n=Math.round(p.len/8); for(let i=0;i<n;i++){ const along=i*8;
    const [x0,y0]=xf.P(p.alongX?[p.x+along, p.z]:[p.x, p.z+along]), [x1,y1]=xf.P(p.alongX?[p.x+along+8, p.z1]:[p.x1, p.z+along+8]);
    const t=2/FT*xf.k; g+=rect(x0,y0,x1-x0,y1-y0,{stroke:INK, sw:0.8})+rect(x0+t,y0+t,x1-x0-2*t,y1-y0-2*t,{stroke:INK, sw:0.5}); } });
  g+=deckSVG(H_, xf);
  if(!conc || H_.decks.length){ let F=null; try{ F=ctx.found(); }catch(e){}
    if(F){ F.sc.forEach(q=>{ const [x,y]=xf.P([q.x,q.z]); g+=circ(x,y,6,{fill:'#fff',stroke:BLUE,sw:0.9})+line(x-4.2,y-4.2,x+4.2,y+4.2,0.5,BLUE)+line(x+4.2,y-4.2,x-4.2,y+4.2,0.5,BLUE)+tx(x+8,y-6,String(q.id),{size:6.5,fill:BLUE}); });
      // screw rows dimensioned along the front and the left side
      const xs=[...new Set(F.sc.map(q=>+q.x.toFixed(3)))], zs=[...new Set(F.sc.map(q=>+q.z.toFixed(3)))];
      g+=chain(xs.map(xf.X), xf.Y(H_.hb.z0)-22, ()=>xf.Y(H_.hb.z0)-4, true, { k:xf.k, min:1.5 });
      g+=chain(zs.map(xf.Y), xf.X(H_.hb.x0)-22, ()=>xf.X(H_.hb.x0)-4, false, { k:xf.k, min:1.5 });
      const nt=`${F.sc.length} GROUND SCREWS, NO MORE THAN ${SCREW_MAX}'-0" APART, CORNERS ALWAYS. SCREW TYPE, LENGTH AND LOADING TO BE DETERMINED BY THE SUPPLIER.`;
      if(!conc) wrap(nt, 420, 9).forEach((l,i)=>{ g+=tx(AREA.x0+10, AREA.y0+20+i*12, l, {size:9, fill:BLUE, weight:'bold'}); });
    } }
  g+=planDims(H_, xf, { openings:false });
  g+=tx(AREA.x1-10, AREA.y1-62, '2" x 3" STEEL TUBE FRAME, 8\' x 8\' SECTIONS UNDER EVERY POD. PODS SET 3/4" APART.', {size:8.5, anchor:'end', fill:BLUE});
  g+=northArrow(AREA.x1-40, AREA.y0+40)+scaleBar(AREA.x0+10, AREA.y1-14, xf.k)+viewTitle(AREA.x0+(AREA.x1-AREA.x0)/2-90, AREA.y1-10, '1', sh.no, 'FOUNDATION PLAN', label);
  return g;
}
/* A21: the four outside elevations (front, right, back, left) */
const GR = 12;   // grade to the underside of the steel frame, inches (permit drawing; varies on site)
const LEV = (() => { const fb=GR+FLOOR_BUILD.frame.h+FLOOR_BUILD.acp.t; return { frame:GR, floorB:fb, wallB:fb+WALL_BASE, ceil:fb+LAYER_KINDS['ceiling-int'].z, roofB:fb+LAYER_KINDS.roof.z, top:fb+LAYER_KINDS.roof.z+LAYER_KINDS.roof.t }; })();
function elevData(H_, side){
  const n={S:[0,-1],N:[0,1],W:[-1,0],E:[1,0]}[side], r=[n[1],-n[0]], h=p=>p[0]*r[0]+p[1]*r[1], dep=p=>p[0]*n[0]+p[1]*n[1];
  const pods=H_.pods.map(p=>{ const C=[[p.x,p.z],[p.x1,p.z],[p.x1,p.z1],[p.x,p.z1]]; return { p, h0:Math.min(...C.map(h)), h1:Math.max(...C.map(h)), dep:Math.max(...C.map(dep)) }; });
  const h0=Math.min(...pods.map(q=>q.h0)), h1=Math.max(...pods.map(q=>q.h1));
  const walls=H_.walls.filter(W=>W.s.type==='ext' && W.s.side===side).map(W=>({ W, dep:dep(W.S) }));
  return { n, r, h, dep, pods, walls, h0, h1 };
}
function drawElevation(ctx, side, x0, yBase, k){   // yBase = grade line on the page; k = pt per foot
  const H_=ctx.H_, E=elevData(H_, side), ki=k/FT, X=hh=>x0+(hh-E.h0)*k, Y=v=>yBase-v*ki; let g='';
  const top=LEV.top;
  // ground screws / ICF under the home
  let F=null; if(foundationOf(ctx.k)!=='concrete'){ try{ F=ctx.found(); }catch(e){} }
  if(F){ const seen=[]; F.sc.forEach(q=>{ const hh=E.h([q.x,q.z]); if(seen.some(v=>Math.abs(v-hh)<0.4)) return; seen.push(hh);
      const x=X(hh); g+=line(x, Y(GR), x, Y(-26), 1.4); for(let z=-24; z<GR-2; z+=4) g+=line(x-3, Y(z), x+3, Y(z+2.4), 0.5); }); }
  else g+=rect(X(E.h0), Y(GR), (E.h1-E.h0)*k, GR*ki, {fill:'#d9d9d9', stroke:INK, sw:0.8});
  // pods far to near
  E.pods.slice().sort((a,b)=>a.dep-b.dep).forEach(P=>{ const xa=X(P.h0), xb=X(P.h1);
    g+=rect(xa, Y(top), xb-xa, (top-LEV.frame)*ki, {fill:'#fff', stroke:INK, sw:0.9});
    g+=rect(xa, Y(LEV.floorB), xb-xa, (LEV.floorB-LEV.frame)*ki, {fill:'#4a4a4a', stroke:INK, sw:0.5});     // steel frame
    g+=line(xa, Y(LEV.wallB), xb, Y(LEV.wallB), 0.6)+line(xa, Y(LEV.ceil), xb, Y(LEV.ceil), 0.6)+line(xa, Y(LEV.roofB), xb, Y(LEV.roofB), 0.3, GREY);
    // the outside walls of this pod on this side, nearest first only where they are this pod's face
    E.walls.filter(w=>w.W.s.pod.i===P.p.i).forEach(({W})=>{
      W.ops.forEach(q=>{ const o=q.o; if(!q.owner && o.kind!=='opening') return;
        const a=E.h(W.at(q.a)), b=E.h(W.at(q.b)), xl=X(Math.min(a,b)), xr=X(Math.max(a,b)), yb=Y(LEV.wallB+o.y), yt=Y(LEV.wallB+o.y+o.h), wd=xr-xl, ht=yb-yt;
        if(o.shape==='round'){ g+=circ((xl+xr)/2,(yt+yb)/2,wd/2,{fill:'#eef5fb', stroke:INK, sw:0.9}); return; }
        g+=rect(xl, yt, wd, ht, {fill:o.kind==='door'?'#f3efe8':'#eef5fb', stroke:INK, sw:0.9})+rect(xl+2.2, yt+2.2, wd-4.4, ht-4.4, {stroke:INK, sw:0.4});
        const ur=q.ur; if(ur){ const sym=symbol(ur.unit.type, ur.hand, o.w, o.h); sym.segs.forEach(([p1,p2,p3,p4])=>{ g+=line(xl+p1*ki, yb-p2*ki, xl+p3*ki, yb-p4*ki, 0.45, INK, '4 3'); }); sym.arrows.forEach(([p1,p2,p3,p4])=>{ g+=line(xl+p1*ki, yb-p2*ki, xl+p3*ki, yb-p4*ki, 0.6); }); }
        if(o.kind!=='opening'){ const lab = ur ? `${fin(ur.unit.w)} x ${fin(ur.unit.h)}` : `${fin(o.w)} x ${fin(o.h)}`, cxm=(xl+xr)/2, cym=(yt+yb)/2;
          if(wd>=textW(lab,8)+10) g+=rect(cxm-textW(lab,8)/2-3, cym-20, textW(lab,8)+6, 12, {fill:'#fff', stroke:'none'})+tx(cxm, cym-11, lab, {size:8, anchor:'middle', fill:BLUE, weight:'bold'});
          else g+=tx(cxm+3, cym, lab, {size:Math.min(8, ht/7), anchor:'middle', fill:BLUE, weight:'bold', rot:-90}); }
      });
    });
  });
  g+=line(X(E.h0)-30, Y(0), X(E.h1)+30, Y(0), 1.4);
  for(let x=X(E.h0)-30; x<X(E.h1)+30; x+=9) g+=line(x, Y(0)+1, x-6, Y(0)+7, 0.35, GREY);
  return { g, w:(E.h1-E.h0)*k, E };
}
function levels(x, yBase, ki){
  let g=''; [['T.O. ROOF', LEV.top], ['U/S CEILING', LEV.ceil], ['T.O. SUBFLOOR', LEV.wallB], ['GRADE (VARIES)', 0]].forEach(([t,v])=>{ const y=yBase-v*ki;
    g+=line(x, y, x+16, y, 0.5, BLUE, '3 2')+`<polygon points="${f1(x+16)},${f1(y)} ${f1(x+22)},${f1(y-5)} ${f1(x+28)},${f1(y)}" fill="${BLUE}"/>`+tx(x+32, y-2, t, {size:7.5, fill:BLUE, weight:'bold'})+tx(x+32, y+8, ftin(v-LEV.wallB), {size:7, fill:BLUE}); });
  return g;
}
function sElevations(ctx, sh){
  const { H_ } = ctx; const lenS=elevData(H_,'S'), lenE=elevData(H_,'E');
  const wFront=lenS.h1-lenS.h0, wSide=lenE.h1-lenE.h0, hF=(LEV.top+40)/FT;
  const availW=AREA.x1-AREA.x0-120, availH=AREA.y1-AREA.y0-3*70;
  const [k,label]=pickScale(Math.max(wFront, 2*wSide+10), 3*hF, availW, availH, 27); sh.scale=label; const ki=k/FT;
  const rowH=(AREA.y1-AREA.y0)/3, cx=(AREA.x0+AREA.x1)/2;
  const put=(side, xMid, yBase, num, title)=>{ const pre=elevData(H_, side), w=(pre.h1-pre.h0)*k, x0=xMid-w/2; const D=drawElevation(ctx, side, x0, yBase, k);
    return D.g+viewTitle(xMid-70, yBase+26*ki+26, num, 'A21', title, '') + (num==='1' ? levels(x0+w+40, yBase, ki) : ''); };
  let g='';
  g+=put('S', cx, AREA.y0+rowH-64, '1', `${SIDE_NAME.S.toUpperCase()} ELEVATION`);
  g+=put('E', AREA.x0+(AREA.x1-AREA.x0)*0.74, AREA.y0+2*rowH-64, '2', `RIGHT ELEVATION`);
  g+=put('W', AREA.x0+(AREA.x1-AREA.x0)*0.26, AREA.y0+2*rowH-64, '4', `LEFT ELEVATION`);
  g+=put('N', cx, AREA.y0+3*rowH-64, '3', `${SIDE_NAME.N.toUpperCase()} ELEVATION`);
  g+=tx(AREA.x1-10, AREA.y1-4, `SCALE: ${label}  ·  GRADE SHOWN ${GR}" BELOW THE STEEL FRAME FOR PERMIT ONLY; SET ON SITE`, {size:8, anchor:'end', fill:BLUE});
  return g;
}
/* A31: typical section across a pod, every layer drawn to scale, with the build-up notes */
function sSection(ctx, sh){
  const { bp } = ctx, V=noteVars(); const k=54, ki=k/FT;   // 1" = 1'-0"
  const scale='1" = 1\'-0"'; sh.scale=scale;
  const podW=96, wT=T, totalW=podW, totalH=LEV.top-LEV.frame+6;
  const x0=AREA.x0+(AREA.x1-AREA.x0)*0.52 - totalW*ki/2, yB=AREA.y0+(AREA.y1-AREA.y0)*0.5 + totalH*ki/2;
  const X=x=>x0+x*ki, Y=v=>yB-(v-LEV.frame)*ki; let g='';
  g+=`<defs><pattern id="bpFoam" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#dbe7f5"/><line x1="0" y1="6" x2="6" y2="0" stroke="#8fb0d8" stroke-width="0.5"/></pattern></defs>`;
  const sip=(x,y,w,h,vert)=>{ const sk=7/16*ki; let s=rect(x,y,w,h,{fill:'url(#bpFoam)', stroke:INK, sw:0.6});
    s+= vert ? rect(x,y,sk,h,{fill:'#e8cf9a', stroke:INK, sw:0.4})+rect(x+w-sk,y,sk,h,{fill:'#e8cf9a', stroke:INK, sw:0.4}) : rect(x,y,w,sk,{fill:'#e8cf9a', stroke:INK, sw:0.4})+rect(x,y+h-sk,w,sk,{fill:'#e8cf9a', stroke:INK, sw:0.4}); return s; };
  const fb=LEV.floorB, L=LAYER_KINDS;
  // frame + ACM
  g+=rect(X(0), Y(fb), FLOOR_BUILD.frame.w*ki, (fb-LEV.frame)*ki, {fill:'#555', stroke:INK, sw:0.5})+rect(X(podW)-FLOOR_BUILD.frame.w*ki, Y(fb), FLOOR_BUILD.frame.w*ki, (fb-LEV.frame)*ki, {fill:'#555', stroke:INK, sw:0.5});
  // floor: exterior SIP, gap, interior SIP, rims
  g+=sip(X(0), Y(fb+L['floor-ext'].z+L['floor-ext'].t), podW*ki, L['floor-ext'].t*ki, false);
  g+=sip(X(0), Y(fb+L['floor-int'].z+L['floor-int'].t), podW*ki, L['floor-int'].t*ki, false);
  g+=rect(X(0), Y(fb+FLOOR_BUILD.rimZ+FRAME.lvl.floor), FRAME.lvl.t*ki, FRAME.lvl.floor*ki, {fill:'#d9a85f', stroke:INK, sw:0.5})+rect(X(podW)-FRAME.lvl.t*ki, Y(fb+FLOOR_BUILD.rimZ+FRAME.lvl.floor), FRAME.lvl.t*ki, FRAME.lvl.floor*ki, {fill:'#d9a85f', stroke:INK, sw:0.5});
  // walls
  const wb=fb+WALL_BASE; g+=sip(X(0), Y(wb+H), wT*ki, H*ki, true)+sip(X(podW-wT), Y(wb+H), wT*ki, H*ki, true);
  g+=rect(X(7/16), Y(wb+FRAME.plate), (wT-7/8)*ki, FRAME.plate*ki, {fill:'#e8c88f', stroke:INK, sw:0.3})+rect(X(podW-wT+7/16), Y(wb+FRAME.plate), (wT-7/8)*ki, FRAME.plate*ki, {fill:'#e8c88f', stroke:INK, sw:0.3});
  // ceiling + roof
  g+=sip(X(0), Y(fb+L['ceiling-int'].z+L['ceiling-int'].t), podW*ki, L['ceiling-int'].t*ki, false)+sip(X(0), Y(fb+L.roof.z+L.roof.t), podW*ki, L.roof.t*ki, false);
  g+=rect(X(0), Y(fb+L.roof.z+L.roof.t-0.3), FRAME.lvl.t*ki, FRAME.lvl.roof*ki, {fill:'#d9a85f', stroke:INK, sw:0.5})+rect(X(podW)-FRAME.lvl.t*ki, Y(fb+L.roof.z+L.roof.t-0.3), FRAME.lvl.t*ki, FRAME.lvl.roof*ki, {fill:'#d9a85f', stroke:INK, sw:0.5});
  // grade
  g+=line(X(-6), Y(0), X(podW+14), Y(0), 1.2)+tx(X(podW+16), Y(0)+3, 'GRADE', {size:7.5, fill:BLUE});
  // dimensions on the right
  const dx=X(podW)+30, dv=(a,b,t,off=0)=>{ const y1=Y(a), y2=Y(b); return line(dx+off,y1,dx+off,y2,0.5,BLUE)+line(dx+off-3,y1+3,dx+off+3,y1-3,0.9,BLUE)+line(dx+off-3,y2+3,dx+off+3,y2-3,0.9,BLUE)+line(X(podW)+3,y1,dx+off+4,y1,0.3,BLUE)+line(X(podW)+3,y2,dx+off+4,y2,0.3,BLUE)+tx(dx+off+10,(y1+y2)/2+3,t,{size:8.5,fill:BLUE,weight:'bold'}); };
  g+=dv(fb, wb, `${fin(WALL_BASE)} FLOOR`)+dv(wb, fb+L['ceiling-int'].z, `${fin(L['ceiling-int'].z-WALL_BASE)} CLEAR (${ftin(L['ceiling-int'].z-WALL_BASE)})`)+dv(fb+L['ceiling-int'].z, LEV.top, `${fin(LEV.top-fb-L['ceiling-int'].z)} CEILING + ROOF`);
  g+=dv(LEV.frame, LEV.top, `${ftin(LEV.top-LEV.frame)} OVERALL`, 120);
  // width
  const yw=Y(LEV.top)-24; g+=line(X(0),yw,X(podW),yw,0.5,BLUE)+line(X(0)-3,yw+3,X(0)+3,yw-3,0.9,BLUE)+line(X(podW)-3,yw+3,X(podW)+3,yw-3,0.9,BLUE)+tx(X(podW/2), yw-4, `${ftin(podW)} POD`, {size:8.5, anchor:'middle', fill:BLUE, weight:'bold'});
  // notes with leaders
  const note=(title, text, yTop, tgt)=>{ const L2=fillVars(text, V).split('\n').filter(Boolean); const xr=X(0)-60; let s=tx(xr, yTop, title, {size:11.5, weight:'bold', fill:BLUE, anchor:'end'})+line(xr-textW(title,11.5)*1.02, yTop+3, xr, yTop+3, 0.8, BLUE);
    L2.forEach((l,i)=>{ s+=tx(xr, yTop+18+i*14, l.toUpperCase()+' -', {size:9.5, fill:BLUE, anchor:'end', weight:'bold'}); });
    const ly=yTop+18+Math.floor(L2.length/2)*14-3; s+=line(xr+4, ly, xr+22, ly, 0.5, BLUE)+line(xr+22, ly, tgt[0], tgt[1], 0.5, BLUE)+circ(tgt[0], tgt[1], 1.6, {fill:BLUE, stroke:BLUE}); return s; };
  g+=note('TYPICAL SIP ROOF / CEILING CONSTRUCTION:', bp.notes.roof, Y(LEV.top)-80, [X(14), Y(fb+L.roof.z+2)]);
  g+=note('TYPICAL SIP WALL CONSTRUCTION:', bp.notes.wall, Y(wb+H*0.62), [X(wT/2), Y(wb+H*0.5)]);
  g+=note('TYPICAL SIP FLOOR CONSTRUCTION:', bp.notes.floor, Y(fb+4)+50, [X(14), Y(fb+L['floor-ext'].z+2)]);
  g+=tx(X(podW/2), Y(wb+H*0.55), 'INTERIOR', {size:10, anchor:'middle', fill:GREY});
  g+=tx(X(podW/2), Y(fb+(L['floor-ext'].t+L['floor-int'].z)/2+0.4), 'SERVICE GAP', {size:6.5, anchor:'middle', fill:INK});
  g+=viewTitle(X(podW/2)-90, Y(LEV.frame)+GR*ki+56, '1', 'A31', 'SECTION 1-A31', scale);
  g+=tx(X(podW/2), Y(LEV.frame)+GR*ki+92, 'TYPICAL CROSS SECTION THROUGH A POD. ALL LAYERS DRAWN AT THEIR BUILD THICKNESS.', {size:8, anchor:'middle', fill:GREY});
  return g;
}
/* A61: window, exterior door, interior door schedules */
function schedules(H_){
  const W={}, D={}, I={};
  const add=(map, q, W_)=>{ const o=q.o, u=q.ur?.unit, wd=u?u.w:o.w, ht=u?u.h:o.h;
    const desc = u ? (TYPES[u.type]?.label||u.type).toUpperCase() : o.kind==='opening' ? 'DOORWAY OPENING' : o.kind==='patio' ? 'PATIO DOOR (R.O.)' : o.kind==='door' ? 'DOOR (R.O.)' : 'WINDOW (R.O.)';
    const lab = u ? u.id : `${fin(wd)} X ${fin(ht)}`;
    const key=[desc,lab,wd,ht].join('|'); (map[key] ||= { desc, lab, w:wd, h:ht, n:0, type:u?.type||o.kind, hand:q.ur?.hand, shape:o.shape }).n++; };
  H_.walls.forEach(Wl=>Wl.ops.forEach(q=>{ if(!q.owner) return; const k=q.o.kind;
    if(Wl.s.type==='ext'){ if(k==='window') add(W,q,Wl); else add(D,q,Wl); }
    else if(k!=='opening' || Wl.s.pod.i < (Wl.s.other?.i ?? 1e9)) add(I,q,Wl); }));
  return { windows:Object.values(W), extDoors:Object.values(D), intDoors:Object.values(I) };
}
function schedTable(x, y, w, title, rows){
  const cols=[['FLOOR',0.07],['DESCRIPTION',0.21],['LABEL',0.17],['WIDTH',0.09],['HEIGHT',0.09],['AREA (SF)',0.11],['QTY',0.07],['ELEVATION',0.19]];
  const rh=Math.max(48, Math.min(90, 0)) || 60, hh=30; let g=rect(x, y, w, 16, {fill:'#eef2f8', stroke:BLUE, sw:0.6})+tx(x+w/2, y+12, title, {size:9.5, weight:'bold', fill:BLUE, anchor:'middle'});
  let yy=y+16; g+=rect(x, yy, w, hh, {stroke:BLUE, sw:0.6}); let cx=x; cols.forEach(([c,f])=>{ g+=tx(cx+4, yy+hh-10, c, {size:8, weight:'bold', fill:BLUE}); cx+=f*w; g+=line(cx, yy, cx, yy+hh+rows.length*rh+16, 0.4, BLUE); }); yy+=hh;
  let tot=0;
  rows.forEach(r=>{ const area=r.w*r.h/144*r.n; tot+=area; g+=rect(x, yy, w, rh, {stroke:BLUE, sw:0.4});
    const vals=['1', r.desc, r.lab, `${fin(r.w)}`, `${fin(r.h)}`, (r.w*r.h/144).toFixed(2), String(r.n)];
    let c2=x; vals.forEach((v,i)=>{ const L=wrap(String(v), cols[i][1]*w-8, 8.5); L.slice(0,3).forEach((l,j)=>{ g+=tx(c2+4, yy+rh/2+3+(j-(Math.min(3,L.length)-1)/2)*10, l, {size:8.5, fill:BLUE}); }); c2+=cols[i][1]*w; });
    // the unit drawn small, as seen from outside
    const ew=cols[7][1]*w-16, eh=rh-14, sc=Math.min(ew/r.w, eh/r.h), dw=r.w*sc, dh=r.h*sc, ex=c2+(cols[7][1]*w-dw)/2, ey=yy+(rh-dh)/2;
    if(r.shape==='round') g+=circ(ex+dw/2, ey+dh/2, dw/2, {sw:0.9})+circ(ex+dw/2, ey+dh/2, dw/2-2, {sw:0.4});
    else { g+=rect(ex, ey, dw, dh, {sw:0.9})+rect(ex+1.6, ey+1.6, dw-3.2, dh-3.2, {sw:0.4});
      const sym=symbol(r.type, r.hand, r.w, r.h); sym.segs.forEach(([a,b,c,d])=>{ g+=line(ex+a*sc, ey+dh-b*sc, ex+c*sc, ey+dh-d*sc, 0.4, INK, '2 1.5'); }); }
    yy+=rh; });
  g+=rect(x, yy, w, 16, {stroke:BLUE, sw:0.6})+tx(x+4, yy+12, 'TOTALS:', {size:8.5, weight:'bold', fill:BLUE})+tx(x+(0.07+0.21+0.17+0.09+0.09)*w+4, yy+12, tot.toFixed(2), {size:8.5, weight:'bold', fill:BLUE})+tx(x+(0.07+0.21+0.17+0.09+0.09+0.11)*w+4, yy+12, String(rows.reduce((a,r)=>a+r.n,0)), {size:8.5, weight:'bold', fill:BLUE});
  return { g, h: yy+16-y };
}
function sSchedules(ctx, sh){
  const S=schedules(ctx.H_); sh.scale='N.T.S.';
  const w=(AREA.x1-AREA.x0-30)/2; let g='';
  const A=schedTable(AREA.x0, AREA.y0+20, w, 'WINDOW SCHEDULE', S.windows);
  const B=schedTable(AREA.x0+w+30, AREA.y0+20, w, 'EXTERIOR DOOR SCHEDULE', S.extDoors);
  const C=schedTable(AREA.x0+w+30, AREA.y0+20+B.h+30, w, 'INTERIOR DOOR & OPENING SCHEDULE', S.intDoors);
  g+=A.g+B.g+C.g;
  g+=tx(AREA.x0, AREA.y1-10, 'SIZES ARE THE UNIT SIZE WHERE A UNIT IS CHOSEN, ELSE THE ROUGH OPENING (R.O.). HAND AND SWING AS SEEN FROM OUTSIDE. AREA IN SQUARE FEET.', {size:8, fill:GREY});
  return g;
}
/* A91: renders */
function sViews(ctx, sh){
  sh.scale='N.T.S.'; const R=ctx.renders||[]; let g='';
  const gap=24, w=(AREA.x1-AREA.x0-gap)/2, h=(AREA.y1-AREA.y0-gap-30)/2;
  const T_=['EXTERIOR VIEW 1','EXTERIOR VIEW 2','EXTERIOR VIEW 3','FLOOR PLAN, ROOF OFF'];
  for(let i=0;i<4;i++){ const x=AREA.x0+(i%2)*(w+gap), y=AREA.y0+Math.floor(i/2)*(h+gap+15);
    if(R[i]) g+=`<image x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" href="${R[i]}" preserveAspectRatio="xMidYMid slice"/>`;
    else g+=rect(x,y,w,h,{fill:'#f3f4f6', stroke:GREY, sw:0.6})+tx(x+w/2, y+h/2, '3D VIEW NOT RENDERED', {size:12, anchor:'middle', fill:GREY});
    g+=rect(x,y,w,h,{sw:0.6})+tx(x, y+h+13, T_[i], {size:9, weight:'bold', fill:BLUE}); }
  return g;
}

/* ------------------------------------------------------------------ the set */
const SHEETS = [
  { id:'cover', no:'A01', title:'Cover & General Notes', scale:'N.T.S.', fn:sCover },
  { id:'found', no:'A11', title:'Foundation Plan', fn:sFoundation },
  { id:'floor', no:'A12', title:'Main Level Floor Plan', fn:sFloor },
  { id:'key',   no:'A13', title:'Pod & Wall Key Plan', fn:sKey },
  { id:'elec',  no:'E11', title:'Main Level Electrical Plan', fn:sElectrical },
  { id:'plumb', no:'P11', title:'Main Level Plumbing Plan', fn:sPlumbing },
  { id:'elev',  no:'A21', title:'Exterior Elevations', fn:sElevations },
  { id:'sect',  no:'A31', title:'Building Section', fn:sSection },
  { id:'sched', no:'A61', title:'Window & Door Schedules', scale:'N.T.S.', fn:sSchedules },
  { id:'views', no:'A91', title:'3D Views', scale:'N.T.S.', fn:sViews },
];
/* ctx: everything the sheets share. found / concrete are passed in (to keep this file free of the sheet UI imports) */
function makeContext({ bp=loadBP(), renders=[], found=null, concrete=null }={}){
  const k=state.model, H_=homeModel(k), info=homeInfo(bp, k);
  const counts={}; H_.pods.forEach(p=>counts[p.len]=(counts[p.len]||0)+1);
  const podsText=Object.entries(counts).sort((a,b)=>b[0]-a[0]).map(([l,n])=>(n>1?`${n} x `:'')+`${l}'`).join(' + ');
  const area=H_.pods.reduce((a,p)=>a+p.w*p.d, 0);
  const on = info.sheets ? SHEETS.filter(s=>info.sheets[s.id]!==false) : SHEETS;
  const list=on.map((s,i)=>({ ...s, i }));
  return { k, bp, info, H_, renders, found, concrete, model:MODELS[k]?.name||k, podsText, areaText:`${Math.round(area)} SQ FT (${(area*0.0929).toFixed(1)} M2)`, list, count:list.length };
}
function buildSheet(ctx, sh){ const s={...sh}; const body=s.fn(ctx, s); return sheetSVG(ctx, s, body); }
function buildSet(ctx){ return ctx.list.map(sh=>({ sh, svg:buildSheet(ctx, sh) })); }

export { SHEETS, PW, PH, loadBP, saveBP, homeInfo, makeContext, buildSheet, buildSet, setLogo, homeModel, schedules, NOTES0, COMPANY0, ftin };
