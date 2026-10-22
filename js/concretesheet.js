/* Cubit Builder — concretesheet.js : the foundation sheet for a home on a concrete ICF foundation.
   Plan (footing, ICF, inside supports, access, decks), a typical section, the takeoff and the PDF. */
import { FT, ICF, FLOOR } from './config.js';
import { MODELS } from './data.js';
import { fin, fft, asciiFt } from './format.js';
import { getBearing, fmtBearing, northVec } from './orient.js';
import { podList, deckList, layoutOffsets, screwPlan, padsFor } from './layout.js';
import { concretePlan, offsetLoop } from './concrete.js';
import { buildHome } from './scene3d.js';
import { renderSide, toast } from './sidebar.js';
import { state, save } from './state.js';
import { dimH, dimV, downloadBlob } from './sheets.js';

const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const yd3 = ft3 => ft3/27, m3 = ft3 => ft3*0.0283168;
const vol = ft3 => `${ft3.toFixed(1)} ft³ · ${yd3(ft3).toFixed(2)} yd³ · ${m3(ft3).toFixed(2)} m³`;

function sheetData(){
  const cp=concretePlan(state.model), m=MODELS[state.model];
  const LO=layoutOffsets(state.model);
  const pods=podList(state.model).map(p=>({...p, x:p.x+LO.pods[p.i].ox, z:p.z+LO.pods[p.i].oz}));
  const decks=deckList(state.model).map(d=>({...d, x:d.x+LO.decks[d.k].ox, z:d.z+LO.decks[d.k].oz}));
  const footPolys=cp.loops.map(l=>offsetLoop(l,cp.off.foot0));
  const all=footPolys.flat().concat(decks.flatMap(d=>[[d.x,d.z],[d.x+d.w,d.z+d.d]]));
  const home=cp.loops.flatMap(l=>l.map(e=>e.p));
  const hx0=Math.min(...home.map(p=>p[0])), hz0=Math.min(...home.map(p=>p[1])), hx1=Math.max(...home.map(p=>p[0])), hz1=Math.max(...home.map(p=>p[1]));
  const fx0=Math.min(...footPolys.flat().map(p=>p[0])), fz0=Math.min(...footPolys.flat().map(p=>p[1])), fx1=Math.max(...footPolys.flat().map(p=>p[0])), fz1=Math.max(...footPolys.flat().map(p=>p[1]));
  const minx=Math.min(...all.map(p=>p[0])), minz=Math.min(...all.map(p=>p[1])), maxx=Math.max(...all.map(p=>p[0])), maxz=Math.max(...all.map(p=>p[1]));
  const I = (x,z) => [(x-hx0)*FT, (z-hz0)*FT];    // inches from the datum (home's top-left outside corner)
  const screws=screwPlan(state.model, state.inset).screws.map((q,k)=>({...q, id:k+1})), pads=padsFor(state.model, state.inset).map((q,k)=>({...q, id:k+1}));
  return { cp, m, pods, decks, footPolys, I, home:{x0:hx0,z0:hz0,x1:hx1,z1:hz1}, foot:{x0:fx0,z0:fz0,x1:fx1,z1:fz1}, box:{minx,minz,maxx,maxz}, screws, pads };
}

