/* Cubit Builder — panels.js */
import { FT, H, PW } from './config.js';

/* ============================================================ panel geometry (shared by 3D + 2D) */
function panelCells(w, k){
  const X0=k*PW, X1=X0+PW, xs=new Set([X0,X1]), ys=new Set([0,H]);
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
const panelCount = w => Math.round(w.len*FT/PW);
// physical panel number for the k-th panel counted from the exterior-left end.
// Default order: panel 1 is the left end when you face the INTERIOR side.
const panelNum = (n,k,rev) => rev ? k+1 : n-k;

/* ============================================================ thumbnails (exterior elevation) */
function thumbSVG(w){
  const L=w.len*FT, s=150/Math.max(L,96*1.6), Wd=L*s, Hd=H*s;
  let g=`<svg viewBox="-2 -2 ${Wd+4} ${Hd+4}" aria-hidden="true"><rect x="0" y="0" width="${Wd}" height="${Hd}" fill="#e8d3ad" stroke="#5b4a33" stroke-width=".8"/>`;
  for(let k=1;k<panelCount(w);k++) g+=`<line x1="${k*PW*s}" y1="0" x2="${k*PW*s}" y2="${Hd}" stroke="#5b4a33" stroke-width=".4" stroke-dasharray="2 2"/>`;
  w.openings.forEach(o=>{ g+=`<rect x="${o.x*s}" y="${(H-o.y-o.h)*s}" width="${o.w*s}" height="${o.h*s}" fill="${o.kind==='window'?'#8fc3ea':o.kind==='patio'?'#a9d4f2':o.kind==='opening'?'#ffffff':o.kind==='vent'?'#555':'#6b4a2f'}" stroke="#2c2c2c" stroke-width=".6"/>`; });
  return g+'</svg>';
}

export { panelCells, panelCount, panelNum, thumbSVG };
