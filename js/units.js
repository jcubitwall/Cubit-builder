/* Cubit Builder — units.js : the window & door library and which unit goes in each opening.

   Library (data/units.json, filled by "Upload STEP → Window / door"):
     { id, name, type, w, h, d, hand?, swing?, source, sample? }   sizes in inches (the unit itself)
   Types, and what "hand" means for each (always seen from OUTSIDE):
     picture   fixed glass
     casement  hinged on one side          hand = hinge side L / R
     awning    hinged at the top
     single    single hung, lower sash slides up
     slider    horizontal slider           hand = the panel that moves, L / R
     entry     man door                    hand = hinge side L / R, swing in / out
     patio     patio slider                hand = the panel that moves, L / R
   Which unit sits in an opening: the person's choice (kept per home, per wall slot, per opening), else
   the home's own (models.json "units"), else the only library unit of the right kind that fits the
   rough opening. If several fit, it is left for the person to choose. */
import { state, save } from './state.js';
import { MODELS } from './data.js';

const TYPES = {
  picture:  { label:'Picture (fixed)', cat:'window' },
  casement: { label:'Casement',        cat:'window', hand:'Hinge' },
  awning:   { label:'Awning',          cat:'window' },
  single:   { label:'Single hung',     cat:'window' },
  slider:   { label:'Slider',          cat:'window', hand:'Moving panel' },
  entry:    { label:'Man door',        cat:'door',   hand:'Hinge', swing:true },
  patio:    { label:'Patio slider',    cat:'patio',  hand:'Moving panel' },
};
const CAT_OF = { window:'window', door:'door', patio:'patio' };   // opening kind → unit category
const UNITLIB = [];
async function loadUnits(){
  try{ const r=await fetch('data/units.json'); if(r.ok) (await r.json()).forEach(u=>UNITLIB.push(u)); }catch(e){}
}
const unitById = id => UNITLIB.find(u=>u.id===id);
const catOf = o => CAT_OF[o.kind];
/* a unit fits a rough opening when it is no bigger and at most 2″ smaller each way */
const fits = (u,o) => u.w<=o.w+0.125 && u.h<=o.h+0.125 && o.w-u.w<=2 && o.h-u.h<=2;
// sample units drop out of a category as soon as a real (uploaded) unit of that category exists
const unitsFor = o => { const c=catOf(o), real=UNITLIB.some(u=>!u.sample && TYPES[u.type]?.cat===c);
  return UNITLIB.filter(u=>TYPES[u.type]?.cat===c && !(real && u.sample))
  .map(u=>({u, fit:fits(u,o)})).sort((a,b)=>(b.fit-a.fit) || (a.u.name>b.u.name?1:-1)); };
const okey = o => o.key ?? `${o.kind}@${Math.round(o.x)}`;

/* { unit, hand, swing, how:'chosen'|'home'|'auto' } or null */
function unitFor(slot, o){
  if(!catOf(o) || !slot) return null;
  const k=okey(o);
  const pick = state.units?.[state.model]?.[slot.id]?.[k] || MODELS[state.model]?.units?.[slot.id]?.[k];
  if(pick===false) return null;
  if(pick && unitById(pick.u)){ const u=unitById(pick.u); return { unit:u, hand:pick.hand||u.hand||'L', swing:pick.swing||u.swing||'in', how: state.units?.[state.model]?.[slot.id]?.[k]?'chosen':'home' }; }
  const fitting = unitsFor(o).filter(x=>x.fit);
  if(fitting.length===1){ const u=fitting[0].u; return { unit:u, hand:u.hand||'L', swing:u.swing||'in', how:'auto' }; }
  return null;
}
function setUnit(slot, o, pick){   // pick: {u, hand, swing} · null = back to automatic · false = leave empty
  const m=(state.units[state.model] ||= {}), s=(m[slot.id] ||= {}), k=okey(o);
  if(pick===null) delete s[k]; else s[k]=pick;
  save();
}

