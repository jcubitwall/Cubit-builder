/* Cubit Builder — electrical.js : plugs and switches laid out by rule.

   New homes (and any wall swapped in, or pod added, in an older home) take no plugs or switches from the wall
   library: they're laid out here from the rooms, the doors and the cabinets, every time something changes, and
   cut into the walls like any other box (3D, panel sheets, CNC, blueprints). The team can still add, remove and
   move boxes; those changes are kept with the home (MODELS[k].elec.ov) and survive every re-layout.

   The rules (Canadian Electrical Code, as used in Nova Scotia; heights to the box centre):
     · No plug under a window: it goes to the nearest chase beside it (left or right).
     · Plugs 16″. Along the floor line no point of usable wall is more than 1.8 m (70 7/8″) from a plug, so plugs are
       never more than 3.6 m apart; any stretch of wall 900 mm (35 7/16″) or longer gets one. Doorways, full-height
       glass, the wall behind a door swung open and walls behind fixed cabinets, appliances, tubs and showers aren't
       usable wall and break the run. The run carries on around corners. Bathrooms only need the basin plug.
     · Kitchen counters: plugs at 42″ so no point along the counter is more than 900 mm from one; none behind the
       range or the sink.
     · Bathroom basin: a GFCI plug at 42″ within 1 m of the basin.
     · No plug within 500 mm of a bathtub or shower, measured across the floor in the same room (plumbing.js).
     · Appliances get their own plug behind them: fridge 42″, range 6″, dishwasher 12″ (or in the sink cabinet),
       washer / dryer 42″, microwave 42″ (over the range: in the cabinet above).
     · Bedside: a plug each side of the head of a bed that's against a wall.
     · Desk against a wall: a plug behind it, 12″ above the top.
     · TV on the wall: a recessed TV box behind the screen, clear of the wall mount, on the chase nearest the middle.
   Furniture's own plugs (appliances, basin GFCI, counters, bedside, desk) go on every wall, even one that keeps the
   library's plugs and switches; the rest (wall plugs, switches, outside, data) only on walls by the rules.
     · Outside: at least one weatherproof plug, beside the main door.
     · Switches 48″, centre 6″ from the door's rough opening on the side you walk through at (a man door: the latch side;
       a patio slider: the moving panel's side), on the side the door swings into. A door in a middle wall: on the middle
       wall beside its latch, else round the corner on the wall it meets. Nothing goes where a middle wall meets a wall,
       and a door's switch never walks past a middle wall into the next room.
       (an outside door: inside). A room with two or more entrances gets 3-way switches (confirmed by the team).
       An outside door gets a double box (the room's lights + the outside light).
     · Walls between pods: boxes only on the face toward the wall's own pod.
     · Data boxes (network / TV) are optional per home: the TV wall in front of a sofa and opposite each bed, 16″.
     · Baseboard heater: its wire comes out of the wall 3″ up from the floor, 3″ in from the heater's right end (seen
       from the room). The CNC routes it from the nearest usable chase (one not cut by a window or door), on the room
       face: a hole straight into the chase at 6″ up, the bit down to the middle of the SIP (whatever its thickness), a 3″
       radius curve toward the heater that levels out at 3″ up, then straight along to the wire spot. The depth comes up
       steadily from the middle of the panel (starting on the curve) to 1″ deep at the wire spot. ¾″ SIP cutter (tool 13).
   Chases first: every box sits on an electrical chase (wall-rules.js: 6″ in from each edge of the original 48″
   panel, then every 12″; dead centre first, nudged up to 2″ either way if it has to be) when one is within reach (18″ for plugs, 6″ for switches) of where the rule wants it,
   and clear of openings, panel joints, cabinets and other boxes. Otherwise it stays where the rule wants it and is
   flagged "needs a chase".
   Shared by everyone through the home (drafts, projects, Cubit Homes). */
import { MODELS, saveCustomModels } from './data.js';
import { state, save, wkey } from './state.js';
import { panelSpans, setElecHook, isElecBox } from './panels.js';
import { homeModel, podInterior } from './blueprint.js';
import { itemDef, firePower } from './casework.js';
import { ensureDraft } from './pods.js';
import { deviceById, defaultDevice } from './devices.js';
import { checkpoint } from './history.js';
import { FT } from './config.js';
import { fin } from './format.js';

const H = { plug:16, counter:42, gfci:42, switch:48, double:48, data:16, wp:16, tvr:48, light:66 };
const REACH = { plug:18, counter:18, gfci:18, appl:18, data:18, wp:18, switch:6, double:6, jbox:6, tvr:36 };
const R_WALL = 70.866, R_COUNTER = 35.433, MIN_RUN = 35.433, MIN_COUNTER = 11.8, BASIN = 39.37;
const NUDGE = 2;   // a box up to 2″ either side of a chase's centre still counts as on it (centre first)
const SW_OFF = 6, CORNER = 3, JOINT = 2.9, STUD = 1.5, BOX_GAP = 4;
const BOX = { std:{w:2.375, h:3.375}, double:{w:4.125, h:3.625}, jbox:{w:4.375, h:4.375} };   // jbox: a 4″ square junction box (boxes.js)
/* box size by gang (single / double / triple): any box can be set to any of them, per home (ov.g) */
const GANG = { 1:{w:2.375, h:3.375}, 2:{w:4.125, h:3.625}, 3:{w:5.875, h:3.625} };
const gangOf = b => b.g || (b.rk==='double' || b.rk==='tvr' ? 2 : 1);
/* what each switch in a switch box does (one per gang), for the electrician */
const CONTROLS = { room:'Room lights', pot:'Pot lights', out:'Outside light', fan:'Exhaust fan', cfan:'Ceiling fan', ucab:'Under-cabinet lights', pend:'Pendant / island lights', wall:'Wall light', splug:'Switched plug', other:'Other', none:'Not set yet' };
const SWITCHY = new Set(['switch','double']);   // a recessed TV box: double size to start
const NAME = { light:'Wall light box', plug:'Plug box', counter:'Counter plug box', gfci:'GFCI plug box', appl:'Appliance plug box', switch:'Switch box', double:'Double switch box', data:'Data box', wp:'Outside plug (WP)', jbox:'Junction box (hardwired)', tvr:'Recessed TV box' };
/* receptacles (not switches) never go under a window: anywhere below its sill, from 1½″ outside one side to 1½″
   outside the other */
const RCPT = new Set(['plug','counter','gfci','appl','data','wp','tvr']);
const underWindow = (W, a, y, hw=BOX.std.w/2) => (W.w.openings||[]).some(op=>op.kind==='window' && y<op.y && a+hw+STUD>op.x && a-hw-STUD<op.x+op.w);
const NUDGES = [0,0.5,-0.5,1,-1,1.5,-1.5,2,-2];
/* a box placed or moved by hand on a wall that has since got shorter (a middle wall cut back, a pod change): pulled
   back onto the wall, to the nearest chase inside it, and flagged; never left hanging past the wall's end */
function onWall(W, a){
  const lo=CORNER+1.25, hi=W.Lin-CORNER-1.25; if(a>=lo && a<=hi) return { a, moved:false };
  const c=W.chases.filter(x=>x>=lo && x<=hi).sort((p,q)=>Math.abs(p-a)-Math.abs(q-a))[0];
  return { a:+(c ?? Math.max(lo, Math.min(hi, a))).toFixed(3), moved:true };
}
const onChase = (W, a) => W.chases.some(c=>Math.abs(c-a)<=NUDGE+0.01);
const ROUND = v => Math.round(v*8)/8;
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------------------------------------------------------------- which walls follow the rules */
const elecOf = (k=state.model) => MODELS[k]?.elec || null;
const homeAuto = (k=state.model) => !!elecOf(k)?.auto;
const usesRules = (k=state.model) => { const E=elecOf(k); return !!E && (E.auto || Object.keys(E.walls||{}).length>0) || (MODELS[k]?.pods||[]).some(p=>p.elec); };
function slotAuto(slot, k=state.model){
  const E=elecOf(k); if(E?.auto) return true;
  if(slot?.pod?.elec) return true;
  return !!E?.walls?.[wkey(slot)];
}
/* change the home's electrical settings (a protected home becomes a draft first) */
function editElec(fn){
  checkpoint(); const k=ensureDraft(); const m=MODELS[k];
  m.elec = m.elec ? clone(m.elec) : {}; fn(m.elec); if(m.custom) saveCustomModels(); save(); return k;
}

/* ---------------------------------------------------------------- what the furniture is */
function applKind(I){
  const k=I.it.k||'', n=(I.def.name||'').toLowerCase();
  if(/microwave/.test(n)) return 'microwave';
  if(I.cat!=='appliance') return null;
  if(/^FR/.test(k)) return /U$/.test(k) ? 'under' : 'fridge';
  if(/^RG/.test(k)) return 'range';
  if(/^DW/.test(k)) return 'dw';
  if(/^WD/.test(k)) return 'washer';
  return null;   // hood: wired from the cabinet above, by the electrician
}
const APPL = { fridge:{y:42, n:'Fridge'}, under:{y:16, n:'Under-counter fridge'}, range:{y:6, n:'Range (40 A)'}, dw:{y:12, n:'Dishwasher'}, washer:{y:42, n:'Washer / dryer'}, microwave:{y:42, n:'Microwave'} };
const isBasin = I => (I.cat==='vanity' && /sink/i.test(I.def.name||'')) || (I.cat==='bath' && /sink|basin|lav/i.test(I.def.name||''));
const isWet = I => I.cat==='bath' && /^(WC|SH|TS|BT)/.test(I.it.k||'');
/* tubs and showers: no receptacle within 500 mm of one (across the floor, same room) */
const TUB_CLEAR = 19.685;
const isTub = I => I.cat==='bath' && /^(SH|TS|BT|LPG-SH)/.test(I.it.k||'');
const tubsOf = Hm => Hm.items.filter(isTub).map(I=>({ pod:I.it.pod, pts:[I.f(-I.it.w/2,0), I.f(I.it.w/2,0), I.f(I.it.w/2,I.it.d), I.f(-I.it.w/2,I.it.d)] }));
function distToQuad(P, Q){   // feet: 0 inside the (convex) quad, else to the nearest edge
  let inside=true, sg=0, best=Infinity;
  for(let i=0;i<4;i++){ const A=Q[i], B=Q[(i+1)%4], ex=B[0]-A[0], ez=B[1]-A[1], cr=ex*(P[1]-A[1])-ez*(P[0]-A[0]);
    if(Math.abs(cr)>1e-9){ const s=Math.sign(cr); if(!sg) sg=s; else if(s!==sg) inside=false; }
    const L2=ex*ex+ez*ez||1e-12, t=Math.max(0,Math.min(1,((P[0]-A[0])*ex+(P[1]-A[1])*ez)/L2)); best=Math.min(best, Math.hypot(P[0]-A[0]-t*ex, P[1]-A[1]-t*ez)); }
  return inside ? 0 : best;
}
const nearTub = (tubs, W, a, hw=0) => { if(!tubs.length) return false; const P=W.at(a/FT, W.t); return tubs.some(T=>T.pod===W.s.pod.i && distToQuad(P, T.pts)*FT - hw < TUB_CLEAR); };
const isSinkBase = I => (I.it.k==='BS') || I.cat==='sink';
const blocks = I => I.cat!=='furniture' && I.cat!=='sink';     // beds, sofas, tables… can move; sinks sit in a counter

