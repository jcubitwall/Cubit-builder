/* Cubit Builder — casework-parts.js : how every cabinet part is cut, drawn and dimensioned.

   partSVG(p) draws one part as it lies on the CNC (the face that's up), from part.cnc:
     the outline with its notches, every dado / groove / rabbet (hatched, by bit), every hole (shelf pins, hinge
     plate marks, runner holes, hinge cups and dowels, handle holes), the four edges named, and dimension chains
     to the edges for everything on it.
   opsTable(p) lists the same as numbers: program side, bit, what, where (from which edges), size and depth.
   Side A is the last program (the cut-throughs are in it). Side B, if a part has any, is cut first. */
import { fmt, fx3, settings, MM } from './casework.js';

const esc = s => String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const U_ = () => settings().units;
const L = v => U_()==='mm' ? `${Math.round(v/MM*10)/10}` : fmt(v);          // drawing labels (1/16″ or 0.1 mm)
const COL = { '½″':'#d0661f', '¼″':'#7a3fb0', '⅜″':'#2f6db5', hole:'#2f6db5', mark:'#7f8a83', cup:'#2f8a57', runner:'#c0392b', handle:'#111' };
const holeCol = o => o.k==='cup' ? COL.cup : o.k==='mark' ? COL.mark : /Runner/.test(o.what) ? COL.runner : /handle|pull|knob/i.test(o.what) ? COL.handle : /dowel/i.test(o.what) ? COL.cup : COL.hole;

