/* Cubit Builder — panels.js */
import { FT, H, PW } from './config.js';

/* ============================================================ panel geometry (shared by 3D + 2D) */
/* Walls are measured in inches from the LEFT END SEEN FROM OUTSIDE (x = 0) to L.
   Panels: 4′ × 8′ SIPs. Full panels start at panel 1 — the left end seen from INSIDE, which is the
   RIGHT end seen from outside — and the last panel (leftmost from outside) is cut to fit. */
const wallLen = w => w.L ?? w.len*FT;
const panelCount = w => Math.max(1, Math.ceil(wallLen(w)/PW - 1e-6));
function panelSpans(w){
  const L=wallLen(w), n=panelCount(w);
  return [...Array(n)].map((_,k)=>{ const j=n-k; return [Math.max(0, L-j*PW), L-(j-1)*PW]; });   // k = 0 is the leftmost from outside
}
function panelAt(w, x){
  const sp=panelSpans(w); const k=sp.findIndex(([a,b])=>x>=a-1e-6 && x<b-1e-6);
  return k>=0 ? k : (x<=0 ? 0 : sp.length-1);
}
/* The wall as built in its slot. Long walls run the full pod length; short end walls fit BETWEEN the
   long walls, so they lose the long walls' thickness at each end (slot.trim = [left, right] in inches,
   seen from outside). Wall data is stored edge-to-edge; this shifts and clips it to the real wall. */
function bodyWall(slot, w){
  if(!w || w.fitted) return w;
  const tl=slot?.trim?.[0]||0, tr=slot?.trim?.[1]||0, full=w.len*FT, L=full-tl-tr;
  const clip = o => { const x0=Math.max(0,o.x-tl), x1=Math.min(L,o.x+o.w-tl); return x1-x0>0.5 ? {...o, x:x0, w:x1-x0} : null; };
  return { ...w, L, trim:[tl,tr], fitted:true,
    openings: w.openings.map(clip).filter(Boolean),
    inside: (w.inside||[]).map(b=>({...b, x:b.x-tr})).filter(b=>b.x>0 && b.x<L),     // inside items are measured from the inside-left = outside-right end
    outside: (w.outside||[]).map(b=>({...b, x:b.x-tl})).filter(b=>b.x>0 && b.x<L) };
}
function panelCells(w, k){
  const [X0,X1]=panelSpans(w)[k], xs=new Set([X0,X1]), ys=new Set([0,H]);
  const ops = w.openings.filter(o=>o.x<X1 && o.x+o.w>X0);
  ops.forEach(o=>{ xs.add(Math.max(X0,o.x)); xs.add(Math.min(X1,o.x+o.w)); ys.add(o.y); ys.add(Math.min(H,o.y+o.h)); });
  const X=[...xs].sort((a,b)=>a-b), Y=[...ys].sort((a,b)=>a-b), out=[];
  for(let i=0;i<X.length-1;i++){
    let run=null;
    for(let j=0;j<Y.length-1;j++){
      const cx=(X[i]+X[i+1])/2, cy=(Y[j]+Y[j+1])/2;
      const hole = ops.some(o=>cx>o.x&&cx<o.x+o.w&&cy>o.y&&cy<o.y+o.h);
      if(!hole){ if(run) run[3]=Y[j+1]; else run=[X[i],X[i+1],Y[j],Y[j+1]]; }
      else if(run){ out.push(run); run=null; }
    }
    if(run) out.push(run);
  }
  return out;
}
// physical panel number for the k-th panel counted from the exterior-left end.
// Default order: panel 1 is the left end when you face the INTERIOR side.
const panelNum = (n,k,rev) => rev ? k+1 : n-k;

/* ============================================================ thumbnails (exterior elevation) */
function thumbSVG(w){
  const L=wallLen(w), s=150/Math.max(L,96*1.6), Wd=L*s, Hd=H*s;
  let g=`<svg viewBox="-2 -2 ${Wd+4} ${Hd+4}" aria-hidden="true"><rect x="0" y="0" width="${Wd}" height="${Hd}" fill="#e8d3ad" stroke="#5b4a33" stroke-width=".8"/>`;
  panelSpans(w).slice(1).forEach(([a])=>{ g+=`<line x1="${a*s}" y1="0" x2="${a*s}" y2="${Hd}" stroke="#5b4a33" stroke-width=".4" stroke-dasharray="2 2"/>`; });
  w.openings.forEach(o=>{ g+=`<rect x="${o.x*s}" y="${(H-o.y-o.h)*s}" width="${o.w*s}" height="${o.h*s}" fill="${o.kind==='window'?'#8fc3ea':o.kind==='patio'?'#a9d4f2':o.kind==='opening'?'#ffffff':o.kind==='vent'?'#555':'#6b4a2f'}" stroke="#2c2c2c" stroke-width=".6"/>`; });
  return g+'</svg>';
}

export { panelCells, panelCount, panelNum, thumbSVG, wallLen, panelSpans, panelAt, bodyWall };
