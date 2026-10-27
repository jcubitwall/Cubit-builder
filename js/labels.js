/* Cubit Builder — labels.js
   Panel codes, assembly sequence, stacking order, CNC cut face / flip, and the label PDF.

   Panel numbers are fixed to the panel: panel 1 is the LEFT end of the wall seen from the
   INTERIOR side (for a wall between pods: seen from the pod that owns it, "side A").
   Assembly always goes LEFT → RIGHT as the assemblers see the wall on the table:
     interior side facing the assemblers → 1, 2, 3 … n
     exterior side facing the assemblers → n … 3, 2, 1
   Panels are stacked so the first one needed is on top.
   ShopSabre: a face with cuts that don't go through (plug / switch boxes, outside fixtures, the steel spine
   notch on the outer face of an end wall's corner panels) has to be UP on the CNC. If that face isn't the face the assemblers need up, the panel is flipped before stacking. */
import { FT, PW } from './config.js';
import { MODELS } from './data.js';
import { slotsFor } from './layout.js';
import { panelCount, panelSpans, wallLen, bodyWall } from './panels.js';
import { pickFor, podSeg, state } from './state.js';
import { fin } from './format.js';
import { nameOf } from './names.js';

const faceFor = slot => state.faces?.[state.model]?.[slot.id] || podSeg(slot)?.face || 'int';
const faceName = (slot, f) => slot.type==='int' ? (f==='int' ? `side A (faces ${slot.pod.label})` : `side B (faces ${slot.other.label})`) : (f==='int' ? 'interior' : 'exterior');
const faceShort = (slot, f) => slot.type==='int' ? (f==='int' ? 'SIDE A' : 'SIDE B') : (f==='int' ? 'INTERIOR' : 'EXTERIOR');

function panelPlan(slot, w0, assembly = faceFor(slot)){
  const w = bodyWall(slot, w0), L = wallLen(w), podNo = slot.pod.i+1, spans = panelSpans(w), n = spans.length;
  const panels = [];
  for(let k=0;k<n;k++){                 // k = index from the left end seen from OUTSIDE
    const [x0,x1]=spans[k], num=n-k, width=x1-x0;
    const through = w.openings.filter(o=>o.x < x1-0.01 && o.x+o.w > x0+0.01);
    const intCuts = (w.inside||[]).filter(b=>{ const xe=L-b.x; return xe>=x0 && xe<x1; });
    const extCuts = (w.outside||[]).filter(b=>b.x>=x0 && b.x<x1);
    // steel spine notch at a pod corner: cut into the outer face of an end wall's corner panel, so it counts as an outer-face cut
    const notch = !!((w.notch?.[0] && x0<=0.01) || (w.notch?.[1] && x1>=L-0.01));
    const outer = extCuts.length || notch;
    const cnc = intCuts.length && outer ? 'both' : intCuts.length ? 'int' : outer ? 'ext' : assembly;
    const flip = cnc==='both' ? 'two-sided' : (cnc!==assembly ? 'flip' : 'none');
    panels.push({ k, num, width, cut: width < PW-0.01, cutEnd: spans[k].cutEnd||null, code:`${podNo}${slot.letter}-${num}`, through, intCuts, extCuts, notch, cnc, flip });
  }
  // left → right as the assemblers see it
  const seq = assembly==='int' ? panels.slice().sort((a,b)=>a.num-b.num) : panels.slice().sort((a,b)=>b.num-a.num);
  seq.forEach((p,i)=>{ p.order=i+1; p.stack=i+1; });   // stack position 1 = top of the pile
  // OSB splines: each panel carries them on the edge that meets the next panel (its right edge as assembled)
  // …only where the two panels actually meet (none across a full-height opening with no SIP)
  const meet = (a,b) => b && Math.abs(spans[Math.min(a.k,b.k)][1]-spans[Math.max(a.k,b.k)][0])<0.01 && Math.abs(a.k-b.k)===1;
  seq.forEach((p,i)=>{ p.splineTo = meet(p, seq[i+1]) ? seq[i+1].code : null; });
  return { slot, w, n, assembly, panels, seq, name: nameOf('w:'+slot.id) };
}
function homePlans(){
  return slotsFor(state.model).map(s=>{ const w=pickFor(s); return w ? panelPlan(s,w) : null; }).filter(Boolean);
}

