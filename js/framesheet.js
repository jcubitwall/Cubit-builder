/* Cubit Builder — framesheet.js : the framing cut list for the whole home (walls by pod, LVL rims by pod) and
   what to buy, plus the framing table shown on each wall's assembly sheet. */
import { MODELS } from './data.js';
import { FRAME } from './config.js';
import { fin, fft } from './format.js';
import { state } from './state.js';
import { homeFraming, podRims, framingTakeoff } from './framing.js';
import { downloadBlob } from './sheets.js';

const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ORDER = ['Top plate','Bottom plate','End stud','Jack','Spline'];
/* one wall's pieces grouped by kind and length */
function wallRows(W){
  const g={}; W.pieces.forEach(p=>{ const k=p.kind+'|'+p.len.toFixed(3); (g[k] ||= {kind:p.kind, len:p.len, n:0, lumber:p.lumber, notes:new Set()}).n++; g[k].notes.add(p.kind==='Spline' ? `${p.carrier} carries → ${p.receiver}` : p.note); });
  return Object.values(g).sort((a,b)=>ORDER.indexOf(a.kind)-ORDER.indexOf(b.kind) || b.len-a.len);
}
function wallFramingHTML(W){
  const rows=wallRows(W).map(r=>`<tr><td>${r.kind}</td><td>${r.n}</td><td>${r.kind==='Spline'?'½″ OSB × 3½″':r.lumber}</td><td><b>${fin(r.len)}</b> (${fft(r.len)})</td><td>${esc([...r.notes].join(' · '))}</td></tr>`).join('');
  return `<table class="boxes"><thead><tr><th>Piece</th><th>Qty</th><th>Size</th><th>Length</th><th>Where</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function csv(walls, rims){
  const q=v=>`"${String(v).replace(/"/g,'""')}"`, rows=[['group','wall_or_pod','piece','qty','size','length_in','length_ft_in','where']];
  walls.forEach(W=>wallRows(W).forEach(r=>rows.push(['wall', `${W.slot.label} (${W.w.id})`, r.kind, r.n, r.kind==='Spline'?'1/2 OSB x 3-1/2':r.lumber, +r.len.toFixed(4), fft(r.len), [...r.notes].join(' | ')])));
  rims.forEach(R=>R.pieces.forEach(([name,h,len,n])=>rows.push(['lvl', R.pod.label, name, n, `LVL 1-7/8 x ${h}`, +len.toFixed(4), fft(len), 'outside length minus the 1-7/8 corner squares'])));
  return rows.map(r=>r.map(q).join(',')).join('\n');
}
function renderFramingSheet(el){
  const walls=homeFraming(), rims=podRims(), T=framingTakeoff(walls, rims), m=MODELS[state.model];
  const total=T.reduce((a,g)=>a+g.pieces,0);
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Framing · Cubit Home</div><h3>${esc(m.name)} — framing cut list</h3></div>
      <div class="meta">${total} pieces · ${walls.length} walls · ${rims.length} pods<br>${new Date().toISOString().slice(0,10)}</div></div>
    <div class="sheet-tools"><button class="btn" id="frCsv">Cut list (CSV)</button>
      <span style="font-size:12.5px;color:#333">2×6 in exterior walls, 2×4 in interior walls · plates recessed top and bottom inside the 96″ panels (single top plate) · jacks the height of each opening, sides only · end stud at each wall end · two ½″ OSB splines per panel joint · LVL rims touch only at the inside corners, leaving the Einspine squares.</span></div>
    <div class="eyebrow" style="color:#555;margin:6px 0 4px">What to buy</div>
    <table class="boxes"><thead><tr><th>Material</th><th>Pieces</th><th>Buy</th></tr></thead><tbody>${T.map(g=>`<tr><td><b>${esc(g.mat)}</b></td><td>${g.pieces}</td><td>${esc(g.buy)}</td></tr>`).join('')}</tbody></table>
    <div class="eyebrow" style="color:#555;margin:12px 0 4px">Cut list by material</div>
    ${T.map(g=>`<div class="tblwrap" style="margin-bottom:8px"><table class="boxes"><thead><tr><th colspan="3">${esc(g.mat)}</th></tr><tr><th>Piece</th><th>Qty</th><th>Length</th></tr></thead><tbody>${g.cuts.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.n}</td><td><b>${fin(c.len)}</b> (${fft(c.len)})</td></tr>`).join('')}</tbody></table></div>`).join('')}
    <div class="eyebrow" style="color:#555;margin:12px 0 4px">LVL rims by pod</div>
    <table class="boxes"><thead><tr><th>Pod</th><th>Floor rim 1⅞″ × 9¼″</th><th>Roof rim 1⅞″ × 11⅞″</th></tr></thead><tbody>${rims.map(R=>`<tr><td>${esc(R.pod.label)}</td><td>2 × ${fin(R.pieces[0][2])} · 2 × ${fin(R.pieces[1][2])}</td><td>2 × ${fin(R.pieces[2][2])} · 2 × ${fin(R.pieces[3][2])}</td></tr>`).join('')}</tbody></table>
    <div class="eyebrow" style="color:#555;margin:12px 0 4px">By wall</div>
    ${walls.map(W=>`<details class="frwall"><summary><b>${esc(W.slot.label)}</b> · ${esc(W.slot.detail)} · ${esc(W.w.id)} · ${W.pieces.length} pieces</summary>${wallFramingHTML(W)}</details>`).join('')}`;
  el.querySelector('#frCsv').onclick=()=>downloadBlob(new Blob([csv(walls,rims)],{type:'text/csv'}), `${m.name} - framing cut list.csv`);
}
export { renderFramingSheet, wallFramingHTML };