/* ---------------- plan ---------------- */
function planSVG(D){
  const {cp}=D, B=D.box, Wi=(B.maxx-B.minx)*FT, Di=(B.maxz-B.minz)*FT;
  const s=Math.min(2.2, 860/Wi), ml=120, mt=150, mr=90, mb=90, VW=Wi*s+ml+mr, VH=Di*s+mt+mb;
  const X=x=>ml+(x-B.minx)*FT*s, Y=z=>mt+(z-B.minz)*FT*s;
  const path=pts=>'M'+pts.map(([x,z])=>`${X(x).toFixed(1)} ${Y(z).toFixed(1)}`).join(' L')+' Z';
  const ring=(b,fill,stroke='none',sw=0)=>`<path d="${path(b.outer)} ${path(b.inner)}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${sw}"/>`;
  let g=`<svg viewBox="0 0 ${VW.toFixed(0)} ${VH.toFixed(0)}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Concrete foundation plan"><defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="#2f6db5"/></marker>
    <pattern id="eps" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#eef2f5"/><circle cx="3" cy="3" r=".8" fill="#c9d3da"/></pattern></defs>`;
  // decks (outline) under everything
  D.decks.forEach(d=>{ g+=`<rect x="${X(d.x)}" y="${Y(d.z)}" width="${d.w*FT*s}" height="${d.d*FT*s}" fill="#f4ecdb" stroke="#8a7a5c" stroke-width="1" stroke-dasharray="6 3"/><text x="${X(d.x+d.w/2)}" y="${Y(d.z+d.d/2)+4}" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-size="12" font-weight="700" fill="#a8977a">${esc(d.label)} · ${d.L.w}′ × ${d.L.d}′</text>`; });
  // footing, then ICF
  cp.band(cp.off.foot0, cp.off.foot1).forEach(b=>g+=ring(b,'#dcdedb','#7d807b',0.8));
  cp.sections.forEach(sc=>{ const f=sc.foot; g+=`<rect x="${X(f[0])}" y="${Y(f[1])}" width="${(f[2]-f[0])*FT*s}" height="${(f[3]-f[1])*FT*s}" fill="#dcdedb" stroke="#7d807b" stroke-width=".8"/>`; });
  cp.band(cp.off.foamOut, cp.off.core0).forEach(b=>g+=ring(b,'url(#eps)'));
  cp.band(cp.off.core1, cp.off.foamIn).forEach(b=>g+=ring(b,'url(#eps)'));
  cp.band(cp.off.core0, cp.off.core1).forEach(b=>g+=ring(b,'#9b9e99'));
  cp.sections.forEach(sc=>{ const [x0,z0,x1,z1]=sc.rect, F=cp.F;
    g+=`<rect x="${X(x0)}" y="${Y(z0)}" width="${(x1-x0)*FT*s}" height="${(z1-z0)*FT*s}" fill="url(#eps)" stroke="#555" stroke-width=".6"/>`;
    const c = sc.ax==='x' ? [x0, z0+F, x1, z1-F] : [x0+F, z0, x1-F, z1];
    g+=`<rect x="${X(c[0])}" y="${Y(c[1])}" width="${(c[2]-c[0])*FT*s}" height="${(c[3]-c[1])*FT*s}" fill="#9b9e99"/>`;
    const cx=X((x0+x1)/2), cy=Y((z0+z1)/2), off=sc.ax==='x' ? [0,-16] : [16,0];
    g+=`<circle cx="${cx+off[0]}" cy="${cy+off[1]}" r="9" fill="#fff" stroke="#111"/><text x="${cx+off[0]}" y="${cy+off[1]+3.5}" text-anchor="middle" font-size="9.5" font-weight="700">F${sc.id}</text>`; });
  // the home's outer face (= outside of the concrete core)
  cp.loops.forEach(l=>{ g+=`<path d="${path(l.map(e=>e.p))}" fill="none" stroke="#111" stroke-width="1.6" stroke-dasharray="10 4"/>`; });
  D.pods.forEach(p=>{ g+=`<text x="${X(p.x+p.w/2)}" y="${Y(p.z+p.d/2)+4}" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-size="12" font-weight="700" fill="#a8977a" ${p.alongX?'':`transform="rotate(-90 ${X(p.x+p.w/2)} ${Y(p.z+p.d/2)+4})"`}>8′ × ${p.len}′</text>`; });
  // access opening
  if(cp.access){ const a=cp.access, w=a.w/2, along=a.ax==='x';
    const nx=a.n[0], nz=a.n[1], rx0 = along ? a.x-w : (nx>0 ? a.x-cp.C-cp.F : a.x-cp.F), rz0 = along ? (nz>0 ? a.z-cp.C-cp.F : a.z-cp.F) : a.z-w;
    const rw = along ? 2*w : cp.C+2*cp.F, rh = along ? cp.C+2*cp.F : 2*w;
    g+=`<rect x="${X(rx0)}" y="${Y(rz0)}" width="${rw*FT*s}" height="${rh*FT*s}" fill="#fff" stroke="#d0661f" stroke-width="2"/>`;
    const tx=X(a.x-nx*1.4), ty=Y(a.z-nz*1.4);
    g+=`<text x="${tx}" y="${ty+4}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#d0661f">CRAWL ACCESS ${ICF.access}″</text>`; }
  // deck screws / pads
  D.screws.forEach(q=>{ g+=`<circle cx="${X(q.x)}" cy="${Y(q.z)}" r="5" fill="#56606b" stroke="#111"/><text x="${X(q.x)+7}" y="${Y(q.z)-6}" font-size="8.5">S${q.id}</text>`; });
  D.pads.forEach(q=>{ const h=8*s; g+=`<rect x="${X(q.x)-h}" y="${Y(q.z)-h}" width="${2*h}" height="${2*h}" fill="#d9dbd6" stroke="#6d706b"/><text x="${X(q.x)+h+2}" y="${Y(q.z)-h}" font-size="8.5" fill="#555">P${q.id}</text>`; });
  // every outside face: its length at the home's face, dimensioned just outside the footing
  const fo=(cp.off.foot0)*FT*s+26;
  cp.loops.forEach(l=>l.forEach(e=>{ const n=e.n, L=Math.hypot(e.q[0]-e.p[0], e.q[1]-e.p[1]);
    const ax=X(e.p[0])+n[0]*fo, ay=Y(e.p[1])+n[1]*fo, bx=X(e.q[0])+n[0]*fo, by=Y(e.q[1])+n[1]*fo;
    if(n[1]!==0) g+=dimH(Math.min(ax,bx), Math.max(ax,bx), ay, fin(L*FT), Y(e.p[1]), 9.5);
    else g+=dimV(Math.min(ay,by), Math.max(ay,by), ax+(n[0]>0?10:0), fin(L*FT), X(e.p[0]), 9.5); }));
  // overall: home (outer face) and footing outside
  const H=D.home, Fo=D.foot;
  g+=dimH(X(H.x0), X(H.x1), mt-62, `${fin((H.x1-H.x0)*FT)} (${fft((H.x1-H.x0)*FT)}) home outside`, Y(H.z0), 10.5);
  g+=dimH(X(Fo.x0), X(Fo.x1), mt-92, `${fin((Fo.x1-Fo.x0)*FT)} (${fft((Fo.x1-Fo.x0)*FT)}) footing outside`, Y(Fo.z0), 10.5);
  g+=dimV(Y(H.z0), Y(H.z1), ml-62, `${fin((H.z1-H.z0)*FT)} home`, X(H.x0), 10.5);
  g+=dimV(Y(Fo.z0), Y(Fo.z1), ml-92, `${fin((Fo.z1-Fo.z0)*FT)} footing`, X(Fo.x0), 10.5);
  g+=`<circle cx="${X(H.x0)}" cy="${Y(H.z0)}" r="5" fill="#fff" stroke="#d0661f" stroke-width="2"/>`;
  g+=`<text x="${ml-100}" y="${mt-128}" font-size="11" font-weight="700" fill="#111">ORIENTATION · TOP faces ${fmtBearing(getBearing())} · RIGHT ${fmtBearing(getBearing()+90)} · BOTTOM ${fmtBearing(getBearing()+180)} · LEFT ${fmtBearing(getBearing()+270)}</text>`;
  g+=`<text x="${ml-100}" y="${mt-112}" font-size="10" fill="#333">DATUM (orange) = top-left outside corner of the home = outside face of the concrete core. Dashed line = home's outer face.</text>`;
  { const n=northVec(), a=Math.atan2(n[0],-n[1])*180/Math.PI, ax=VW-34, ay=mt-110;
    g+=`<g transform="rotate(${a} ${ax} ${ay})"><circle cx="${ax}" cy="${ay}" r="20" fill="#fff" stroke="#111" stroke-width="1.2"/><path d="M${ax} ${ay-17} L${ax+6} ${ay+5} L${ax} ${ay+1} L${ax-6} ${ay+5} Z" fill="#c0392b"/><text x="${ax}" y="${ay-23}" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-weight="800" font-size="12" fill="#c0392b">N</text></g>`; }
  g+=`<text x="${VW-mr}" y="${VH-14}" text-anchor="end" font-size="10" fill="#555">PLAN SEEN FROM ABOVE · grey = footing · dotted = EPS · dark = concrete core · F = inside support</text>`;
  return g+'</svg>';
}

