/* Cubit Builder — sidingsheet.js : the siding schedule (Sheets → Whole home → Siding schedule), for the crew.
   From sidinglayout.js (v2): what to buy (stock panels, rips paired out of one panel, trims, ACM, screws), every
   piece by mark, and wall by wall the steps: where to start, which way the rib ends point, each panel's rib-end
   mark on the tape from the wall's left end, the last piece and its play. Prints, and downloads as a CSV. */
import { MODELS } from './data.js';
import { fin, fft } from './format.js';
import { state } from './state.js';
import { homeSiding, MOLD, ACM_LAP, SIDING_TRIM as TR } from './sidinglayout.js';
import { downloadBlob } from './sheets.js';

const SCREWS = { perPanel:12, bag:250, what:'siding screw' };
const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f2 = v => fin(Math.round(v*16)/16);
const EDGE = { C:'the Einspine corner trim', I:'the inside corner trim', J:'the pod joint connector', M:'the brick mold', X:'the joiner' };
const EDGE_SHORT = { C:'corner', I:'inside corner', J:'joint', M:'brick mold' };

function profileSVG(P, wpx=560){
  const s=wpx/(P.w+0.6), Hh=(P.depth+0.5)*s*3, Y=y=>Hh-0.25*s*3-y*s*3, X=x=>(x+0.3)*s;
  const path=(P.profile||[]).map(g=>`M${X(g.a[0]).toFixed(1)} ${Y(g.a[1]).toFixed(1)}L${X(g.b[0]).toFixed(1)} ${Y(g.b[1]).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${wpx} ${Hh.toFixed(0)}" width="100%" style="max-width:${wpx}px" aria-hidden="true"><line x1="0" x2="${wpx}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="#b9b4a6" stroke-dasharray="4 3"/><path d="${path}" stroke="#1c211e" stroke-width="1.6" fill="none"/>
    <text x="${X(0)}" y="${Y(P.depth)-6}" font-size="11" fill="#5b6159">rib end</text><text x="${X(P.w)}" y="${Y(P.depth)-6}" font-size="11" fill="#5b6159" text-anchor="end">long flat + end flange</text></svg>`;
}
/* marks: P panels by length, R rips by width and kept edge, J connectors by width; the rest by name */
function schedule(k=state.model){
  const S=homeSiding(k); if(!S) return null;
  const P=S.P, rows=[], mark={};
  S.panels.forEach((p,i)=>{ const m='P'+(i+1); mark['P|'+p.len]=m; rows.push({ mark:m, group:'Siding', profile:P.name, what:'Full panel, cut to length', w:P.w, len:p.len, n:p.n, screws:SCREWS.perPanel, lb:p.len/12*P.lbPerFt, note:`lay at ${f2(TR.nom)} cover (${f2(P.coverMin)}–${f2(P.cover)} is fine; hopped ${f2(P.hop[0])}–${f2(P.hop[1])} where the wall says)` }); });
  S.rips.forEach((r,i)=>{ const m='R'+(i+1); mark['R|'+r.w+'|'+r.keeps+'|'+r.len]=m; rows.push({ mark:m, group:'Siding', profile:P.name, what:`Rip ${f2(r.w)} showing, keeps the ${r.keeps==='rib'?'rib end':'flange end'}`, w:r.w, len:r.len, n:r.n, screws:SCREWS.perPanel, note:'cut from a stock panel; cut edge goes under the trim' }); });
  S.trims.forEach((t,i)=>{ const m=t.joint ? 'J'+(S.trims.filter(x=>x.joint).indexOf(t)+1) : 'T'+(i+1); if(t.joint) mark['J|'+t.w+'|'+t.len]=m;
    rows.push({ mark:m, group:'Trim', profile:t.std?'Standard trim':'Bent to suit', what:t.what, w:t.w??null, len:t.len, n:t.n, screws:null, note:[t.legs, t.note].filter(Boolean).join(' · ') }); });
  S.acm.forEach((a,i)=>rows.push({ mark:'A'+(i+1), group:'ACM', profile:'ACM 4 mm, matte black', what:a.where==='beside' ? 'Strip beside an opening, full height' : `Panel ${a.where} a window / door`, w:a.w, len:a.h, n:a.n, screws:null, note:a.note||`brick mold + ${f2(ACM_LAP)} under the siding each side` }));
  rows.forEach(r=>{ r.screwsAll = r.screws ? r.screws*r.n : 0; });
  const screws=rows.reduce((a,r)=>a+r.screwsAll,0);
  return { S, P, rows, mark, screws, bags:Math.ceil(screws/SCREWS.bag) };
}
/* the crew's steps for one run */
function runSteps(R, Sc, Wl){
  const { P, mark }=Sc, len=Math.round(Wl.H*16)/16;
  const where=`${f2(R.x0)} → ${f2(R.x1)} (${f2(R.W)})`, ends=`${EDGE_SHORT[R.ends[0]]||'?'} → ${EDGE_SHORT[R.ends[1]]||'?'}`;
  if(R.joinerOnly) return `<li><b>${where}</b> · ${ends}: only the <b>joiner</b>, centred.</li>`;
  if(R.connectorOnly) return `<li><b>${where}</b> · ${ends}: no siding: the <b>pod joint connector</b> is made wide enough to cover it.</li>`;
  if(R.narrow) return `<li><b>${where}</b> · ${ends}: too narrow for siding: <b>black ACM strip</b> ${f2(R.W)} wide, full height.</li>`;
  const pan=R.pieces.filter(p=>p.kind==='panel'), rip=R.pieces.find(p=>p.kind==='rip'), pm=mark['P|'+len]||'P';
  const rm=rip ? (mark['R|'+Math.round(rip.w*16)/16+'|'+rip.keeps+'|'+len]||'R') : '';
  const covers=pan.length ? (pan.every(p=>Math.abs(p.cover-pan[0].cover)<0.02) ? `${pan.length} × ${pm} at ${f2(pan[0].cover)} cover` : pan.map(p=>`${pm} at ${f2(p.cover)}`).join(', ')) : 'no full panels';
  const hops=R.hops ? ` (${R.hops} hopped a rib)` : '';
  const marks=pan.map(p=>f2(p.ribR ? p.x1 : p.x0));
  let how;
  if(R.split){
    const L=pan.filter(p=>!p.ribR), Rt=pan.filter(p=>p.ribR);
    how=`Rib ends at <b>both</b> brick molds. From the left mold work right: ${L.length} × ${pm}; from the right mold work left: ${Rt.length} × ${pm}${rip?` then <b>${rm}</b> (${f2(rip.w)}, cut edge to the middle)`:''}. They meet under the <b>joiner</b> (gap ${f2(R.joiner?.gap||0)}, ${f2(0)}–${f2(TR.joiner.w-2*TR.joiner.lap)} is fine).`;
  } else {
    const startEdge=R.ribsRight ? R.ends[1] : R.ends[0], endEdge=R.ribsRight ? R.ends[0] : R.ends[1], dir=R.ribsRight ? 'left' : 'right';
    const first = rip && ((R.ribsRight && rip.x1>=R.x1-R.d[1]-0.01) || (!R.ribsRight && rip.x0<=R.x0+R.d[0]+0.01));
    how=`Rib ends point <b>${R.ribsRight?'right':'left'}</b>. Start at ${EDGE[startEdge]}${startEdge==='M'?` (rib end against it, tucked up to ${f2(TR.mold.tuck)} into the J-trim)`:`, siding edge ${f2(R.ribsRight?R.d[1]:R.d[0])} in from the end`}${first?` with <b>${rm}</b> (${f2(rip.w)}, cut edge under ${EDGE[startEdge]})`:''}, work ${dir}: ${covers}${hops}.`
      + (rip && !first ? ` Last piece: <b>${rm}</b> (${f2(rip.w)} showing, cut edge under ${EDGE[endEdge]}).` : ` The last edge stops ${f2(R.ribsRight?R.d[0]:R.d[1])} from ${EDGE[endEdge]==='the brick mold'?'the mold':'the end'}.`);
  }
  return `<li><b>${where}</b> · ${ends}: ${how}${marks.length?` <span class="sd-marks">Rib-end marks from the left end: ${marks.join(' · ')}</span>`:''} <span class="sd-play">play ±${f2(Math.max(0,(R.play||0)/2))}</span></li>`;
}
const endName = (e, Wl, i) => e==='C' ? 'Einspine corner' : e==='J' ? 'joint to the next pod' : 'inside corner';
function renderSidingSheet(el){
  const m=MODELS[state.model], Sc=schedule();
  if(!Sc){ el.innerHTML='<p class="note">No siding profile in the Library yet.</p>'; return; }
  const { S, P, rows, screws, bags }=Sc;
  const nGrp=g=>rows.filter(r=>r.group===g).reduce((a,r)=>a+r.n,0);
  const pairs=S.stockRips.filter(g=>g.length===2).length;
  const tr=r=>`<tr><td><b>${r.mark}</b></td><td>${esc(r.profile)}</td><td>${esc(r.what)}</td><td>${r.w!=null?f2(r.w):'—'}</td><td><b>${f2(r.len)}</b> <small>(${fft(r.len)})</small></td><td><b>${r.n}</b></td><td>${r.screws!=null?r.screws:'—'}</td><td>${r.screws!=null?r.screwsAll:'—'}</td><td><small>${esc(r.note||'')}</small></td></tr>`;
  const custom=S.trims.filter(t=>t.joint).reduce((a,t)=>a+t.n,0);
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Siding · Cubit Home</div><h3>${esc(m?.name||'')} — siding schedule</h3></div>
      <div class="meta">${S.nStock} stock panels · ${S.nRips} rips · ${S.trims.reduce((a,t)=>a+t.n,0)} trims<br>${new Date().toISOString().slice(0,10)}</div></div>
    <div class="sheet-tools"><button class="btn" id="sdCsv">Schedule (CSV)</button><button class="btn ghost" id="sdPrint">Print</button>
      <span style="font-size:12.5px;color:#333">${fft(S.runs)} of exterior wall · ${S.nOpen} windows and doors · about ${Math.round(S.lb).toLocaleString()} lb of panels · ${custom} piece${custom===1?'':'s'} bent to suit (the pod joint connectors), everything else standard.</span></div>

    <div class="eyebrow" style="color:#555;margin:6px 0 4px">The pack</div>
    <table class="boxes"><tbody>
      ${S.stock.map(s=>`<tr><td><b>${s.n}</b> ${esc(P.name)} panels × ${f2(s.len)} (${fft(s.len)})</td><td>${S.nPanels} go up whole · ${S.stockRips.length} are cut into ${S.nRips} rips${pairs?` (${pairs} panel${pairs>1?'s':''} give two rips each)`:''}</td></tr>`).join('')}
      ${S.trims.map(t=>`<tr><td><b>${t.n}</b> ${esc(t.what)}${t.what.includes('total')?'':` × ${f2(t.len)}`}${t.what.includes('total')?` ${f2(t.len)} (${fft(t.len)})`:''}</td><td>${t.std?'standard':'bent to suit'}${t.legs?` · ${esc(t.legs)}`:''}</td></tr>`).join('')}
      <tr><td><b>${S.acmSheets}</b> ACM sheets 4 × 8, matte black</td><td>${nGrp('ACM')} pieces above / below the openings${S.narrow?` and ${S.narrow} strip${S.narrow>1?'s':''} too narrow for siding`:''}, 15% for cutting</td></tr>
      <tr><td><b>${bags} bag${bags===1?'':'s'}</b> of ${SCREWS.bag} ${SCREWS.what}s</td><td>${screws.toLocaleString()} screws: ${SCREWS.perPanel} per panel and per rip · ${(bags*SCREWS.bag-screws).toLocaleString()} spare</td></tr></tbody></table>

    <div class="eyebrow" style="color:#555;margin:12px 0 4px">How it goes (every wall)</div>
    <ol class="note sd-rules">
      <li><b>Rib ends point at the windows and doors.</b> Where a wall has none, the flange end goes to the Einspine corner.</li>
      <li><b>Start at the rib-end side</b> (the brick mold, or the end the wall says) and work back: each new panel's rib end laps over the flange of the one already up.</li>
      <li>Lay panels at <b>${f2(TR.nom)}</b> cover. Each can be pulled back to ${f2(P.coverMin)} or let out to ${f2(P.cover)}: that's your play to keep the rib-end marks.</li>
      <li>The <b>last piece</b> on a run is a <b>rip</b> (marked R): measure what's left, cut a stock panel down its length to fit, keep the edge that laps, and put the cut edge under the trim.</li>
      <li><b>Corners</b>: every Einspine corner gets the same corner trim (${TR.corner.leg}″ legs); keep the siding ${f2(TR.corner.clear)} to ${f2(TR.corner.leg-TR.corner.lap)} from the corner so the spine stays clear and the trim covers at least ${f2(TR.corner.lap)}. Screw the trim, don't rivet: it comes off to reach the spine.</li>
      <li><b>Joints between pods</b>: the connector is bent to suit each joint (J marks): the siding can stop ${f2(TR.joint.clear)} to ${f2(TR.joint.max)} from the pod's end.</li>
      <li><b>Between two openings</b> the runs go out from each brick mold and meet under the joiner (${TR.joiner.w}″, standard).</li>
      <li>Above and below every opening: <b>black ACM</b>, against the wall, ${f2(ACM_LAP)} under the siding each side, before the siding goes on.</li>
    </ol>

    <div class="eyebrow" style="color:#555;margin:12px 0 4px">Profile</div>
    <div class="sd-profiles"><div class="sd-prof sd-wide"><b>${esc(P.name)}</b> <small>${esc(P.gauge||'')} · cover ${f2(P.cover)} full, ${f2(P.coverMin)} pulled back, ${f2(P.hop[0])}–${f2(P.hop[1])} hopped · ${P.lbPerFt} lb/ft</small>${profileSVG(P)}</div></div>

    <div class="eyebrow" style="color:#555;margin:12px 0 4px">Every piece</div>
    <div class="tblwrap"><table class="boxes sd-tab"><thead><tr><th>Mark</th><th>Profile</th><th>Piece</th><th>Width</th><th>Length</th><th>Qty</th><th>Screws each</th><th>Screws</th><th>Note</th></tr></thead>
      <tbody>${rows.map(tr).join('')}</tbody>
      <tfoot><tr><td colspan="5"><b>Total</b></td><td><b>${rows.reduce((a,r)=>a+r.n,0)}</b></td><td></td><td><b>${screws.toLocaleString()}</b></td><td>${bags} bag${bags===1?'':'s'} of screws</td></tr></tfoot></table></div>
    ${S.stockRips.some(g=>g.length===2)?`<p class="note" style="color:#444">Rips cut two from one panel: ${S.stockRips.filter(g=>g.length===2).map(([a,b])=>`${f2(a.w)} (rib end) + ${f2(b.w)} (flange end)`).join(' · ')}.</p>`:''}

    <div class="eyebrow" style="color:#555;margin:12px 0 4px">Wall by wall · measured from the wall's left end, standing outside facing it</div>
    ${S.walls.map(W=>{ const np=W.runs.reduce((a,R)=>a+R.pieces.filter(p=>p.kind==='panel').length,0), nr=W.runs.reduce((a,R)=>a+R.pieces.filter(p=>p.kind==='rip').length,0);
      return `<details class="frwall"><summary><b>${esc(W.s.label)}</b> · ${fft(W.L)} · left: ${endName(W.ends[0])}, right: ${endName(W.ends[1])} · ${np} panel${np===1?'':'s'}${nr?`, ${nr} rip${nr>1?'s':''}`:''}${W.molds.length?`, ${W.molds.length} opening${W.molds.length>1?'s':''}`:''}</summary>
        <ol class="note sd-runs">${W.runs.map(R=>runSteps(R, Sc, W)).join('')}
        ${W.cols.map(c=>`<li>Opening ${f2(c.m.x0+MOLD)} to ${f2(c.m.x1-MOLD)}: black ACM ${f2(c.m.x1-c.m.x0+2*ACM_LAP)} wide${c.above>0.5?`, ${f2(c.above)} high above`:''}${c.below>0.5?`, ${f2(c.below)} high below`:''}, then J-trim up both sides of the brick mold.</li>`).join('')}</ol></details>`; }).join('')}`;
  el.querySelector('#sdPrint').onclick=()=>window.print();
  el.querySelector('#sdCsv').onclick=()=>{
    const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const lines=[['Mark','Profile','Piece','Width (in)','Length (in)','Qty','Screws each','Screws','Note'].map(q).join(',')];
    rows.forEach(r=>lines.push([r.mark,r.profile,r.what,r.w!=null?r.w.toFixed(3):'',r.len.toFixed(3),r.n,r.screws??'',r.screwsAll||'',r.note].map(q).join(',')));
    lines.push(['','','Screws','','','',SCREWS.perPanel,screws,`${bags} bags of ${SCREWS.bag}`].map(q).join(','));
    downloadBlob(new Blob([lines.join('\n')],{type:'text/csv'}), `${m?.name||'home'} - siding schedule.csv`); };
}
export { renderSidingSheet, schedule as sidingSchedule, SCREWS as SIDING_SCREWS };
