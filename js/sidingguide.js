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
import { slotsFor } from './layout.js';
import { accentOf } from './accent.js';

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
/* the top view for the crew: every outside wall with its name and length, where each window and door sits
   (measured from the wall's left end, seen from outside), which way the rib ends run, and what's at each corner */
function planSVG(S, Sc, lv=0){
  const slots=slotsFor(state.model).filter(s=>(s.pod?.lv||0)===lv); if(!slots.length) return '';
  const xs=slots.flatMap(s=>[s.p0[0],s.p1[0]]), zs=slots.flatMap(s=>[s.p0[1],s.p1[1]]);
  const x0=Math.min(...xs), x1=Math.max(...xs), z0=Math.min(...zs), z1=Math.max(...zs), m=5.5;
  const vb=[x0-m, z0-m, x1-x0+2*m, z1-z0+2*m], out=[];
  const F=v=>v.toFixed(3), fs=0.42;
  // pods shaded, joint walls thin, outside walls heavy
  const pods=[...new Set(slots.map(s=>s.pod))];
  pods.forEach(P=>{ const ps=slots.filter(s=>s.pod===P), px=ps.flatMap(s=>[s.p0[0],s.p1[0]]), pz=ps.flatMap(s=>[s.p0[1],s.p1[1]]);
    const a=Math.min(...px), b=Math.max(...px), c=Math.min(...pz), d=Math.max(...pz);
    out.push(`<rect x="${F(a)}" y="${F(c)}" width="${F(b-a)}" height="${F(d-c)}" fill="#f3f0e8"/><text x="${F((a+b)/2)}" y="${F((c+d)/2)}" font-size="${fs*1.5}" text-anchor="middle" fill="#8a8578" font-weight="700">${esc(P.label)}</text>`); });
  slots.filter(s=>s.type!=='ext').forEach(s=>out.push(`<line x1="${F(s.p0[0])}" y1="${F(s.p0[1])}" x2="${F(s.p1[0])}" y2="${F(s.p1[1])}" stroke="#b9b4a6" stroke-width="0.12"/>`));
  const byId=new Map(S.walls.map(W=>[W.s.id,W]));
  slots.filter(s=>s.type==='ext').forEach(s=>{
    const W=byId.get(s.id), L=s.len*12, d=[(s.p1[0]-s.p0[0])/(L), (s.p1[1]-s.p0[1])/(L)], n=s.n;
    const at=(x,o=0)=>[s.p0[0]+d[0]*x+n[0]*o, s.p0[1]+d[1]*x+n[1]*o];
    const acc=accentOf(s), side=Math.abs(n[0])>0.5, anc=side ? (n[0]>0?'start':'end') : 'middle';   // a wall running up the page: its words go out to the side
    out.push(`<line x1="${F(s.p0[0])}" y1="${F(s.p0[1])}" x2="${F(s.p1[0])}" y2="${F(s.p1[1])}" stroke="${acc?'#8a5a2e':'#1c211e'}" stroke-width="0.32"/>`);
    // openings: a white gap in the wall and the distance from the left end to the brick mold
    (W?.molds||[]).forEach((mo,i)=>{ const p=at(mo.x0+MOLD), q=at(mo.x1-MOLD);
      out.push(`<line x1="${F(p[0])}" y1="${F(p[1])}" x2="${F(q[0])}" y2="${F(q[1])}" stroke="#fff" stroke-width="0.22"/>`);
      const t=at((mo.x0+mo.x1)/2, side ? 0.6 : 1.15+(i%2)*0.6);
      out.push(`<text x="${F(t[0])}" y="${F(t[1])}" font-size="${fs*0.85}" text-anchor="${anc}" dominant-baseline="middle" fill="#2a6fb0">${f2(mo.x0)}–${f2(mo.x1)}</text>`); });
    // the name, the length and the left end (seen from outside)
    const mid=at(L/2+(side && W?.molds?.length ? (W.molds[0].x0+W.molds[0].x1)/2 > L/2 ? -L/4 : L/4 : 0), side ? 0.6 : (W?.molds?.length ? 3.1 : 1.5)), l0=at(0,0.55);
    out.push(`<text x="${F(mid[0])}" y="${F(mid[1])}" font-size="${fs}" text-anchor="${anc}" dominant-baseline="middle" font-weight="700">${esc(s.label.replace((s.pod?.label||'')+' · ',''))} · ${fft(L)}${acc?' · ACP':''}</text>`);
    out.push(`<circle cx="${F(l0[0])}" cy="${F(l0[1])}" r="0.2" fill="#1c211e"/>`);
    // which way the rib ends run, run by run
    (W?.runs||[]).forEach(R=>{ if(R.narrow||R.joinerOnly||R.connectorOnly||!R.pieces.length) return;
      const arrow=(xa,xb)=>{ const p=at(xa,0.55), q=at(xb,0.55), dx=q[0]-p[0], dz=q[1]-p[1], l=Math.hypot(dx,dz)||1, ux=dx/l, uz=dz/l;
        out.push(`<line x1="${F(p[0])}" y1="${F(p[1])}" x2="${F(q[0])}" y2="${F(q[1])}" stroke="#d0661f" stroke-width="0.07"/><path d="M${F(q[0]-ux*0.35-uz*0.18)} ${F(q[1]-uz*0.35+ux*0.18)} L${F(q[0])} ${F(q[1])} L${F(q[0]-ux*0.35+uz*0.18)} ${F(q[1]-uz*0.35-ux*0.18)}" fill="none" stroke="#d0661f" stroke-width="0.07"/>`); };
      const a=R.x0+2, b=R.x1-2; if(b-a<6) return;
      if(R.split){ const c=(R.x0+R.x1)/2; arrow(c-2, a); arrow(c+2, b); } else if(R.ribsRight) arrow(a, b); else arrow(b, a); });
    // the two ends
    if(W) [[0,W.ends[0]],[L,W.ends[1]]].forEach(([x,e])=>{ const p=at(x,0.1);
      if(e==='C') out.push(`<rect x="${F(p[0]-0.22)}" y="${F(p[1]-0.22)}" width="0.44" height="0.44" fill="#4c5257"/>`);
      else if(e==='I') out.push(`<circle cx="${F(p[0])}" cy="${F(p[1])}" r="0.24" fill="none" stroke="#4c5257" stroke-width="0.09"/>`);
      else { const j=Sc.S.joints.find(j=>j.walls.includes(s.label)), jm=j ? (Sc.mark['J|'+j.w+'|'+j.len]||'J') : 'J', t=at(x,1.1);
        out.push(`<rect x="${F(p[0]-0.18)}" y="${F(p[1]-0.18)}" width="0.36" height="0.36" fill="#d0661f"/><text x="${F(t[0])}" y="${F(t[1])}" font-size="${fs*0.85}" text-anchor="middle" dominant-baseline="middle" fill="#d0661f" font-weight="700">${jm}</text>`); } });
  });
  // overall size
  out.push(`<text x="${F((x0+x1)/2)}" y="${F(z1+m-0.6)}" font-size="${fs}" text-anchor="middle" fill="#555">${fft((x1-x0)*12)} × ${fft((z1-z0)*12)} outside</text>`);
  return `<svg viewBox="${vb.map(F).join(' ')}" width="100%" style="max-width:980px;background:#fff;border:1px solid #ddd;border-radius:6px" role="img" aria-label="Top view of the walls for the siding">${out.join('')}</svg>`;
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
    <section class="sg-page">
      <div class="sheet-title"><div><div class="eyebrow" style="color:#555">${esc(m?.name||'')} · siding</div><h3>Top view</h3></div><div class="meta">north up as drawn in the plan</div></div>
      ${[...new Set(S.walls.map(W=>W.s.pod?.lv||0))].sort().map(lv=>`${lv?`<div class="eyebrow" style="color:#555;margin:10px 0 4px">Level ${lv+1}</div>`:''}${planSVG(S, Sc, lv)}`).join('')}
      <p class="sg-legend">Heavy line: outside wall with siding (brown: ACP accent wall) · <b>●</b> the wall's left end, seen from outside: every measurement starts there · <span style="color:#2a6fb0">blue</span>: brick mold to brick mold of each window and door, from the left end · <span style="color:#d0661f">orange arrows</span>: the way the rib ends run · <span class="k" style="background:#4c5257"></span>Einspine corner trim · ○ inside corner · <span class="k" style="background:#d0661f"></span>pod joint connector (J mark)</p>
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