/* ---------------- typical section through the perimeter ---------------- */
function sectionSVG(cp){
  const s=7, F=ICF.foam, C=cp.C*FT, FW=ICF.footW, FTk=ICF.footT, BH=cp.brand.h, fl=FLOOR*FT, wt=6.5;
  const mid=-C/2, f0=mid+FW/2, f1=mid-FW/2;                 // footing faces, inches from the home's outer face (+ = outside)
  const xin=f1-22, xout=f0+14, y1=FTk, y2=FTk+BH, y3=y2+fl, ytop=y3+16;
  const ml=70, mt=34, VW=(xout-xin)*s+ml+40, VH=ytop*s+mt+92;
  const X=x=>ml+(xout-x)*s, Y=y=>mt+(ytop-y)*s;               // outside drawn on the LEFT
  const R=(x0,x1,ya,yb,fill)=>`<rect x="${Math.min(X(x0),X(x1))}" y="${Y(Math.max(ya,yb))}" width="${Math.abs(x1-x0)*s}" height="${Math.abs(yb-ya)*s}" fill="${fill}" stroke="#222" stroke-width=".8"/>`;
  let g=`<svg viewBox="0 0 ${VW} ${VH}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Typical foundation section"><defs><marker id="ar2" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="#2f6db5"/></marker>
    <pattern id="eps2" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#eef2f5"/><circle cx="3" cy="3" r=".9" fill="#c4ced6"/></pattern>
    <pattern id="conc" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#b9bbb6"/><circle cx="3" cy="4" r="1" fill="#8d8f8a"/><circle cx="8" cy="8" r=".7" fill="#8d8f8a"/></pattern></defs>`;
  g+=`<text x="${ml}" y="18" font-size="11" font-weight="700">TYPICAL SECTION · ${cp.brand.name.toUpperCase()} ICF</text><text x="${X(xout)}" y="${Y(ytop)+12}" font-size="9.5" fill="#555">OUTSIDE</text><text x="${X(xin)}" y="${Y(ytop)+12}" text-anchor="end" font-size="9.5" fill="#555">INSIDE</text>`;
  g+=R(f0,f1,0,y1,'url(#conc)');
  g+=R(F,0,y1,y2,'url(#eps2)')+R(0,-C,y1,y2,'url(#conc)')+R(-C,-C-F,y1,y2,'url(#eps2)');
  g+=R(0,xin,y2,y3,'#e9dcc0')+R(0,-wt,y3,ytop,'#c9a46a');
  g+=`<text x="${X(-wt)+8}" y="${Y(y2+fl/2)+4}" font-size="9.5" fill="#333">home floor ${fin(fl)}</text><text x="${X(-wt)+8}" y="${Y(y3+8)+4}" font-size="9.5" fill="#333">exterior wall ${fin(wt)}</text>`;
  g+=`<line x1="${X(0)}" y1="${Y(ytop)}" x2="${X(0)}" y2="${Y(0)+66}" stroke="#d0661f" stroke-width="1" stroke-dasharray="5 3"/>`;
  const dH=(a,b,y,t,fs=9.5)=>`<line x1="${X(a)}" y1="${y}" x2="${X(b)}" y2="${y}" stroke="#2f6db5" stroke-width=".9" marker-start="url(#ar2)" marker-end="url(#ar2)"/><text x="${(X(a)+X(b))/2}" y="${y-4}" text-anchor="middle" font-size="${fs}" fill="#2f6db5">${t}</text>`;
  const dV=(a,b,x,t)=>`<line x1="${x}" y1="${Y(a)}" x2="${x}" y2="${Y(b)}" stroke="#2f6db5" stroke-width=".9" marker-start="url(#ar2)" marker-end="url(#ar2)"/><text transform="translate(${x-5},${(Y(a)+Y(b))/2}) rotate(-90)" text-anchor="middle" font-size="9.5" fill="#2f6db5">${t}</text>`;
  g+=dH(f0,F,Y(0)+18,fin(f0-F),8.5)+dH(F,0,Y(0)+18,fin(F),8.5)+dH(0,-C,Y(0)+18,fin(C),8.5)+dH(-C,-C-F,Y(0)+18,fin(F),8.5)+dH(-C-F,f1,Y(0)+18,fin(f0-F),8.5);
  g+=dH(f0,f1,Y(0)+40,`footing ${fin(FW)} · ICF ${fin(C+2*F)}`);
  g+=dV(0,y1,X(f0)-14,fin(FTk))+dV(y1,y2,X(f0)-14,`ICF ${fin(BH)}`);
  g+=`<text x="${ml}" y="${Y(0)+64}" font-size="9.5" fill="#d0661f">— home's outer face = outside of the concrete core</text>`;
  g+=`<text x="${ml}" y="${Y(0)+80}" font-size="9.5" fill="#333">The home bears on the core; the outside foam is fully outside the home.</text>`;
  return g+'</svg>';
}

