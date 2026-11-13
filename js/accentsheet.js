/* Cubit Builder — accentsheet.js : Sheets → Whole home → Accent walls. Each ACP accent wall drawn as seen from
   outside: the 4′ × 10′ sheets numbered, the joints (3 mm deep) heavy, the reveals (1.5 mm) light, the screws as
   dots in the reveals, the openings cut out. A DXF per wall for the CNC (each sheet on its own, layers OUTLINE,
   JOINT_3MM, REVEAL_1_5MM, SCREWS, LABEL). */
import { MODELS } from './data.js';
import { fin, fft } from './format.js';
import { state } from './state.js';
import { accentWalls, accentDXF, ACPLIB } from './accent.js';
import { downloadBlob } from './sheets.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function elevationSVG(A, wpx=900){
  const pad=28, sc=(wpx-2*pad)/A.L, hpx=A.H*sc+2*pad+18, X=x=>pad+x*sc, Y=y=>pad+(A.y1-y)*sc;
  const C=A.colour, fill=C.wood ? C.hex : C.hex, ink=['white','silver','birch'].includes(C.id) ? '#555' : '#e9e6dc';
  const sheets=A.sheets.map((sh,i)=>`<polygon points="${sh.outline.map(p=>`${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}" fill="${fill}" fill-opacity="${i%2?0.82:1}" stroke="none"/>`).join('');
  const holes=A.holes.map(h=>{ const y0=Math.max(h.y0,A.y0), y1=Math.min(h.y1,A.y1); return y1>y0 ? `<rect x="${X(h.x0)}" y="${Y(y1)}" width="${(h.x1-h.x0)*sc}" height="${(y1-y0)*sc}" fill="#f4f2ec" stroke="#999" stroke-dasharray="3 2"/>` : ''; }).join('');
  const lines=A.lines.map(l=>`<line x1="${X(l.a[0]).toFixed(1)}" y1="${Y(l.a[1]).toFixed(1)}" x2="${X(l.b[0]).toFixed(1)}" y2="${Y(l.b[1]).toFixed(1)}" stroke="${l.kind==='joint'?'#d0661f':ink}" stroke-width="${l.kind==='joint'?2.4:1}"/>`).join('');
  const screws=A.screws.map(p=>`<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="1.8" fill="#2a7de1"/>`).join('');
  const nums=A.sheets.map(sh=>{ const cx=(sh.x0+sh.x1)/2; return `<g><circle cx="${X(cx)}" cy="${Y(A.y0)-16}" r="10" fill="#fff" stroke="#1c211e"/><text x="${X(cx)}" y="${Y(A.y0)-12}" font-size="11" text-anchor="middle" font-weight="700">${sh.i+1}</text></g>`; }).join('');
  const dims=A.sheets.map(sh=>`<text x="${X((sh.x0+sh.x1)/2)}" y="${Y(A.y0)+14}" font-size="10" text-anchor="middle" fill="#444">${fin(sh.w)}</text>`).join('');
  return `<svg viewBox="0 0 ${wpx} ${hpx.toFixed(0)}" width="100%" style="max-width:${wpx}px;background:#fff;border:1px solid #ddd;border-radius:6px" role="img" aria-label="${esc(A.s.label)} accent wall, seen from outside">
    <rect x="${X(0)}" y="${Y(A.y1)}" width="${A.L*sc}" height="${A.H*sc}" fill="none" stroke="#1c211e"/>${sheets}${holes}${lines}${screws}${nums}${dims}
    <text x="${pad}" y="${hpx-4}" font-size="10" fill="#555">Seen from outside · left end at the left · ${fft(A.L)} × ${fin(A.H)}</text></svg>`;
}
function renderAccentSheet(el){
  const m=MODELS[state.model], W=accentWalls();
  if(!W.length){ el.innerHTML=`<div class="sheet-title"><div><div class="eyebrow" style="color:#555">ACP accent walls · Cubit Home</div><h3>${esc(m?.name||'')} — accent walls</h3></div></div>
    <p class="note">No accent walls on this home. Pick an exterior wall, then <b>Accent wall</b> in its side panel: board look, geometric lines or hexagons, in ${ACPLIB.colours.length} colours.</p>`; return; }
  const byCol={}; W.forEach(A=>{ (byCol[A.colour.name] ||= { n:0, area:0 }); byCol[A.colour.name].n+=A.sheets.length; byCol[A.colour.name].area+=A.area; });
  const screws=W.reduce((a,A)=>a+A.screws.length,0);
  el.innerHTML=`<div class="sheet-title"><div><div class="eyebrow" style="color:#555">ACP accent walls · Cubit Home</div><h3>${esc(m?.name||'')} — accent walls</h3></div>
      <div class="meta">${W.length} wall${W.length>1?'s':''} · ${W.reduce((a,A)=>a+A.sheets.length,0)} sheets<br>${new Date().toISOString().slice(0,10)}</div></div>
    <div class="sheet-tools"><button class="btn ghost" id="acPrint">Print</button>
      <span style="font-size:12.5px;color:#333"><b style="color:#d0661f">Orange</b>: joint, ½″ bit 3 mm deep (half on each sheet) · <b>light lines</b>: reveal, ½″ bit 1.5 mm deep · <b style="color:#2a7de1">blue dots</b>: screws, in the reveals.</span></div>
    <table class="boxes"><tbody>${Object.entries(byCol).map(([c,v])=>`<tr><td><b>${v.n}</b> ACP sheets 4′ × 10′, ${esc(c)}</td><td>${Math.round(v.area)} sq ft on the wall</td></tr>`).join('')}
      <tr><td><b>${screws}</b> screws</td><td>in the reveals, about every ${ACPLIB.screws.every}″</td></tr></tbody></table>
    ${W.map((A,i)=>`<div class="acc-wall"><div class="eyebrow" style="color:#555;margin:14px 0 4px">${esc(A.s.label)} · ${esc(A.P.name)} · ${esc(A.colour.name)}${A.a.size?` · ${fin(A.a.size)} ${esc(A.P.sizeName||'')}`:''}</div>
      ${elevationSVG(A)}
      <div class="row" style="margin:6px 0"><button class="btn" data-dxf="${i}">DXF for the CNC</button><span class="note" style="margin-left:8px">${A.sheets.length} sheets · ${Math.round(A.jointFt)} ft of joint · ${Math.round(A.revealFt)} ft of reveal · ${A.screws.length} screws${A.colour.wood?' · woodgrain: keep every sheet the same way up':''}</span></div>
      <table class="boxes"><thead><tr><th>Sheet</th><th>From the left end</th><th>Width used</th><th>Edges</th></tr></thead><tbody>
      ${A.sheets.map(sh=>`<tr><td><b>${sh.i+1}</b></td><td>${fin(sh.x0)} → ${fin(sh.x1)}</td><td>${fin(sh.w)}</td><td>${sh.zig?'zigzag along the hexagons':'straight'}${sh.w<ACPLIB.sheet.w-0.5 && !sh.zig?' · cut down':''}</td></tr>`).join('')}</tbody></table></div>`).join('')}`;
  el.querySelector('#acPrint').onclick=()=>window.print();
  el.querySelectorAll('[data-dxf]').forEach(b=>b.onclick=()=>{ const A=W[+b.dataset.dxf]; downloadBlob(new Blob([accentDXF(A)],{type:'application/dxf'}), `${m?.name||'home'} - ${A.s.label} - ACP ${A.P.name}.dxf`); });
}
export { renderAccentSheet };
