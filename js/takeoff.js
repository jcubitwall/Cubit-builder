/* Cubit Builder — takeoff.js : everything it takes to build the home on screen, grouped by build stage
   (Foundation → Floor → Walls → Roof → Decks → Windows & doors → Fasteners), and the shopping list made from it.
   Used by the Take-off and Shopping views (phone tabs, and sheets on bigger screens). */
import { MODELS, SIDINGLIB } from './data.js';
import { ICF, DECK, FRAME } from './config.js';
import { fin, fft } from './format.js';
import { state, foundationOf } from './state.js';
import { screwPlan, padsFor, deckList, slotsFor, podList, upstairs, layerSlotsFor } from './layout.js';
import { stairsOf } from './stairs.js';
import { UP, EPS_PAD, LAYER_KINDS, WALL_BASE, FLOOR, PW } from './config.js';
import { concretePlan } from './concrete.js';
import { homeFraming, podRims, framingTakeoff, floorBuilds, roofBuilds } from './framing.js';
import { deckTakeoff, deckName } from './deckframe.js';
import { homePlans } from './labels.js';
import { bodyWall } from './panels.js';
import { pickFor } from './state.js';
import { unitFor, catOf, TYPES } from './units.js';
import { sealRole, sealsFor, SEAL } from './seals.js';
import { H, sidingSpan, SIDING } from './config.js';
/* compression seal around every opening between pods (both pods): [{n, len} …] and total inches */
function sealRun(){ const sl=slotsFor(state.model); let tot=0, n=0, hi=0; sl.forEach(s=>{ const r=sealRole(s, sl); sealsFor(bodyWall(s,pickFor(s)), r, H).forEach(x=>{ tot+=x.len; n++; if(r==='high') hi++; }); }); return {tot, n, hi}; }

const yd3 = ft3 => ft3/27;
/* the second floor: the 1″ EPS pad where the upstairs pods sit on a pod below (their floors are built like the ground
   floor's, counted with it, less the steel frame and ACM), and the 8×8 posts
   under an overhang of 8′ or more, each on a ground screw or a 10″ Sonotube (as the house's foundation) */
const TUBE = { d:10, deep:50 };   // inches: 10″ Sonotube, 4′ 2″ into the ground (below frost)
/* every second-floor shopping line there can be (both foundations), so the price book always lists them */
function upstairsBuyLines(){ const L=(UP-WALL_BASE)+FLOOR*12, st=Math.ceil(L/24-1e-6)*2;
  return [`EPS ${EPS_PAD}″ sheet 4 × 8 (pad under upstairs pods)`, `8×8 pressure-treated post × ${st}′`, '8×8 post base', `${TUBE.d}″ Sonotube × 4′`, 'yd³ concrete (Sonotubes, incl. 10%)', 'ground screw, post head'].map(what=>({ group:'Upper floors', what })); }
function upstairsTakeoff(k=state.model){
  const ups=podList(k).filter(p=>p.lv); if(!ups.length) return null;
  const U=upstairs(k), conc=foundationOf(k)==='concrete';
  // less the stair openings that go through it
  const SH=stairsOf(k).filter(st=>st.above!=null).flatMap(st=>st.holes);
  const ov=(e,H)=>Math.max(0, Math.min(e.x1,H.x1)-Math.max(e.x,H.x)) * Math.max(0, Math.min(e.z1,H.z1)-Math.max(e.z,H.z));
  const epsSqft=U.eps.reduce((a,e)=>a+(e.x1-e.x)*(e.z1-e.z) - SH.reduce((b,H)=>b+ov(e,H),0), 0);
  // each post: from the underside of the home (screw cap / tube top), or from the roof of a pod further down it lands
  // on, up to the underside of its pod's floor
  const roofTop = r => LAYER_KINDS.roof.z+LAYER_KINDS.roof.t-WALL_BASE + r*UP;
  const lens=U.posts.map(q=>{ const top=q.lv*UP-WALL_BASE, bot = q.rest<0 ? -FLOOR*12 : roofTop(q.rest); return { len:top-bot, ground:q.rest<0 }; });
  const byStock={}; lens.forEach(l=>{ const st=Math.ceil(l.len/24-1e-6)*2; (byStock[st] ||= { stock:st, n:0, len:0 }).n++; byStock[st].len=Math.max(byStock[st].len, l.len); });   // 8×8s come in even feet
  const postLen=lens.length ? Math.max(...lens.map(l=>l.len)) : 0, stock=Math.ceil(postLen/24-1e-6)*2;
  const tubeYd3=yd3(Math.PI*(TUBE.d/24)**2*(TUBE.deep/12));
  return { pods:ups.length, epsSqft, epsSheets:Math.ceil(epsSqft*1.1/32-1e-6), posts:U.posts.length, grounded:lens.filter(l=>l.ground).length, stocks:Object.values(byStock).sort((a,b)=>a.stock-b.stock), postLen, stock, conc, tubeYd3,
    floors:Math.max(...ups.map(p=>p.lv))+1 };
}
/* siding (config.js SIDING): every exterior side of every pod, in full-height panels of the library's profile (Rando Rib),
   each cut to the floor's siding length: ½″ over the steel frame (½″ under the floor upstairs) to 1″ under the roof.
   Panels per side = the side's length / the profile's cover width, rounded up; openings aren't taken off (the
   panels are cut around them on the wall). Corner and top / bottom trims aren't in yet. */
