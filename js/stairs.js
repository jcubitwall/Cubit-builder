/* Cubit Builder — stairs.js : a stair from the ground floor up to a pod on the second floor.

   A plain straight stair in a ground-floor pod, against one of its long walls, running along the pod, up into the
   pod above through a stair hole cut in the lower pod's ceiling and roof and in the upper pod's floor.

   The rules (National Building Code of Canada, 9.8, stairs within a dwelling unit):
     rise 125–200 mm (max 7⅞″) · run 255–355 mm (min 10⅛″ rounded up) · width 860 mm (34″) or more
     headroom 1950 mm (76¾″) over the stair · all risers the same
   The total rise is fixed by the build: ground floor top to upstairs floor top = UP (116.4″).

   Three options, all legal, 36″ wide: the shortest (the steepest the code allows), a standard one and a
   comfortable one; the options a pod can't take are shown as not fitting.

   MODELS[k].stairs = [{ id, pod (the ground-floor pod), dir (1 = going up toward the pod's own E end, -1 W),
                         side ('S'|'N', the pod's own long wall it's against), u0 (inches from the pod's own W end to the
                         foot of the bottom riser), opt }]

   Pod-local inches: u along the pod from its own W end, v across from its own S side (the floor layers' frame). */
import { MODELS } from './data.js';
import { state, save, pickFor } from './state.js';
import { checkpoint } from './history.js';
import { UP, LAYER_KINDS, WALL_BASE } from './config.js';
import { podList, layerSlotsFor, podOffsets } from './layout.js';
import { ensureDraft } from './pods.js';

const R = UP;   // inches, ground floor top to the upstairs floor top
const HEAD = 76.75, CEIL_ABOVE = LAYER_KINDS['ceiling-int'].z - WALL_BASE;   // ceiling underside above the floor
const plan = (rise, run, label, note) => { const n=Math.ceil(R/rise - 1e-9), r=R/n; return { n, rise:r, run, total:(n-1)*run, label, note }; };
const OPTS = {
  min:     { ...plan(7.875, 10.125, 'Shortest', 'the steepest the code allows: 7⅞″ rise, 10⅛″ run'), w:36 },
  std:     { ...plan(7.5, 10.5, 'Standard', 'about 7½″ rise, 10½″ run'), w:36 },
  comfort: { ...plan(7, 11, 'Comfortable', 'about 7″ rise, 11″ run'), w:36 },
};
const TW = s => s.type==='int' ? 4.5 : 6.5;

/* the opening: from where the headroom runs out to the top riser (inches along the stair from its foot) */
function openingOf(o){ const k=Math.floor((CEIL_ABOVE - HEAD)/o.rise); return { a:Math.max(0, k*o.run), b:o.total + 1 }; }

/* pod-local ↔ plan feet (same turn rule as the floor layers) */
const frame = (k, i) => { const ls=layerSlotsFor(k).find(l=>l.pod.i===i && l.kind==='ceiling-int'); return ls; };
function toPlan(ls, [u, v]){ const th=-(ls.rot||0)*Math.PI/180, L0=ls.len, off={0:[0,0],90:[8,0],180:[L0,8],270:[0,L0]}[ls.rot||0], c=Math.cos(th), s=Math.sin(th);
  const lu=u/12, lv=v/12; return [ls.x+off[0]+(c*lu + s*lv), ls.z+off[1]+(-s*lu + c*lv)]; }
function toLocal(ls, [wx, wz]){ const th=-(ls.rot||0)*Math.PI/180, L0=ls.len, off={0:[0,0],90:[8,0],180:[L0,8],270:[0,L0]}[ls.rot||0], c=Math.cos(th), s=Math.sin(th);
  const dx=wx-ls.x-off[0], dz=wz-ls.z-off[1]; return [(dx*c-dz*s)*12, (dx*s+dz*c)*12]; }
const rectPlan = (ls, u0, u1, v0, v1) => { const P=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(q=>toPlan(ls,q)); return { x:Math.min(...P.map(p=>p[0])), z:Math.min(...P.map(p=>p[1])), x1:Math.max(...P.map(p=>p[0])), z1:Math.max(...P.map(p=>p[1])) }; };

/* everything about one stair: its steps (pod-local), its footprint and opening in plan, the pod above, and whether
   it fits */
function solve(k, S){
  const pods=podList(k), p=pods[S.pod]; if(!p || p.lv) return null;
  const o=OPTS[S.opt]||OPTS.std, ls=frame(k, S.pod); if(!ls) return null;
  const inS = 6.5, inN = 6.5;   // the long walls' inside faces (close enough; interior walls are 4½″)
  const v0 = S.side==='N' ? 96-inN-o.w : inS, v1 = v0+o.w;
  const uA = S.u0, uB = S.u0 + S.dir*o.total;   // foot and top along the pod
  const lo=Math.min(uA,uB), hi=Math.max(uA,uB), L=p.len*12;
  const op=openingOf(o), oa = S.dir>0 ? S.u0+op.a : S.u0-op.b, ob = S.dir>0 ? S.u0+op.b : S.u0-op.a;
  const foot=rectPlan(ls, lo, hi, v0, v1), hole=rectPlan(ls, Math.min(oa,ob), Math.max(oa,ob), v0-0.5, v1+0.5);
  // the pod above: it has to cover the whole opening
  const OFF=podOffsets(k), above=pods.filter(q=>q.lv).find(q=>{ const o2=OFF[q.i], x=q.x+o2.ox, z=q.z+o2.oz; return hole.x>=x-0.01 && hole.x1<=x+q.w+0.01 && hole.z>=z-0.01 && hole.z1<=z+q.d+0.01; });
  const why = lo < 6.5-0.01 || hi > L-6.5+0.01 ? `needs ${Math.ceil(o.total/12*10)/10}′ clear along the pod` : !above ? 'the opening has to be under an upstairs pod' : '';
  const steps=[]; for(let i=0;i<o.n-1;i++){ const u = S.u0 + S.dir*(i*o.run); steps.push({ u0:Math.min(u, u+S.dir*o.run), u1:Math.max(u, u+S.dir*o.run), top:(i+1)*o.rise }); }
  return { S, o, p, ls, v0, v1, lo, hi, foot, hole, above:above?above.i:null, why, steps, op };
}
const stairsOf = (k=state.model) => (MODELS[k]?.stairs||[]).map(S=>solve(k,S)).filter(Boolean);