/* the electrical rules that come with one library item (shown on the item in the Library; the same rules are in
   Library → Electrical → Electrical rules and act on the walls): [text] */
function itemElecRules(d){
  if(!d) return [];
  const I={ it:{ k:d.k }, def:d, cat:d.cat }, out=[], ap=applKind(I);
  if(ap){ const A=APPL[ap]; out.push(`Its own plug behind it at ${A.y}″${ap==='range'?' (40 A)':''}${ap==='dw'?' (or in the sink cabinet beside it)':''}${ap==='microwave'?'; over the range it goes in the cabinet above':''}.`); }
  if(d.cat==='base' || d.cat==='counter') out.push(`Counter plugs at ${H.counter}″ so no point along the counter is more than 900 mm from one; none behind the range or the sink.`);
  if(isSinkBase(I)) out.push('No counter plug behind the sink.');
  if(isBasin(I)) out.push(`A GFCI plug at ${H.gfci}″ within 1 m of the basin.`);
  if(d.k==='BED') out.push(`Against a wall: a plug each side of the head, ${H.plug}″.`);
  if(d.k==='DESK') out.push('Against a wall: a plug behind it, 12″ above the top.');
  if(d.tv) out.push('A recessed TV box (power + low voltage) behind the screen, hidden by it, clear of the wall mount, on the chase nearest the middle.');
  if(d.cat==='fire') out.push('Power: Plug or Hardwired (its option). The plug or junction box goes inside the surround behind the insert, on its own circuit, and moves with the fireplace (locked).');
  if(isTub(I)) out.push(`No receptacle within 500 mm of it (across the floor, same room).`);
  if(/^BB-/.test(d.k||'')) out.push('No receptacle above it.');
  if(blocks(I) && !d.tv && d.cat!=='fire') out.push('The general wall plugs skip the wall behind it (it breaks the plug run along the floor where it reaches below 24″).');
  if(d.k==='SOFA') out.push(`With data boxes on for the home: a data box (network / TV) on the wall in front of it, ${H.data}″.`);
  if(d.k==='BED') out.push(`With data boxes on for the home: a data box on the wall opposite it, ${H.data}″.`);
  if(/^HD/.test(d.k||'')) out.push('Wired from the cabinet above, by the electrician (no plug of its own on the wall).');
  if(d.cat==='elec') out.push('Keep 1 m clear in front of it; not in a bathroom or a clothes closet. Its place is up to the electrician’s layout.');
  return out;
}
/* ---------------------------------------------------------------- the plan */
let building=false, memo={ sig:null, plan:null };
function sigOf(k){
  const m=MODELS[k]; if(!m) return '';
  return JSON.stringify([k, m.pods, m.picks, m.units, m.elec, m.joint, m.wallA, state.picks?.[k], state.faces?.[k], state.units?.[k], state.wallA?.[k], state.furniture?.[k]]);
}
function planFor(k=state.model){
  if(building) return null;
  const sig=sigOf(k); if(memo.sig===sig && memo.plan) return memo.plan;
  const keep=state.model; building=true; let P=null;
  try{ state.model=k; P=compute(k); }
  catch(e){ console.warn('electrical layout', e); P={ byWall:{}, boxes:[], flags:[{t:'Electrical layout failed: '+e.message}], rooms:[] }; }
  finally{ building=false; state.model=keep; }
  memo={ sig, plan:P }; return P;
}

/* a baseboard heater's wire run (header). a = along the wall from the left seen from OUTSIDE; the room face's x is
   Lin − a. Seen from the room the heater's right end is its low-a end (a0). */
const BB = { up:3, inFromRight:3, chaseY:6, r:3, endDepth:1, bit:0.75 };
function heaterRoute(W, it, id){ const r=wireRoute(W, it.a0+BB.inFromRight, BB.up, id, 'Heater wire run'); if(r) r.items.forEach(x=>x.heater=it.I.it.k); return r; }
/* a wall light box (placed exactly, by hand; the standard single-gang SHALLOW box): the same run from the nearest
   usable chase (the hole into the chase 3″ above the box's centre, the 3″ curve down to the box's centre height, then
   straight), ending at the SIDE of the box, and NOT tapering: it stays in the middle of the panel all the way. A chase
   that runs through the box itself: straight down the chase to the top of the box. */