function sidingTakeoff(k=state.model){
  const P=SIDINGLIB.find(x=>x.id==='rando-rib') || SIDINGLIB[0]; if(!P) return null;
  const runs={};
  slotsFor(k).filter(s=>s.type==='ext').forEach(s=>{ const r=(runs[s.pod.i+'|'+s.side] ||= { lv:s.pod.lv||0, len:0 }); r.len+=s.len*12; });
  const by={};
  Object.values(runs).forEach(r=>{ const S=sidingSpan(r.lv), key=S.len.toFixed(3); const b=(by[key] ||= { n:0, len:S.len, lv:r.lv, run:0, sides:0, S });
    b.n+=Math.ceil(r.len/P.cover-1e-6); b.run+=r.len; b.sides++; });
  return { P, lines:Object.values(by).sort((a,b)=>a.lv-b.lv) };
}
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
    ...groupRims(rims,'Floor rim LVL','LVL 1⅞″ × 9½″'),
    ...byKind(p=>p.kind==='Bottom plate').map(x=>({...x, note:'bottom plate · on the floor · bevel 2 top corners ¾″'})),
    ...(()=>{ const B=floorBuilds(), eps={}; let blocks=0; B.forEach(b=>{ blocks+=b.blocks.length; b.epsLens.forEach(l=>{ const k=l.toFixed(2); (eps[k] ||= {n:0, what:'EPS strip 8″ × 1½″', len:l, note:'floor gap, against the rims'}).n++; }); });
      let frames=0, acp=0; const tube={}; B.forEach(b=>{ frames+=b.frames.length; acp+=b.acp.length; b.tubeLens.forEach(l=>{ const k=l.toFixed(2); (tube[k] ||= {n:0, what:'Steel tube 2″ × 3″', len:l, note:'floor frame'}).n++; }); });
      return [...(frames?[{n:frames, what:'Steel floor frame 8′ × 8′', note:'2″ × 3″ tube · one per 8′ of pod'}, ...Object.values(tube).sort((a,b)=>b.len-a.len)]:[]), ...(acp?[{n:acp, what:'ACM 2 mm sheet 4 × 8', note:'underside of the floor'}]:[]),
        ...Object.values(eps).sort((a,b)=>b.len-a.len), ...(blocks?[{n:blocks, what:'2×4', len:16, note:'floor joint block · flat across each panel joint, at 32″ and 64″'}]:[])]; })()]);
  // Walls: SIP panels, studs, jacks, splines
  { const plans=homePlans(), g={};
    plans.forEach(pl=>pl.panels.forEach(p=>{ const t=pl.slot.type==='int'?'4½″ interior / connecting':'6½″ exterior', k=t+'|'+(p.cut?p.width.toFixed(2):'full'); (g[k] ||= {n:0, what:`SIP panel ${t}`, len:p.cut?p.width:48, note:p.cut?'cut to width':'full 48″ × 96″'}).n++; }));
    add('walls','Walls',[...Object.values(g).sort((a,b)=>a.what.localeCompare(b.what)||b.len-a.len), ...byKind(p=>!/plate/.test(p.kind))]); }
  // Roof: LVL rims and the top plates that go on the ceiling
  // SilverBack (butyl skin): two layers over every flat roof, wrapping down over the LVL rim on the sides where pods meet
  const SB=(()=>{ const sl=slotsFor(state.model); let roof=0, wrap=0; podList(state.model).forEach(p=>{ roof+=p.len*8; });
    sl.filter(s=>s.type==='int').forEach(s=>{ wrap+=s.len*(FRAME.lvl.roof/12); }); return {roof, wrap, total:2*(roof+wrap)}; })();
  add('roof','Roof & ceiling',[
    {n:Math.ceil(SB.total*1.1), what:'sq ft SilverBack butyl skin', note:`2 layers · roof ${SB.roof} sq ft + down the LVL rim where pods meet ${SB.wrap.toFixed(0)} sq ft · +10%`},
    ...groupRims(rims,'Roof rim LVL','LVL 1⅞″ × 11⅞″'),
    ...(()=>{ const B=roofBuilds(), eps={}; let blocks=0; B.forEach(b=>{ blocks+=b.blocks.length; b.epsLens.forEach(l=>{ const k=l.toFixed(2); (eps[k] ||= {n:0, what:'EPS strip 8″ × 1⅞″', len:l, note:'ceiling–roof gap, against the rims'}).n++; }); });
      return [...Object.values(eps).sort((a,b)=>b.len-a.len), ...(blocks?[{n:blocks, what:'LVL block 1⅞″ × 3½″', len:16, note:'roof joint block · flat across each ceiling panel joint, at 32″ and 64″ · LVL offcuts'}]:[])]; })(),
    ...byKind(p=>p.kind==='Top plate').map(x=>({...x, note:'top plate · on the ceiling · bevel 2 bottom corners ¾″'}))]);
  // Decks
  { const ds=deckList(state.model);
    if(ds.length){ const T=deckTakeoff(ds.map(d=>d.L));
      add('decks','Decks',[...T.cuts.map(c=>({n:c.n, what:'2×8', len:c.len, note:c.name.toLowerCase()})),
        {n:T.boardsN, what:DECK.board.name, len:ds[0].L.D, note:'deck boards (if supplied)'}, {n:T.angles, what:DECK.angle, len:T.angleLen, note:'corner spines'}],
        `${ds.length} deck${ds.length>1?'s':''}`); } }
  // Second floor
  { const T=upstairsTakeoff(); if(T){ const items=[
      {n:+T.epsSqft.toFixed(1), what:`sq ft EPS pad ${EPS_PAD}″`, note:`only where an upstairs pod sits on a pod below · ${T.epsSheets} sheets 4 × 8 with 10%`}];
    if(T.posts){ T.stocks.forEach(s=>items.push({n:s.n, what:'8×8 post', len:s.len, note:`under overhangs of 8′ or more · cut from ${s.stock}′ stock`}));
      items.push({n:T.posts, what:'8×8 post base', note:T.grounded<T.posts ? `${T.grounded} on the ground, ${T.posts-T.grounded} on the roof of a pod further down` : T.conc?'anchored in the Sonotube':'on the ground screw cap'});
      const g=T.grounded; if(g){ if(T.conc){ items.push({n:g, what:`${TUBE.d}″ Sonotube`, len:TUBE.deep, note:'below frost'}); items.push({n:+(T.tubeYd3*g).toFixed(2), what:'yd³ concrete, Sonotube fill', note:'net, order ~10% more'}); }
      else items.push({n:g, what:'ground screw, post head', note:'one under each post on the ground'}); } }
    add('up','Upper floors',items,`${T.pods} pod${T.pods>1?'s':''} above the ground floor, ${T.floors} floors`); } }
  // Siding
  { const T=sidingTakeoff(); if(T){ const P=T.P;
    add('siding','Siding',T.lines.map(b=>({ n:b.n, what:`${P.name} panel, ${fin(P.cover)} cover`, len:b.len,
      note:`${b.lv?'upper floor · ½″ below the floor':'ground floor · ½″ over the steel frame'} to 1″ under the roof · ${b.sides} side${b.sides>1?'s':''}, ${fft(b.run)} of wall · openings not taken off` })),
      `${P.material||'Metal'} · ${fin(P.depth)} deep · trims to come`); } }
  // Windows & doors
  { const g={}; let open=0;
    slotsFor(state.model).forEach(s=>{ const w=bodyWall(s, pickFor(s)); (w?.openings||[]).filter(catOf).forEach(o=>{ const r=unitFor(s,o);
      if(r){ const k=r.unit.id; (g[k] ||= {n:0, what:r.unit.name, note:`${TYPES[r.unit.type]?.label||''} · ${r.unit.id}`}).n++; }
      else if(!(s.type==='int' && catOf(o)==='door')) open++; }); });
    const items=Object.values(g); if(open) items.push({n:open, what:'opening with no unit chosen', note:'choose in the wall panel'});
    add('units','Windows & doors',items); }
  // Compression seal between pods
  { const S=sealRun(); if(S.n) add('seal','Seals on connecting walls',[{n:+(S.tot/12*1.1).toFixed(0), what:`ft · ${SEAL.name}`, note:`${S.n} runs around openings (${S.hi} high, ${S.n-S.hi} low) · ${fft(S.tot)} net + 10%`}]); }
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
  framingTakeoff().forEach(g=>(g.order||[]).forEach(o=>add(/screw/i.test(o.what)?'Fasteners':/steel|ACM/i.test(o.what)?'Steel frame & ACM':/EPS/.test(o.what)?'Insulation':'Lumber & LVL', o.n, o.what)));
  const ds=deckList(state.model);
  if(ds.length){ const T=deckTakeoff(ds.map(d=>d.L));
    Object.entries(T.frame.byLen).forEach(([ft,n])=>add('Decks', n, `2×8 × ${ft}′`));
    Object.entries(T.deckBoards.byLen).forEach(([ft,n])=>add('Decks', n, `${DECK.board.name} × ${ft}′`));
    add('Decks', T.angles, `${DECK.angle} × ${fin(T.angleLen)}`); }
  { const T=upstairsTakeoff(); if(T){ add('Upper floors', T.epsSheets, `EPS ${EPS_PAD}″ sheet 4 × 8 (pad under upstairs pods)`);
    if(T.posts){ T.stocks.forEach(s=>add('Upper floors', s.n, `8×8 pressure-treated post × ${s.stock}′`)); add('Upper floors', T.posts, '8×8 post base');
      const g=T.grounded; if(g){ if(T.conc){ add('Upper floors', g, `${TUBE.d}″ Sonotube × 4′`); add('Upper floors', +(T.tubeYd3*g*1.1).toFixed(2), 'yd³ concrete (Sonotubes, incl. 10%)'); }
      else add('Upper floors', g, 'ground screw, post head'); } } } }
  { const T=sidingTakeoff(); if(T) T.lines.forEach(b=>add('Siding', b.n, `${T.P.name} panel ${fin(T.P.cover)} cover × ${fin(b.len)}`)); }
  const u={}; slotsFor(state.model).forEach(s=>{ const w=bodyWall(s, pickFor(s)); (w?.openings||[]).filter(catOf).forEach(o=>{ const r=unitFor(s,o); if(r) u[r.unit.name+' ('+r.unit.id+')']=(u[r.unit.name+' ('+r.unit.id+')']||0)+1; }); });
  Object.entries(u).forEach(([k,n])=>add('Windows & doors', n, k));
  { const S=sealRun(); if(S.n) add('Seals', +(S.tot/12*1.1).toFixed(0), `ft · ${SEAL.name}`); }
  { const sl=slotsFor(state.model); const t=2*(podList(state.model).reduce((a,p)=>a+p.len*8,0) + sl.filter(s=>s.type==='int').reduce((a,s)=>a+s.len*FRAME.lvl.roof/12,0)); add('Roof', Math.ceil(t*1.1), 'sq ft SilverBack butyl skin (2 layers)'); }
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
export { sidingTakeoff, upstairsBuyLines, upstairsTakeoff, homeTakeoff, shoppingList, takeoffHTML, shoppingText };
