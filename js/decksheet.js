/* Cubit Builder — decksheet.js : framing sheet for one deck, and the lumber takeoff for all the decks of a home.
   Every deck is framed by the same rules (deckframe.js); drawn in the deck's own frame with the house side on top. */
import { MODELS } from './data.js';
import { DECK } from './config.js';
import { fft, fin } from './format.js';
import { deckList } from './layout.js';
import { dimH, dimV } from './sheets.js';
import { state } from './state.js';
import { deckMembers, joistCentres, deckTakeoff, deckName, deckSizes, ocSeg, bindOC } from './deckframe.js';
import { deckOCOf } from './state.js';
import { buildHome } from './scene3d.js';

const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function planSVG(L){
  const W=L.W, D=L.D, n=DECK.notch, mem=deckMembers(L);
  const s=Math.min(5, 760/W, 560/D), ml=90, mt=96, VW=W*s+ml+170, VH=D*s+mt+90;
  const X=u=>ml+u*s, Y=v=>mt+v*s;
  let g=`<svg viewBox="0 0 ${VW} ${VH}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Deck framing plan"><defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="#2f6db5"/></marker></defs>`;
  g+=`<rect x="${X(0)}" y="${Y(0)}" width="${W*s}" height="${D*s}" fill="#f6efe0" stroke="#bbb" stroke-dasharray="4 3"/>`;
  mem.forEach(([nm,u0,u1,v0,v1])=>{ g+=`<rect x="${X(u0)}" y="${Y(v0)}" width="${(u1-u0)*s}" height="${(v1-v0)*s}" fill="${nm==='Joist'?'#c7ad78':'#a88f5d'}" stroke="#3b3122" stroke-width=".8"/>`; });
  [[0,0],[1,0],[0,1],[1,1]].forEach(([cu,cv])=>{ const u=cu?W-n:0, v=cv?D-n:0; g+=`<rect x="${X(u)}" y="${Y(v)}" width="${n*s}" height="${n*s}" fill="#fff" stroke="#7a3fb0" stroke-width="1.4"/>`; });
  g+=`<text x="${X(W/2)}" y="${Y(0)-44}" text-anchor="middle" font-size="11" font-weight="700" fill="#3b3122">HOUSE SIDE (LEDGER) · ¾″ off the house · straight up to another deck</text>`;
  g+=dimH(X(0),X(W),Y(0)-18,`${fin(W)} (${fft(W)})`,Y(0),11);
  g+=dimV(Y(0),Y(D),X(0)-30,`${fin(D)} (${fft(D)})`,X(0),11);
  // joist centres from the house side, 24″ (or 16″) o.c.; the last space is what's left
  const jc=joistCentres(L), pts=[0, ...jc, D];
  for(let i=0;i<pts.length-1;i++) g+=dimV(Y(pts[i]),Y(pts[i+1]),X(W)+36,fin(pts[i+1]-pts[i])+(i===pts.length-2?' (last)':' o.c.'),X(W),9.5);
  g+=`<text x="${X(W)+60}" y="${Y(0)+12}" font-size="9.5" fill="#555">to joist centres</text>`;
  g+=`<text x="${X(0)}" y="${Y(D)+34}" font-size="10" fill="#7a3fb0" font-weight="600">□ 4 corner notches ${fin(DECK.notch)} × ${fin(DECK.notch)} for the ${DECK.angle} spine</text>`;
  g+=`<text x="${X(0)}" y="${Y(D)+50}" font-size="10" fill="#333">Rims: double 2×8 all round · joists: 2×8, parallel to the house, ${deckOCOf(state.model)}″ o.c. from the house side</text>`;
  return g+'</svg>';
}
function takeoffHTML(T, count){
  const row=(a,b,c,d)=>`<tr><td>${a}</td><td>${b}</td><td>${c}</td><td>${d}</td></tr>`;
  const buy=o=>Object.entries(o.byLen).sort((a,b)=>+a[0]-+b[0]).map(([ft,n])=>`<b>${n}</b> × ${ft}′`).join(' · ');
  return `<table class="boxes"><thead><tr><th>Member</th><th>Qty</th><th>Size</th><th>Cut length</th></tr></thead><tbody>
    ${T.cuts.map(c=>row(c.name, c.n, '2×8 (1½″ × 7¼″)', `<b>${fin(c.len)}</b> (${fft(c.len)})`)).join('')}
    </tbody></table>
    <table class="boxes" style="margin-top:8px"><tbody>
      <tr><td><b>2×8 to buy</b></td><td>${buy(T.frame)} <span style="color:#555">(${T.frame.boards.length} boards for ${T.pieces} pieces; shortest standard lengths, ⅛″ kerf)</span></td></tr>
      <tr><td><b>Deck boards</b></td><td>${T.boardsN} × ${DECK.board.name}, laid out from the house across the joists: ${buy(T.deckBoards)} <span style="color:#555">(${fin(DECK.board.gap)} gaps; if Cubit supplies the decking)</span></td></tr>
      <tr><td><b>Angle-iron spines</b></td><td>${T.angles} × ${DECK.angle}, ${fin(T.angleLen)} long (one per corner notch)</td></tr>
    </tbody></table>
    <p class="note" style="color:#444;margin-top:6px">Fasteners, joist hangers and ledger connections aren't counted. ${count>1?`Totals for all ${count} decks.`:''}</p>`;
}
function renderDeckSheet(el, k){
  const d=deckList(state.model)[k], L=d.L;
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Deck framing · Cubit Home</div><h3>Deck ${k+1} — ${esc(deckName(L))}</h3></div>
      <div class="meta">${esc(MODELS[state.model].name)} · ${esc(L.id)} · ${deckMembers(L).length} pieces of 2×8<br>${new Date().toISOString().slice(0,10)}</div></div>
    <p class="note" style="color:#333">Seen from above with the house side at the top. Screws or pads for this deck are on the foundation sheet.</p>
    <div class="sheet-tools edit-only">${ocSeg()}</div>
    <div class="elev">${planSVG(L)}</div>
    <div class="tblwrap"><div class="eyebrow" style="color:#555;margin-bottom:4px">Lumber takeoff · this deck</div>${takeoffHTML(deckTakeoff([L]),1)}</div>`;
  bindOC(el, ()=>{ buildHome(); renderDeckSheet(el,k); });
}
function renderDecksTakeoff(el){
  const ds=deckList(state.model), sizes=deckSizes(MODELS[state.model]);
  const T=deckTakeoff(ds.map(d=>d.L));
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Decks · Cubit Home</div><h3>${esc(MODELS[state.model].name)} — deck lumber takeoff</h3></div>
      <div class="meta">${ds.length} deck${ds.length===1?'':'s'} · ${sizes.map(([id,n])=>`${n} × ${esc(deckName(ds.find(d=>d.lib===id).L))}`).join(' · ')}<br>${new Date().toISOString().slice(0,10)}</div></div>
    ${sizes.length>1?`<p class="note" style="color:#b4520f;font-weight:600">${sizes.length} different deck sizes on this home. Keep to one size where you can: the same frames, the same screw layout, no mix-ups.</p>`:''}
    <div class="sheet-tools edit-only">${ocSeg()}</div>
    <div class="tblwrap">${takeoffHTML(T, ds.length)}</div>
    <div class="tblwrap" style="margin-top:10px"><div class="eyebrow" style="color:#555;margin-bottom:4px">Per deck</div><table class="boxes"><thead><tr><th>Deck</th><th>Size</th><th>Joists</th><th>Pieces</th></tr></thead><tbody>
      ${ds.map(d=>`<tr><td>Deck ${d.k+1}</td><td>${esc(deckName(d.L))}</td><td>${joistCentres(d.L).length}</td><td>${deckMembers(d.L).length}</td></tr>`).join('')}</tbody></table></div>`;
  bindOC(el, ()=>{ buildHome(); renderDecksTakeoff(el); });
}
export { renderDeckSheet, renderDecksTakeoff };