const LIGHT_BOX = { w:2.375, h:3.375, depth:1.625, box:'BX-IBV-1100L' };   // boxes.js: Iberville 1100L, 1½″ deep, pocket 1⅝″
function lightRoute(W, b, id){ return wireRoute(W, b.a, b.y, id, 'Wall light wire run', { box:LIGHT_BOX, flat:true }); }
function wireRoute(W, aT, yT, id, label, opt={}){
  const tIn=+(W.w.t || W.t*FT), chaseY=yT+(BB.chaseY-BB.up);
  const cut=(W.w.openings||[]).filter(o=>o.w>0);
  const usable=W.chases.filter(c=>!cut.some(o=>c>o.x-BB.bit/2-0.25 && c<o.x+o.w+BB.bit/2+0.25));
  if(!usable.length) return { items:[], flag:`No usable chase on ${W.s.label} for the ${label.toLowerCase()}`, aH:aT };
  const aC=usable.slice().sort((p,q)=>Math.abs(p-aT)-Math.abs(q-aT))[0];
  let aH=aT, yH=yT, P;
  if(opt.box && Math.abs(aT-aC) <= opt.box.w/2){ aH=aC; yH=yT+opt.box.h/2; P=[[aC, chaseY],[aC, yH]]; }   // the chase runs into the box: down to its top
  else {
    if(opt.box) aH = aT - Math.sign(aT-aC)*opt.box.w/2;   // stop at the box's side
    const dx=aH-aC, sg=Math.sign(dx)||1, r=Math.min(BB.r, Math.abs(dx));
    // the path along the room face, in a (outside) coords: down the chase if the end is closer than 3″, the curve, then straight
    P=[[aC, chaseY]];
    if(chaseY-r > yH+1e-6) P.push([aC, yH+r]);
    if(r>1e-6) for(let i=1;i<=9;i++){ const th=i/9*Math.PI/2; P.push([aC+sg*r*(1-Math.cos(th)), yH+r*(1-Math.sin(th))]); }
    if(Math.abs(aH-P[P.length-1][0])>1e-6 || Math.abs(yH-P[P.length-1][1])>1e-6) P.push([aH, yH]); }
  // the depth: the middle of the panel at the chase; a heater's run comes up evenly along the path to 1″ at the wire spot,
  // a wall light's stays in the middle of the panel
  const len=[0]; for(let i=1;i<P.length;i++) len.push(len[i-1]+Math.hypot(P[i][0]-P[i-1][0], P[i][1]-P[i-1][1]));
  const tot=len[len.length-1]||1, d0=tIn/2, dEnd=opt.flat ? d0 : BB.endDepth, pts=P.map((p,i)=>[p[0], p[1], +(d0+(dEnd-d0)*len[i]/tot).toFixed(4)]);
  // split at panel joints: each panel gets its own piece (x on the room face)
  const lo=Math.min(aC,aH), hi=Math.max(aC,aH), cuts=W.joints.filter(j=>j>lo+1e-6 && j<hi-1e-6);
  const edges=[-Infinity, ...cuts, Infinity], items=[];
  for(let k=0;k<edges.length-1;k++){ const e0=edges[k], e1=edges[k+1], seg=[];
    for(let i=0;i<pts.length;i++){ const p=pts[i], q=pts[i+1]; if(p[0]>=e0-1e-9 && p[0]<=e1+1e-9) seg.push(p);
      if(q) [e0,e1].forEach(e=>{ if(isFinite(e) && (p[0]-e)*(q[0]-e)<0){ const f=(e-p[0])/(q[0]-p[0]); seg.push([e, p[1]+f*(q[1]-p[1]), p[2]+f*(q[2]-p[2])]); } }); }
    if(seg.length<2) continue;
    const route=seg.map(([a,y,d])=>[+(W.Lin-a).toFixed(4), +y.toFixed(4), d]);
    const xs=route.map(p=>p[0]), ys=route.map(p=>p[1]), path=grooveOutline(route, BB.bit/2);
    items.push({ kind:'pocket', shape:'poly', route, path, x:+((Math.min(...xs)+Math.max(...xs))/2).toFixed(4), y:+((Math.min(...ys)+Math.max(...ys))/2).toFixed(4),
      w:+(Math.max(...xs)-Math.min(...xs)+BB.bit).toFixed(4), h:+(Math.max(...ys)-Math.min(...ys)+BB.bit).toFixed(4), depth:+Math.max(...route.map(p=>p[2])).toFixed(4),
      name:label, auto:id+(items.length?`-${items.length}`:'') }); }
  return { items, aH, aC, flag:null };   // a wire spot or run on a panel joint is fine (the run is split per panel)
}
/* the ¾″ groove's outline around a centre line (room-face x, y), round ends */
function grooveOutline(route, r){
  const P=route.map(p=>[p[0],p[1]]); if(P.length===1){ const [x,y]=P[0], o=[]; for(let i=0;i<=24;i++){ const a=i/24*Math.PI*2; o.push([+(x+r*Math.cos(a)).toFixed(4), +(y+r*Math.sin(a)).toFixed(4)]); } return o; }
  const nrm=i=>{ const a=P[Math.max(0,i-1)], b=P[Math.min(P.length-1,i+1)], dx=b[0]-a[0], dy=b[1]-a[1], l=Math.hypot(dx,dy)||1; return [-dy/l, dx/l]; };
  const L=P.map((p,i)=>{ const n=nrm(i); return [p[0]+n[0]*r, p[1]+n[1]*r]; }), R=P.map((p,i)=>{ const n=nrm(i); return [p[0]-n[0]*r, p[1]-n[1]*r]; });
  const cap=(c,from,to)=>{ const a0=Math.atan2(from[1]-c[1], from[0]-c[0]), out=[]; let a1=Math.atan2(to[1]-c[1], to[0]-c[0]); while(a1>a0) a1-=Math.PI*2; for(let i=1;i<8;i++){ const a=a0+(a1-a0)*i/8; out.push([c[0]+r*Math.cos(a), c[1]+r*Math.sin(a)]); } return out; };
  const n=P.length-1, out=[...L, ...cap(P[n], L[n], R[n]), ...R.slice().reverse(), ...cap(P[0], R[0], L[0])]; out.push(out[0]);
  return out.map(([x,y])=>[+x.toFixed(4), +y.toFixed(4)]);
}
function compute(k){
  const E=elecOf(k)||{}, Hm=homeModel(k);
  const walls=Hm.walls, boxes=[], flags=[], tubs=tubsOf(Hm);
  const autoOf = W => slotAuto(W.s, k);

  /* ---- each wall: its line, its chases, panel joints, openings and what stands against it */
  walls.forEach(W=>{
    W.Lin=W.L*FT; W.key=wkey(W.s);
    const sp=panelSpans(W.w);
    W.chases=[]; sp.forEach(s=>{ const [a,b]=s, fromLeft=s.cutEnd==='right'; for(let c=6;c<48;c+=12){ const x=fromLeft?a+c:b-c; if(x>a+0.5 && x<b-0.5) W.chases.push(+x.toFixed(4)); } });
    W.joints=[]; for(let i=1;i<sp.length;i++) W.joints.push(sp[i][0]);
    W.items=[];
    W.auto=autoOf(W);
  });
  Hm.items.forEach(I=>{
    const w=I.it.w, y0=+(I.it.y||0), y1=y0+(+I.it.h||0);
    const P1=I.f(-w/2,0), P2=I.f(w/2,0);
    walls.forEach(W=>{ if(W.s.pod.i!==I.it.pod) return;
      const off=P=>((P[0]-W.S[0])*W.m[0]+(P[1]-W.S[1])*W.m[1])*FT - W.t*FT;
      if(Math.abs(off(P1))>4 || Math.abs(off(P2))>4) return;
      const al=P=>((P[0]-W.S[0])*W.d[0]+(P[1]-W.S[1])*W.d[1])*FT;
      const a0=Math.max(0,Math.min(al(P1),al(P2))), a1=Math.min(W.Lin,Math.max(al(P1),al(P2)));
      if(a1-a0<1) return;
      W.items.push({ a0, a1, y0, y1, I, cat:I.cat, appl:applKind(I) }); });
  });

  /* ---- rooms: pods joined through an opening 48″ or wider (not a door) */
  const pods=Hm.pods, root=pods.map((_,i)=>i), find=i=>root[i]===i?i:(root[i]=find(root[i]));
  walls.forEach(W=>{ if(W.s.type==='int' && W.s.other && (W.w.openings||[]).some(o=>o.w>=48 && o.kind!=='door' && o.kind!=='patio' && o.kind!=='window')) root[find(W.s.pod.i)]=find(W.s.other.i); });
  const rooms={}; pods.forEach(p=>{ const r=find(p.i); (rooms[r] ||= { pods:[], entries:[], key:'' }).pods.push(p.i); });
  Object.values(rooms).forEach(R=>{ R.key=R.pods.slice().sort((a,b)=>a-b).join('-');
    const its=Hm.items.filter(I=>R.pods.includes(I.it.pod));
    R.name = R.pods.map(i=>pods[i].name||pods[i].label).join(' + ');
    R.bed=its.some(I=>I.it.k==='BED'); R.sofa=its.some(I=>I.it.k==='SOFA');
    R.kitchen=its.some(I=>I.cat==='base'||applKind(I)==='range'||applKind(I)==='fridge');
    R.bath=its.some(isWet) && !R.bed && !R.sofa && !R.kitchen; });
  const roomOf = podI => rooms[find(podI)];

  /* ---- each pod's inside face as one loop (inches, going round): S, E, N, W */
  const loops=pods.map(p=>{
    const I=podInterior(Hm, p), ix=I.ix, iz=I.iz, x0=I.cx-ix/2/FT, x1=I.cx+ix/2/FT, z0=I.cz-iz/2/FT, z1=I.cz+iz/2/FT;
    const start={ S:0, E:ix, N:ix+iz, W:2*ix+iz }, len={ S:ix, E:iz, N:ix, W:iz };
    const uOn=(side,[x,z])=> side==='S' ? (x-x0)*FT : side==='E' ? ix+(z-z0)*FT : side==='N' ? ix+iz+(x1-x)*FT : 2*ix+iz+(z1-z)*FT;
    const L={ p, P:2*(ix+iz), ix, iz, x0, x1, z0, z1, walls:[], uOn, start, len };
    walls.filter(W=>W.s.pod.i===p.i && !W.s.part).forEach(W=>{   // middle walls aren't on the pod's loop
      const side=W.s.side, u0=uOn(side, W.at(0, W.t)), u1=uOn(side, W.at(W.L, W.t)), dir=u1>=u0?1:-1;
      const lo=Math.max(start[side], Math.min(u0,u1)), hi=Math.min(start[side]+len[side], Math.max(u0,u1));
      if(hi-lo<1) return;
      W.loop={ L, u0, dir, lo, hi }; L.walls.push(W); });
    return L;
  });
  const uOf = (W,a) => W.loop.u0 + W.loop.dir*a;
  const aOf = (W,u) => (u - W.loop.u0)*W.loop.dir;
  const mod = (u,P) => ((u%P)+P)%P;
  /* where each middle wall meets the pod's inside face: { u (on the loop), half (half its thickness, inches) }. Nothing
     goes there (the middle wall stands on it), and a door's switch never walks past one into the next room */
  loops.forEach(L=>{ L.mids=[];
    walls.filter(W=>W.s.part && W.s.pod.i===L.p.i).forEach(Wm=>[0, Wm.L].forEach(aE=>{ const P=Wm.at(aE, Wm.t/2);
      let best=null; L.walls.forEach(Wl=>{ const a=(P[0]-Wl.S[0])*Wl.d[0]+(P[1]-Wl.S[1])*Wl.d[1], off=Math.abs((P[0]-Wl.S[0])*Wl.m[0]+(P[1]-Wl.S[1])*Wl.m[1]);
        if(a>=-0.01 && a<=Wl.L+0.01 && off<=Wl.t+0.2 && (!best || off<best.off)) best={ Wl, a:a*FT, off }; });
      if(best) L.mids.push({ u:mod(uOf(best.Wl, best.a), L.P), half:Wm.t*FT/2, Wm }); })); });
  const midAt = (W, a, hw) => { const L=W.loop?.L; if(!L) return false; const u=uOf(W,a), P=L.P;
    return L.mids.some(m=>{ const d=Math.min(mod(u-m.u,P), mod(m.u-u,P)); return d < m.half+hw+STUD; }); };
  // walking round the loop from u0 by dir: does it pass a middle wall before reaching u?
  const pastMid = (L, u0, u, dir) => { const P=L.P, t=mod((u-u0)*dir, P); return (L.mids||[]).some(m=>{ const tm=mod((m.u-u0)*dir, P); return tm>0.01 && tm<t; }); };
  const at = (L,u) => { u=mod(u,L.P); for(const W of L.walls){ const l=W.loop; if(u>=l.lo-1e-6 && u<=l.hi+1e-6) return { W, a:aOf(W,u), edge:Math.min(u-l.lo, l.hi-u) }; } return null; };

  /* ---- can a box go here? */
  const sz = rk => rk==='double' || rk==='tvr' ? BOX.double : rk==='jbox' ? BOX.jbox : BOX.std;
  function okAt(W, face, a, y, rk, o={}){
    if(!o.any && !o.furn && !W.auto) return false;   // furniture's own plugs go on every wall; the rest only on walls by the rules
    const {w,h}=sz(rk), hw=w/2, hh=h/2;
    if(face==='in'){ const l=W.loop; if(l){ const u=uOf(W,a); if(u<l.lo+CORNER || u>l.hi-CORNER) return false; } else if(a<CORNER || a>W.Lin-CORNER) return false; }
    else if(a<CORNER+1.75 || a>W.Lin-CORNER-1.75) return false;
    if((W.w.openings||[]).some(op=>a+hw+STUD>op.x && a-hw-STUD<op.x+op.w && y+hh+STUD>op.y && y-hh-STUD<op.y+op.h)) return false;
    if(RCPT.has(rk) && underWindow(W, a, y, hw)) return false;   // never under a window: the nearest chase beside it instead
    if(face==='in' && RCPT.has(rk) && nearTub(tubs, W, a, hw)) return false;   // 500 mm clear of a tub or shower
    if(face==='in' && RCPT.has(rk) && W.items.some(it=>/^BB-/.test(it.I.it.k||'') && a+hw>it.a0-1 && a-hw<it.a1+1)) return false;   // never above a baseboard heater
    if(W.joints.some(j=>Math.abs(a-j)<JOINT)) return false;
    if(face==='in' && midAt(W, a, hw)) return false;   // a middle wall meets this face here
    if(face==='in' && W.items.some(it=>it.I!==o.ignore && blocks(it.I) && a+hw>it.a0-0.5 && a-hw<it.a1+0.5 && y+hh>it.y0 && y-hh<it.y1)) return false;
    if(boxes.some(b=>b.W===W && b.face===face && Math.abs(b.a-a)<BOX_GAP && Math.abs(b.y-y)<BOX_GAP+2)) return false;
    if(!W.auto && (face==='in' ? W.w.inside : W.w.outside||[]).some(b=>isElecBox(b) && Math.abs((face==='in' ? W.Lin-b.x : b.x)-a)<BOX_GAP && Math.abs(b.y-y)<BOX_GAP+2)) return false;   // the library's own boxes
    if(o.within && !o.within(a)) return false;
    return true;
  }
  /* the nearest good chase to a target on one wall (face) within reach; else the target if it's good; else the
     nearest good spot (scanning out up to `scan`) and a chase near that */
  function spotOnWall(W, face, aT, y, rk, o={}){
    const reach=o.reach ?? REACH[rk] ?? 18;
    const good=a=>okAt(W, face, a, y, rk, o);
    // each chase within reach, nearest first: its centre, else nudged up to 2″ either way (½″ steps, smallest first)
    const near=c=>{ for(const x of W.chases.filter(x=>Math.abs(x-c)<=reach+1e-6).sort((p,q)=>Math.abs(p-c)-Math.abs(q-c))) for(const n of NUDGES){ if(good(x+n)) return x+n; } return null; };
    let c=near(aT); if(c!=null) return { a:c, chase:true, moved:Math.abs(c-aT)>0.01 };
    if(good(aT)) return { a:aT, chase:false };
    for(let s=0.5; s<=(o.scan??48); s+=0.5) for(const a of [aT+s, aT-s]){ if(a<0||a>W.Lin||!good(a)) continue;
      c=near(a); return c!=null ? { a:c, chase:true, moved:true, blocked:true } : { a, chase:false, moved:true, blocked:true }; }
    return null;
  }
  /* the same along a pod's inside loop (round corners): dir 0 = either way, ±1 = only that way from `from` */
  function spotOnLoop(L, uT, y, rk, o={}){
    const reach=o.reach ?? REACH[rk] ?? 18, P=L.P;
    const t = u => o.dir ? mod((u-o.from)*o.dir, P) : 0;
    const dist = (u,v) => { const d=mod(u-v,P); return Math.min(d, P-d); };
    const allowed = u => (!o.dir || (t(u)>=(o.min??0) && t(u)<=(o.max??P))) && (!o.inside || o.inside(mod(u,P)));
    const good = u => { if(!allowed(u)) return null; const q=at(L,u); return q && okAt(q.W,'in',q.a,y,rk,o) ? q : null; };
    const chases=[]; L.walls.forEach(W=>W.chases.forEach(a=>{ const u=uOf(W,a); if(u>=W.loop.lo && u<=W.loop.hi) chases.push(u); }));
    const near = c => { let best=null; chases.forEach(u0=>{ const d=dist(u0,c); if(d>reach+1e-6 || (best && d>=best.d)) return;
      for(const n of NUDGES){ const q=good(u0+n); if(q){ best={ d, u:u0+n, q }; return; } } }); return best; };
    let c=near(uT); if(c) return { ...c.q, u:c.u, chase:true, moved:c.d>0.01 };
    let q=good(uT); if(q) return { ...q, u:uT, chase:false };
    const scan=o.scan ?? 96;
    for(let s=0.5; s<=scan; s+=0.5){
      for(const u of (o.dir ? [uT+o.dir*s, uT-o.dir*s] : [uT+s, uT-s])){ q=good(u); if(!q) continue;
        c=near(u); return c ? { ...c.q, u:c.u, chase:true, moved:true, blocked:true } : { ...q, u, chase:false, moved:true, blocked:true }; }
    }
    return null;
  }
  const add = (W, face, s, y, rk, id, extra={}) => {
    const b={ id, W, face, a:+s.a.toFixed(3), y, rk, chase:!!s.chase, note:extra.note||'', why:extra.why||'', flags:[], room:extra.room||null, ...extra };
    if(!s.chase) b.flags.push('needs a chase');
    boxes.push(b); return b; };

  /* ---- 1. appliances: their own plug, behind them */
  walls.forEach(W=>W.items.forEach(it=>{
    const A=APPL[it.appl]; if(!A) return;
    let y=A.y; if(it.appl==='microwave' && it.y0>=48) y=it.y1+6;
    const c=(it.a0+it.a1)/2, half=Math.max(1,(it.a1-it.a0)/2-2);
    const s=spotOnWall(W,'in',c,y,'appl',{ ignore:it.I, within:a=>Math.abs(a-c)<=half, scan:half, furn:true });
    if(!s){ flags.push({ t:`No spot behind the ${A.n.toLowerCase()} on ${W.s.label} for its plug`, w:W.s.id }); return; }
    add(W,'in',s,y,'appl',`ap:${it.I.it.id}`,{ note:A.n+(it.appl==='dw'?' (or in the sink cabinet)':'')+(it.appl==='microwave'&&it.y0>=48?' (in the cabinet above)':''), why:'appliance' });
  }));
  Hm.items.forEach(I=>{ const a=applKind(I); if(!a || a==='microwave') return;
    if(!walls.some(W=>W.items.some(it=>it.I===I))) flags.push({ t:`The ${APPL[a].n.toLowerCase()} isn't against a wall: no plug placed for it` }); });

  /* ---- 2. switches at the doors */
  const swingZones=[];   // walls behind a door swung open (not usable for plugs)
  walls.forEach(W=>W.ops.forEach(q=>{
    const op=q.o; if(!q.owner || (op.kind!=='door' && op.kind!=='patio')) return;
    // the side you walk through at: a man door's latch side (its hand is the hinge side); a patio slider's MOVING panel
    // side (its hand is the panel that moves: when it slides open the way through is where that panel was)
    const hand=q.ur?.hand||'L', swing=q.ur?.swing||'in', slider=op.kind==='patio', openSide = slider ? hand : (hand==='R'?'L':'R');
    const latchA = openSide==='L' ? op.x : op.x+op.w, hingeA = openSide==='L' ? op.x+op.w : op.x;
    const hingeP=W.at(hingeA/FT, W.t/2), latchP=W.at(latchA/FT, W.t/2);
    let F=W, fo=op;
    if(W.s.type==='int' && swing==='out' && q.pr){ const Wp=walls.find(x=>x.s.id===q.pr.slot.id); if(Wp){ F=Wp; fo=q.pr.o; } }
    if(!F.loop) return;
    // this face's two jambs: which one is the latch (farther from the hinge in plan)
    const ends=[fo.x, fo.x+fo.w].map(a=>({ a, P:F.at(a/FT, F.t/2) }));
    const dH=e=>Math.hypot(e.P[0]-hingeP[0], e.P[1]-hingeP[1]);
    const [hE,lE]=dH(ends[0])<dH(ends[1]) ? [ends[0],ends[1]] : [ends[1],ends[0]];
    const L=F.loop.L, uL=uOf(F,lE.a), uH=uOf(F,hE.a), dir=Math.sign(uL-uH)||1;
    if(op.kind==='door' && (swing==='in' || W.s.type==='int')) swingZones.push({ L, a:mod(uH-dir*op.w,L.P), b:uH, dir });
    if(!F.auto) return;
    const ext=W.s.type==='ext', rk=ext?'double':'switch', R=roomOf(F.s.pod.i);
    const s=spotOnLoop(L, uL+dir*SW_OFF, H[rk], rk, { dir, from:uL, min:STUD+sz(rk).w/2, scan:120, inside:u=>!pastMid(L, uL, u, dir) })
         || spotOnLoop(L, uH-dir*(op.w+SW_OFF), H[rk], rk, { dir:-dir, from:uH, min:op.w+STUD, scan:120, inside:u=>!pastMid(L, uH, u, -dir) });
    const doorName = `${ext?'outside ':''}${op.kind==='patio'?'patio door':'door'} on ${W.s.label}`;
    if(!s){ flags.push({ t:`No spot for the switch at the ${doorName}`, w:F.s.id }); return; }
    const b=add(s.W,'in',s,H[rk],rk,`sw:${W.key}:${Math.round(op.x)}`,{ note:ext?'room lights + outside light':'', why:`switch, ${doorName}`, room:R.key });
    if(s.blocked) b.flags.push(`moved off the 6″ rule (blocked)`);
    R.entries.push(b);
  }));
  // a door in a middle wall: its switch beside the latch, on the side it swings into, on the middle wall itself; when the
  // door is too near the end, round the corner on the wall the middle wall meets there, just past its face
  walls.filter(W=>W.s.part && W.auto).forEach(W=>W.ops.forEach(q=>{
    const op=q.o; if(op.kind!=='door' || !q.owner) return;
    const hand=q.ur?.hand||'L', swing=q.ur?.swing||'in', latchA=hand==='R'?op.x:op.x+op.w, dir=hand==='R'?-1:1, face=swing==='in'?'in':'out', hw=sz('switch').w/2, R=roomOf(W.s.pod.i);
    const why={ why:`switch, door on ${W.s.label}`, room:R.key };
    const s=spotOnWall(W, face, latchA+dir*SW_OFF, H.switch, 'switch', { within:a=>dir>0 ? a>=latchA+STUD+hw : a<=latchA-STUD-hw, scan:18 });
    if(s){ const b=add(W, face, s, H.switch, 'switch', `sw:${W.key}:${Math.round(op.x)}`, why); R.entries.push(b); return; }
    const L=loops[W.s.pod.i]; if(!L) return;
    const toward = swing==='in' ? W.m : W.n, P=W.at(dir>0 ? W.L : 0, W.t/2), k=W.t/2+(SW_OFF+hw)/FT, T=[P[0]+toward[0]*k, P[1]+toward[1]*k];
    let best=null; L.walls.forEach(Wl=>{ const a=(T[0]-Wl.S[0])*Wl.d[0]+(T[1]-Wl.S[1])*Wl.d[1], off=Math.abs((T[0]-Wl.S[0])*Wl.m[0]+(T[1]-Wl.S[1])*Wl.m[1]);
      if(a>=0 && a<=Wl.L && off<=Wl.t+0.3 && (!best || off<best.off)) best={ Wl, a:a*FT, off }; });
    const s2=best && spotOnWall(best.Wl, 'in', best.a, H.switch, 'switch', { scan:12 });
    if(!s2){ flags.push({ t:`No spot for the switch at the door on ${W.s.label}`, w:W.s.id }); return; }
    const b=add(best.Wl, 'in', s2, H.switch, 'switch', `sw:${W.key}:${Math.round(op.x)}`, { ...why, why:`switch, door on ${W.s.label} (round the corner)` }); R.entries.push(b);
  }));
  // a room with no door of its own (reached through a narrow cased opening): a switch beside that opening
  Object.values(rooms).forEach(R=>{ if(R.entries.length) return;
    for(const W of walls.filter(W=>R.pods.includes(W.s.pod.i) && W.loop && W.auto)){
      const op=(W.w.openings||[]).find(o=>(o.kind==='opening'||o.kind==='door') && o.y<1); if(!op) continue;
      const L=W.loop.L, u1=uOf(W,op.x+op.w), u0=uOf(W,op.x), dir=Math.sign(u1-u0)||1;
      const s=spotOnLoop(L, u1+dir*SW_OFF, H.switch, 'switch', { dir, from:u1, min:3, scan:120 }); if(!s) continue;
      const b=add(s.W,'in',s,H.switch,'switch',`sw:${W.key}:${Math.round(op.x)}`,{ why:`switch beside the opening on ${W.s.label}`, room:R.key });
      b.flags.push('room has no door: check this switch'); R.entries.push(b); break; }
  });
  // 3-way where a room has two or more entrances
  const confirms=[];
  Object.values(rooms).forEach(R=>{ if(R.entries.length<2) return;
    const v=E.sw3?.[R.key];
    R.entries.forEach((b,i)=>{ b.way = v===false ? 1 : (R.entries.length>2 && i>0 && i<R.entries.length-1 ? 4 : 3); if(v===undefined) b.flags.push('confirm 3-way'); });
    confirms.push({ room:R.key, name:R.name, n:R.entries.length, value:v });
  });

  /* ---- 3. bathroom basins: GFCI within 1 m */
  walls.forEach(W=>W.items.forEach(it=>{ if(!isBasin(it.I)) return;
    const c=(it.a0+it.a1)/2, w2=(it.a1-it.a0)/2;
    const within=a=>Math.abs(a-c)<=BASIN-2;
    let s=null; for(const aT of [c+w2+4, c-w2-4, c]){ s=spotOnWall(W,'in',aT,H.gfci,'gfci',{ within, reach:8, scan:0, furn:true }); if(s) break; }
    s = s || spotOnWall(W,'in',c,H.gfci,'gfci',{ within, scan:BASIN, furn:true });
    if(!s){ flags.push({ t:`No spot within 1 m of the basin on ${W.s.label} for its GFCI plug`, w:W.s.id }); return; }
    add(W,'in',s,H.gfci,'gfci',`gf:${it.I.it.id}`,{ note:'GFCI, within 1 m of the basin', why:'bathroom basin', room:roomOf(W.s.pod.i).key });
  }));

  /* ---- 4. kitchen counters: every point within 900 mm of a plug */
  walls.forEach(W=>{
    const base=W.items.filter(it=>(it.cat==='base' || it.cat==='counter' || ['dw','range','under'].includes(it.appl)) && it.y0<40 && it.y1>=30).sort((p,q)=>p.a0-q.a0);
    const runs=[]; base.forEach(it=>{ const r=runs[runs.length-1]; if(r && it.a0<=r.a1+3){ r.a1=Math.max(r.a1,it.a1); r.its.push(it); } else runs.push({ a0:it.a0, a1:it.a1, its:[it] }); });
    runs.forEach((r,ri)=>{ const len=r.a1-r.a0; if(len<MIN_COUNTER) return;
      const no=[...r.its.filter(it=>it.appl==='range' || isSinkBase(it.I)), ...W.items.filter(it=>isSinkBase(it.I))].map(it=>[it.a0,it.a1]);
      const within=a=>a>=r.a0+2 && a<=r.a1-2 && !no.some(([p,q])=>a>p-1.5 && a<q+1.5);
      const free=len-no.reduce((t,[p,q])=>t+Math.max(0,Math.min(q,r.a1)-Math.max(p,r.a0)),0); if(free<MIN_COUNTER) return;   // all sink / range: no work surface
      const n=Math.max(1, Math.ceil(len/(2*R_COUNTER)-1e-6));
      for(let i=0;i<n;i++){ const aT=r.a0+len*(i+0.5)/n;
        const s=spotOnWall(W,'in',aT,H.counter,'counter',{ within, scan:len, furn:true });
        if(!s){ flags.push({ t:`No spot for a counter plug on ${W.s.label}`, w:W.s.id }); continue; }
        add(W,'in',s,H.counter,'counter',`ct:${W.key}:${ri}:${i}`,{ note:'counter', why:'kitchen counter', room:roomOf(W.s.pod.i).key }); }
    });
  });

  /* ---- 5. beside the beds */
  const anchors=pods.map(()=>[]);
  walls.forEach(W=>W.items.forEach(it=>{ if(it.I.it.k!=='BED' || !W.loop) return;
    [[it.a0-10, 'L'], [it.a1+10, 'R']].forEach(([aT,sd])=>{
      const s=spotOnWall(W,'in',aT,H.plug,'plug',{ reach:12, scan:12, within:a=>a<it.a0-1.5 || a>it.a1+1.5, furn:true }); if(!s) return;
      const b=add(W,'in',s,H.plug,'plug',`bed:${it.I.it.id}:${sd}`,{ note:'bedside', why:'bedside', room:roomOf(W.s.pod.i).key });
      anchors[W.s.pod.i].push(uOf(W,b.a)); });
  }));
  /* ---- 5b. a desk against a wall: a plug above the desktop, behind it */
  walls.forEach(W=>W.items.forEach(it=>{ if(it.I.it.k!=='DESK' || !W.loop) return;
    const c=(it.a0+it.a1)/2, half=Math.max(1,(it.a1-it.a0)/2-3), y=Math.round(it.y1+12);
    const s=spotOnWall(W,'in',c,y,'plug',{ ignore:it.I, within:a=>Math.abs(a-c)<=half, scan:half, furn:true }); if(!s) return;
    add(W,'in',s,y,'plug',`dk:${it.I.it.id}`,{ note:'desk, above the top', why:'desk', room:roomOf(W.s.pod.i).key });
    if(y<30) anchors[W.s.pod.i].push(uOf(W,s.a)); }));

  /* ---- 5d. a TV on the wall: a recessed TV box (power + low voltage) behind the screen, hidden by it, clear of the
     wall mount (the middle of the TV, about a third of its width, up to 24″), on the chase nearest the middle */
  walls.forEach(W=>W.items.forEach(it=>{ if(!itemDef(it.I.it.k)?.tv || !W.loop) return;
    const c=(it.a0+it.a1)/2, half=(it.a1-it.a0)/2, mount=Math.min(12, (it.a1-it.a0)/6)+BOX.double.w/2+1, y=Math.round((it.y0+it.y1)/2);
    const within=a=>Math.abs(a-c)>=mount && a>=it.a0+BOX.double.w/2+1 && a<=it.a1-BOX.double.w/2-1;
    const s=spotOnWall(W,'in',c,y,'tvr',{ ignore:it.I, within, reach:half, scan:half, furn:true });
    if(!s){ flags.push({ t:`No spot for the TV box behind the TV on ${W.s.label}`, w:W.s.id }); return; }
    add(W,'in',s,y,'tvr',`tv:${it.I.it.id}`,{ note:'behind the TV, clear of the mount', why:'TV', room:roomOf(W.s.pod.i).key }); }));

  /* ---- 5c. a fireplace insert: its plug, or its junction box if it's hardwired (the surround's Power), inside the
     surround behind the insert, on its own circuit. Locked to the fireplace: it goes where the fireplace goes, and
     can't be moved or removed by hand (move the fireplace, or change its Power). */
  walls.forEach(W=>W.items.forEach(it=>{ const P=firePower(it.I.it); if(!P || !W.loop) return;
    const c=(it.a0+it.a1)/2, rk=P.hard?'jbox':'appl', y=Math.round(it.y0+P.y);
    const s=spotOnWall(W,'in',c+P.off,y,rk,{ ignore:it.I, within:a=>Math.abs(a-c)<=P.half, scan:2*P.half, furn:true });
    if(!s){ flags.push({ t:`No spot behind the fireplace on ${W.s.label} for its ${P.hard?'junction box':'plug'}`, w:W.s.id }); return; }
    add(W,'in',s,y,rk,`fp:${it.I.it.id}`,{ note:P.hard ? `fireplace insert, hardwired: junction box in the surround, dedicated circuit` : `fireplace insert plug, in the surround behind the insert, dedicated circuit`, why:'fireplace', room:roomOf(W.s.pod.i).key, lock:true });
  }));
  Hm.items.forEach(I=>{ if(I.it.k==='FP' && !walls.some(W=>W.items.some(it=>it.I===I))) flags.push({ t:'The fireplace isn’t against a wall: no plug or junction box placed for it' }); });

  /* ---- 6. data boxes (optional): the TV wall in front of a sofa, opposite each bed */
  if(E.data){
    Hm.items.filter(I=>I.it.k==='SOFA' || I.it.k==='BED').forEach(I=>{
      const L=loops[I.it.pod]; if(!L) return;
      const C=I.f(0, I.it.d/2), F=I.f(0, I.it.d/2+1), v=[F[0]-C[0], F[1]-C[1]], n=Math.hypot(...v)||1;
      // walk from its middle the way it faces to the inside face
      let tMin=Infinity, hit=null;
      [['S',L.z0,1],['N',L.z1,1],['W',L.x0,0],['E',L.x1,0]].forEach(([side,c,isZ])=>{ const vv=isZ?v[1]:v[0], cc=isZ?C[1]:C[0]; if(Math.abs(vv)<1e-9) return; const t=(c-cc)/vv; if(t<=0 || t>=tMin) return;
        const P=[C[0]+v[0]*t, C[1]+v[1]*t]; if(P[0]<L.x0-1e-3||P[0]>L.x1+1e-3||P[1]<L.z0-1e-3||P[1]>L.z1+1e-3) return; tMin=t; hit={ side, P }; });
      if(!hit) return;
      const s=spotOnLoop(L, L.uOn(hit.side, hit.P), H.data, 'data', { scan:48 }); if(!s) return;
      add(s.W,'in',s,H.data,'data',`dt:${I.it.id}`,{ note:I.it.k==='SOFA'?'TV wall':'opposite the bed', why:'data (network / TV)', room:roomOf(I.it.pod).key });
    });
  }

  /* ---- 7. plugs along the walls: no point more than 1.8 m from one */
  loops.forEach(L=>{
    const R=roomOf(L.p.i); if(R.bath || !L.walls.length) return;
    const P=L.P, breaks=[];
    const brk=(a,b)=>{ let x=mod(a,P), y=mod(b,P); if(Math.abs(b-a)>=P-1e-6){ breaks.push([0,P]); return; } if(x<=y) breaks.push([x,y]); else { breaks.push([x,P]); breaks.push([0,y]); } };
    L.walls.forEach(W=>{ const u=a=>uOf(W,a);
      (W.w.openings||[]).forEach(op=>{ if(op.y<20 && op.kind!=='vent') { const p=u(op.x), q=u(op.x+op.w); brk(Math.min(p,q), Math.max(p,q)); } });
      W.items.forEach(it=>{ if(blocks(it.I) && it.y0<24){ const p=u(it.a0), q=u(it.a1); brk(Math.min(p,q), Math.max(p,q)); } });
      // the existing plugs of a wall that keeps the library's boxes count; nothing new goes on it
      if(!W.auto) (W.w.inside||[]).forEach(b=>{ if(isElecBox(b) && b.y<30){ anchors[L.p.i].push(u(W.Lin-b.x)); } });
    });
    // a gap along the loop with no wall (shouldn't happen) is not wall
    const cov=L.walls.map(W=>[W.loop.lo, W.loop.hi]).sort((p,q)=>p[0]-q[0]); let x=0; cov.forEach(([a,b])=>{ if(a>x+0.5) brk(x,a); x=Math.max(x,b); }); if(P>x+0.5) brk(x,P);
    swingZones.filter(z=>z.L===L).forEach(z=>{ const p=z.dir>0?z.a:z.b, q=z.dir>0?z.b:z.a; brk(p, p+mod(q-p,P)); });
    // the free runs between breaks (round the loop)
    breaks.sort((p,q)=>p[0]-q[0]); const mb=[]; breaks.forEach(b=>{ const l=mb[mb.length-1]; if(l && b[0]<=l[1]+0.01) l[1]=Math.max(l[1],b[1]); else mb.push(b.slice()); });
    let runs=[];
    if(!mb.length) runs=[{ s:0, len:P, loop:true }];
    else mb.forEach((b,i)=>{ const nx=mb[(i+1)%mb.length], s=b[1], e=i+1<mb.length ? nx[0] : nx[0]+P; if(e-s>0.5) runs.push({ s, len:e-s }); });
    let n0=0;
    runs.forEach(r=>{ if(r.len<MIN_RUN) return;
      const inRun = u => { const t=mod(u-r.s,P); return t>=0 && t<=r.len; };
      const tOf = u => mod(u-r.s,P);
      const fixed=anchors[L.p.i].filter(inRun).map(tOf).sort((a,b)=>a-b);
      const plan = (Rm) => {
        const T=[]; const ends = r.loop ? null : [0, r.len];
        if(r.loop){ const pts=fixed.length?fixed:[]; if(!pts.length){ const n=Math.ceil(r.len/(2*Rm)-1e-6); for(let i=0;i<n;i++) T.push(r.len*(i+0.5)/n); return T; }
          for(let i=0;i<pts.length;i++){ const a=pts[i], b=i+1<pts.length?pts[i+1]:pts[0]+r.len, g=b-a, k2=Math.max(0,Math.ceil(g/(2*Rm)-1e-6)-1); for(let j=1;j<=k2;j++) T.push((a+g*j/(k2+1))%r.len); } return T; }
        if(!fixed.length){ const n=Math.ceil(r.len/(2*Rm)-1e-6); for(let i=0;i<n;i++) T.push(r.len*(i+0.5)/n); return T; }
        const f0=fixed[0], fl=fixed[fixed.length-1];
        const endPiece=(g)=>Math.max(0, Math.ceil(g/(2*Rm)-0.5-1e-6));
        let k1=endPiece(f0); for(let i=1;i<=k1;i++) T.push(f0 - f0*i/(k1+0.5));
        for(let i=0;i+1<fixed.length;i++){ const a=fixed[i], g=fixed[i+1]-a, k2=Math.max(0,Math.ceil(g/(2*Rm)-1e-6)-1); for(let j=1;j<=k2;j++) T.push(a+g*j/(k2+1)); }
        const ge=ends[1]-fl; k1=endPiece(ge); for(let i=1;i<=k1;i++) T.push(fl + ge*i/(k1+0.5));
        return T; };
      const coverOk = (pts) => { const s=[...pts].sort((a,b)=>a-b); if(!s.length) return false;
        if(r.loop){ for(let i=0;i<s.length;i++){ const g=(i+1<s.length?s[i+1]:s[0]+r.len)-s[i]; if(g>2*R_WALL+0.01) return false; } return true; }
        if(s[0]>R_WALL+0.01 || r.len-s[s.length-1]>R_WALL+0.01) return false;
        for(let i=0;i+1<s.length;i++) if(s[i+1]-s[i]>2*R_WALL+0.01) return false; return true; };
      let placed=null;
      for(const Rm of [R_WALL, R_WALL-10, R_WALL-20, R_WALL-30, R_WALL-40]){
        const T=plan(Rm), got=[], mark=boxes.length;
        let ok=true;
        for(const t of T){ const s=spotOnLoop(L, r.s+t, H.plug, 'plug', { inside:inRun, scan:Math.min(48, r.len) });
          if(!s){ ok=false; continue; }
          got.push(add(s.W,'in',s,H.plug,'plug','',{ why:'wall plug (1.8 m rule)', room:R.key })); }
        if(ok && coverOk([...fixed, ...got.map(b=>tOf(uOf(b.W,b.a)))])){ placed=got; break; }
        boxes.splice(mark);   // try again a little closer together
      }
      if(!placed){ // keep the first try and say so
        const T=plan(R_WALL); placed=[];
        for(const t of T){ const s=spotOnLoop(L, r.s+t, H.plug, 'plug', { inside:inRun, scan:Math.min(48,r.len) }); if(s) placed.push(add(s.W,'in',s,H.plug,'plug','',{ why:'wall plug (1.8 m rule)', room:R.key })); }
        flags.push({ t:`${L.p.name||L.p.label}: couldn't keep every point within 1.8 m of a plug on one stretch of wall` });
      }
      placed.sort((p,q)=>tOf(uOf(p.W,p.a))-tOf(uOf(q.W,q.a))).forEach(b=>{ b.id=`pl:${L.p.i}:${n0++}`; });
    });
  });

  /* ---- 8. outside: one weatherproof plug beside the main door */
  const extHas = walls.some(W=>!W.auto && W.s.type==='ext' && (W.w.outside||[]).some(isElecBox));
  if(!extHas){
    let done=false;
    const doors=[]; walls.forEach(W=>{ if(W.s.type==='ext' && W.auto) W.ops.forEach(q=>{ if(q.owner && (q.o.kind==='door'||q.o.kind==='patio')) doors.push({ W, q }); }); });
    doors.sort((p,q)=>(p.q.o.kind==='door'?0:1)-(q.q.o.kind==='door'?0:1));
    for(const {W,q} of doors){ const op=q.o, hand=q.ur?.hand||'L', openSide = op.kind==='patio' ? hand : (hand==='R'?'L':'R'), latchA=openSide==='L'?op.x:op.x+op.w, dir=openSide==='L'?-1:1;
      const s=spotOnWall(W,'out',latchA+dir*12,H.wp,'wp',{ scan:48 }); if(!s) continue;
      add(W,'out',s,H.wp,'wp','wp:main',{ note:'weatherproof, GFCI', why:'outside plug' }); done=true; break; }
    if(!done){   // no outside door: the middle of the longest outside wall, to be moved where it's wanted
      const W=walls.filter(W=>W.s.type==='ext' && W.auto).sort((p,q)=>q.Lin-p.Lin)[0];
      const s=W && spotOnWall(W,'out',W.Lin/2,H.wp,'wp',{ scan:W.Lin/2 });
      if(s){ const b=add(W,'out',s,H.wp,'wp','wp:main',{ note:'weatherproof, GFCI', why:'outside plug' }); b.flags.push('no outside door: check where it goes'); }
      else if(walls.some(W=>W.s.type==='ext' && W.auto)) flags.push({ t:'No spot for the outside (weatherproof) plug: add one' });
    }
  }

  /* ---- the team's own changes */
  const ov=E.ov||{}, byKey={}; walls.forEach(W=>{ byKey[W.key]=W; });
  const out=[];
  boxes.forEach(b=>{ if(!b.id) return; if(b.lock){ out.push(b); return; }   // a locked box (the fireplace's) ignores hand changes
    if(ov.del?.[b.id]){ b.removed=true; return; }
    if(ov.g?.[b.id]) b.g=ov.g[b.id];
    const mv=ov.mv?.[b.id]; if(mv){ if(mv.a!=null){ const fit=onWall(b.W, mv.a); b.a=fit.a; if(fit.moved) b.shrunk=true; } if(mv.y!=null) b.y=mv.y; b.moved=true; b.chase=onChase(b.W,b.a)||b.rk==='light'; b.flags=b.flags.filter(f=>f!=='needs a chase'); if(!b.chase) b.flags.push('needs a chase'); if(RCPT.has(b.rk) && underWindow(b.W,b.a,b.y)) b.flags.push('under a window'); if(b.face==='in' && RCPT.has(b.rk) && nearTub(tubs,b.W,b.a,BOX.std.w/2)) b.flags.push('within 500 mm of the tub / shower'); }
    out.push(b); });
  (ov.add||[]).forEach(u=>{ const W=byKey[u.w]; if(!W) return; const fit=onWall(W, u.a), chase=onChase(W,fit.a);
    out.push({ id:u.id, W, face:u.face||'in', a:fit.a, ...(fit.moved?{ shrunk:true }:{}), y:u.y, rk:u.rk, ...(u.g?{ g:u.g }:{}), chase:chase||u.rk==='light', user:true, note:u.note||'', why:u.rk==='light'?'wall light, placed by hand':'added by hand', flags:[...(chase||u.face==='out'||u.rk==='light'?[]:['needs a chase']), ...(RCPT.has(u.rk) && underWindow(W,u.a,u.y)?['under a window']:[]), ...((u.face||'in')==='in' && RCPT.has(u.rk) && nearTub(tubs,W,u.a,BOX.std.w/2)?['within 500 mm of the tub / shower']:[])] }); });
  out.forEach(b=>{ if(b.shrunk) b.flags.push('the wall got shorter: moved back onto it, check where it goes'); });

  /* ---- switches: a number each (S1, S2 … for the electrician) and what each switch in the box does.
     By the rules: the room's lights (3-way / 4-way with the room's other doors when the room has 3-way), an outside
     door's second switch the outside light, any more gangs "not set". The team can set each one (ov.sw), and pair any
     two switches as a 3-way, in one room or across an open space */
  const roomByKey={}; Object.values(rooms).forEach(R=>{ roomByKey[R.key]=R; });
  const live=new Set(out);
  const sws=out.filter(b=>SWITCHY.has(b.rk)).sort((p,q)=>(p.W.s.pod.i-q.W.s.pod.i) || String(p.W.s.id).localeCompare(String(q.W.s.id)) || (p.a-q.a));
  sws.forEach((b,i)=>{ b.sn='S'+(i+1); });
  const outById={}; out.forEach(b=>{ outById[b.id]=b; });
  sws.forEach(b=>{ const n=gangOf(b), R=b.room && roomByKey[b.room], ext=b.rk==='double' && /outside/.test(b.why||'');
    const others=R && b.way>1 ? R.entries.filter(x=>x!==b && live.has(x)).map(x=>x.id) : [];
    const def=[{ c:'room', way:b.way||1, with:others }]; if(ext) def.push({ c:'out', way:1, with:[] });
    while(def.length<n) def.push({ c:'none', way:1, with:[] }); def.length=n;
    const o=E.ov?.sw?.[b.id]||[];
    b.uses=def.map((d,i)=>{ const u={ ...d, ...(o[i]||{}) }; u.with=(u.with||[]).filter(id=>outById[id]); if(u.way>1 && !u.with.length && o[i]?.way>1) u.flagged=true; return u; });
  });
  // 3-way groups: switches tied together (either side's list); two = both 3-way; more = 3-way at the ends, 4-way between
  { const key=(id,i)=>id+'#'+i, root={}, fnd=x=>root[x]===x?x:(root[x]=fnd(root[x]));
    const gangOfLink=(B,aId,c)=>{ let j=B.uses.findIndex(u=>u.way>1 && (u.with||[]).includes(aId)); if(j<0) j=B.uses.findIndex(u=>u.way>1 && u.c===c); return j; };
    sws.forEach(b=>b.uses.forEach((u,i)=>{ if(u.way>1) root[key(b.id,i)]=key(b.id,i); }));
    sws.forEach(b=>b.uses.forEach((u,i)=>{ if(u.way<=1) return; (u.with||[]).forEach(id=>{ const B=outById[id]; if(!B?.uses) return; const j=gangOfLink(B,b.id,u.c); if(j<0) return; const x=fnd(key(b.id,i)), y=fnd(key(id,j)); if(x!==y) root[x]=y; }); }));
    const groups={}; Object.keys(root).forEach(k=>{ (groups[fnd(k)] ||= []).push(k); });
    const snN=b=>+b.sn.slice(1); let gid=0;
    Object.values(groups).map(G=>G.map(k=>{ const [id,i]=k.split('#'); return { b:outById[id], i:+i }; }).sort((p,q)=>snN(p.b)-snN(q.b)))
      .sort((P,Q)=>snN(P[0].b)-snN(Q[0].b))
      .forEach(M=>{ const g = M.length>1 ? ++gid : 0;   // each tied group gets a number (and a colour on screen)
        M.forEach((m,n)=>{ const u=m.b.uses[m.i]; if(M.length<2){ u.with=[]; return; } u.way = n===0||n===M.length-1 ? 3 : 4; u.with=M.filter(x=>x.b!==m.b).map(x=>x.b.id); u.grp=g; u.order=M.map(x=>x.b.id); }); }); }
  sws.forEach(b=>{ b.way=Math.max(1, ...b.uses.map(u=>u.way||1)); });
  const cName = (c,t) => c==='other' && t ? t : CONTROLS[c]||c;
  const useText = b => (b.uses||[]).map((u,i)=>`${(b.uses.length>1?(i+1)+' ':'')}${cName(u.c,u.t)}${u.n>1 && u.c2 ? ` + ${cName(u.c2,u.t2)}` : ''}${u.way>1?` (${u.way}-way with ${u.with.map(id=>outById[id]?.sn).filter(Boolean).join(', ')||'?'})`:''}${u.dev && deviceById(u.dev) ? ` — ${deviceById(u.dev).name}` : ''}`).join(' · ');
  /* devices: one per gang (a switch, a receptacle, a data jack …), by the rules unless the team picks (ov.dev) */
  out.forEach(b=>{ const n=gangOf(b), o=E.ov?.dev?.[b.id]||[];
    b.devs=Array.from({length:n}, (_,i)=>{ const u=b.uses?.[i]; const id=o[i] || defaultDevice(b.rk, u?.way||1, b.note||b.why||''); return id && deviceById(id) && !deviceById(id).deleted ? id : (o[i] ? defaultDevice(b.rk, u?.way||1, b.note||b.why||'') : id); });
    (b.uses||[]).forEach((u,i)=>{ const d=deviceById(b.devs[i]); u.dev=b.devs[i]; u.n=d?.n||1; if(u.n<2) delete u.c2;
      if(d && d.kind==='sw' && (u.way||1)>1 && (d.way||1)<u.way) b.flags.push(`${b.sn} switch ${i+1}: the ${d.name.toLowerCase()} can't be ${u.way}-way`); }); });
  sws.forEach(b=>{ b.useText=useText(b); if(b.uses.some(u=>u.c==='none')) b.flags.push('say what each switch does'); });

  /* ---- into the walls */
  const byWall={};
  out.forEach(b=>{ const {w,h}=b.rk==='jbox' ? BOX.jbox : (GANG[gangOf(b)]||sz(b.rk)), W=b.W, o=(byWall[W.s.id] ||= { inside:[], outside:[] });
    const nm = b.rk==='switch' && b.way>1 ? `${b.way}-way switch box` : NAME[b.rk] || 'Box';
    const item={ kind:'box', shape:'rect', w, h, depth:b.rk==='jbox' ? 2.25 : b.rk==='light' ? LIGHT_BOX.depth : 3, ...(b.rk==='jbox'?{ box:'BX-JB-4SQ' }:b.rk==='light'?{ box:LIGHT_BOX.box }:{}), x:+(b.face==='in' ? W.Lin-b.a : b.a).toFixed(4), y:b.y, rk:b.rk==='wp'?'plug':b.rk, name:nm, gang:gangOf(b), devs:(b.devs||[]).map(id=>deviceById(id)?.name).filter(Boolean), ...(b.sn?{ sn:b.sn, uses:b.useText, links:b.uses.filter(u=>u.grp).map(u=>({ grp:u.grp, order:u.order.map(id=>outById[id]?.sn) })) }:{}), auto:b.id, ...(b.chase?{}:{ offChase:true }) };
    (b.face==='in' ? o.inside : o.outside).push(item); b.name=nm; });
  /* ---- baseboard heater wire runs (header): one per heater, on the room face */
  const routes=[];
  walls.forEach(W=>W.items.filter(it=>/^BB-/.test(it.I.it.k||'')).forEach((it,i)=>{
    const r=heaterRoute(W, it, `bbw-${W.s.id}-${i}`); if(!r) return; routes.push(r);
    (byWall[W.s.id] ||= { inside:[], outside:[] }).inside.push(...r.items);
    if(r.flag) flags.push({ t:r.flag, w:W.s.id }); }));
  out.filter(b=>b.rk==='light' && b.face==='in').forEach(b=>{ const r=lightRoute(b.W, b, `lw-${b.id}`); if(!r) return; routes.push(r);
    (byWall[b.W.s.id] ||= { inside:[], outside:[] }).inside.push(...r.items); if(r.flag) flags.push({ t:r.flag, w:b.W.s.id }); });
  const removed=boxes.filter(b=>b.removed);
  return { byWall, routes, boxes:out, removed, flags, confirms, rooms:Object.values(rooms).map(R=>({ key:R.key, name:R.name, entries:R.entries.length, bath:R.bath, kitchen:R.kitchen, bed:R.bed })) };
}

