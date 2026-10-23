/* Cubit Builder — framesheet.js : the framing cut list for the whole home (walls by pod, LVL rims by pod) and
   what to buy, plus the framing table shown on each wall's assembly sheet. */
import { MODELS } from './data.js';
import { FRAME, SPINE } from './config.js';
import { fin, fft } from './format.js';
import { state } from './state.js';
import { homeFraming, podRims, framingTakeoff, platesByPod } from './framing.js';
import { layoutOffsets, podList } from './layout.js';
import { downloadBlob } from './sheets.js';

const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ORDER = ['Top plate','Bottom plate','Corner post','End stud','Corner stud','Jack','Spline'];
/* one wall's pieces grouped by kind and length */
function wallRows(W){
  const g={}; W.pieces.forEach(p=>{ const k=p.kind+'|'+p.len.toFixed(3); (g[k] ||= {kind:p.kind, len:p.len, n:0, lumber:p.lumber, notes:new Set()}).n++; g[k].notes.add(p.kind==='Spline' ? `${p.carrier} carries → ${p.receiver}` : p.note); });
  return Object.values(g).sort((a,b)=>ORDER.indexOf(a.kind)-ORDER.indexOf(b.kind) || b.len-a.len);
}
function wallFramingHTML(W){
  const rows=wallRows(W).map(r=>`<tr><td>${r.kind}</td><td>${r.n}</td><td>${r.kind==='Spline'?'½″ OSB × 3½″':r.kind==='Corner stud'?r.lumber+' ripped':r.lumber}</td><td><b>${fin(r.len)}</b> (${fft(r.len)})</td><td>${esc([...r.notes].join(' · '))}</td></tr>`).join('');
  return `<table class="boxes"><thead><tr><th>Piece</th><th>Qty</th><th>Size</th><th>Length</th><th>Where</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function csv(walls, rims){
  const q=v=>`"${String(v).replace(/"/g,'""')}"`, rows=[['group','wall_or_pod','piece','qty','size','length_in','length_ft_in','where']];
  walls.forEach(W=>wallRows(W).forEach(r=>rows.push(['wall', `${W.slot.label} (${W.w.id})`, r.kind, r.n, r.kind==='Spline'?'1/2 OSB x 3-1/2':r.lumber, +r.len.toFixed(4), fft(r.len), [...r.notes].join(' | ')])));
  rims.forEach(R=>R.pieces.forEach(([name,h,len,n])=>rows.push(['lvl', R.pod.label, name, n, `LVL 1-7/8 x ${h}`, +len.toFixed(4), fft(len), 'outside length minus the 1-7/8 corner squares'])));
  rows.push(['fastener','all pods','Einspine screws 3-1/2 Dynobite', rims.length*4*18, '3-1/2 Dynobite', '', '', '18 per Einspine: 3 into each of 4 LVL ends + 1 per side every 2 ft']);
  return rows.map(r=>r.map(q).join(',')).join('\n');
}
/* plate layout for one pod: its floor (bottom plates) or its ceiling (top plates), seen from above */
function platePlanSVG(P, which){
  const LO=layoutOffsets(state.model), pd=podList(state.model).find(q=>q.i===P.pod.i), ox=pd.x+LO.pods[pd.i].ox, oz=pd.z+LO.pods[pd.i].oz, W=pd.w, D=pd.d;
  const s=Math.min(260/(W*12), 200/(D*12))*12, m=28, VW=W*s+2*m, VH=D*s+2*m+14, X=x=>m+(x-ox)*s, Y=z=>m+(z-oz)*s;
  let g=`<svg viewBox="0 0 ${VW.toFixed(0)} ${VH.toFixed(0)}" width="${VW.toFixed(0)}" font-family="IBM Plex Mono, monospace" role="img" aria-label="${which} plates"><rect x="${m}" y="${m}" width="${W*s}" height="${D*s}" fill="#f6f1e6" stroke="#111" stroke-width="1.2"/>`;
  P[which].forEach(pl=>{ const [x0,z0,x1,z1]=pl.rect;
    g+=`<rect x="${X(x0)}" y="${Y(z0)}" width="${Math.max(1,(x1-x0)*s)}" height="${Math.max(1,(z1-z0)*s)}" fill="#e0b36a" stroke="#6b4e1f" stroke-width=".6"/>`;
    if(pl.len>=10){ const cx=X((x0+x1)/2), cz=Y((z0+z1)/2), inside=[ (m+W*s/2)-cx, (m+D*s/2)-cz ], k=Math.hypot(...inside)||1;
      const tx=cx+inside[0]/k*11, tz=cz+inside[1]/k*11;
      g+=`<text x="${tx}" y="${tz+3}" ${pl.ax==='z'?`transform="rotate(-90 ${tx} ${tz+3})"`:''} text-anchor="middle" font-size="8" fill="#6b4e1f">${fin(pl.len)}</text>`; } });
  g+=`<text x="${m}" y="${VH-6}" font-size="9" fill="#333">${which==='floor'?'FLOOR · bottom plates':'CEILING · top plates (seen from above)'}</text>`;
  return g+'</svg>';
}
const bevelSVG = () => `<svg viewBox="0 0 230 92" width="230" font-family="IBM Plex Mono, monospace" role="img" aria-label="Plate bevel"><path d="M20 70 L20 53 L37 36 L103 36 L120 53 L120 70 Z" fill="#e0b36a" stroke="#6b4e1f"/><text x="70" y="62" text-anchor="middle" font-size="9">bottom plate</text><text x="6" y="22" font-size="9" fill="#2f6db5">¾″ bevels: the wall comes down over it</text><line x1="10" y1="70" x2="130" y2="70" stroke="#999"/><text x="140" y="60" font-size="9" fill="#333">top plate: the</text><text x="140" y="72" font-size="9" fill="#333">same, bevels</text><text x="140" y="84" font-size="9" fill="#333">facing down</text></svg>`;
/* plan detail of a pod corner (exterior walls, 2×6): the Einspine notch wrapped in wood from floor to roof */
function cornerSVG(){
  const k=22, o=36, X=x=>o+x*k, Y=z=>o+z*k, R=(x0,z0,x1,z1,fill,extra='')=>`<rect x="${X(x0)}" y="${Y(z0)}" width="${(x1-x0)*k}" height="${(z1-z0)*k}" fill="${fill}" stroke="#333" stroke-width=".8" ${extra}/>`;
  const n=1.75, osb=FRAME.osb, wt=6.5, zc=0.5, lv=FRAME.lvl.t;
  let g=`<svg class="corner-svg" viewBox="0 0 ${o*2+12*k+190} ${o*2+12*k}" width="${o*2+12*k+190}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Corner framing detail">`;
  // LVL rims below (dashed): touch at the inside corner, open 1⅞″ square
  // end wall (runs through, along x) and long wall (butts, along z)
  g+=R(0,0,12,wt,'#f3ead6')+R(n,0,12,osb,'#d9c49a')+R(0,wt-osb,12,wt,'#d9c49a')+R(0,n,osb,wt,'#d9c49a','opacity=".0"');
  g+=R(0,wt,wt,12,'#f3ead6')+R(0,wt,osb,12,'#d9c49a')+R(wt-osb,wt,wt,12,'#d9c49a');
  // lumber
  g+=R(n,zc,n+1.5,zc+5.5,'#e0b36a')+R(0,n,1.5,wt-zc,'#e0b36a')+R(zc,wt,zc+5.5,wt+1.5,'#e0b36a');
  // LVL rims (dashed, below the floor and above the roof): they touch at the inside corner, leaving 1⅞″ open
  g+=`<path d="M${X(lv)} ${Y(0)} H${X(12)} M${X(lv)} ${Y(lv)} H${X(12)} M${X(0)} ${Y(lv)} V${Y(12)} M${X(lv)} ${Y(lv)} V${Y(12)}" fill="none" stroke="#c9783a" stroke-width="1.6" stroke-dasharray="5 3"/>`;
  // the Einspine notch
  g+=R(0,0,n,n,'#fff','stroke="#7a3fb0" stroke-width="1.6"');
  g+=R(0,0,SPINE,SPINE,'#8a8f96','stroke="#333"');   // the Einspine, 1½″ × 1½″, tight to the outside corner
  const t=(x,y,txt,c='#222')=>`<text x="${x}" y="${y}" font-size="9.5" fill="${c}">${txt}</text>`;
  g+=t(X(12)+8, Y(0.6), 'END WALL (runs through)')+t(X(6.6), Y(12)-4, 'LONG WALL')+t(X(n+1.6)+2, Y(3.4), 'end stud 2×6');
  g+=t(X(12)+8, Y(3.0), 'corner stud: 2×6 ripped', '#6b4e1f')+t(X(12)+8, Y(3.0)+12, 'to 4¼″ behind the notch', '#6b4e1f');
  g+=t(X(12)+8, Y(7.6), 'long wall end stud')+t(X(0), Y(0)-10, 'EINSPINE 1½″ × 1½″ in a 1¾″ notch (LVL leaves 1⅞″)', '#7a3fb0')+t(X(12)+8, Y(10.5), 'LVL rims below/above (dashed):', '#c9783a')+t(X(12)+8, Y(10.5)+12, 'touch at the inside corner', '#c9783a');
  g+=t(o, o*2+12*k-6, 'PLAN · outside corner top-left · plates are notched 1¾″ × 1¼″ the same way');
  return g+'</svg>';
}
function renderFramingSheet(el){
  const walls=homeFraming(), rims=podRims(), T=framingTakeoff(walls, rims), m=MODELS[state.model];
  const total=T.filter(g=>!g.fastener).reduce((a,g)=>a+g.pieces,0);
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Framing · Cubit Home</div><h3>${esc(m.name)} — framing cut list</h3></div>
      <div class="meta">${total} pieces · ${walls.length} walls · ${rims.length} pods<br>${new Date().toISOString().slice(0,10)}</div></div>
    <div class="sheet-tools"><button class="btn" id="frCsv">Cut list (CSV)</button>
      <span style="font-size:12.5px;color:#333">2×6 in exterior walls, 2×4 in interior walls · plates recessed top and bottom inside the 96″ panels (single top plate) · jacks the height of each opening, sides only · end stud at each wall end · two ½″ OSB splines per panel joint · LVL rims touch only at the inside corners, leaving the Einspine squares.</span></div>
    <div class="eyebrow" style="color:#555;margin:6px 0 4px">What to buy</div>
    <table class="boxes"><thead><tr><th>Material</th><th>Pieces</th><th>Buy</th></tr></thead><tbody>${T.map(g=>`<tr><td><b>${esc(g.mat)}</b></td><td>${g.pieces}</td><td>${esc(g.buy)}</td></tr>`).join('')}</tbody></table>
    <div class="eyebrow" style="color:#555;margin:12px 0 4px">Cut list by material</div>
    ${T.filter(g=>!g.fastener).map(g=>`<div class="tblwrap" style="margin-bottom:8px"><table class="boxes"><thead><tr><th colspan="3">${esc(g.mat)}</th></tr><tr><th>Piece</th><th>Qty</th><th>Length</th></tr></thead><tbody>${g.cuts.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.n}</td><td><b>${fin(c.len)}</b> (${fft(c.len)})</td></tr>`).join('')}</tbody></table></div>`).join('')}
    <div class="eyebrow" style="color:#555;margin:12px 0 4px">Plate layout · bottom plates go on the floor first, top plates on the ceiling</div>
    <p class="note" style="color:#444">Fasten the bottom plates to each pod's floor, then set the walls down over them; fasten the top plates to the ceiling so they lock into the walls as the ceiling is lowered. Each plate's outer edge sits ½″ in from the floor (or ceiling) edge, behind the outside OSB. Bevel the two corners that face the incoming wall (bottom plates: top corners; top plates: bottom corners) about ¾″.</p>
    <div class="plates">${platesByPod(walls).map(P=>`<div class="plate-pod"><b>${esc(P.pod.label)}</b><div class="plate-pair">${platePlanSVG(P,'floor')}${platePlanSVG(P,'ceiling')}</div></div>`).join('')}<div class="plate-pod"><b>Bevel</b>${bevelSVG()}</div><div class="plate-pod"><b>Pod corner · Einspine</b>${cornerSVG()}<p class="note" style="color:#444;max-width:420px">Wood behind both faces of the spine from the bottom of the floor to the top of the roof: floor LVL ends, the notched bottom plate, the two corner studs, the notched top plate, the roof LVL ends. Every Dynobite screw through the spine lands in wood: 3 into each of the 4 LVL ends and 1 per side every 2′ up the wall, 18 per Einspine (3½″).</p></div></div>
    <div class="eyebrow" style="color:#555;margin:12px 0 4px">LVL rims by pod</div>
    <table class="boxes"><thead><tr><th>Pod</th><th>Floor rim 1⅞″ × 9½″</th><th>Roof rim 1⅞″ × 11⅞″</th></tr></thead><tbody>${rims.map(R=>`<tr><td>${esc(R.pod.label)}</td><td>2 × ${fin(R.pieces[0][2])} · 2 × ${fin(R.pieces[1][2])}</td><td>2 × ${fin(R.pieces[2][2])} · 2 × ${fin(R.pieces[3][2])}</td></tr>`).join('')}</tbody></table>
    <div class="eyebrow" style="color:#555;margin:12px 0 4px">By wall</div>
    ${walls.map(W=>`<details class="frwall"><summary><b>${esc(W.slot.label)}</b> · ${esc(W.slot.detail)} · ${esc(W.w.id)} · ${W.pieces.length} pieces</summary>${wallFramingHTML(W)}</details>`).join('')}`;
  el.querySelector('#frCsv').onclick=()=>downloadBlob(new Blob([csv(walls,rims)],{type:'text/csv'}), `${m.name} - framing cut list.csv`);
}
export { renderFramingSheet, wallFramingHTML };