/* the stair holes in one layer (layer-local inches, as holes): the lower pod's ceiling and roof, the upper pod's floor */
function stairHoles(ls, k=state.model){
  const out=[];
  stairsOf(k).forEach(st=>{ if(st.above==null) return;
    const mine = (ls.pod.i===st.S.pod && (ls.kind==='ceiling-int' || ls.kind==='roof')) || (ls.pod.i===st.above && ls.kind==='floor-up');
    if(!mine) return;
    const H=st.hole, P=[[H.x,H.z],[H.x1,H.z],[H.x1,H.z1],[H.x,H.z1]].map(q=>toLocal(ls,q));
    const x=Math.min(...P.map(p=>p[0])), x1=Math.max(...P.map(p=>p[0])), z=Math.min(...P.map(p=>p[1])), z1=Math.max(...P.map(p=>p[1]));
    out.push({ x:+x.toFixed(3), z:+z.toFixed(3), w:+(x1-x).toFixed(3), d:+(z1-z).toFixed(3), stair:true, name:'Stair opening' }); });
  return out;
}

/* the best spot in a ground-floor pod (or any): the first that fits, against either long wall, going either way */
function bestSpot(k, i, opt){
  const pods=podList(k), list = i!=null ? [pods[i]] : pods.filter(p=>!p.lv);
  for(const p of list){ if(!p || p.lv) continue; const L=p.len*12, o=OPTS[opt]||OPTS.std;
    for(const side of ['S','N']) for(const dir of [1,-1]) for(let a=6.5; a<=L-6.5; a+=1){
      const S={ pod:p.i, dir, side, u0: dir>0 ? a : L-a, opt }; const st=solve(k,S); if(st && !st.why) return S; } }
  return null;
}
function edit(fn){ checkpoint(); const key=ensureDraft(); const m=MODELS[key]; m.stairs ||= []; const r=fn(m.stairs, key); if(!m.stairs.length) delete m.stairs; save(); return r; }
function addStair(i=null, opt='std'){
  const k=state.model; let S=null;
  for(const o of [opt, 'std', 'min']){ S=bestSpot(k, i, o); if(S) break; }
  if(!S) return null;
  return edit(L=>{ let n=1; while(L.some(s=>s.id==='s'+n)) n++; const s={ id:'s'+n, ...S }; L.push(s); return s.id; });
}
function updateStair(id, patch){ return edit(L=>{ const s=L.find(x=>x.id===id); if(s) Object.assign(s, patch); return id; }); }
function removeStair(id){ edit(L=>{ const i=L.findIndex(x=>x.id===id); if(i>=0) L.splice(i,1); }); }
/* each option for a stair as it sits now (or at its best spot in this pod): { key, label, note, fits, why } */
function optionsFor(id){
  const k=state.model, S=(MODELS[k]?.stairs||[]).find(x=>x.id===id); if(!S) return [];
  return Object.entries(OPTS).map(([key,o])=>{ const st=solve(k,{...S, opt:key}); const alt=st?.why ? bestSpot(k, S.pod, key) : null;
    return { key, label:o.label, note:`${o.n} risers ${o.rise.toFixed(2)}″, ${o.n-1} treads ${o.run}″ · ${Math.floor(o.total/12)}′ ${Math.round(o.total%12)}″ long, ${o.w}″ wide`, fits:!st?.why || !!alt, why:st?.why, alt }; });
}
/* the treads and stringers in plan feet, for the 3D: [{ x, z, x1, z1, y0, y1, kind }] (y: inches above the floor) */
function stairParts(st){
  const out=[], T=1.5;
  st.steps.forEach(q=>{ const r=rectPlan(st.ls, q.u0, q.u1+(st.S.dir>0?1:0), st.v0, st.v1); out.push({ ...r, y0:q.top-T, y1:q.top, kind:'tread' }); });
  [[st.v0, st.v0+1.5],[st.v1-1.5, st.v1]].forEach(([a,b])=>{ const r=rectPlan(st.ls, st.lo, st.hi, a, b); out.push({ ...r, y0:0, y1:R, kind:'stringer' }); });
  return out;
}
/* the stair in plan feet, for the 2D and the sheets: the tread lines across, and the walking line up the middle */
function stairPlan(st){
  const P=q=>toPlan(st.ls, q), vm=(st.v0+st.v1)/2, lines=[];
  for(let i=0;i<st.o.n;i++){ const u=st.S.u0 + st.S.dir*(i*st.o.run); lines.push([P([u, st.v0]), P([u, st.v1])]); }
  return { lines, walk:[P([st.S.u0, vm]), P([st.S.u0 + st.S.dir*st.o.total, vm])] };
}
export { stairPlan, stairParts, OPTS, stairsOf, stairHoles, addStair, updateStair, removeStair, optionsFor, bestSpot, solve };