/* the wall's boxes: the rules' instead of the library's */
setElecHook((slot, bw)=>{
  if(building || !slot || !slot.pod) return bw;
  const k=state.model, E=elecOf(k); if(!MODELS[k]) return bw;
  const auto=slotAuto(slot,k);
  const P=planFor(k); const mine=P?.byWall?.[slot.id] || { inside:[], outside:[] };
  if(!auto) return mine.inside.length||mine.outside.length ? { ...bw, inside:[...(bw.inside||[]), ...mine.inside], outside:[...(bw.outside||[]), ...mine.outside] } : bw;   // the library's boxes + the furniture's plugs + the ones added by hand
  return { ...bw, inside:[...(bw.inside||[]).filter(b=>!isElecBox(b)), ...mine.inside], outside:[...(bw.outside||[]).filter(b=>!isElecBox(b)), ...mine.outside] };
});

/* ---------------------------------------------------------------- changes */
function relay(k=state.model, { clear=false }={}){ return editElec(E=>{ E.auto=true; delete E.walls; if(clear){ delete E.ov; delete E.sw3; } }); }
function setData(on){ return editElec(E=>{ E.data=!!on; }); }
function setThreeWay(room, v){ return editElec(E=>{ (E.sw3 ||= {})[room]=v; }); }
function removeBox(id){ return editElec(E=>{ E.ov ||= {}; if(String(id).startsWith('u-')){ E.ov.add=(E.ov.add||[]).filter(u=>u.id!==id); return; } (E.ov.del ||= {})[id]=true; }); }
function restoreBox(id){ return editElec(E=>{ if(E.ov?.del) delete E.ov.del[id]; }); }
function moveBox(id, a, y){ return editElec(E=>{ E.ov ||= {};
  const u=(E.ov.add||[]).find(x=>x.id===id); if(u){ if(a!=null) u.a=a; if(y!=null) u.y=y; return; }
  const m=((E.ov.mv ||= {})[id] ||= {}); if(a!=null) m.a=+a.toFixed(3); if(y!=null) m.y=y; }); }
