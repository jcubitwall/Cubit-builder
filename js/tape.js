/* Cubit Builder — tape.js : a measuring tape for the panel builder (walls, floors, ceilings, roofs).

   Tap 📏 Tape, then tap two points on the drawing. Each tap clicks onto the nearest thing worth measuring from,
   within a finger's reach: a corner, the middle of an edge or the centre of a window, door, hole, box, pocket or shape;
   else a line (a panel joint, a chase, an end, the floor, the top or an edge of the panel), keeping where you tapped
   along it; else exactly where you tapped (to the nearest 1/16″). It shows the distance across, up / down and
   straight between them, drawn on the panel. A third tap starts a new measurement. Measuring only: nothing moves.

   Drawing units (inches), x right, y DOWN (SVG), like refmeasure.js. The builder hands in:
     items()  → [{ x0, x1, y0, y1, round, label }]   everything on the panel (the picked item too)
     lines()  → [[{ x } | { y }, label]]              joints, chases, ends, floor, top …
     extent() → { x0, x1, y0, y1 }
     rerender(), pinching()
     words    { across, updown }                       how the two directions read in that builder */
import { fin } from './format.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const r16 = v => Math.round(v*16)/16;
const REACH = 22;   // px: how far a tap reaches to click onto something

function makeTape(A){
  let on=false, a=null, b=null, down=null;
  const W = { across:'Across', updown:'Up / down', ...(A.words||{}) };

  function points(){
    const out=[];
    A.items().forEach(it=>{ const cx=(it.x0+it.x1)/2, cy=(it.y0+it.y1)/2, L=it.label;
      out.push({ x:cx, y:cy, label:`centre of ${L}`, big:true },
        { x:it.x0, y:cy, label:`left edge of ${L}` }, { x:it.x1, y:cy, label:`right edge of ${L}` },
        { x:cx, y:it.y0, label:`top edge of ${L}` }, { x:cx, y:it.y1, label:`bottom edge of ${L}` });
      if(!it.round) [[it.x0,it.y0,'top left'],[it.x1,it.y0,'top right'],[it.x0,it.y1,'bottom left'],[it.x1,it.y1,'bottom right']].forEach(([x,y,c])=>out.push({ x, y, label:`${c} corner of ${L}` }));
    });
    const E=A.extent();
    [[E.x0,E.y0,'top left corner of the panel'],[E.x1,E.y0,'top right corner of the panel'],[E.x0,E.y1,'bottom left corner of the panel'],[E.x1,E.y1,'bottom right corner of the panel']].forEach(([x,y,label])=>out.push({ x, y, label }));
    return out;
  }
  /* where a tap lands: a point, else a line (or two crossing), else where it was */
  function snap(p, unitsPerPx){
    const R=REACH*unitsPerPx;
    let best=null; points().forEach(c=>{ const d=Math.hypot(c.x-p.x, c.y-p.y); if(d<R && (!best || d<best.d - (c.big?0:0))) best={ ...c, d }; });
    if(best) return { x:best.x, y:best.y, label:best.label };
    let bx=null, by=null;
    A.lines().forEach(([ln,label])=>{
      if(ln.x!=null){ const d=Math.abs(ln.x-p.x); if(d<R && (!bx || d<bx.d)) bx={ v:ln.x, d, label }; }
      else { const d=Math.abs(ln.y-p.y); if(d<R && (!by || d<by.d)) by={ v:ln.y, d, label }; } });
    const x=bx?bx.v:r16(p.x), y=by?by.v:r16(p.y);
    const label = bx && by ? `${bx.label} at ${by.label}` : bx ? bx.label : by ? by.label : 'the point you tapped';
    return { x, y, label };
  }
  const start = () => { on=true; a=b=null; A.rerender(); };
  const stop = () => { on=false; a=b=null; A.rerender(); };
  const active = () => on;

  /* the builder's pointerdown / pointerup call these first; true = the tape has it */
  function handle(e){ if(!on) return false; e.preventDefault(); e.stopPropagation(); down=[e.clientX, e.clientY]; return true; }
  function release(e, svg){
    if(!on || !down) return false;
    const moved=Math.hypot(e.clientX-down[0], e.clientY-down[1]); down=null;
    if(moved>8 || A.pinching?.()) return true;
    const m=svg.getScreenCTM(); if(!m) return true;
    const P=svg.createSVGPoint(); P.x=e.clientX; P.y=e.clientY; const p=P.matrixTransform(m.inverse());
    const s=snap(p, 1/Math.abs(m.a||1));
    if(!a || b){ a=s; b=null; } else b=s;
    A.rerender(); return true;
  }

  function overlay(){
    if(!on) return '';
    let g='<g class="tp-layer">';
    points().forEach(c=>{ g+=`<circle cx="${c.x}" cy="${c.y}" r="${c.big?0.9:0.6}" class="tp-dot"/>`; });
    const pt=(q,cls)=>`<circle cx="${q.x}" cy="${q.y}" r="1.6" class="tp-pt ${cls}"/>`;
    if(a) g+=pt(a,'a');
    if(a && b){ const dx=Math.abs(b.x-a.x), dy=Math.abs(b.y-a.y), d=Math.hypot(dx,dy);
      if(dx>0.01) g+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${a.y}" class="tp-leg"/><text x="${(a.x+b.x)/2}" y="${a.y + (b.y>=a.y?-1.6:3.8)}" class="tp-t">${fin(r16(dx))}</text>`;
      if(dy>0.01) g+=`<line x1="${b.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="tp-leg"/><text x="${b.x + (b.x>=a.x?1.6:-1.6)}" y="${(a.y+b.y)/2+1}" class="tp-t" text-anchor="${b.x>=a.x?'start':'end'}">${fin(r16(dy))}</text>`;
      if(dx>0.01 && dy>0.01) g+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="tp-line"/><text x="${(a.x+b.x)/2 - (b.x>=a.x?1.4:-1.4)}" y="${(a.y+b.y)/2 + (b.y>=a.y?2.6:-1.4)}" class="tp-t tp-d" text-anchor="${b.x>=a.x?'end':'start'}">${fin(r16(d))}</text>`;
      g+=pt(b,'b'); }
    return g+'</g>';
  }
  function button(){ return `<button class="btn ghost sm" data-tp="${on?'stop':'start'}" aria-pressed="${on}" title="Measure between any two points: corners, edges, centres, joints, chases, ends">📏 Tape</button>`; }
  function panel(){
    if(!on) return '';
    let body;
    if(!a) body=`<p class="note">Tap the first point. It clicks onto the nearest corner, edge or centre of an opening, hole, box or shape, or onto a panel joint, chase, end, the floor or the top.</p>`;
    else if(!b) body=`<p class="note"><b>From</b> ${esc(a.label)}. Now tap the second point.</p>`;
    else { const dx=r16(Math.abs(b.x-a.x)), dy=r16(Math.abs(b.y-a.y)), d=r16(Math.hypot(b.x-a.x, b.y-a.y));
      body=`<p class="note"><b>From</b> ${esc(a.label)} <b>to</b> ${esc(b.label)}</p>
        <div class="tp-read"><span><small>${esc(W.across)}</small><b>${fin(dx)}</b></span><span><small>${esc(W.updown)}</small><b>${fin(dy)}</b></span>${dx>0.01&&dy>0.01?`<span><small>Straight</small><b>${fin(d)}</b></span>`:''}</div>
        <p class="note muted">Tap again to start a new measurement.</p>`; }
    return `<div class="tp-box"><div class="eyebrow">📏 Tape</div>${body}<div class="row"><button class="btn ghost sm" data-tp="stop">Done</button></div></div>`;
  }
  function bind(root){ root.querySelectorAll('[data-tp]').forEach(el=>el.onclick=()=>{ el.dataset.tp==='start' ? start() : stop(); }); }
  return { start, stop, active, handle, release, overlay, button, panel, bind };
}
export { makeTape };