/* ---------- on-screen table for one wall ---------- */
function stackTableHTML(plan){
  const {slot}=plan;
  let h=`<table class="boxes"><thead><tr><th>Stack</th><th>Label</th><th>Cuts</th><th>Cut on the CNC with</th><th>Splines (staple on at the CNC)</th><th>Before stacking</th></tr></thead><tbody>`;
  plan.seq.forEach(p=>{
    const cuts=[p.through.length?`${p.through.length} through`:'', p.intCuts.length?`${p.intCuts.length} on ${faceShort(slot,'int').toLowerCase()}`:'', p.extCuts.length?`${p.extCuts.length} on ${faceShort(slot,'ext').toLowerCase()}`:'', p.notch?`spine notch on ${faceShort(slot,'ext').toLowerCase()}`:''].filter(Boolean).join(', ')||'none';
    const cnc = p.cnc==='both' ? `${faceShort(slot,'int')} up, then ${faceShort(slot,'ext')} up` : `${faceShort(slot,p.cnc)} up`;
    const flip = p.flip==='none' ? 'stack as cut' : p.flip==='flip' ? `<b class="flipflag">FLIP</b> so ${faceShort(slot,plan.assembly)} is up` : `<b class="flipflag">TWO-SIDED</b> · finish with ${faceShort(slot,plan.assembly)} up`;
    h+=`<tr><td>${p.stack}${p.stack===1?' (top)':p.stack===plan.n?' (bottom)':''}</td><td><b>${p.code}</b>${p.cut?` <span class="flipflag">cut to ${fin(p.width)}</span>`:''}</td><td>${cuts}</td><td>${cnc}</td><td>${p.splineTo?`right edge (meets ${p.splineTo})`:'none'}</td><td>${flip}</td></tr>`;
  });
  return h+`</tbody></table>`;
}