/* the device in gang i of box id (this home) */
function setDevice(id, i, dev){ return editElec(E=>{ E.ov ||= {}; const L=((E.ov.dev ||= {})[id] ||= []); L[i]=dev||undefined; }); }
/* how many of each device the home uses: [{ id, name, kind, n }] */
const deviceCounts = (k=state.model) => { const P=planFor(k); if(!P) return []; const c={}; P.boxes.forEach(b=>(b.devs||[]).forEach(id=>{ if(id) c[id]=(c[id]||0)+1; }));
  return Object.entries(c).map(([id,n])=>({ id, n, name:deviceById(id)?.name||id, kind:deviceById(id)?.kind||'' })).sort((p,q)=>(p.kind>q.kind?1:p.kind<q.kind?-1:0) || q.n-p.n); };
/* single / double / triple: this home only */
function setGang(id, g){ g=[1,2,3].includes(+g) ? +g : 1; return editElec(E=>{ E.ov ||= {};
  const u=(E.ov.add||[]).find(x=>x.id===id); if(u){ u.g=g; return; }
  (E.ov.g ||= {})[id]=g; }); }
/* what switch i of box id does: patch { c, t, way } (this home) */
function setSwitchUse(id, i, patch){ return editElec(E=>{ E.ov ||= {}; const L=((E.ov.sw ||= {})[id] ||= []); L[i]={ ...(L[i]||{}), ...patch }; if(patch.way===1){ L[i].with=[]; } }); }
/* pair switch i of box a with box b as a 3-way (both sides): b's switch doing the same thing, else its first one
   not set yet, else its first */
