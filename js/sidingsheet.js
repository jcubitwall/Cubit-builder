/* Cubit Builder — sidingsheet.js : the siding schedule (Sheets → Whole home → Siding schedule).
   Every piece the siding crew needs, from sidinglayout.js: each profile with its measurements, every piece by mark
   with its size and count, the screws (SCREWS.perPanel per panel, in bags of SCREWS.bag), the trims (their bend
   profiles are still to come) and, wall by wall, how each run is laid out. Prints, and downloads as a CSV. */
import { MODELS } from './data.js';
import { fin, fft } from './format.js';
import { state } from './state.js';
import { homeSiding, MOLD, FILL_MIN, ACM_LAP } from './sidinglayout.js';
import { downloadBlob } from './sheets.js';

const SCREWS = { perPanel:12, bag:250, what:'siding screw' };
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f2 = v => fin(Math.round(v*16)/16);

/* the cross-section, drawn from the scan (depth drawn 3× so the ribs read) */
function profileSVG(P, wpx=560){
  const s=wpx/(P.w+0.6), Hh=(P.depth+0.5)*s*3, Y=y=>Hh-0.25*s*3-y*s*3, X=x=>(x+0.3)*s;
  const path=(P.profile||[]).map(g=>`M${X(g.a[0]).toFixed(1)} ${Y(g.a[1]).toFixed(1)}L${X(g.b[0]).toFixed(1)} ${Y(g.b[1]).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${wpx} ${Hh.toFixed(0)}" width="100%" style="max-width:${wpx}px" aria-hidden="true"><line x1="0" x2="${wpx}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="#b9b4a6" stroke-dasharray="4 3"/><path d="${path}" stroke="#1c211e" stroke-width="1.6" fill="none"/>
    <text x="${X(0)}" y="${Y(P.depth)-6}" font-size="11" fill="#5b6159">rib end</text><text x="${X(P.w)}" y="${Y(P.depth)-6}" font-size="11" fill="#5b6159" text-anchor="end">long flat + end flange</text></svg>`;
}
/* every piece, marked: P panels, F fillers, A ACM, T trims */
function schedule(k=state.model){
  const S=homeSiding(k); if(!S) return null;
  const P=S.P, rows=[];
  S.panels.forEach((p,i)=>rows.push({ mark:'P'+(i+1), profile:P.name, what:`Panel, cut to length${p.rip?`, ripped to ${f2(p.rip)}`:''}`, w:p.rip||P.w, cover:p.rip||P.cover, len:p.len, n:p.n,
    screws:SCREWS.perPanel, lb:p.len/12*P.lbPerFt*(p.rip?p.rip/P.cover:1), note:p.what }));
  S.fillers.forEach((x,i)=>rows.push({ mark:'F'+(i+1), profile:`${P.name} filler`, what:`Filler, bent to match (${f2(x.w*P.developed/P.cover)} flat)`, w:x.w, cover:x.w, len:x.len, n:x.n,
    screws:SCREWS.perPanel, lb:x.len*x.w*(P.developed/P.cover)*P.t*P.steel, note:`${x.at==='middle'?'in the middle of a run':x.at==='far corner'?'at the far corner':'between panels'} · never under ${f2(FILL_MIN)}` }));
  S.acm.forEach((a,i)=>rows.push({ mark:'A'+(i+1), profile:'ACM 4 mm, matte black', what:`Panel ${a.where} a window / door`, w:a.w, len:a.h, n:a.n, screws:null, note:`brick mold + ${f2(ACM_LAP)} under the siding each side` }));
  S.trims.forEach((t,i)=>rows.push({ mark:'T'+(i+1), profile:'Trim (custom bend)', what:t.what, len:t.len, n:t.n, screws:null, note:'bend profile coming soon' }));
  rows.forEach(r=>{ r.screwsAll = r.screws ? r.screws*r.n : 0; });
  const screws=rows.reduce((a,r)=>a+r.screwsAll,0);
  return { S, P, rows, screws, bags:Math.ceil(screws/SCREWS.bag) };
}
function runText(st){
  const c=st.covers, same=c.length && c.every(x=>Math.abs(x-c[0])<0.01);
  const covers = !c.length ? 'no whole panels' : same ? `${c.length} × ${f2(c[0])} cover` : c.map(f2).join(' + ');
  const ends = st.ends.map(e=>e==='C'?'corner':e==='M'?'brick mold':'free').join(' → ');
  return `${f2(st.x0)} to ${f2(st.x1)} (${f2(st.W)}), ${ends}: ${covers}${st.filler>0.01?` + filler ${f2(st.filler)} ${st.fillerAt==='middle'?'in the middle':st.fillerAt==='far corner'?'at the far corner':'after the first panel'}`:''}${st.hops?` · ${st.hops} hopped a rib`:''}`;
}
function renderSidingSheet(el){
  const m=MODELS[state.model], Sc=schedule();
  if(!Sc){ el.innerHTML='<p class="note">No siding profile in the Library yet.</p>'; return; }
  const { S, P, rows, screws, bags }=Sc, n=t=>rows.filter(r=>r.mark[0]===t).reduce((a,r)=>a+r.n,0);
  const tr=(r)=>`<tr><td><b>${r.mark}</b></td><td>${esc(r.profile)}</td><td>${esc(r.what)}</td><td>${r.w!=null?f2(r.w):'—'}</td><td><b>${f2(r.len)}</b> <small>(${fft(r.len)})</small></td><td><b>${r.n}</b></td><td>${r.screws!=null?r.screws:'—'}</td><td>${r.screws!=null?r.screwsAll:'—'}</td><td>${r.lb!=null?(r.lb*r.n).toFixed(0)+' lb':''}</td><td><small>${esc(r.note||'')}</small></td></tr>`;
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Siding · Cubit Home</div><h3>${esc(m?.name||'')} — siding schedule</h3></div>
      <div class="meta">${n('P')} panels · ${n('F')} fillers · ${n('A')} ACM · ${n('T')} trims<br>${new Date().toISOString().slice(0,10)}</div></div>
    <div class="sheet-tools"><button class="btn" id="sdCsv">Schedule (CSV)</button><button class="btn ghost" id="sdPrint">Print</button>
      <span style="font-size:12.5px;color:#333">${fft(S.runs)} of exterior wall · ${S.nOpen} windows and doors · about ${Math.round(S.lb).toLocaleString()} lb of siding.</span></div>

    <div class="eyebrow" style="color:#555;margin:6px 0 4px">Screws</div>
    <table class="boxes"><tbody>
      <tr><td><b>${screws.toLocaleString()}</b> ${SCREWS.what}s</td><td>${SCREWS.perPanel} per panel and per filler, ${n('P')+n('F')} pieces</td></tr>
      <tr><td><b>${bags} bag${bags===1?'':'s'}</b> of ${SCREWS.bag}</td><td>${(bags*SCREWS.bag-screws).toLocaleString()} spare</td></tr></tbody></table>

    <div class="eyebrow" style="color:#555;margin:12px 0 4px">Profiles</div>
    <div class="sd-profiles">
      <div class="sd-prof sd-wide"><b>${esc(P.name)}</b> <small>${esc(P.gauge||'')}</small>${profileSVG(P)}
        <table class="boxes"><tbody>
          <tr><th>Full cover</th><td>${f2(P.cover)}</td><th>Overall width</th><td>${f2(P.w)}</td></tr>
          <tr><th>Pulled back</th><td>down to ${f2(P.coverMin)}</td><th>Hopped a rib</th><td>${f2(P.hop[1])} to ${f2(P.hop[0])}</td></tr>
          <tr><th>Depth</th><td>${f2(P.depth)}</td><th>Flat width (coil)</th><td>${P.developed}″</td></tr>
          <tr><th>Weight</th><td>${P.lbPerFt} lb / ft</td><th>Height on the wall</th><td>${[...new Set(S.panels.map(p=>f2(p.len)))].join(', ')}</td></tr></tbody></table></div>
      <div class="sd-prof"><b>Filler pieces</b> <small>bent from the same coil</small>
        <p class="note">Where whole panels can't close a run, a filler bent to the same look takes up the rest: never narrower than ${f2(FILL_MIN)}. Between two openings the two runs meet on a filler in the middle.</p></div>
      <div class="sd-prof"><b>ACM, matte black</b> <small>4 mm aluminium composite</small>
        <p class="note">Above and below every window and door (no metal siding there): against the wall, the brick mold's width (${f2(MOLD)} outside the opening) plus ${f2(ACM_LAP)} each side under the siding; the rib end laps over it. ${S.acmSheets} sheet${S.acmSheets===1?'':'s'} 4 × 8 with 15% for cutting.</p></div>
      <div class="sd-prof"><b>Trims</b> <small>custom bends</small>
        <p class="note">Outside corners (Einspines), inside corners, joints between pods, J-trim at the brick molds and drip flashing over each head. <b>Bend profiles coming soon</b>: listed here by length for now.</p></div>
    </div>

    <div class="eyebrow" style="color:#555;margin:12px 0 4px">Every piece</div>
    <div class="tblwrap"><table class="boxes sd-tab"><thead><tr><th>Mark</th><th>Profile</th><th>Piece</th><th>Width</th><th>Length</th><th>Qty</th><th>Screws each</th><th>Screws</th><th>Weight</th><th>Note</th></tr></thead>
      <tbody>${rows.map(tr).join('')}</tbody>
      <tfoot><tr><td colspan="5"><b>Total</b></td><td><b>${rows.reduce((a,r)=>a+r.n,0)}</b></td><td></td><td><b>${screws.toLocaleString()}</b></td><td><b>${Math.round(S.lb).toLocaleString()} lb</b></td><td>${bags} bag${bags===1?'':'s'} of screws</td></tr></tfoot></table></div>

    <div class="eyebrow" style="color:#555;margin:12px 0 4px">By wall · measured from the wall's left end, seen from outside</div>
    ${S.walls.map(W=>{ const s=W.s, np=W.full.reduce((a,st)=>a+st.covers.length,0), nf=W.full.filter(st=>st.filler>0.01).length;
      return `<details class="frwall"><summary><b>${esc(s.label||`${s.pod?.label||''} · Wall ${s.letter||''}`)}</b> · ${fft(W.L)} · ${np} panel${np===1?'':'s'}${nf?`, ${nf} filler${nf>1?'s':''}`:''}${W.molds.length?`, ${W.molds.length} opening${W.molds.length>1?'s':''}`:''}</summary>
        <ul class="note sd-runs">${W.full.map(st=>`<li>${runText(st)}</li>`).join('')}
        ${W.cols.map(c=>`<li>Opening ${f2(c.m.x0+MOLD)} to ${f2(c.m.x1-MOLD)}: ACM ${f2(c.m.x1-c.m.x0+2*ACM_LAP)} wide${c.above>0.5?`, ${f2(c.above)} high above`:''}${c.below>0.5?`, ${f2(c.below)} high below`:''}</li>`).join('')}</ul></details>`; }).join('')}`;
  el.querySelector('#sdPrint').onclick=()=>window.print();
  el.querySelector('#sdCsv').onclick=()=>{
    const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const lines=[['Mark','Profile','Piece','Width (in)','Length (in)','Qty','Screws each','Screws','Weight (lb)','Note'].map(q).join(',')];
    rows.forEach(r=>lines.push([r.mark,r.profile,r.what,r.w!=null?r.w.toFixed(3):'',r.len.toFixed(3),r.n,r.screws??'',r.screwsAll||'',r.lb!=null?(r.lb*r.n).toFixed(1):'',r.note].map(q).join(',')));
    lines.push(['','','Screws','','','',SCREWS.perPanel,screws,'',`${bags} bags of ${SCREWS.bag}`].map(q).join(','));
    downloadBlob(new Blob([lines.join('\n')],{type:'text/csv'}), `${m?.name||'home'} - siding schedule.csv`); };
}
export { renderSidingSheet, schedule as sidingSchedule, SCREWS as SIDING_SCREWS };