/* ---------- label PDF: Avery 5163 / 8163 layout, 2 × 5 labels of 4″ × 2″ on letter ---------- */
function labelsPDF(plans, title){
  const doc=new window.jspdf.jsPDF({orientation:'portrait',unit:'pt',format:'letter'});
  const _text=doc.text.bind(doc); const clean=t=>String(t).replace(/′/g,"'").replace(/″/g,'"').replace(/[↔→←↓]/g,'-');
  doc.text=(t,...r)=>_text(Array.isArray(t)?t.map(clean):clean(t),...r);
  const ink=[17,17,17], org=[208,102,31];
  const date=new Date().toISOString().slice(0,10);
  // page 1+: stack list
  let y=50;
  const head=()=>{ doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(...ink); doc.text(`${title} - cut & stack list`, 40, 40); doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(80,80,80);
    doc.text(doc.splitTextToSize(`Assembly always starts at the LEFT (the squaring edge of the upright table) and runs left to right as the assemblers see the wall. Each panel is stacked with that face up and labelled on that face. Stack position 1 is the top of the pile. Panel 1 = left end seen from the interior (side A). ${date}`, 530), 40, 54); y=80; };
  head();
  plans.forEach(pl=>{
    const rows=pl.seq.length;
    if(y+38+rows*13>752){ doc.addPage(); head(); }
    doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.setTextColor(...ink);
    doc.text(`${pl.slot.label}${pl.name?' - '+pl.name:''} (${pl.slot.detail}) - ${pl.w.id}`, 40, y+10);
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
    doc.text(`${faceShort(pl.slot,pl.assembly)} facing the assemblers  |  assembly order: ${pl.seq.map(p=>p.num).join(', ')}`, 40, y+22);
    y+=38;
    pl.seq.forEach(p=>{
      doc.setDrawColor(210,214,206); doc.setLineWidth(0.4); doc.line(40,y+3,572,y+3);
      doc.setTextColor(...ink); doc.setFont('helvetica','bold'); doc.text(String(p.stack), 44, y); doc.text(p.code+(p.cut?'  ('+fin(p.width)+')':''), 80, y);
      doc.setFont('helvetica','normal');
      doc.text(p.cnc==='both'?`CNC: ${faceShort(pl.slot,'int')} up, then ${faceShort(pl.slot,'ext')} up`:`CNC: ${faceShort(pl.slot,p.cnc)} up`, 150, y);
      if(p.flip!=='none'){ doc.setTextColor(...org); doc.setFont('helvetica','bold'); doc.text(p.flip==='flip'?'FLIP before stacking':'TWO-SIDED', 330, y); doc.setTextColor(...ink); doc.setFont('helvetica','normal'); }
      else doc.text('stack as cut', 330, y);
      doc.text(`${p.through.length} through, ${p.intCuts.length+p.extCuts.length} face cuts`, 460, y);
      y+=13;
    });
    y+=12;
  });
  // labels
  const LW=288, LH=144, mx=11.25, my=36, gap=13.5;
  let i=0;
  const all=plans.flatMap(pl=>pl.seq.map(p=>({pl,p})));
  all.forEach(({pl,p})=>{
    if(i%10===0) doc.addPage();
    const col=i%2, row=Math.floor((i%10)/2);
    const x=mx+col*(LW+gap), yy=my+row*LH;
    doc.setDrawColor(200,200,200); doc.setLineWidth(0.3); doc.roundedRect(x+4,yy+4,LW-8,LH-8,6,6);
    doc.setTextColor(...ink); doc.setFont('helvetica','bold'); doc.setFontSize(34); doc.text(p.code, x+16, yy+46); if(pl.name){ const cw=doc.getTextWidth(p.code); doc.setFontSize(12); doc.text(doc.splitTextToSize(pl.name, LW-48-cw)[0], x+24+cw, yy+46); }
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,70);
    doc.text(title, x+16, yy+62);
    doc.setTextColor(...ink); doc.setFontSize(10);
    doc.text(`${pl.slot.label} - panel ${p.num} of ${pl.n}  |  ${p.cut?'CUT to '+fin(p.width)+' wide':'full 48" panel'}`, x+16, yy+76);
    doc.text(`Stack ${p.stack} of ${pl.n}${p.stack===1?' (TOP)':p.stack===pl.n?' (bottom)':''}  |  assemble #${p.order} from left`, x+16, yy+90);
    doc.setFont('helvetica','bold'); doc.text(`STICK ON THE ${faceShort(pl.slot,pl.assembly)} FACE (faces the assemblers)`, x+16, yy+104);
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text(p.cnc==='both'?`CNC: cut ${faceShort(pl.slot,'int')} up, flip, cut ${faceShort(pl.slot,'ext')} up`:`CNC: cut with ${faceShort(pl.slot,p.cnc)} up`, x+16, yy+117);
    if(p.flip!=='none'){
      doc.setFillColor(...ink); doc.roundedRect(x+16, yy+122, 150, 15, 3, 3, 'F'); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(9);
      doc.text(p.flip==='flip'?'FLIP BEFORE STACKING':'TWO-SIDED PANEL', x+22, yy+132.5);
    }
    // mini wall strip seen from the assembly side, this panel filled
    const sw=96, sx=x+LW-sw-16, sy=yy+20, ph=34, pw=sw/pl.n;
    pl.seq.forEach((q,j)=>{
      doc.setDrawColor(...ink); doc.setLineWidth(0.6);
      if(q===p){ doc.setFillColor(...org); doc.rect(sx+j*pw, sy, pw, ph, 'FD'); } else doc.rect(sx+j*pw, sy, pw, ph);
      doc.setFontSize(7); doc.setTextColor(q===p?255:60, q===p?255:60, q===p?255:60); doc.text(String(q.num), sx+j*pw+pw/2, sy+ph/2+2.5, {align:'center'});
    });
    // splines: a heavy bar on this panel's right edge in the strip
    const me=pl.seq.indexOf(p);
    if(p.splineTo){ doc.setDrawColor(...ink); doc.setLineWidth(2.4); doc.line(sx+(me+1)*pw, sy-3, sx+(me+1)*pw, sy+ph+3); doc.setLineWidth(0.6); }
    doc.setTextColor(90,90,90); doc.setFontSize(6.5); doc.text('left  ->  right', sx+sw/2, sy+ph+9, {align:'center'});
    doc.setTextColor(...ink); doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.text(p.splineTo?`SPLINES ON RIGHT EDGE`:'NO SPLINES', sx+sw/2, sy-6, {align:'center'}); doc.setFont('helvetica','normal');
    i++;
  });
  return doc.output('blob');
}

export { panelPlan, homePlans, stackTableHTML, labelsPDF, faceFor, faceName, faceShort };
