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
   Furniture's own plugs (appliances, basin GFCI, counters, bedside, desk) go on every wall, even one that keeps the
   library's plugs and switches; the rest (wall plugs, switches, outside, data) only on walls by the rules.
     · Outside: at least one weatherproof plug, beside the main door.
     · Switches 48″, centre 6″ from the door's rough opening on the latch side, on the side the door swings into
       (an outside door: inside). A room with two or more entrances gets 3-way switches (confirmed by the team).
       An outside door gets a double box (the room's lights + the outside light).
     · Walls between pods: boxes only on the face toward the wall's own pod.
     · Data boxes (network / TV) are optional per home: the TV wall in front of a sofa and opposite each bed, 16″.
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
import { checkpoint } from './history.js';
import { FT } from './config.js';
import { fin } from './format.js';

const H = { plug:16, counter:42, gfci:42, switch:48, double:48, data:16, wp:16 };
const REACH = { plug:18, counter:18, gfci:18, appl:18, data:18, wp:18, switch:6, double:6, jbox:6 };
const R_WALL = 70.866, R_COUNTER = 35.433, MIN_RUN = 35.433, MIN_COUNTER = 11.8, BASIN = 39.37;
const NUDGE = 2;   // a box up to 2″ either side of a chase's centre still counts as on it (centre first)
const SW_OFF = 6, CORNER = 3, JOINT = 2.9, STUD = 1.5, BOX_GAP = 4;
const BOX = { std:{w:2.375, h:3.375}, double:{w:4.125, h:3.625} };
const NAME = { plug:'Plug box', counter:'Counter plug box', gfci:'GFCI plug box', appl:'Appliance plug box', switch:'Switch box', double:'Double switch box', data:'Data box', wp:'Outside plug (WP)', jbox:'Junction box (hardwired)' };
/* receptacles (not switches) never go under a window: anywhere below its sill, from 1½″ outside one side to 1½″
   outside the other */
const RCPT = new Set(['plug','counter','gfci','appl','data','wp']);
const underWindow = (W, a, y, hw=BOX.std.w/2) => (W.w.openings||[]).some(op=>op.kind==='window' && y<op.y && a+hw+STUD>op.x && a-hw-STUD<op.x+op.w);
const NUDGES = [0,0.5,-0.5,1,-1,1.5,-1.5,2,-2];
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
    walls.filter(W=>W.s.pod.i===p.i).forEach(W=>{
      const side=W.s.side, u0=uOn(side, W.at(0, W.t)), u1=uOn(side, W.at(W.L, W.t)), dir=u1>=u0?1:-1;
      const lo=Math.max(start[side], Math.min(u0,u1)), hi=Math.min(start[side]+len[side], Math.max(u0,u1));
      if(hi-lo<1) return;
      W.loop={ L, u0, dir, lo, hi }; L.walls.push(W); });
    return L;
  });
  const uOf = (W,a) => W.loop.u0 + W.loop.dir*a;
  const aOf = (W,u) => (u - W.loop.u0)*W.loop.dir;
  const mod = (u,P) => ((u%P)+P)%P;
  const at = (L,u) => { u=mod(u,L.P); for(const W of L.walls){ const l=W.loop; if(u>=l.lo-1e-6 && u<=l.hi+1e-6) return { W, a:aOf(W,u), edge:Math.min(u-l.lo, l.hi-u) }; } return null; };

  /* ---- can a box go here? */
  const sz = rk => rk==='double' ? BOX.double : BOX.std;
  function okAt(W, face, a, y, rk, o={}){
    if(!o.any && !o.furn && !W.auto) return false;   // furniture's own plugs go on every wall; the rest only on walls by the rules
    const {w,h}=sz(rk), hw=w/2, hh=h/2;
    if(face==='in'){ const l=W.loop; if(!l) return false; const u=uOf(W,a); if(u<l.lo+CORNER || u>l.hi-CORNER) return false; }
    else if(a<CORNER+1.75 || a>W.Lin-CORNER-1.75) return false;
    if((W.w.openings||[]).some(op=>a+hw+STUD>op.x && a-hw-STUD<op.x+op.w && y+hh+STUD>op.y && y-hh-STUD<op.y+op.h)) return false;
    if(RCPT.has(rk) && underWindow(W, a, y, hw)) return false;   // never under a window: the nearest chase beside it instead
    if(face==='in' && RCPT.has(rk) && nearTub(tubs, W, a, hw)) return false;   // 500 mm clear of a tub or shower
    if(face==='in' && RCPT.has(rk) && W.items.some(it=>/^BB-/.test(it.I.it.k||'') && a+hw>it.a0-1 && a-hw<it.a1+1)) return false;   // never above a baseboard heater
    if(W.joints.some(j=>Math.abs(a-j)<JOINT)) return false;
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
    const hand=q.ur?.hand||'L', swing=q.ur?.swing||'in', hingeA=hand==='R'?op.x+op.w:op.x, latchA=hand==='R'?op.x:op.x+op.w;
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
    const s=spotOnLoop(L, uL+dir*SW_OFF, H[rk], rk, { dir, from:uL, min:STUD+sz(rk).w/2, scan:120 })
         || spotOnLoop(L, uH-dir*(op.w+SW_OFF), H[rk], rk, { dir:-dir, from:uH, min:op.w+STUD, scan:120 });
    const doorName = `${ext?'outside ':''}${op.kind==='patio'?'patio door':'door'} on ${W.s.label}`;
    if(!s){ flags.push({ t:`No spot for the switch at the ${doorName}`, w:F.s.id }); return; }
    const b=add(s.W,'in',s,H[rk],rk,`sw:${W.key}:${Math.round(op.x)}`,{ note:ext?'room lights + outside light':'', why:`switch, ${doorName}`, room:R.key });
    if(s.blocked) b.flags.push(`moved off the 6″ rule (blocked)`);
    R.entries.push(b);
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
    for(const {W,q} of doors){ const op=q.o, hand=q.ur?.hand||'L', latchA=hand==='R'?op.x:op.x+op.w, dir=hand==='R'?-1:1;
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
    const mv=ov.mv?.[b.id]; if(mv){ if(mv.a!=null) b.a=mv.a; if(mv.y!=null) b.y=mv.y; b.moved=true; b.chase=onChase(b.W,b.a); b.flags=b.flags.filter(f=>f!=='needs a chase'); if(!b.chase) b.flags.push('needs a chase'); if(RCPT.has(b.rk) && underWindow(b.W,b.a,b.y)) b.flags.push('under a window'); if(b.face==='in' && RCPT.has(b.rk) && nearTub(tubs,b.W,b.a,BOX.std.w/2)) b.flags.push('within 500 mm of the tub / shower'); }
    out.push(b); });
  (ov.add||[]).forEach(u=>{ const W=byKey[u.w]; if(!W) return; const chase=onChase(W,u.a);
    out.push({ id:u.id, W, face:u.face||'in', a:u.a, y:u.y, rk:u.rk, chase, user:true, note:u.note||'', why:'added by hand', flags:[...(chase||u.face==='out'?[]:['needs a chase']), ...(RCPT.has(u.rk) && underWindow(W,u.a,u.y)?['under a window']:[]), ...((u.face||'in')==='in' && RCPT.has(u.rk) && nearTub(tubs,W,u.a,BOX.std.w/2)?['within 500 mm of the tub / shower']:[])] }); });

  /* ---- into the walls */
  const byWall={};
  out.forEach(b=>{ const {w,h}=sz(b.rk), W=b.W, o=(byWall[W.s.id] ||= { inside:[], outside:[] });
    const nm = b.rk==='switch' && b.way>1 ? `${b.way}-way switch box` : NAME[b.rk] || 'Box';
    const item={ kind:'box', shape:'rect', w, h, depth:3, x:+(b.face==='in' ? W.Lin-b.a : b.a).toFixed(4), y:b.y, rk:b.rk==='wp'?'plug':b.rk, name:nm, auto:b.id, ...(b.chase?{}:{ offChase:true }) };
    (b.face==='in' ? o.inside : o.outside).push(item); b.name=nm; });
  const removed=boxes.filter(b=>b.removed);
  return { byWall, boxes:out, removed, flags, confirms, rooms:Object.values(rooms).map(R=>({ key:R.key, name:R.name, entries:R.entries.length, bath:R.bath, kitchen:R.kitchen, bed:R.bed })) };
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
function resetBox(id){ return editElec(E=>{ if(E.ov?.mv) delete E.ov.mv[id]; }); }
function addBox(slot, rk, a, y, face='in'){ let id='u-'+Date.now().toString(36);
  editElec(E=>{ ((E.ov ||= {}).add ||= []).push({ id, w:wkey(slot), rk, a:+a.toFixed(3), y:y ?? H[rk] ?? 16, face }); }); return id; }
