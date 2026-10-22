/* Cubit Builder — deckframe.js : how every deck is framed (Cubit's rules, whatever frame size it is) and the
   lumber takeoff. A deck is drawn in its own inches: u along the house (0..W), v out from the house (0..D);
   the ledger side (v = 0) is the side that docks to the house or to another deck.

   · Perimeter: double 2×8 all round. The outer ply of the house and far rims runs between the corner notches,
     the inner ply between the side rims; both side plies run between the notches.
   · Corners: a 1½″ × 1½″ notch at every corner for the angle-iron spine.
   · Joists: single 2×8 parallel to the house, 24″ (or 16″) on centre measured from the house side of the deck, between
     the side rims. The last space (to the far rim) is whatever is left. */
import { DECK } from './config.js';
import { state, deckOCOf, setDeckOC } from './state.js';

function deckMembers(L, oc=deckOCOf(state.model)){
  const W=L.W, D=L.D, t=DECK.ply, n=DECK.notch, out=[];
  // [name, u0, u1, v0, v1]
  out.push(['Ledger rim · outer ply', n, W-n, 0, t], ['Ledger rim · inner ply', 2*t, W-2*t, t, 2*t]);
  out.push(['Far rim · outer ply', n, W-n, D-t, D], ['Far rim · inner ply', 2*t, W-2*t, D-2*t, D-t]);
  out.push(['Side rim · outer ply', 0, t, n, D-n], ['Side rim · inner ply', t, 2*t, n, D-n]);
  out.push(['Side rim · outer ply', W-t, W, n, D-n], ['Side rim · inner ply', W-2*t, W-t, n, D-n]);
  for(let c=oc; c+t/2 <= D-2*t-0.01; c+=oc) out.push(['Joist', 2*t, W-2*t, c-t/2, c+t/2]);
  return out;
}
const joistCentres = L => deckMembers(L).filter(m=>m[0]==='Joist').map(m=>(m[3]+m[4])/2);
const lenOf = m => Math.max(m[2]-m[1], m[4]-m[3]);

/* buy-list: either one board per piece (the shortest standard length that holds it), or cuts packed longest
   first into 16′ boards that are then cut down to the shortest length that holds them. Whichever uses less
   lumber wins; on a tie, one piece per board (shorter, lighter boards, less cutting). */
function packStock(cuts, stock=DECK.stock){
  const fit = len => stock.find(f=>f*12>=len-1e-6);
  const single = cuts.map(c=>{ const ft=fit(c); if(!ft) throw new Error('A piece is longer than 16′'); return {cuts:[c], ft}; });
  const packed=[];
  cuts.slice().sort((a,b)=>b-a).forEach(c=>{
    const b=packed.find(b=>b.left>=c+DECK.kerf-1e-6);
    if(b){ b.cuts.push(c); b.left-=c+DECK.kerf; } else packed.push({cuts:[c], left:stock[stock.length-1]*12-c-DECK.kerf});
  });
  packed.forEach(b=>{ b.ft=fit(b.cuts.reduce((a,c)=>a+c,0)+DECK.kerf*(b.cuts.length-1)); });
  const total = bs => bs.reduce((a,b)=>a+b.ft,0);
  const boards = total(packed) < total(single) ? packed : single;
  const byLen={}; boards.forEach(b=>{ byLen[b.ft]=(byLen[b.ft]||0)+1; });
  return { boards, byLen };
}
/* takeoff for one or many decks: cut list, 2×8 to buy, deck boards, angle-iron spines */
function deckTakeoff(Ls){
  const cuts={}, all=[];
  Ls.forEach(L=>deckMembers(L).forEach(m=>{ const len=lenOf(m), k=m[0].replace(/ · .*/,'')+'|'+len.toFixed(3); (cuts[k] ||= {name:m[0].replace(/ · .*/,''), len, n:0}).n++; all.push(len); }));
  const frame=packStock(all);
  // deck boards run out from the house, across the joists, cut to the deck's depth
  const B=DECK.board, boardCuts=[]; let boardsN=0;
  Ls.forEach(L=>{ const n=Math.ceil((L.W+B.gap)/(B.w+B.gap)); boardsN+=n; for(let i=0;i<n;i++) boardCuts.push(L.D); });
  const deckBoards=packStock(boardCuts);
  return { cuts:Object.values(cuts).sort((a,b)=>a.name.localeCompare(b.name)||b.len-a.len), pieces:all.length, frame, deckBoards, boardsN, angles:Ls.length*4, angleLen:DECK.depth };
}
const deckName = L => `${L.w}′ × ${L.d}′ deck`;
/* which deck frames a home uses, most used first: [[libId, count], ...] */
const deckSizes = m => { const c={}; (m.decks||[]).forEach(d=>{ c[d.lib]=(c[d.lib]||0)+1; }); return Object.entries(c).sort((a,b)=>b[1]-a[1]); };
/* the 16″ / 24″ joist spacing switch (one setting for all the decks of a home); bindOC wires it up */
const ocSeg = () => `<div class="fld">Deck joists, on centre (all decks on this home)<div class="seg" role="group" aria-label="Deck joist spacing">${[16,24].map(v=>`<button class="fsbtn" data-oc="${v}" aria-pressed="${deckOCOf(state.model)===v}">${v}″</button>`).join('')}</div></div>`;
function bindOC(root, after){ root.querySelectorAll('[data-oc]').forEach(b=>b.onclick=()=>{ setDeckOC(state.model, +b.dataset.oc); after(); }); }
export { packStock, ocSeg, bindOC, deckName, deckSizes, deckMembers, joistCentres, deckTakeoff, lenOf };