function takeoff(cp){
  const footLen = cp.footArea/cp.FW;
  return [
    ['Footing', `${fft(footLen*FT)} of ${fin(ICF.footW)} × ${fin(ICF.footT)} (perimeter + under the inside supports)`, vol(cp.footVol)],
    ['ICF perimeter', `${fft(cp.coreLen*FT)} · ${cp.brand.name} ${fin(cp.brand.h)} high, ${fin(cp.C*FT)} core · about ${cp.blocks} blocks of ${fin(cp.brand.len)} (5% waste; corners from the supplier)`, ''],
    ...(cp.secLen ? [['ICF inside', `${fft(cp.secLen*FT)} · ${fin(cp.CI*FT)} core under the pod joints · about ${cp.blocksIn} blocks of ${fin(cp.brand.len)}`, '']] : []),
    ['Corners', `${cp.corners.out} outside 90° · ${cp.corners.in} inside 90°`, ''],
    ['Form ends', `${cp.ends} end caps on the inside supports${cp.access?' + 2 at the crawl access':''}`, ''],
    ['Core fill', `${fin(cp.C*FT)} perimeter${cp.secLen?` + ${fin(cp.CI*FT)} inside`:''} × ${fin(cp.brand.h)}${cp.access?', less the access opening':''}`, vol(cp.coreVol)],
    ['Concrete total', 'footing + core, before waste (order about 10% more)', vol(cp.footVol+cp.coreVol)],
  ];
}