/* the drawing: px wide (height follows the part), u to the right, v up */
let NID=0;
function partSVG(p, { px=620, dims=true, maxH=460 }={}){
  const c=p.cnc; if(!c) return ''; const id=`p${++NID}`;
  const pad=dims?58:14, s=Math.min((px-2*pad)/c.U, maxH/c.V), W=c.U*s+2*pad, H=c.V*s+2*pad+(dims?10:0);
  const X=u=>pad+u*s, Y=v=>pad+(c.V-v)*s;
  let g=`<svg class="pt-svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" role="img" aria-label="${esc(p.name)} as it is cut">`;
  g+=`<defs>${Object.entries({a:COL['½″'],b:COL['¼″'],c:COL['⅜″']}).map(([k,col])=>`<pattern id="${id}${k}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${col}22"/><line x1="0" y1="0" x2="0" y2="6" stroke="${col}" stroke-width="1.4"/></pattern>`).join('')}</defs>`;
  // the part
  g+=`<polygon points="${c.outline.map(([u,v])=>`${X(u).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" class="pt-out"/>`;
  // dados, grooves, rabbets (side B ones dashed: they're on the face that's down)
  c.ops.filter(o=>o.u0!=null).forEach(o=>{ const tid=o.tool==='½″'?'a':o.tool==='¼″'?'b':'c';
    g+=`<rect x="${X(Math.max(0,o.u0)).toFixed(1)}" y="${Y(Math.min(c.V,o.v1)).toFixed(1)}" width="${((Math.min(c.U,o.u1)-Math.max(0,o.u0))*s).toFixed(1)}" height="${((Math.min(c.V,o.v1)-Math.max(0,o.v0))*s).toFixed(1)}" fill="url(#${id}${tid})" stroke="${COL[o.tool]||'#333'}" stroke-width="1" ${o.side==='B'?'stroke-dasharray="4 3"':''}><title>${esc(o.what)}</title></rect>`; });
  // holes (drawn at least 2.2 px so 5 mm holes show on a long panel)
  c.ops.filter(o=>o.u!=null).forEach(o=>{ const r=Math.max(2.2, o.d/2*s), col=holeCol(o);
    g+=`<circle cx="${X(o.u).toFixed(1)}" cy="${Y(o.v).toFixed(1)}" r="${r.toFixed(1)}" fill="${o.k==='mark'?'#fff':o.thru?col:col+'55'}" stroke="${col}" stroke-width="${o.k==='cup'?1.4:1}"><title>${esc(o.what)} Ø${Math.round(o.d/MM*10)/10} mm × ${fx3(o.depth)}</title></circle>`; });
  // edge names
  g+=`<text x="${X(c.U/2)}" y="${Y(0)+14}" class="pt-edge" text-anchor="middle">${esc(c.v[0])}</text>`;
  g+=`<text x="${X(c.U/2)}" y="${Y(c.V)-6}" class="pt-edge" text-anchor="middle">${esc(c.v[1])}</text>`;
  g+=`<text transform="translate(${X(0)-6} ${Y(c.V/2)}) rotate(-90)" class="pt-edge" text-anchor="middle">${esc(c.u[0])}</text>`;
  g+=`<text transform="translate(${X(c.U)+12} ${Y(c.V/2)}) rotate(90)" class="pt-edge" text-anchor="middle">${esc(c.u[1])}</text>`;
  if(dims){
    // overall sizes
    const dimH=(u0,u1,y,lab,cls='pt-dim')=>{ if(Math.abs(u1-u0)<1e-6) return ''; return `<line x1="${X(u0)}" y1="${y}" x2="${X(u1)}" y2="${y}" class="${cls}"/><line x1="${X(u0)}" y1="${y-4}" x2="${X(u0)}" y2="${y+4}" class="${cls}"/><line x1="${X(u1)}" y1="${y-4}" x2="${X(u1)}" y2="${y+4}" class="${cls}"/><text x="${(X(u0)+X(u1))/2}" y="${y-3}" class="pt-dimt" text-anchor="middle">${lab}</text>`; };
    const dimV=(v0,v1,x,lab,cls='pt-dim')=>{ if(Math.abs(v1-v0)<1e-6) return ''; return `<line x1="${x}" y1="${Y(v0)}" x2="${x}" y2="${Y(v1)}" class="${cls}"/><line x1="${x-4}" y1="${Y(v0)}" x2="${x+4}" y2="${Y(v0)}" class="${cls}"/><line x1="${x-4}" y1="${Y(v1)}" x2="${x+4}" y2="${Y(v1)}" class="${cls}"/><text transform="translate(${x-3} ${(Y(v0)+Y(v1))/2}) rotate(-90)" class="pt-dimt" text-anchor="middle">${lab}</text>`; };
    g+=dimH(0,c.U,H-12,L(c.U),'pt-dim big')+dimV(0,c.V,12,L(c.V),'pt-dim big');
    // chains: every distinct u (dado ends, notches, hole columns) along the top; every distinct v up the right side
    const us=new Set([0,c.U]), vs=new Set([0,c.V]);
    c.outline.forEach(([u,v])=>{ us.add(+u.toFixed(4)); vs.add(+v.toFixed(4)); });
    c.ops.forEach(o=>{ if(o.u!=null){ us.add(+o.u.toFixed(4)); vs.add(+o.v.toFixed(4)); } else { [o.u0,o.u1].forEach(u=>u>0.001&&u<c.U-0.001&&us.add(+u.toFixed(4))); [o.v0,o.v1].forEach(v=>v>0.001&&v<c.V-0.001&&vs.add(+v.toFixed(4))); } });
    const chain=(set,max)=>{ let a=[...set].sort((x,y)=>x-y).filter((x,i,arr)=>i===0||x-arr[i-1]>0.02); return a.length>max ? null : a; };
    const cu=chain(us,22), cv=chain(vs,26);
    if(cu) for(let i=0;i+1<cu.length;i++) g+=dimH(cu[i],cu[i+1],pad-20,(cu[i+1]-cu[i])*s>22?L(cu[i+1]-cu[i]):'');
    if(cv) for(let i=0;i+1<cv.length;i++) g+=dimV(cv[i],cv[i+1],W-pad+30,(cv[i+1]-cv[i])*s>22?L(cv[i+1]-cv[i]):'');
    if(!cu || !cv) g+=`<text x="${X(0)}" y="${H-1}" class="pt-dimt">${!cu&&!cv?'Many holes: positions in the table below':!cu?'Many positions along: see the table':'Many heights: see the table'}</text>`;
  }
  return g+'</svg>';
}

/* the table: one row per kind of cut, with where it is from the edges */
function opsTable(p){
  const c=p.cnc; if(!c) return '';
  const rows=[], groups=new Map();
  c.ops.forEach(o=>{ const k=[o.side,o.k,o.what,o.tool||'',o.d||'',o.depth].join('|'); groups.set(k,[...(groups.get(k)||[]),o]); });
  const where=(o)=>{
    if(o.u!=null) return '';
    const fu = o.u0<=0.001 && o.u1>=c.U-0.001 ? `full length (${esc(c.u[0])} to ${esc(c.u[1])})` : `${fx3(o.u0)} to ${fx3(o.u1)} from the ${esc(c.u[0])}`;
    const fv = o.v0<=0.001 && o.v1>=c.V-0.001 ? `full length (${esc(c.v[0])} to ${esc(c.v[1])})` : `${fx3(o.v0)} to ${fx3(o.v1)} from the ${esc(c.v[0])}`;
    return `${fu}<br>${fv}`;
  };
  groups.forEach(os=>{ const o=os[0], isHole=o.u!=null;
    let pos;
    if(isHole){ const us=[...new Set(os.map(q=>q.u.toFixed(3)))], vs=[...new Set(os.map(q=>q.v.toFixed(3)))];
      pos = `${us.length>6?`${us.length} positions`:us.map(u=>fx3(+u)).join(', ')} from the ${esc(c.u[0])}<br>${vs.length>8?`${vs.length} heights, ${fx3(+vs[0])} to ${fx3(+vs[vs.length-1])}`:vs.map(v=>fx3(+v)).join(', ')} from the ${esc(c.v[0])}`; }
    else pos = os.map(where).join('<hr>');
    const size = isHole ? `Ø${Math.round(o.d/MM*10)/10} mm` : `${fx3(Math.min(o.u1-o.u0, o.v1-o.v0))} wide`;
    rows.push({ side:o.side, bit: isHole ? (o.k==='cup'?'35 mm':`${Math.round(o.d/MM*10)/10} mm drill`) : o.tool, what:o.what, n:os.length, pos, size, depth: o.thru ? 'through' : fx3(o.depth) });
  });
  rows.sort((a,b)=>(a.side==='B'?0:1)-(b.side==='B'?0:1));
  const outl = c.outline.length>4 ? `outline with notches (see the drawing)` : 'rectangle';
  return `<table class="pt-tab"><thead><tr><th>Side</th><th>Bit</th><th>Cut</th><th>×</th><th>Where</th><th>Size</th><th>Depth</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${r.side==='B'?'B <small>first</small>':'A'}</td><td>${esc(r.bit)}</td><td>${esc(r.what)}</td><td>${r.n}</td><td>${r.pos}</td><td>${r.size}</td><td>${r.depth}</td></tr>`).join('')}
    <tr class="pt-last"><td>A <small>last</small></td><td>⅜″</td><td>Cut out: ${outl}</td><td>1</td><td>${fx3(c.U)} × ${fx3(c.V)}</td><td>—</td><td>through, skim pass first</td></tr>
  </tbody></table>`;
}
export { partSVG, opsTable };