/* one wall of an older home onto the rules (its library plugs and switches go) */
function ruleWall(slot, on=true){ return editElec(E=>{ if(on) (E.walls ||= {})[wkey(slot)]=true; else if(E.walls) delete E.walls[wkey(slot)]; }); }
/* this wall's boxes, for the wall panel: [{ id, rk, name, a (from the left seen from that face), y, chase, flags, note }] */
function boxesOn(slot){
  const P=planFor(); if(!P) return null;
  return P.boxes.filter(b=>b.W.s.id===slot.id).map(b=>({ id:b.id, rk:b.rk, name:b.name, face:b.face, a:b.a, x:b.face==='in'?b.W.Lin-b.a:b.a, y:b.y, chase:b.chase, flags:b.flags, note:b.note, why:b.why, user:!!b.user, moved:!!b.moved, lock:!!b.lock, way:b.way||1, nudge:b.chase&&b.face==='in'&&b.W.chases.length ? +Math.min(...b.W.chases.map(c=>Math.abs(c-b.a))).toFixed(3) : 0 }))
    .sort((p,q)=>(p.face===q.face?0:p.face==='in'?-1:1) || p.x-q.x);
}
/* the next chase from a, one way (dir ±1); a from the left seen from outside */
function nextChase(slot, bw, a, dir){
  const sp=panelSpans(bw), cs=[]; sp.forEach(s=>{ const [p,q]=s, fl=s.cutEnd==='right'; for(let c=6;c<48;c+=12){ const x=fl?p+c:q-c; if(x>p+0.5 && x<q-0.5) cs.push(x); } });
  cs.sort((p,q)=>p-q); return dir>0 ? cs.find(x=>x>a+0.05) : [...cs].reverse().find(x=>x<a-0.05);
}
const summary = (k=state.model) => { if(!usesRules(k)) return null; const P=planFor(k); const c={}; P.boxes.forEach(b=>{ c[b.rk]=(c[b.rk]||0)+1; }); return { counts:c, flags:P.flags, confirms:P.confirms, offChase:P.boxes.filter(b=>!b.chase && b.face==='in'), needs:P.boxes.filter(b=>b.flags.some(f=>f!=='confirm 3-way')), removed:P.removed, rooms:P.rooms, boxes:P.boxes }; };

export { H as ELEC_H, NAME as ELEC_NAME, usesRules, homeAuto, slotAuto, planFor, relay, setData, setThreeWay, removeBox, restoreBox, moveBox, resetBox, addBox, boxesOn, ruleWall, nextChase, summary, elecOf, fin as elecFin };