function pairSwitch(a, i, bId){
  const P=planFor(); const A=P?.boxes.find(x=>x.id===a), B=P?.boxes.find(x=>x.id===bId); if(!A||!B||a===bId) return;
  const c=A.uses?.[i]?.c||'room', t=A.uses?.[i]?.t||'';
  let j=(B.uses||[]).findIndex(u=>u.c===c); if(j<0) j=(B.uses||[]).findIndex(u=>u.c==='none'); if(j<0) j=0;
  return editElec(E=>{ E.ov ||= {}; const S=(E.ov.sw ||= {});
    const LA=(S[a] ||= []), LB=(S[bId] ||= []);
    const wa=new Set([...(A.uses?.[i]?.with||[]), bId]), wb=new Set([...(B.uses?.[j]?.with||[]), a]);
    LA[i]={ ...(LA[i]||{}), c, t, way:3, with:[...wa] }; LB[j]={ ...(LB[j]||{}), c, t, way:3, with:[...wb] }; }); }
/* back to a 1-way: off both sides */
function unpairSwitch(a, i){
  const P=planFor(); const A=P?.boxes.find(x=>x.id===a); if(!A) return;
  return editElec(E=>{ E.ov ||= {}; const S=(E.ov.sw ||= {}); (S[a] ||= [])[i]={ ...(S[a][i]||{}), way:1, with:[] };
    (A.uses?.[i]?.with||[]).forEach(id=>{ const B=P.boxes.find(x=>x.id===id); const j=(B?.uses||[]).findIndex(u=>(u.with||[]).includes(a)); if(j<0) return;
      const rest=B.uses[j].with.filter(x=>x!==a); (S[id] ||= [])[j]={ ...(S[id][j]||{}), c:B.uses[j].c, way: rest.length ? 3 : 1, with:rest }; }); }); }
