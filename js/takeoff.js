/* Cubit Builder — takeoff.js : everything it takes to build the home on screen, grouped by build stage
   (Foundation → Floor → Walls → Roof → Decks → Windows & doors → Fasteners), and the shopping list made from it.
   Used by the Take-off and Shopping views (phone tabs, and sheets on bigger screens). */
import { MODELS } from './data.js';
import { ICF, DECK } from './config.js';
import { fin, fft } from './format.js';
import { state, foundationOf } from './state.js';
import { screwPlan, padsFor, deckList, slotsFor } from './layout.js';
import { concretePlan } from './concrete.js';
import { homeFraming, podRims, framingTakeoff } from './framing.js';
import { deckTakeoff, deckName } from './deckframe.js';
import { homePlans } from './labels.js';
import { bodyWall } from './panels.js';
import { pickFor } from './state.js';
import { unitFor, catOf, TYPES } from './units.js';

const yd3 = ft3 => ft3/27;
/* item: { n, what, len?, note? } — n pieces of `what`, each `len` inches long when it's a cut piece */
function homeTakeoff(){
  const stages=[], add=(id,title,items,note='')=>{ if(items.length) stages.push({id,title,items,note}); };
  const walls=homeFraming(), rims=podRims();
  const byKind=(pred)=>{ const g={}; walls.forEach(W=>W.pieces.filter(pred).forEach(p=>{ const what=p.kind==='Spline'?'½″ OSB spline, 3½″':p.kind==='Corner stud'?`${p.lumber} ripped to ${fin(p.rip)}`:p.lumber; const k=p.kind+'|'+what+'|'+p.len.toFixed(2); (g[k] ||= {n:0, what, len:p.len, note:p.kind.toLowerCase()}).n++; })); return Object.values(g).sort((a,b)=>a.note.localeCompare(b.note)||b.len-a.len); };
  // Foundation
  { const items=[];
    if(foundationOf(state.model)==='concrete'){
      const c=concretePlan(state.model);
      items.push({n:+yd3(c.footVol).toFixed(2), what:`yd³ concrete, footing ${fin(ICF.footW)} × ${fin(ICF.footT)}`, note:`${fft(c.footArea/c.FW*12)} of footing`});
      items.push({n:c.blocks, what:`${c.brand.name} blocks, ${fin(c.C*12)} core`, note:`perimeter ${fft(c.coreLen*12)} · ${c.corners.out} outside + ${c.corners.in} inside corners`});
      if(c.secLen) items.push({n:c.blocksIn, what:`${c.brand.name} blocks, ${fin(c.CI*12)} core`, note:`inside supports ${fft(c.secLen*12)} (${c.sections.length})`});
      items.push({n:+yd3(c.coreVol).toFixed(2), what:'yd³ concrete, ICF core fill', note:'net, order ~10% more'});
      items.push({n:c.ends+(c.access?2:0), what:'ICF end caps', note:c.access?'inside supports + crawl access':'inside supports'});
    } else {
      const sc=screwPlan(state.model, state.inset).screws, h={}; sc.forEach(q=>{ h[q.head]=(h[q.head]||0)+1; });
      Object.entries(h).forEach(([k,n])=>items.push({n, what:`ground screw, ${k} head`, note:k==='swivel'?'perimeter':'shared in the joints'}));
    }
    if(foundationOf(state.model)==='concrete'){ const ds=screwPlan(state.model, state.inset).screws.length; if(ds) items.push({n:ds, what:'ground screw (decks)', note:'outer edges only'}); }
    const pads=padsFor(state.model, state.inset).length; if(pads) items.push({n:pads, what:'concrete pad (floating decks)'});
    add('found','Foundation',items);
  }
  // Floor: LVL rims and the bottom plates that go on the floor first
  add('floor','Floor',[
    ...groupRims(rims,'Floor rim LVL','LVL 1⅞″ × 9¼″'),
    ...byKind(p=>p.kind==='Bottom plate').map(x=>({...x, note:'bottom plate · on the floor · bevel 2 top corners ¾″'}))]);
  // Walls: SIP panels, studs, jacks, splines
  { const plans=homePlans(), g={};
    plans.forEach(pl=>pl.panels.forEach(p=>{ const t=pl.slot.type==='int'?'4½″ interior':'6½″ exterior', k=t+'|'+(p.cut?p.width.toFixed(2):'full'); (g[k] ||= {n:0, what:`SIP panel ${t}`, len:p.cut?p.width:48, note:p.cut?'cut to width':'full 48″ × 96″'}).n++; }));
    add('walls','Walls',[...Object.values(g).sort((a,b)=>a.what.localeCompare(b.what)||b.len-a.len), ...byKind(p=>!/plate/.test(p.kind))]); }
  // Roof: LVL rims and the top plates that go on the ceiling
  add('roof','Roof & ceiling',[
    ...groupRims(rims,'Roof rim LVL','LVL 1⅞″ × 11⅞″'),
    ...byKind(p=>p.kind==='Top plate').map(x=>({...x, note:'top plate · on the ceiling · bevel 2 bottom corners ¾″'}))]);
  // Decks
  { const ds=deckList(state.model);
    if(ds.length){ const T=deckTakeoff(ds.map(d=>d.L));
      add('decks','Decks',[...T.cuts.map(c=>({n:c.n, what:'2×8', len:c.len, note:c.name.toLowerCase()})),
        {n:T.boardsN, what:DECK.board.name, len:ds[0].L.D, note:'deck boards (if supplied)'}, {n:T.angles, what:DECK.angle, len:T.angleLen, note:'corner spines'}],
        `${ds.length} deck${ds.length>1?'s':''}`); } }
  // Windows & doors
  { const g={}; let open=0;
    slotsFor(state.model).forEach(s=>{ const w=bodyWall(s, pickFor(s)); (w?.openings||[]).filter(catOf).forEach(o=>{ const r=unitFor(s,o);
      if(r){ const k=r.unit.id; (g[k] ||= {n:0, what:r.unit.name, note:`${TYPES[r.unit.type]?.label||''} · ${r.unit.id}`}).n++; }
      else if(!(s.type==='int' && catOf(o)==='door')) open++; }); });
    const items=Object.values(g); if(open) items.push({n:open, what:'opening with no unit chosen', note:'choose in the wall panel'});
    add('units','Windows & doors',items); }
  // Fasteners
  add('fast','Fasteners',[{n:rims.length*4*18, what:'3½″ Dynobite screw', note:`Einspines: 18 each × ${rims.length*4}`}]);
  return stages;
}
function groupRims(rims, name, what){
  const g={}; rims.forEach(R=>R.pieces.filter(p=>p[0]===name).forEach(([nm,h,len,n])=>{ const k=len.toFixed(2); (g[k] ||= {n:0, what, len, note:nm.toLowerCase()}).n+=n; }));
  return Object.values(g).sort((a,b)=>b.len-a.len);
}
/* what to buy, as lines with stable keys (so check-offs stick) */
function shoppingList(){
  const lines=[], add=(group, n, what)=>{ if(n>0) lines.push({group, n, what, key:(group+'|'+what).replace(/\s+/g,' ')}); };
  if(foundationOf(state.model)==='concrete'){ const c=concretePlan(state.model);
    add('Foundation', +(yd3(c.footVol+c.coreVol)*1.1).toFixed(1), 'yd³ concrete (footing + core, incl. 10%)');
    add('Foundation', c.blocks, `${c.brand.name} block ${fin(c.C*12)} core`); if(c.secLen) add('Foundation', c.blocksIn, `${c.brand.name} block ${fin(c.CI*12)} core`);
    add('Foundation', c.ends+(c.access?2:0), 'ICF end cap');
  }
  { const sc=screwPlan(state.model, state.inset).screws, h={}; sc.forEach(q=>{ h[q.head]=(h[q.head]||0)+1; }); Object.entries(h).forEach(([k,n])=>add('Foundation', n, `ground screw, ${k} head`)); }
  add('Foundation', padsFor(state.model, state.inset).length, 'concrete pad 16″ × 16″');
  framingTakeoff().forEach(g=>(g.order||[]).forEach(o=>add(/screw/i.test(o.what)?'Fasteners':'Lumber & LVL', o.n, o.what)));
  const ds=deckList(state.model);
  if(ds.length){ const T=deckTakeoff(ds.map(d=>d.L));
    Object.entries(T.frame.byLen).forEach(([ft,n])=>add('Decks', n, `2×8 × ${ft}′`));
    Object.entries(T.deckBoards.byLen).forEach(([ft,n])=>add('Decks', n, `${DECK.board.name} × ${ft}′`));
    add('Decks', T.angles, `${DECK.angle} × ${fin(T.angleLen)}`); }
  const u={}; slotsFor(state.model).forEach(s=>{ const w=bodyWall(s, pickFor(s)); (w?.openings||[]).filter(catOf).forEach(o=>{ const r=unitFor(s,o); if(r) u[r.unit.name+' ('+r.unit.id+')']=(u[r.unit.name+' ('+r.unit.id+')']||0)+1; }); });
  Object.entries(u).forEach(([k,n])=>add('Windows & doors', n, k));
  return lines;
}
const lenTxt = l => l ? ` @ ${fin(l)}${l>=24?` (${fft(l)})`:''}` : '';
function takeoffHTML(){
  const st=homeTakeoff(), m=MODELS[state.model];
  return `<div class="to-head"><div class="eyebrow">Take-off · by build stage</div><h3>${m.name}</h3></div>`+
    st.map((s,i)=>`<details class="to-stage" ${i<2?'open':''}><summary><b>${s.title}</b><span>${s.items.reduce((a,x)=>a+(Number.isInteger(x.n)?x.n:0),0) || ''}${s.note?' · '+s.note:''}</span></summary>
      <ul class="to-list">${s.items.map(x=>`<li><span class="to-n">${x.n}</span><span class="to-w"><b>${x.what}${lenTxt(x.len)}</b>${x.note?`<small>${x.note}</small>`:''}</span></li>`).join('')}</ul></details>`).join('');
}
function shoppingText(lines){
  const m=MODELS[state.model]; let t=`${m.name} — shopping list\n`, g='';
  lines.forEach(l=>{ if(l.group!==g){ g=l.group; t+=`\n${g}\n`; } t+=`  ${l.n} × ${l.what}\n`; });
  return t;
}
export { homeTakeoff, shoppingList, takeoffHTML, shoppingText };
