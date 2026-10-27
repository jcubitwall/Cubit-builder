/* Cubit Builder — refmeasure.js : place an item by measuring from something already there (panel builder,
   walls and floors / ceilings / roofs).

   Pick an item, tap "Measure from…", then tap any point of reference on the drawing:
     · a dot: the centre, a corner or the middle of an edge of a hole, window, door, box or shape
     · a line: a panel joint, an electrical chase, an end of the panel, the floor or the top
   then type how far, sideways and / or up-down (one direction each, never at an angle), and whether that distance
   goes to the CENTRE of the item you're placing or to its NEAR EDGE (the edge facing the reference).
   "Place it" moves the item there. It's placed once: it doesn't follow the reference if that moves later.

   Everything here works in the drawing's own units (inches), x to the right and y DOWN (SVG), so the same code
   serves the wall (seen from outside or inside) and the layers (seen from above or below). Each builder hands in:
     items()   → [{ id, label, x0, x1, y0, y1, round }]   everything that can be measured from (not the picked one)
     lines()   → [{ x } | { y }, label]                   joints, chases, ends, floor, top …
     box()     → { x0, x1, y0, y1 }                       the picked item, where it is now
     moveBy(dx, dy)                                       move the picked item (returns a note if part was refused)
     rerender()                                           draw again
     words     { left, right, up, down, across, updown }  how directions read in that builder */
import { fin } from './format.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const parse = s => { s=String(s).trim().replace(/[″"]/g,''); if(!s) return NaN;
  const m=s.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/); return m && (m[1]||m[2]) ? (m[1]?+m[1]:0)+(m[2]?(+m[2])/(+m[3]):0) : NaN; };
const r16 = v => Math.round(v*16)/16;

