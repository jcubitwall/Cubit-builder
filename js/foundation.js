/* Cubit Builder — foundation.js */
import { FT, POD } from './config.js';
import { MODELS } from './data.js';
import { asciiFt, fft, fin } from './format.js';
import { getBearing, northVec, fmtBearing, compass } from './orient.js';
import { podOffsets, screwPlan, slotsFor, podList, deckList, layoutOffsets, padsFor } from './layout.js';
import { buildHome } from './scene3d.js';
import { dimH, dimV, renderSheetList } from './sheets.js';
import { renderSide, toast } from './sidebar.js';
import { state } from './state.js';

/* ---------- foundation: one data model drives the on-screen sheet and the PDF ---------- */
function foundationData(){
  const m=MODELS[state.model]; const OFF=podOffsets(state.model);
  const pods=podList(state.model).map((p,i)=>({...p,x:p.x+OFF[i].ox,z:p.z+OFF[i].oz}));
  const LOd0=layoutOffsets(state.model).decks, B=pods.map(p=>[p.x,p.z,p.x+p.w,p.z+p.d]).concat(deckList(state.model).map((d,k)=>[d.x+LOd0[k].ox,d.z+LOd0[k].oz,d.x1+LOd0[k].ox,d.z1+LOd0[k].oz]));
  const minx=Math.min(...B.map(b=>b[0])), maxx=Math.max(...B.map(b=>b[2]));
  const minz=Math.min(...B.map(b=>b[1])), maxz=Math.max(...B.map(b=>b[3]));
  const labels=slotsFor(state.model).reduce((a,s)=>(a[s.pod.i]=s.pod.label,a),{});
  pods.forEach(p=>{ if(!labels[p.i]) labels[p.i]=POD[p.t].name; });
  const LOd=layoutOffsets(state.model).decks;
  const decks=deckList(state.model).map((d,k)=>({...d, x:d.x+LOd[k].ox, z:d.z+LOd[k].oz, idx:pods.length+k}));
  decks.forEach(d=>{ labels[d.idx]=d.label; });
  const plan=screwPlan(state.model,state.inset); let sc=plan.screws.map((q,k)=>({...q, src:k}));
  sc=sc.map(q=>{ const p=pods[q.pod]||decks[q.pod-pods.length]; const cx=p.x+p.w/2, cz=p.z+p.d/2; return {...q, ang:Math.atan2(q.z-cz, q.x-cx)}; })
       .sort((a,b)=>a.pod-b.pod || a.ang-b.ang).map((q,i)=>({...q,id:i+1, X:(q.x-minx)*FT, Y:(q.z-minz)*FT}));
  const dist=(a,b)=>Math.hypot(a.X-b.X,a.Y-b.Y);
  // squaring checks: outer corner screws of the whole layout, then each pod's own corners
  const checks=[];
  const pick=f=>sc.reduce((best,q)=>f(q)>f(best)?q:best, sc[0]);
  const FL=pick(q=>-(q.X+q.Y)), BR=pick(q=>q.X+q.Y), FR=pick(q=>q.X-q.Y), BL=pick(q=>q.Y-q.X);
  checks.push({group:'Whole layout', kind:'Diagonal', a:FL, b:BR}, {group:'Whole layout', kind:'Diagonal', a:FR, b:BL},
              {group:'Whole layout', kind:'Top side', a:FL, b:FR}, {group:'Whole layout', kind:'Bottom side', a:BL, b:BR},
              {group:'Whole layout', kind:'Left side', a:FL, b:BL}, {group:'Whole layout', kind:'Right side', a:FR, b:BR});
  // per pod: the largest rectangle of real screws carrying that pod (shared ones included), so its diagonals must match
  if(pods.length>1) pods.forEach(p=>{
    const x0=(p.x-minx)*FT-12, x1=(p.x-minx+p.w)*FT+12, y0=(p.z-minz)*FT-12, y1=(p.z-minz+p.d)*FT+12;
    const cand=sc.filter(q=>q.X>=x0&&q.X<=x1&&q.Y>=y0&&q.Y<=y1 && q.pods.includes(p.i));
    const at=(x,y)=>cand.find(q=>Math.abs(q.X-x)<0.05&&Math.abs(q.Y-y)<0.05);
    const xs=[...new Set(cand.map(q=>+q.X.toFixed(3)))], ys=[...new Set(cand.map(q=>+q.Y.toFixed(3)))];
    let best=null;
    xs.forEach(xa=>xs.forEach(xb=>{ if(xb<=xa) return; ys.forEach(ya=>ys.forEach(yb=>{ if(yb<=ya) return;
      const c=[at(xa,ya),at(xb,ya),at(xb,yb),at(xa,yb)]; if(c.some(v=>!v)) return;
      const area=(xb-xa)*(yb-ya); if(!best||area>best.area) best={area,c}; })); }));
    if(best && best.area>0.5*p.len*FT*96){ const c=best.c;
      checks.push({group:labels[p.i], kind:'Diagonal', a:c[0], b:c[2]}, {group:labels[p.i], kind:'Diagonal', a:c[1], b:c[3]}); }
  });
  checks.forEach(c=>c.len=dist(c.a,c.b));
  const front=[...new Set(sc.filter(q=>q.Y<12).map(q=>+q.X.toFixed(3)))].sort((a,b)=>a-b);
  const left=[...new Set(sc.filter(q=>q.X<12).map(q=>+q.Y.toFixed(3)))].sort((a,b)=>a-b);
  const pads=padsFor(state.model,state.inset).map((q,k)=>({...q, id:k+1, X:(q.x-minx)*FT, Y:(q.z-minz)*FT}));
  return {m,pods,decks,pads,labels,sc,warnings:plan.warnings,checks,front,left,minx,minz,W:(maxx-minx)*FT,D:(maxz-minz)*FT,corners:{FL,FR,BR,BL}};
}
/* head outlines around the screw centre, in drawing units (s = units per inch) */
function headRects(q,s){
  const L1=15*s, W1=7*s, ax=Math.abs(q.dir[0])>0.5;
  const rect=(horiz,off)=>{ const w=horiz?L1:W1, h=horiz?W1:L1; return [(horiz?off:0)-w/2, (horiz?0:off)-h/2, w, h]; };
  if(q.head==='swivel'){ const off=4.5*s*(ax?q.dir[0]:q.dir[1]); return [rect(ax, off)]; }
  if(q.head==='centre') return [rect(ax,0)];
  return [rect(true,0), rect(false,0)];
}
function headSVG(q,cx,cy,s){
  const st=q.shared?'fill="#f3c9a8" stroke="#d0661f" stroke-width="1.4"':'fill="#e3e6e0" stroke="#56606b" stroke-width=".8"';
  let g=headRects(q,s).map(([x,y,w,h])=>`<rect x="${cx+x}" y="${cy+y}" width="${w}" height="${h}" ${st}/>`).join('');
  if(q.arm){ const ax=cx+q.arm[0]*12*s, ay=cy+q.arm[1]*12*s; g+=`<line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" stroke="#d0661f" stroke-width="${3*s+1.5}" stroke-linecap="square"/><rect x="${ax-3.5*s}" y="${ay-3.5*s}" width="${7*s}" height="${7*s}" fill="#f3c9a8" stroke="#d0661f"/>`; }
  if(q.head==='swivel') g+=`<circle cx="${cx}" cy="${cy}" r="${3.6*s+3}" fill="none" stroke="#56606b" stroke-width=".7" stroke-dasharray="2 1.5"/>`;
  return g;
}
const HEAD_NAME={swivel:'Swivel', centre:'Centre', tee:'Tee', cross:'Cross'};
function headText(q,labels,html){
  const arm = q.arm ? ` + corner arm ${fin(Math.hypot(q.arm[0],q.arm[1])*12)}` : '';
  return headText0(q,labels,html)+arm;
}
function headText0(q,labels,html){
  if(q.head==='swivel') return html?'Swivel · perimeter, bracket turned in':'Swivel, perimeter';
  const who=q.pods.map(i=>labels[i]).join(' + ');
  return html?`<b style="color:#b4520f">${HEAD_NAME[q.head]}</b> · centred in the joint, carries ${who}`:`${HEAD_NAME[q.head]}, joint: ${who}`;
}
function renderFoundation(el){
  const F=foundationData(); const {pods,labels,sc,checks,W:Wf,D:Df}=F;
  const s=Math.min(2.4, 860/Wf), ml=110, mt=136, mr=60, mb=50, VW=Wf*s+ml+mr, VH=Df*s+mt+mb;
  const X=x=>ml+x*s, Y=y=>mt+y*s;    // inches from datum; true plan seen from above (same as the 3D top view)
  let g=`<svg viewBox="0 0 ${VW} ${VH}" font-family="IBM Plex Mono, monospace" role="img" aria-label="Ground screw plan"><defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="#2f6db5"/></marker></defs>`;
  F.decks.forEach(d=>{
    const px=(d.x-F.minx)*FT, py=(d.z-F.minz)*FT;
    g+=`<rect x="${X(px)}" y="${Y(py)}" width="${d.w*FT*s}" height="${d.d*FT*s}" fill="#efe4cc" stroke="#6b5a3a" stroke-width="1.2" stroke-dasharray="6 3"/>`;
    g+=`<text x="${X(px+d.w*6)}" y="${Y(py+d.d*6)+4}" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-size="12" font-weight="700" fill="#8a7a5c">${d.label} · ${d.L.w}′ × ${d.L.d}′</text>`;
  });
  pods.forEach(p=>{
    const px=(p.x-F.minx)*FT, py=(p.z-F.minz)*FT;
    g+=`<rect x="${X(px)}" y="${Y(py)}" width="${p.w*FT*s}" height="${p.d*FT*s}" fill="#f6f1e6" stroke="#111" stroke-width="1.6"/>`;
    g+=`<text x="${X(px+p.w*6)}" y="${Y(py+p.d*6)+4}" ${p.alongX?'':`transform="rotate(-90 ${X(px+p.w*6)} ${Y(py+p.d*6)+4})"`} text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-size="13" font-weight="700" fill="#8a7a5c">${labels[p.i]} · 8′ × ${p.len}′</text>`;
  });
  // squaring lines (whole layout diagonals)
  checks.filter(c=>c.group==='Whole layout'&&c.kind==='Diagonal').forEach(c=>{
    g+=`<line x1="${X(c.a.X)}" y1="${Y(c.a.Y)}" x2="${X(c.b.X)}" y2="${Y(c.b.Y)}" stroke="#c0392b" stroke-width="1" stroke-dasharray="6 4"/>`;
  });
  sc.forEach(q=>{
    g+=headSVG(q, X(q.X), Y(q.Y), s);
    g+=`<circle cx="${X(q.X)}" cy="${Y(q.Y)}" r="6" fill="#56606b" stroke="#111"/><circle cx="${X(q.X)}" cy="${Y(q.Y)}" r="1.6" fill="#fff"/>`;
    g+=`<text x="${X(q.X)+8}" y="${Y(q.Y)-7}" font-size="9.5" fill="#111">S${q.id}</text>`;
  });
  F.pads.forEach(q=>{ const h=8*s; g+=`<rect x="${X(q.X)-h}" y="${Y(q.Y)-h}" width="${2*h}" height="${2*h}" fill="#d9dbd6" stroke="#6d706b" stroke-width="1"/><text x="${X(q.X)+h+3}" y="${Y(q.Y)-h}" font-size="9" fill="#555">P${q.id}</text>`; });
  const yb=Y(0)-34; let pts=[0,...F.front,Wf];
  for(let k=0;k<pts.length-1;k++){ const a=pts[k],b=pts[k+1]; if(b-a<1e-3) continue; g+=dimH(X(a),X(b),yb,fin(b-a),Y(0),9.5); }
  const xl=X(0)-34; pts=[0,...F.left,Df];
  for(let k=0;k<pts.length-1;k++){ const a=pts[k],b=pts[k+1]; if(b-a<1e-3) continue; g+=dimV(Y(a),Y(b),xl,fin(b-a),X(0),9.5); }
  g+=dimH(X(0),X(Wf),Y(0)-76,`${fft(Wf)} overall`,Y(0),12);
  g+=dimV(Y(0),Y(Df),X(0)-74,`${fft(Df)}`,X(0),12);
  g+=`<text x="${X(0)}" y="${mt-100}" font-size="10.5" fill="#333">DATUM 0,0 = top-left outside corner of this plan · screws ${fin(state.inset)} in from the outside edge · orange = shared, centred in the ¾″ joint · grey = swivel head</text>`;
  g+=`<circle cx="${X(0)}" cy="${Y(0)}" r="5" fill="#fff" stroke="#d0661f" stroke-width="2"/>`;
  // north arrow + which way each side of the plan faces
  { const n=northVec(), a=Math.atan2(n[0],-n[1])*180/Math.PI, ax=VW-30, ay=mt+34;
    g+=`<g transform="rotate(${a} ${ax} ${ay})"><circle cx="${ax}" cy="${ay}" r="22" fill="#fff" stroke="#111" stroke-width="1.2"/><path d="M${ax} ${ay-19} L${ax+7} ${ay+6} L${ax} ${ay+1} L${ax-7} ${ay+6} Z" fill="#c0392b"/><text x="${ax}" y="${ay-25}" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-weight="800" font-size="13" fill="#c0392b">N</text></g>`;
    g+=`<text x="${X(0)}" y="${mt-118}" font-size="11" fill="#111" font-weight="700">ORIENTATION · TOP faces ${fmtBearing(getBearing())} · RIGHT ${fmtBearing(getBearing()+90)} · BOTTOM ${fmtBearing(getBearing()+180)} · LEFT ${fmtBearing(getBearing()+270)}</text>`; }
  g+=`<text x="${X(Wf)}" y="${VH-10}" text-anchor="end" font-size="10" fill="#555">PLAN SEEN FROM ABOVE · red dashed = check diagonals</text></svg>`;
  let ct=`<table class="boxes"><thead><tr><th>Check</th><th>Between</th><th>Measure</th></tr></thead><tbody>`;
  checks.forEach(c=>{ ct+=`<tr><td>${c.group} · ${c.kind}</td><td>S${c.a.id} ↔ S${c.b.id}</td><td><b>${fin(c.len)}</b> (${fft(c.len)})</td></tr>`; });
  ct+=`</tbody></table>`;
  let t=`<table class="boxes"><thead><tr><th>Screw</th><th>Pod</th><th>X from datum</th><th>Y from datum</th><th>Head</th></tr></thead><tbody>`;
  sc.forEach(q=>{ t+=`<tr><td>S${q.id}</td><td>${labels[q.pod]}</td><td>${fin(q.X)}</td><td>${fin(q.Y)}</td><td>${headText(q,labels,true)}</td></tr>`; });
  F.pads.forEach(q=>{ t+=`<tr><td>P${q.id}</td><td>${labels[pods.length+q.deck]}</td><td>${fin(q.X)}</td><td>${fin(q.Y)}</td><td>Concrete pad · floating deck, 16″ × 16″ (to confirm)</td></tr>`; });
  t+=`</tbody></table>`;
  el.innerHTML=`
    <div class="sheet-title"><div><div class="eyebrow" style="color:#555">Site sheet · Cubit Home</div><h3>${F.m.name} — ground screw layout</h3></div>
      <div class="meta">${sc.length} heavy steel ground screws (${sc.filter(q=>q.shared).length} shared in the joints)${F.pads.length?` · ${F.pads.length} concrete pads under floating decks`:''} · ${pods.length} pod${pods.length>1?'s':''} · footprint ${fft(Wf)} × ${fft(Df)}<br>${new Date().toISOString().slice(0,10)}</div></div>
    <div class="sheet-tools"><label for="insetIn" style="font-size:13px">Screw inset from outside edge (inches)</label>
      <input id="insetIn" type="number" min="2" max="18" step="0.5" value="${state.inset}" style="width:80px;padding:6px 8px;border:1px solid #cfd4cc;border-radius:6px;font:inherit">
      <button class="btn" id="pdfBtn" hidden>Download PDF</button>
      <span style="font-size:12.5px;color:#333">No gap over 12′ along any outside edge or joint; every corner has a screw. Where pods meet they share one screw centred in the ¾″ joint; around the outside each screw has a swivel head.</span></div>
    ${F.warnings.length?`<p class="note" style="color:#b4520f;font-weight:600">Check this layout: ${F.warnings.map(w=>`S${sc.findIndex(q=>q.src===w.a)+1} – S${sc.findIndex(q=>q.src===w.b)+1} ${w.kind==='close'?'only':''} ${fin(w.d*FT)} apart`).join(' · ')}</p>`:''}
    <div class="elev">${g}</div>
    <div class="sheet-grid"><div class="tblwrap"><div class="eyebrow" style="color:#555;margin-bottom:4px">Squaring checks</div>${ct}<p class="note" style="color:#444;margin-top:6px">Measure centre to centre of the shafts; each reading should match within 1/8″. The two diagonals of each pod are equal. Whole-layout diagonals can differ slightly where a pod is offset by the ¾″ joint space.</p></div>
      <div class="tblwrap" style="max-height:340px;overflow:auto"><div class="eyebrow" style="color:#555;margin-bottom:4px">Screw schedule</div>${t}</div></div>`;
  el.querySelector('#insetIn').addEventListener('change',e=>{ const v=parseFloat(e.target.value); if(v>=2&&v<=18){ state.inset=v; buildHome(); renderSheetList(); renderFoundation(el); renderSide(); } });
  const btn=el.querySelector('#pdfBtn');
  if(window.jspdf){
    const name=`Cubit ${F.m.name} - ground screw layout.pdf`;
    if(window.claude && window.claude.use){
      // running inside claude.ai: files go through the viewer's save prompt
      window.claude.use('downloads').then(dl=>{ if(!dl) return; btn.hidden=false;
        btn.onclick=async()=>{ try{ await dl.save({filename:name, data:foundationPDF()}); toast('PDF saved'); }
          catch(err){ if(err&&err.code==='declined') return; toast('The PDF could not be saved here.'); } };
      });
    } else {
      // normal website (GitHub Pages): ordinary browser download
      btn.hidden=false;
      btn.onclick=()=>{ const url=URL.createObjectURL(foundationPDF()); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000); toast('PDF downloaded'); };
    }
  }
}
/* vector PDF, letter landscape: page 1 plan with dims + diagonals, page 2 squaring checks + schedule */
function foundationPDF(){
  const F=foundationData(); const {pods,sc,checks,W:Wf,D:Df}=F;
  const labels={}; Object.keys(F.labels).forEach(k=>labels[k]=F.labels[k].replace(/′/g,"'").replace(/″/g,'"'));
  const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'pt',format:'letter'});
  const _text=doc.text.bind(doc); const clean=t=>String(t).replace(/′/g,"'").replace(/″/g,'"').replace(/[↔→←↓]/g,'-');
  doc.text=(t,...rest)=>_text(Array.isArray(t)?t.map(clean):clean(t),...rest);
  const PW_=792, PH_=612, M=36;
  const blue=[47,109,181], ink=[17,17,17], red=[192,57,43], org=[208,102,31];
  const titleBlock=(page,pages)=>{
    doc.setDrawColor(...ink); doc.setLineWidth(1); doc.rect(M, PH_-M-40, PW_-2*M, 40);
    [0.30,0.72,0.86].forEach(f=>doc.line(M+(PW_-2*M)*f,PH_-M-40,M+(PW_-2*M)*f,PH_-M));
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...ink);
    doc.text('CUBIT HOME', M+8, PH_-M-22); doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.text(`${F.m.name} - ground screw layout`, M+8, PH_-M-9);
    const c2=M+(PW_-2*M)*0.30+8; doc.setFontSize(8);
    doc.text(`${sc.length} screws (${sc.filter(q=>q.shared).length} shared)  |  inset ${fin(state.inset)} from outside edge`, c2, PH_-M-24);
    doc.text(`Footprint ${asciiFt(Wf)} x ${asciiFt(Df)}  |  3/4" space at pod joints`, c2, PH_-M-10);
    const c3=M+(PW_-2*M)*0.72+8; doc.text('UNITS: inches', c3, PH_-M-24); doc.text('DATE '+new Date().toISOString().slice(0,10), c3, PH_-M-10);
    const c4=M+(PW_-2*M)*0.86+8; doc.text('SHEET', c4, PH_-M-24); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text(`${page} of ${pages}`, c4, PH_-M-9);
  };
  const arrow=(x,y,dx,dy)=>{ const L=5,Wd=2.2; const n=Math.hypot(dx,dy)||1; const ux=dx/n,uy=dy/n;
    doc.triangle(x,y, x-ux*L-uy*Wd, y-uy*L+ux*Wd, x-ux*L+uy*Wd, y-uy*L-ux*Wd, 'F'); };
  const dimH=(x1,x2,y,ext,txt,fs=7)=>{ doc.setDrawColor(...blue); doc.setFillColor(...blue); doc.setLineWidth(0.6); doc.line(x1,y,x2,y);
    arrow(x1,y,-1,0); arrow(x2,y,1,0); doc.setLineWidth(0.3); doc.line(x1,ext,x1,y+3); doc.line(x2,ext,x2,y+3);
    doc.setTextColor(...blue); doc.setFont('helvetica','normal'); doc.setFontSize(fs); doc.text(txt,(x1+x2)/2,y-2.5,{align:'center'}); };
  const dimV=(y1,y2,x,ext,txt,fs=7)=>{ doc.setDrawColor(...blue); doc.setFillColor(...blue); doc.setLineWidth(0.6); doc.line(x,y1,x,y2);
    arrow(x,y1,0,1); arrow(x,y2,0,-1); doc.setLineWidth(0.3); doc.line(ext,y1,x-3,y1); doc.line(ext,y2,x-3,y2);
    doc.setTextColor(...blue); doc.setFont('helvetica','normal'); doc.setFontSize(fs); doc.text(txt,x-2.5,(y1+y2)/2,{align:'center',angle:90}); };
  // ---- page 1
  doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(...ink);
  doc.text(`${F.m.name} - ground screw layout`, M, M+8);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(60,60,60);
  doc.text('Plan seen from above. DATUM 0,0 = top-left outside corner. All measurements in inches to screw centres. Red dashed lines = diagonals to check square.', M, M+22);
  { const b=getBearing(), deg=d=>`${Math.round(((d%360)+360)%360)} deg ${compass(d)}`;
    doc.setFont('helvetica','bold'); doc.setTextColor(...ink);
    doc.text(`ORIENTATION: top of plan faces ${deg(b)}  |  right ${deg(b+90)}  |  bottom ${deg(b+180)}  |  left ${deg(b+270)}`, M, M+34);
    // north arrow, top right
    const n=northVec(), cx=PW_-M-30, cy=M+18, r=16, px=-n[1], pz=n[0];   // (px,pz) perpendicular to north
    doc.setDrawColor(...ink); doc.setFillColor(255,255,255); doc.setLineWidth(0.8); doc.circle(cx,cy,r,'FD');
    doc.setFillColor(192,57,43); doc.triangle(cx+n[0]*(r-2), cy+n[1]*(r-2), cx+px*5-n[0]*4, cy+pz*5-n[1]*4, cx-px*5-n[0]*4, cy-pz*5-n[1]*4, 'F');
    doc.setTextColor(192,57,43); doc.setFontSize(10); doc.text('N', cx+n[0]*(r+7), cy+n[1]*(r+7)+3, {align:'center'}); doc.setTextColor(...ink); doc.setFont('helvetica','normal'); }
  const areaX=M+70, areaY=M+40, areaW=PW_-2*M-110, areaH=PH_-2*M-40-40-95;
  const s=Math.min(areaW/Wf, (areaH-50)/Df); const ox=areaX+(areaW-Wf*s)/2, oy=areaY+58;
  const X=x=>ox+x*s, Y=y=>oy+y*s;
  F.decks.forEach(d=>{ const px=(d.x-F.minx)*FT, py=(d.z-F.minz)*FT;
    doc.setDrawColor(107,90,58); doc.setFillColor(239,228,204); doc.setLineWidth(0.8); doc.setLineDashPattern([4,2],0); doc.rect(X(px),Y(py),d.w*FT*s,d.d*FT*s,'FD'); doc.setLineDashPattern([],0);
    doc.setTextColor(150,130,95); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(`${d.label}  ${d.L.w}' x ${d.L.d}'`, X(px+d.w*6), Y(py+d.d*6)+3, {align:'center'}); });
  pods.forEach(p=>{ const px=(p.x-F.minx)*FT, py=(p.z-F.minz)*FT;
    doc.setDrawColor(...ink); doc.setFillColor(246,241,230); doc.setLineWidth(1.2); doc.rect(X(px),Y(py),p.w*FT*s,p.d*FT*s,'FD');
    doc.setTextColor(150,130,95); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text(`${labels[p.i]}  8' x ${p.len}'`, X(px+p.w*6), Y(py+p.d*6)+3, {align:'center', angle:p.alongX?0:90}); });
  doc.setDrawColor(...red); doc.setLineWidth(0.8); doc.setLineDashPattern([5,3],0);
  checks.filter(c=>c.group==='Whole layout'&&c.kind==='Diagonal').forEach(c=>{
    doc.line(X(c.a.X),Y(c.a.Y),X(c.b.X),Y(c.b.Y));
  });
  doc.setLineDashPattern([],0);
  { const d=checks.find(c=>c.group==='Whole layout'&&c.kind==='Diagonal'); const mx=(X(d.a.X)+X(d.b.X))/2, my=(Y(d.a.Y)+Y(d.b.Y))/2;
    const d2=checks.filter(c=>c.group==='Whole layout'&&c.kind==='Diagonal')[1];
    doc.setFillColor(255,255,255); doc.setDrawColor(...red); doc.setLineWidth(0.6); doc.roundedRect(mx-78,my-14,156,28,3,3,'FD');
    doc.setTextColor(...red); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.text(`S${d.a.id}-S${d.b.id} = ${fin(d.len)}`, mx, my-3, {align:'center'}); doc.text(`S${d2.a.id}-S${d2.b.id} = ${fin(d2.len)}`, mx, my+9, {align:'center'}); }
  sc.forEach(q=>{
    if(q.shared){ doc.setFillColor(243,201,168); doc.setDrawColor(...org); } else { doc.setFillColor(227,230,224); doc.setDrawColor(86,96,107); }
    doc.setLineWidth(0.6);
    headRects(q,s).forEach(([rx,ry,rw,rh])=>doc.rect(X(q.X)+rx,Y(q.Y)+ry,rw,rh,'FD'));
    if(q.arm){ doc.setDrawColor(...org); doc.setLineWidth(1.6); doc.line(X(q.X),Y(q.Y),X(q.X)+q.arm[0]*12*s,Y(q.Y)+q.arm[1]*12*s); doc.setLineWidth(0.6); }
    doc.setFillColor(86,96,107); doc.setDrawColor(...ink); doc.circle(X(q.X),Y(q.Y),3.6,'FD');
    doc.setTextColor(...ink); doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.text('S'+q.id, X(q.X)+5, Y(q.Y)-4.5);
  });
  F.pads.forEach(q=>{ const h=8*s; doc.setFillColor(217,219,214); doc.setDrawColor(109,112,107); doc.setLineWidth(0.5); doc.rect(X(q.X)-h,Y(q.Y)-h,2*h,2*h,'FD'); doc.setTextColor(90,90,90); doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.text('P'+q.id, X(q.X)+h+2, Y(q.Y)-h); });
  let pts=[0,...F.front,Wf];
  for(let k=0;k<pts.length-1;k++){ const a=pts[k],b=pts[k+1]; if(b-a<1e-3) continue; dimH(X(a),X(b),Y(0)-22,Y(0)-2,fin(b-a),6.5); }
  dimH(X(0),X(Wf),Y(0)-46,Y(0)-2,`${fin(Wf)}  (${asciiFt(Wf)}) overall`,8);
  pts=[0,...F.left,Df];
  for(let k=0;k<pts.length-1;k++){ const a=pts[k],b=pts[k+1]; if(b-a<1e-3) continue; dimV(Y(a),Y(b),X(0)-22,X(0)-2,fin(b-a),6.5); }
  dimV(Y(0),Y(Df),X(0)-48,X(0)-2,`${fin(Df)}  (${asciiFt(Df)})`,8);
  doc.setDrawColor(...org); doc.setFillColor(255,255,255); doc.setLineWidth(1.2); doc.circle(X(0),Y(0),3,'FD');
  // legend
  const lgY=PH_-M-40-14; doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(60,60,60);
  doc.setFillColor(243,201,168); doc.setDrawColor(...org); doc.rect(M,lgY-6,14,7,'FD'); doc.text('Shared - head centred in the 3/4" joint (centre, tee or cross head)', M+18, lgY);
  doc.setFillColor(227,230,224); doc.setDrawColor(86,96,107); doc.rect(M+260,lgY-6,14,7,'FD'); doc.text('Perimeter - swivel head, bracket turned in under the pod', M+278, lgY);
  doc.text('PLAN SEEN FROM ABOVE', PW_-M, lgY, {align:'right'});
  titleBlock(1,2);
  // ---- page 2: checks + schedule
  doc.addPage();
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...ink); doc.text('Squaring checks', M, M+8);
  const table=(x,y,cols,widths,rows,fs=7.5)=>{ let yy=y; const rh=13;
    doc.setFillColor(241,243,239); doc.setDrawColor(200,205,198); doc.setLineWidth(0.4);
    doc.rect(x,yy,widths.reduce((a,b)=>a+b,0),rh,'FD'); doc.setFont('helvetica','bold'); doc.setFontSize(fs); doc.setTextColor(...ink);
    let xx=x; cols.forEach((c,i)=>{ doc.text(c,xx+4,yy+9); xx+=widths[i]; }); yy+=rh;
    doc.setFont('helvetica','normal');
    rows.forEach(r=>{ doc.rect(x,yy,widths.reduce((a,b)=>a+b,0),rh); let xx=x; r.forEach((c,i)=>{ doc.text(String(c),xx+4,yy+9); xx+=widths[i]; }); yy+=rh; });
    return yy; };
  let y2=table(M, M+18, ['Check','Between','Measure (in)','Feet-inches'], [170,80,80,80],
    checks.map(c=>[`${c.group} - ${c.kind}`, `S${c.a.id} to S${c.b.id}`, fin(c.len), asciiFt(c.len)]));
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(60,60,60);
  doc.text(doc.splitTextToSize('Measure centre to centre of the screw shafts. Each reading should match this sheet within 1/8". The two diagonals of each pod are equal. Whole-layout diagonals differ slightly when pods are offset by the 3/4" joint space - use the numbers above, not each other.', 400), M, y2+14);
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...ink); doc.text('Screw schedule', M+430, M+8);
  const rows=sc.map(q=>[`S${q.id}`, labels[q.pod], fin(q.X), fin(q.Y), headText(q,labels,false)]).concat(F.pads.map(q=>[`P${q.id}`, labels[pods.length+q.deck], fin(q.X), fin(q.Y), 'Concrete pad, floating deck']));
  const perCol=Math.floor((PH_-2*M-40-40)/13)-1;
  table(M+430, M+18, ['Screw','Pod','X','Y','Head'], [32,62,46,46,140], rows.slice(0,perCol), 7);
  if(rows.length>perCol){ doc.addPage(); table(M, M+18, ['Screw','Pod','X','Y','Head'], [32,62,46,46,140], rows.slice(perCol), 7); }
  titleBlock(2,2);
  return doc.output('blob');
}
window.cubitFoundationPDF = foundationPDF;

export { foundationData, renderFoundation, foundationPDF };
