/* Cubit Builder — sidingguide.js : Sheets → Whole home → Siding install guide. One page per exterior wall, pod by
   pod, made to print (or save as a PDF) and hand to the crew: the wall drawn from outside, every piece numbered in
   the order it goes up, an arrow on each rib end, rips in red with their width and the edge to keep, the black
   ACM, the trims and connector, and a tape line with each rib-end mark. Then the steps in words. */
import { MODELS } from './data.js';
import { fin, fft } from './format.js';
import { state } from './state.js';
import { SIDING_TRIM as TR, MOLD, ACM_LAP } from './sidinglayout.js';
import { sidingSchedule, SIDING_SCREWS } from './sidingsheet.js';
import { wallSteps } from './sidingsteps.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f2 = v => fin(Math.round(v*16)/16);
const endName = e => e==='C' ? 'Einspine corner' : e==='J' ? 'joint to the next pod' : 'inside corner';

function wallSVG(Wl, steps, wpx=980){
  const pad=34, sc=Math.min((wpx-2*pad)/(Wl.L+12), 6), W=(Wl.L+12)*sc+2*pad, top=40, Hpx=Wl.H*sc, tape=70, hpx=top+Hpx+tape+20;
  const X=x=>pad+(x+6)*sc, Y=y=>top+(Wl.y1-y)*sc, out=[];
  out.push(`<rect x="${X(0)}" y="${Y(Wl.y1)}" width="${Wl.L*sc}" height="${Hpx}" fill="#f6f4ee" stroke="#1c211e"/>`);
  // openings: the rough opening and its brick mold
  Wl.molds.forEach(m=>{ const y0=Math.max(m.y0,Wl.y0), y1=Math.min(m.y1,Wl.y1);
    out.push(`<rect x="${X(m.x0)}" y="${Y(y1)}" width="${(m.x1-m.x0)*sc}" height="${(y1-y0)*sc}" fill="#fff" stroke="#888"/><rect x="${X(m.x0+MOLD)}" y="${Y(Math.min(m.y1-MOLD,Wl.y1))}" width="${(m.x1-m.x0-2*MOLD)*sc}" height="${(Math.min(m.y1-MOLD,Wl.y1)-Math.max(m.y0+MOLD,Wl.y0))*sc}" fill="#dfeaf2" stroke="#9ab"/>`); });
  // ACM
  Wl.cols.forEach(c=>{ const x0=c.m.x0-ACM_LAP, x1=c.m.x1+ACM_LAP;
    if(c.below>0.5) out.push(`<rect x="${X(x0)}" y="${Y(Wl.y0+c.below)}" width="${(x1-x0)*sc}" height="${c.below*sc}" fill="#151617"/>`);
    if(c.above>0.5) out.push(`<rect x="${X(x0)}" y="${Y(Wl.y1)}" width="${(x1-x0)*sc}" height="${c.above*sc}" fill="#151617"/>`); });
  Wl.runs.filter(R=>R.narrow).forEach(R=>out.push(`<rect x="${X(R.x0)}" y="${Y(Wl.y1)}" width="${(R.x1-R.x0)*sc}" height="${Hpx}" fill="#151617"/>`));
  // pieces, numbered in install order
  const midY=Y((Wl.y0+Wl.y1)/2);
  steps.filter(s=>s.piece).forEach((s,i)=>{ const p=s.piece, x0=X(p.x0), w=p.w*sc, rip=p.kind==='rip';
    out.push(`<rect x="${x0.toFixed(1)}" y="${Y(Wl.y1)}" width="${w.toFixed(1)}" height="${Hpx}" fill="${rip?'url(#ripHatch)':(s.n%2?'#c9ced2':'#b7bdc2')}" stroke="#5b6159" stroke-width="0.8"/>`);
    const rx=X(s.ribX);
    out.push(`<line x1="${rx}" y1="${Y(Wl.y1)}" x2="${rx}" y2="${Y(Wl.y0)}" stroke="#1c211e" stroke-width="3"/>`);
    const k=p.ribR?-1:1;   // the chevron sits inside the piece next to its rib end and points at it
    out.push(`<path d="M${rx+k*14} ${midY-50} L${rx+k*5} ${midY-40} L${rx+k*14} ${midY-30}" fill="none" stroke="#d0661f" stroke-width="2.6"/>`);
    out.push(`<circle cx="${x0+w/2}" cy="${midY}" r="${Math.min(13, w/2-1)}" fill="#fff" stroke="${rip?'#c0392b':'#1c211e'}" stroke-width="1.6"/><text x="${x0+w/2}" y="${midY+4}" font-size="12" font-weight="700" text-anchor="middle">${s.n}</text>`);
    out.push(`<text x="${x0+w/2}" y="${midY+28}" font-size="10" text-anchor="middle" fill="${rip?'#c0392b':'#333'}">${esc(s.mark)}${rip?` ${f2(p.w)}`:''}</text>`);
    if(rip) out.push(`<text x="${x0+w/2}" y="${midY+41}" font-size="9" text-anchor="middle" fill="#c0392b">keep ${p.keeps==='rib'?'rib':'flange'}</text>`); });
  // trims: the joiner and the two ends
  const strip=(a,b,label,fill='#7d8489')=>out.push(`<rect x="${X(a)}" y="${Y(Wl.y1)-6}" width="${(b-a)*sc}" height="${Hpx+12}" fill="${fill}" fill-opacity="0.85" stroke="#333"/><text x="${X((a+b)/2)}" y="${Y(Wl.y1)-10}" font-size="10" text-anchor="middle">${esc(label)}</text>`);
  Wl.runs.forEach(R=>{ if(R.joiner) strip(R.joiner.x-TR.joiner.w/2, R.joiner.x+TR.joiner.w/2, 'joiner'); else if(R.joinerOnly) strip(R.x0, R.x1, 'joiner'); });
  const legOf=(e,d)=> e==='C' ? TR.corner.leg : e==='I' ? TR.inside.leg : d+TR.joint.lap, nm={ C:'corner', I:'inside', J:'connector' };
  const R0=Wl.runs[0], R1=Wl.runs[Wl.runs.length-1];
  strip(0, legOf(Wl.ends[0], R0?.d?.[0]||0), nm[Wl.ends[0]], '#4c5257'); strip(Wl.L-legOf(Wl.ends[1], R1?.d?.[1]||0), Wl.L, nm[Wl.ends[1]], '#4c5257');
  // the tape: 0 at the left end, a tick at every rib-end mark
  const ty=Y(Wl.y0)+24;
  out.push(`<line x1="${X(0)}" y1="${ty}" x2="${X(Wl.L)}" y2="${ty}" stroke="#1c211e" stroke-width="1.2"/><text x="${X(0)}" y="${ty+14}" font-size="10">0</text><text x="${X(Wl.L)}" y="${ty+14}" font-size="10" text-anchor="end">${f2(Wl.L)}</text>`);
  steps.filter(s=>s.piece).forEach(s=>{ const x=X(s.ribX); out.push(`<line x1="${x}" y1="${ty-6}" x2="${x}" y2="${ty+6}" stroke="#d0661f" stroke-width="2"/><text x="${x}" y="${ty+18}" font-size="9" text-anchor="end" transform="rotate(-50 ${x} ${ty+18})">${f2(s.ribX)}</text>`); });
  return `<svg viewBox="0 0 ${W.toFixed(0)} ${(hpx+20).toFixed(0)}" width="100%" style="max-width:${W.toFixed(0)}px;background:#fff" role="img" aria-label="${esc(Wl.s.label)} siding, seen from outside">
    <defs><pattern id="ripHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f6d5cf"/><line x1="0" y1="0" x2="0" y2="6" stroke="#c0392b" stroke-width="1.4"/></pattern></defs>${out.join('')}</svg>`;
}
function renderSidingGuide(el){
  const m=MODELS[state.model], Sc=sidingSchedule();
  if(!Sc){ el.innerHTML='<p class="note">No siding profile in the Library yet.</p>'; return; }
  const { S, P, rows, screws, bags }=Sc, pods={};
  S.walls.forEach(W=>{ (pods[W.s.pod.label] ||= []).push(W); });
  const legend=`<p class="sg-legend"><span class="k" style="background:#c9ced2"></span>panel · <span class="k" style="background:#f6d5cf;border-color:#c0392b"></span>rip (cut to width) · <span class="k" style="background:#151617"></span>black ACM · <span class="k" style="background:#4c5257"></span>trim / connector · <b style="color:#d0661f">›</b> the way the rib end points (heavy line = rib end) · the numbers are the order the pieces go up · orange ticks: rib-end marks on the tape from the wall's left end</p>`;
  el.innerHTML=`
    <div class="sheet-tools no-print"><button class="btn" id="sgPrint">Print or save as PDF</button><span class="note" style="margin-left:8px">One page per wall, pod by pod. In the 3D: <b>Install steps</b> walks the same order piece by piece.</span></div>
    <section class="sg-page">
      <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Siding install guide · Cubit Home</div><h3>${esc(m?.name||'')}</h3></div><div class="meta">${S.walls.length} walls · ${S.nStock} stock panels<br>${new Date().toISOString().slice(0,10)}</div></div>
      <div class="eyebrow" style="color:#555;margin:8px 0 4px">The pack</div>
      <table class="boxes"><tbody>${rows.map(r=>`<tr><td><b>${r.mark}</b></td><td><b>${r.n}</b> × ${esc(r.what)}</td><td>${r.w!=null?f2(r.w)+' × ':''}${f2(r.len)}</td></tr>`).join('')}
        <tr><td></td><td><b>${bags} bag${bags>1?'s':''}</b> of ${SIDING_SCREWS.bag} screws</td><td>${screws} screws</td></tr></tbody></table>
      <div class="eyebrow" style="color:#555;margin:12px 0 4px">Every wall, the same way</div>
      <ol class="note sd-rules">
        <li>Black ACM above and below each window and door, then J-trim up the sides of the brick mold and the drip flashing.</li>
        <li>Each run starts at the rib-end side (the brick mold, or the end shown) and works back: every new panel's rib end laps over the flange already up. Lay at ${f2(TR.nom)} cover; ${f2(P.coverMin)}–${f2(P.cover)} is your play to hit the marks.</li>
        <li>Red pieces are rips: measure what's left, cut a stock panel to fit, keep the edge shown, cut edge under the trim.</li>
        <li>Trims last: corner trims screwed (never riveted) so they come off; connectors once both pods are sided.</li>
      </ol>
      ${legend}
      <p class="note">Walls: ${Object.entries(pods).map(([p,ws])=>`<b>${esc(p)}</b> ${ws.map(w=>esc(w.s.label.replace(p+' · ',''))).join(', ')}`).join(' · ')}</p>
    </section>
    ${S.walls.map(W=>{ const st=wallSteps(W, Sc), np=st.filter(s=>s.kind==='panel').length, nr=st.filter(s=>s.kind==='rip').length;
      return `<section class="sg-page"><div class="sheet-title"><div><div class="eyebrow" style="color:#555">${esc(m?.name||'')} · siding</div><h3>${esc(W.s.label)}</h3></div>
        <div class="meta">${fft(W.L)} · ${np} panels${nr?` · ${nr} rip${nr>1?'s':''}`:''}<br>left: ${endName(W.ends[0])} · right: ${endName(W.ends[1])}</div></div>
        <p class="note" style="margin:2px 0 6px">Seen from outside, standing in front of the wall.</p>
        ${wallSVG(W, st)}
        ${legend}
        <ul class="sg-steps">${st.map(s=>`<li class="sg-${s.kind}"><span class="sg-n">${s.n?s.n:s.kind==='acm'?'First':'Last'}</span><b>${esc(s.title.replace(/^\d+\. /,''))}</b> — ${esc(s.text)}</li>`).join('')}</ul></section>`; }).join('')}`;
  el.querySelector('#sgPrint').onclick=()=>window.print();
}
export { renderSidingGuide };