/* The elevation symbol for a unit, in the opening's own inches: x from its left edge SEEN FROM OUTSIDE, y up.
   Same lines for the 3D view and the drawings. Standard convention: a casement / door triangle points to
   the hinge side; sliders get an arrow on the panel that moves. */
function symbol(type, hand, w, h){
  const segs=[], arrows=[], m=Math.min(3, w*0.08), x0=m, x1=w-m, y0=m, y1=h-m, L=hand!=='R';
  if(type==='casement' || type==='entry'){
    const hx = L? x0 : x1, ox = L? x1 : x0;          // hinge side / handle side
    segs.push([ox,y0,hx,(y0+y1)/2],[ox,y1,hx,(y0+y1)/2]);
  } else if(type==='awning'){
    segs.push([x0,y0,(x0+x1)/2,y1],[x1,y0,(x0+x1)/2,y1]);
  } else if(type==='single'){
    segs.push([0,h/2,w,h/2]);
    arrows.push([w/2,h*0.12,w/2,h*0.4]);
  } else if(type==='slider' || type==='patio'){
    segs.push([w/2,0,w/2,h]);
    const ym=h*0.5, a=w*0.12, b=w*0.38;
    arrows.push(L ? [a,ym,b,ym] : [w-a,ym,w-b,ym]);
  }
  return { segs, arrows };
}
/* a small picture of the unit for lists */
function unitSVG(type, hand, w=30, h=50, px=44){
  const s=px/Math.max(w,h), W=w*s, Hh=h*s, sym=symbol(type, hand, w, h), glass=type!=='entry';
  let g=`<svg viewBox="-2 -2 ${W+4} ${Hh+4}" width="${(W+4).toFixed(1)}" height="${(Hh+4).toFixed(1)}" aria-hidden="true"><rect x="0" y="0" width="${W}" height="${Hh}" fill="${type==='none'?'#e4e6e1':glass?'#cfe6f7':'#c8a27e'}" stroke="currentColor" stroke-width="1.2"/>`;
  sym.segs.forEach(([a,b,c,d])=>{ g+=`<line x1="${a*s}" y1="${Hh-b*s}" x2="${c*s}" y2="${Hh-d*s}" stroke="currentColor" stroke-width=".9" stroke-dasharray="3 2"/>`; });
  sym.arrows.forEach(([a,b,c,d])=>{ const ang=Math.atan2(-(d-b),c-a), X=c*s, Y=Hh-d*s, k=4;
    g+=`<line x1="${a*s}" y1="${Hh-b*s}" x2="${X}" y2="${Y}" stroke="currentColor" stroke-width="1"/><path d="M${X} ${Y} L${X-k*Math.cos(ang-0.5)} ${Y-k*Math.sin(ang-0.5)} M${X} ${Y} L${X-k*Math.cos(ang+0.5)} ${Y-k*Math.sin(ang+0.5)}" stroke="currentColor" stroke-width="1" fill="none"/>`; });
  if(type==='entry'){ const kx = hand!=='R' ? W-5 : 5; g+=`<circle cx="${kx}" cy="${Hh*0.55}" r="1.6" fill="currentColor"/>`; }
  return g+'</svg>';
}
const handText = (u, hand, swing) => {
  const T=TYPES[u.type]; if(!T) return '';
  let t=T.hand ? `${T.hand==='Hinge'?'hinge':'moving panel'} ${hand==='R'?'right':'left'}` : '';
  if(T.swing) t+=`${t?', ':''}swings ${swing==='out'?'out':'in'}`;
  return t;
};
const unitLabel = (r) => r ? `${TYPES[r.unit.type]?.label||r.unit.type}${handText(r.unit,r.hand,r.swing)?' · '+handText(r.unit,r.hand,r.swing):''}` : '';

export { TYPES, UNITLIB, loadUnits, unitById, unitsFor, unitFor, setUnit, symbol, unitSVG, unitLabel, handText, catOf, okey, fits };