function renderConcreteSheet(el){
  const D=sheetData(), {cp}=D;
  const rows=takeoff(cp).map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  const sup=cp.sections.map(sc=>{ const [a0,a1]=D.I(sc.ax==='x'?sc.a:sc.c, sc.ax==='x'?sc.c:sc.a), [b0,b1]=D.I(sc.ax==='x'?sc.b:sc.c, sc.ax==='x'?sc.c:sc.b);
    return `<tr><td>F${sc.id}</td><td>${sc.kind==='wall'?'Wall section':'Short section'}${sc.tied?' · ties into the perimeter':''}</td><td>${fft(sc.len*FT)}</td><td>${fin(a0)}, ${fin(a1)} → ${fin(b0)}, ${fin(b1)}</td><td>${sc.ax==='x'?'left–right':'up–down'} along the joint</td></tr>`; }).join('');
  const ds=D.screws.map(q=>{ const [x,y]=D.I(q.x,q.z); return `<tr><td>S${q.id}</td><td>${fin(x)}</td><td>${fin(y)}</td><td>Deck ground screw</td></tr>`; }).join('')
    + D.pads.map(q=>{ const [x,y]=D.I(q.x,q.z); return `<tr><td>P${q.id}</td><td>${fin(x)}</td><td>${fin(y)}</td><td>Concrete pad, floating deck</td></tr>`; }).join('');
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Site sheet · Cubit Home</div><h3>${esc(D.m.name)} — concrete foundation (ICF)</h3></div>
      <div class="meta">${cp.brand.name} on an ${fin(ICF.footW)} × ${fin(ICF.footT)} footing · ${fft(cp.coreLen*FT)} perimeter · ${cp.sections.length} inside support${cp.sections.length===1?'':'s'} · concrete ${yd3(cp.footVol+cp.coreVol).toFixed(1)} yd³ (${m3(cp.footVol+cp.coreVol).toFixed(1)} m³)<br>${new Date().toISOString().slice(0,10)}</div></div>
    <div class="sheet-tools edit-only">
      <label style="font-size:13px">ICF <select id="icfBrand" style="font:inherit;padding:5px 8px;border:1px solid #cfd4cc;border-radius:6px">${Object.entries(ICF.brands).map(([k,b])=>`<option value="${k}" ${state.icf.brand===k?'selected':''}>${b.name} · ${b.h}″ high</option>`).join('')}</select></label>
      <label style="font-size:13px">Perimeter core <select id="icfCore" style="font:inherit;padding:5px 8px;border:1px solid #cfd4cc;border-radius:6px">${[6,8].map(c=>`<option value="${c}" ${state.icf.core===c?'selected':''}>${c}″</option>`).join('')}</select></label>
      <button class="btn" id="cPdf">Download PDF</button>
    </div>
    ${cp.warnings.map(w=>`<p class="note" style="color:${w.kind==='closed'?'#b4520f':'#333'};${w.kind==='closed'?'font-weight:600':''}">${w.kind==='closed'?'⚠ ':''}${esc(w.text)}</p>`).join('')}
    <div class="elev">${planSVG(D)}</div>
    <div class="sheet-grid">
      <div class="elev">${sectionSVG(cp)}</div>
      <div class="tblwrap"><div class="eyebrow" style="color:#555;margin-bottom:4px">Takeoff</div><table class="boxes"><tbody>${rows}</tbody></table>
        <p class="note" style="color:#444;margin-top:6px">Rebar, frost depth, soil bearing and anchor bolts or straps are not shown: follow the engineer's or the local code's details. Quantities are net.</p></div>
    </div>
    ${cp.sections.length?`<div class="tblwrap"><div class="eyebrow" style="color:#555;margin:10px 0 4px">Inside supports · ends measured from the datum (X right, Y down), at the core centre</div><table class="boxes"><thead><tr><th>Support</th><th>Type</th><th>Length</th><th>From → to</th><th>Runs</th></tr></thead><tbody>${sup}</tbody></table>
      <p class="note" style="color:#444;margin-top:6px">Inside supports have an ${fin(ICF.coreShared)} core and run along the pod joints, under both pods, never more than 12′ apart (the ground-screw rules). Sections that came within 4′ of each other became one wall; every part of the crawl space stays reachable through gaps of at least 24″.</p></div>`:''}
    ${ds?`<div class="tblwrap"><div class="eyebrow" style="color:#555;margin:10px 0 4px">Decks · screws and pads (none against the house: a deck's house side bears on the foundation)</div><table class="boxes"><thead><tr><th>#</th><th>X</th><th>Y</th><th>What</th></tr></thead><tbody>${ds}</tbody></table></div>`:''}`;
  const re=()=>{ save(); buildHome(); renderSide(); renderConcreteSheet(el); };
  const b=el.querySelector('#icfBrand'); if(b) b.onchange=()=>{ state.icf.brand=b.value; re(); };
  const c=el.querySelector('#icfCore'); if(c) c.onchange=()=>{ state.icf.core=+c.value; re(); };
  el.querySelector('#cPdf').onclick=async()=>{ try{ downloadBlob(await concretePDF(D), `Cubit ${D.m.name} - concrete foundation.pdf`); toast('PDF downloaded'); }catch(e){ toast('The PDF could not be made: '+e.message); } };
}

/* PDF: page 1 the plan, page 2 the section, takeoff and supports. The drawings are rendered sharp from the
   same SVG as the screen. */
function svgToPNG(svg, scale=2.2){
  return new Promise((res,rej)=>{
    const vb=svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), w=+vb[1], h=+vb[2];
    const img=new Image(); img.onload=()=>{ const c=document.createElement('canvas'); c.width=w*scale; c.height=h*scale; const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height); g.drawImage(img,0,0,c.width,c.height); res({url:c.toDataURL('image/jpeg',0.86), w, h}); };
    img.onerror=()=>rej(new Error('drawing')); img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '));
  });
}
async function concretePDF(D){
  const {cp}=D, doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:'letter'}), PW_=792, PH_=612, M=36;
  const clean=t=>String(t).replace(/′/g,"'").replace(/″/g,'"').replace(/³/g,'3').replace(/[→]/g,'->').replace(/°/g,' deg').replace(/·/g,'-').replace(/–/g,'-').replace(/×/g,'x');
  const T=(t,x,y,o)=>doc.text(clean(t),x,y,o);
  const fit=(img, x, y, w, h)=>{ const k=Math.min(w/img.w, h/img.h); doc.addImage(img.url,'JPEG',x+(w-img.w*k)/2,y,img.w*k,img.h*k); return img.h*k; };
  const foot=(n)=>{ doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80); T(`CUBIT HOME - ${D.m.name} - concrete foundation (ICF) - ${new Date().toISOString().slice(0,10)} - sheet ${n} of 2`, M, PH_-M+12); };
  doc.setFont('helvetica','bold'); doc.setFontSize(15); T(`${D.m.name} - concrete foundation (${cp.brand.name} ICF)`, M, M+6);
  fit(await svgToPNG(planSVG(D)), M, M+16, PW_-2*M, PH_-2*M-26); foot(1);
  doc.addPage();
  doc.setFont('helvetica','bold'); doc.setFontSize(13); T('Typical section', M, M+6);
  fit(await svgToPNG(sectionSVG(cp)), M, M+14, 330, 260);
  let y=M+6; doc.setFontSize(13); T('Takeoff', M+360, y); y+=14; doc.setFontSize(8);
  takeoff(cp).forEach(r=>{ doc.setFont('helvetica','bold'); T(r[0], M+360, y); doc.setFont('helvetica','normal'); const lines=doc.splitTextToSize(clean(r[1]+(r[2]?'  =  '+r[2]:'')), 300); doc.text(lines, M+430, y); y+=11*lines.length+3; });
  cp.warnings.forEach(w=>{ const lines=doc.splitTextToSize(clean(w.text), 370); doc.setTextColor(w.kind==='closed'?180:60, w.kind==='closed'?82:60, w.kind==='closed'?15:60); doc.text(lines, M+360, y+4); y+=11*lines.length+6; });
  doc.setTextColor(17,17,17);
  y=Math.max(y, M+290)+10; doc.setFont('helvetica','bold'); doc.setFontSize(11); T('Inside supports (ends from the datum, X right, Y down)', M, y); y+=13; doc.setFontSize(8); doc.setFont('helvetica','normal');
  cp.sections.forEach(sc=>{ const a=D.I(sc.ax==='x'?sc.a:sc.c, sc.ax==='x'?sc.c:sc.a), b=D.I(sc.ax==='x'?sc.b:sc.c, sc.ax==='x'?sc.c:sc.b);
    T(`F${sc.id}  ${sc.kind==='wall'?'wall section':'short section'}${sc.tied?' (ties into perimeter)':''}  ${asciiFt(sc.len*FT)}   ${fin(a[0])}, ${fin(a[1])}  ->  ${fin(b[0])}, ${fin(b[1])}`, M, y); y+=11; });
  if(!cp.sections.length){ T('None: the perimeter carries the whole home.', M, y); y+=11; }
  if(D.screws.length||D.pads.length){ y+=6; doc.setFont('helvetica','bold'); doc.setFontSize(11); T('Decks: screws and pads', M, y); y+=13; doc.setFontSize(8); doc.setFont('helvetica','normal');
    const items=D.screws.map(q=>['S'+q.id, ...D.I(q.x,q.z)]).concat(D.pads.map(q=>['P'+q.id, ...D.I(q.x,q.z)]));
    items.forEach((it,k)=>{ const col=Math.floor(k/14), row=k%14; T(`${it[0]}  ${fin(it[1])}, ${fin(it[2])}`, M+col*130, y+row*11); }); }
  foot(2);
  return doc.output('blob');
}
export { renderConcreteSheet, concretePDF };