/* the tied switches (3-way / 4-way groups), in order along the run: [{ grp, c, boxes:[box…] }] */
const switchLinks = (k=state.model) => { const P=planFor(k); if(!P) return []; const by={}, out={};
  P.boxes.forEach(b=>{ by[b.id]=b; });
  P.boxes.forEach(b=>(b.uses||[]).forEach(u=>{ if(!u.grp || out[u.grp]) return; out[u.grp]={ grp:u.grp, c:u.c, t:u.t, boxes:u.order.map(id=>by[id]).filter(Boolean) }; }));
  return Object.values(out).sort((p,q)=>p.grp-q.grp); };
/* every switch box of the home, numbered, with what each switch does (the switch schedule) */
const switchSchedule = (k=state.model) => { const P=planFor(k); if(!P) return []; return P.boxes.filter(b=>b.sn).sort((p,q)=>+p.sn.slice(1)-+q.sn.slice(1)).map(b=>({ id:b.id, sn:b.sn, wall:b.W.s.label, slot:b.W.s.id, why:b.why, g:gangOf(b), uses:b.uses, text:b.useText })); };
function resetBox(id){ return editElec(E=>{ if(E.ov?.mv) delete E.ov.mv[id]; }); }
function addBox(slot, rk, a, y, face='in'){ let id='u-'+Date.now().toString(36);
  editElec(E=>{ ((E.ov ||= {}).add ||= []).push({ id, w:wkey(slot), rk, a:+a.toFixed(3), y:y ?? H[rk] ?? 16, face }); }); return id; }