function makeRefTool(A){
  let mode=null, ref=null, to='centre', pts=[], vals={};
  const W = { left:'Left', right:'Right', up:'Up', down:'Down', across:'Sideways', updown:'Up / down', ...(A.words||{}) };

  function candidates(){
    const out=[];
    A.items().forEach(it=>{ const cx=(it.x0+it.x1)/2, cy=(it.y0+it.y1)/2, L=it.label;
      out.push({ x:cx, y:cy, label:`centre of ${L}`, big:true });
      out.push({ x:it.x0, y:cy, label:`${W.left.toLowerCase()} edge of ${L}` }, { x:it.x1, y:cy, label:`${W.right.toLowerCase()} edge of ${L}` },
               { x:cx, y:it.y0, label:`${W.up==='Up'?'top':W.up.toLowerCase()} edge of ${L}` }, { x:cx, y:it.y1, label:`${W.down==='Down'?'bottom':W.down.toLowerCase()} edge of ${L}` });
      if(!it.round) [[it.x0,it.y0],[it.x1,it.y0],[it.x0,it.y1],[it.x1,it.y1]].forEach(([x,y])=>out.push({ x, y, label:`corner of ${L}` }));
    });
    return out;
  }
  const start = () => { mode='pick'; ref=null; A.rerender(); };
  const cancel = () => { mode=null; ref=null; A.rerender(); };
  const active = () => !!mode;
  /* current distances from the reference, and which side the item is on */
  function current(){
    const b=A.box(), out={};
    if(ref.x!=null){ const c=(b.x0+b.x1)/2, dir=c>=ref.x?1:-1, edge=dir>0?b.x0:b.x1, p=to==='centre'?c:edge; out.x={ dist:r16(Math.abs(p-ref.x)), dir }; }
    if(ref.y!=null){ const c=(b.y0+b.y1)/2, dir=c>=ref.y?1:-1, edge=dir>0?b.y0:b.y1, p=to==='centre'?c:edge; out.y={ dist:r16(Math.abs(p-ref.y)), dir }; }
    return out;
  }
  function choose(i){ const c=pts[i]; if(!c) return; ref={...c}; mode='set'; to='centre'; vals=current(); A.rerender(); }
  /* the builder's pointerdown calls this first: true = it was a reference point and is handled */
  function handle(e){ if(mode!=='pick') return false; const t=e.target.closest('[data-ref]'); if(!t){ return false; } e.preventDefault(); e.stopPropagation(); choose(+t.dataset.ref); return true; }

  /* drawn over everything: the points to tap, or the measurement once a reference is picked */
  function overlay(){
    if(!mode) return '';
    if(mode==='pick'){
      pts=[]; let g='<g class="rf-layer">';
      A.lines().forEach(([ln,label])=>{ const i=pts.push({...ln, label})-1;
        g += ln.x!=null ? `<line x1="${ln.x}" y1="${A.extent().y0}" x2="${ln.x}" y2="${A.extent().y1}" class="rf-ln" data-ref="${i}"><title>${esc(label)}</title></line>`
                        : `<line x1="${A.extent().x0}" y1="${ln.y}" x2="${A.extent().x1}" y2="${ln.y}" class="rf-ln" data-ref="${i}"><title>${esc(label)}</title></line>`; });
      candidates().forEach(c=>{ const i=pts.push(c)-1; g+=`<circle cx="${c.x}" cy="${c.y}" r="${c.big?2.2:1.6}" class="rf-pt${c.big?' big':''}" data-ref="${i}"><title>${esc(c.label)}</title></circle>`; });
      return g+'</g>';
    }
    const b=A.box(), cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2; let g='<g class="rf-layer set">';
    if(ref.x!=null && ref.y!=null) g+=`<circle cx="${ref.x}" cy="${ref.y}" r="2" class="rf-ref"/>`;
    else if(ref.x!=null) g+=`<line x1="${ref.x}" y1="${A.extent().y0}" x2="${ref.x}" y2="${A.extent().y1}" class="rf-refln"/>`;
    else g+=`<line x1="${A.extent().x0}" y1="${ref.y}" x2="${A.extent().x1}" y2="${ref.y}" class="rf-refln"/>`;
    if(ref.x!=null){ const dir=cx>=ref.x?1:-1, p=to==='centre'?cx:(dir>0?b.x0:b.x1), y=ref.y!=null?ref.y:cy;
      if(Math.abs(p-ref.x)>0.01) g+=`<line x1="${ref.x}" y1="${y}" x2="${p}" y2="${y}" class="rf-dim"/><text x="${(ref.x+p)/2}" y="${y-1.5}" class="rf-dimt">${fin(Math.abs(p-ref.x))}</text>`;
      if(ref.y!=null) g+=`<line x1="${p}" y1="${y}" x2="${p}" y2="${cy}" class="rf-guide"/>`; }
    if(ref.y!=null){ const dir=cy>=ref.y?1:-1, p=to==='centre'?cy:(dir>0?b.y0:b.y1), x=ref.x!=null?(to==='centre'?cx:(cx>=ref.x?b.x0:b.x1)):cx;
      if(Math.abs(p-ref.y)>0.01) g+=`<line x1="${x}" y1="${ref.y}" x2="${x}" y2="${p}" class="rf-dim"/><text x="${x+1.5}" y="${(ref.y+p)/2}" class="rf-dimt" text-anchor="start">${fin(Math.abs(p-ref.y))}</text>`; }
    return g+'</g>';
  }
  function panel(){
    if(!mode) return `<button class="btn ghost sm rf-go" data-rf="start" title="Tap a point on the drawing, then type how far from it">📏 Measure from…</button>`;
    if(mode==='pick') return `<div class="rf-box"><div class="eyebrow">Measure from</div>
      <p class="note">Tap a point of reference on the drawing: a dot (the centre, a corner or an edge of a hole, window, door, box or shape) or a dashed line (a panel joint, a chase, an end, the floor or the top).</p>
      <div class="row"><button class="btn ghost sm" data-rf="cancel">Cancel</button></div></div>`;
    const seg=(name,val,opts)=>`<div class="seg sm" role="group">${opts.map(([v,l])=>`<button type="button" data-rf-${name}="${v}" aria-pressed="${String(val)===String(v)}">${l}</button>`).join('')}</div>`;
    const row=(ax,label,neg,pos)=>{ const v=vals[ax]; if(!v) return '';
      return `<div class="rf-row"><span>${label}</span><label class="cw-f"><input data-rf-dist="${ax}" inputmode="decimal" value="${v.dist}"><i>″</i></label>${seg('dir-'+ax, v.dir, [[-1,neg],[1,pos]])}</div>`; };
    return `<div class="rf-box"><div class="eyebrow">Measure from ${esc(ref.label)}</div>
      <div class="rf-row"><span>To the item's</span>${seg('to', to, [['centre','Centre'],['edge','Near edge']])}</div>
      ${row('x', W.across, '← '+W.left, W.right+' →')}${row('y', W.updown, '↑ '+W.up, '↓ '+W.down)}
      <p class="note">Placed once: it won't follow ${esc(ref.label)} if that moves later.</p>
      <div class="row"><button class="btn sm" data-rf="place">Place it</button><button class="btn ghost sm" data-rf="again">Pick another point</button><button class="btn ghost sm" data-rf="cancel">Done</button></div></div>`;
  }
  function place(root){
    const read=ax=>{ const inp=root.querySelector(`[data-rf-dist="${ax}"]`); if(!inp) return; const v=parse(inp.value); if(isFinite(v) && v>=0) vals[ax].dist=v; };
    read('x'); read('y');
    const b=A.box(), cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2; let dx=0, dy=0;
    if(vals.x){ const d=vals.x.dir, p=to==='centre'?cx:(d>0?b.x0:b.x1); dx = ref.x + d*vals.x.dist - p; }
    if(vals.y){ const d=vals.y.dir, p=to==='centre'?cy:(d>0?b.y0:b.y1); dy = ref.y + d*vals.y.dist - p; }
    const note=A.moveBy(dx, dy); vals=current(); A.rerender(); if(note) A.toast?.(note);
  }
  function bind(root){
    root.querySelectorAll('[data-rf]').forEach(b=>b.onclick=()=>{ const a=b.dataset.rf;
      if(a==='start') start(); else if(a==='cancel') cancel(); else if(a==='again'){ mode='pick'; ref=null; A.rerender(); } else if(a==='place') place(root); });
    root.querySelectorAll('[data-rf-to]').forEach(b=>b.onclick=()=>{ to=b.dataset.rfTo; const keep={...vals}; vals=current(); ['x','y'].forEach(ax=>{ if(keep[ax] && vals[ax]) vals[ax].dir=keep[ax].dir; }); A.rerender(); });
    ['x','y'].forEach(ax=>root.querySelectorAll(`[data-rf-dir-${ax}]`).forEach(b=>b.onclick=()=>{ const inp=root.querySelector(`[data-rf-dist="${ax}"]`); const v=parse(inp?.value); if(isFinite(v)) vals[ax].dist=v; vals[ax].dir=+b.dataset[`rfDir${ax.toUpperCase()}`]; A.rerender(); }));
    // Enter on a keyboard places it too (the iPad number pad has no Enter: tap Place it)
    root.querySelectorAll('[data-rf-dist]').forEach(inp=>inp.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); place(root); } });
  }
  /* the picked item changed (another one picked, removed …): stop measuring */
  const reset = () => { mode=null; ref=null; };
  return { start, cancel, active, handle, overlay, panel, bind, reset, mode:()=>mode };
}
export { makeRefTool };
