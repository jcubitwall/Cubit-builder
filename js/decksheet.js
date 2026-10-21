/* Cubit Builder — decksheet.js : framing sheet for one deck (porch frame): plan, joist layout, corner
   notches for the steel corner posts, and a cut list. Drawn in the deck's own frame with the ledger on top. */
import { MODELS } from './data.js';
import { fft, fin } from './format.js';
import { deckList } from './layout.js';
import { dimH, dimV } from './sheets.js';
import { state } from './state.js';

/* every member of the frame as [name, x0, x1, z0, z1] in the deck's own inches (same rules as the 3D frame) */
function deckMembers(L){
  const W=L.W, D=L.D, t=L.lumber?.t||1.5, n=L.notch||0;
  const R=L.rims||{ledger:true,far:true,left:true,right:true}, N=(cx,cz)=>(L.notches||[]).some(c=>c[0]===cx&&c[1]===cz);
  const sx0=R.left?t:0, sx1=W-(R.right?t:0), out=[];
  if(R.ledger) out.push(['Ledger rim', Math.max(sx0,N(0,0)?n:0), Math.min(sx1,W-(N(1,0)?n:0)), 0, t]);
  if(R.far)    out.push(['Far rim',    Math.max(sx0,N(0,1)?n:0), Math.min(sx1,W-(N(1,1)?n:0)), D-t, D]);
  if(R.left)   out.push(['Side rim',   0, t, N(0,0)?n:0, D-(N(0,1)?n:0)]);
  if(R.right)  out.push(['Side rim',   W-t, W, N(1,0)?n:0, D-(N(1,1)?n:0)]);
  const jz0=R.ledger?t:0, jz1=D-(R.far?t:0);
  (L.joists?.at||[]).forEach(a=>out.push(L.joists.run==='z' ? ['Joist', a, a+t, jz0, jz1] : ['Joist', sx0, sx1, a, a+t]));
  return out;
}
function renderDeckSheet(el, k){
  const d=deckList(state.model)[k], L=d.L, W=L.W, D=L.D, t=L.lumber?.t||1.5, h=L.lumber?.h||L.h;
  const mem=deckMembers(L);
  const s=Math.min(5, 760/W, 560/D), ml=90, mt=90, VW=W*s+ml+160, VH=D*s+mt+90;
  const X=u=>ml+u*s, Y=v=>mt+v*s;
  let g=`<svg viewBox="0 0 ${VW} ${VH}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Deck framing plan"><defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="#2f6db5"/></marker></defs>`;
  g+=`<rect x="${X(0)}" y="${Y(0)}" width="${W*s}" height="${D*s}" fill="#f6efe0" stroke="#bbb" stroke-dasharray="4 3"/>`;
  mem.forEach(([nm,x0,x1,z0,z1])=>{ g+=`<rect x="${X(x0)}" y="${Y(z0)}" width="${(x1-x0)*s}" height="${(z1-z0)*s}" fill="${nm==='Joist'?'#c7ad78':'#a88f5d'}" stroke="#3b3122" stroke-width=".8"/>`; });
  (L.notches||[]).forEach(([cu,cv])=>{ const n=L.notch, u=cu?W-n:0, v=cv?D-n:0;
    g+=`<rect x="${X(u)}" y="${Y(v)}" width="${n*s}" height="${n*s}" fill="#fff" stroke="#7a3fb0" stroke-width="1.4"/>`; });
  g+=`<text x="${X(W/2)}" y="${Y(0)-38}" text-anchor="middle" font-size="11" font-weight="700" fill="#3b3122">LEDGER · docks to the pod or deck · 5/8″ from a pod</text>`;
  g+=dimH(X(0),X(W),Y(0)-16,`${fin(W)} (${fft(W)})`,Y(0),11);
  g+=dimV(Y(0),Y(D),X(0)-30,`${fin(D)} (${fft(D)})`,X(0),11);
  // joist chain from the ledger, to the near face of each member
  if(L.joists?.run!=='z'){
    const pts=[0, ...mem.filter(m=>m[0]==='Joist').map(m=>m[3]), D-(L.rims?.far?t:0)];
    for(let i=0;i<pts.length-1;i++) g+=dimV(Y(pts[i]),Y(pts[i+1]),X(W)+34,fin(pts[i+1]-pts[i]),X(W),9.5);
  }
  if((L.notches||[]).length) g+=`<text x="${X(W)+8}" y="${Y(D)+30}" font-size="10" fill="#7a3fb0" font-weight="600">□ corner notch ${fin(L.notch)} × ${fin(L.notch)} for the steel corner</text>`;
  g+=`</svg>`;
  // cut list
  const cuts={}; mem.forEach(([nm,x0,x1,z0,z1])=>{ const len=Math.max(x1-x0,z1-z0), key=nm+'|'+len.toFixed(3); (cuts[key] ||= {nm,len,n:0}).n++; });
  const nominal=`2×${Math.round(h+0.75)}`;
  let t2=`<table class="boxes"><thead><tr><th>Member</th><th>Qty</th><th>Size</th><th>Length</th></tr></thead><tbody>`;
  Object.values(cuts).sort((a,b)=>a.nm.localeCompare(b.nm)).forEach(c=>{ t2+=`<tr><td>${c.nm}</td><td>${c.n}</td><td>${nominal} (${fin(t)} × ${fin(h)})</td><td><b>${fin(c.len)}</b></td></tr>`; });
  t2+=`</tbody></table>`;
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Deck framing · Cubit Home</div><h3>Deck ${k+1} — ${L.id}</h3></div>
      <div class="meta">${MODELS[state.model].name} · ${L.w}′ × ${L.d}′ · ${mem.length} members · ${nominal}<br>${new Date().toISOString().slice(0,10)}</div></div>
    <p class="note" style="color:#333">${L.name||''}${L.source?` · from ${L.source}`:''}. Seen from above with the ledger at the top. Ground screws for this deck are on the foundation sheet.</p>
    <div class="elev">${g}</div>
    <div class="tblwrap"><div class="eyebrow" style="color:#555;margin-bottom:4px">Cut list</div>${t2}</div>`;
}
export { renderDeckSheet, deckMembers };