/* one wall of an older home onto the rules (its library plugs and switches go) */
function ruleWall(slot, on=true){ return editElec(E=>{ if(on) (E.walls ||= {})[wkey(slot)]=true; else if(E.walls) delete E.walls[wkey(slot)]; }); }
/* this wall's boxes, for the wall panel: [{ id, rk, name, a (from the left seen from that face), y, chase, flags, note }] */
function boxesOn(slot){
  const P=planFor(); if(!P) return null;
  return P.boxes.filter(b=>b.W.s.id===slot.id).map(b=>({ id:b.id, rk:b.rk, g:gangOf(b), devs:b.devs, sn:b.sn, uses:b.uses, useText:b.useText, name:b.name, face:b.face, a:b.a, x:b.face==='in'?b.W.Lin-b.a:b.a, y:b.y, chase:b.chase, flags:b.flags, note:b.note, why:b.why, user:!!b.user, moved:!!b.moved, lock:!!b.lock, way:b.way||1, nudge:b.chase&&b.face==='in'&&b.W.chases.length ? +Math.min(...b.W.chases.map(c=>Math.abs(c-b.a))).toFixed(3) : 0 }))
    .sort((p,q)=>(p.face===q.face?0:p.face==='in'?-1:1) || p.x-q.x);
}
/* the next chase from a, one way (dir ±1); a from the left seen from outside */
function nextChase(slot, bw, a, dir){
  const sp=panelSpans(bw), cs=[]; sp.forEach(s=>{ const [p,q]=s, fl=s.cutEnd==='right'; for(let c=6;c<48;c+=12){ const x=fl?p+c:q-c; if(x>p+0.5 && x<q-0.5) cs.push(x); } });
  cs.sort((p,q)=>p-q); return dir>0 ? cs.find(x=>x>a+0.05) : [...cs].reverse().find(x=>x<a-0.05);
}
const summary = (k=state.model) => { if(!usesRules(k)) return null; const P=planFor(k); const c={}; P.boxes.forEach(b=>{ c[b.rk]=(c[b.rk]||0)+1; }); return { counts:c, flags:P.flags, confirms:P.confirms, offChase:P.boxes.filter(b=>!b.chase && b.face==='in'), needs:P.boxes.filter(b=>b.flags.some(f=>f!=='confirm 3-way')), removed:P.removed, rooms:P.rooms, boxes:P.boxes }; };

export { setDevice, deviceCounts, switchLinks, CONTROLS, setSwitchUse, pairSwitch, unpairSwitch, switchSchedule, itemElecRules, setGang, GANG, gangOf, H as ELEC_H, NAME as ELEC_NAME, usesRules, homeAuto, slotAuto, planFor, relay, setData, setThreeWay, removeBox, restoreBox, moveBox, resetBox, addBox, boxesOn, ruleWall, nextChase, summary, elecOf, fin as elecFin };
