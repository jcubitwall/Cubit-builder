/* Cubit Builder — casework-svg.js : a front view of a cabinet / appliance / piece of furniture, drawn from its parts
   (thumbnails in the library and the Build tray). */
import { partsOf } from './casework.js';

const FILL = { carcass:'#e6d3ae', shelf:'#ead9b6', back:'#d6bf95', front:'#f7f3ea', drawer:'#dcc394', hw:'#3b3f42', appliance:'#cfd3d6', appdoor:'#e6e8ea', top:'#9a9f9e',
  furnsoft:'#97a093', furnsoft2:'#aab2a4', furnwood:'#b98f60', furnwood2:'#c9a070' };
function frontSVG(it, { pad=2, stroke='#1c211e' }={}){
  const P=partsOf(it).filter(p=>p.box[5]>0.001 || p.box[3]>0.001);
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  P.forEach(p=>{ const [x,y,z,sx,sy]=p.box; x0=Math.min(x0,x); x1=Math.max(x1,x+sx); y0=Math.min(y0,y); y1=Math.max(y1,y+sy); });
  if(!P.length){ x0=0;y0=0;x1=it.w;y1=it.h; }
  const W=x1-x0, H=y1-y0, sw=Math.max(W,H)/90;
  const rects=P.slice().sort((a,b)=>(a.box[2]+a.box[5])-(b.box[2]+b.box[5])).map(p=>{ const [x,y,z,sx,sy]=p.box;
    return `<rect x="${(x-x0).toFixed(2)}" y="${(y1-y-sy).toFixed(2)}" width="${Math.max(sx,0.05).toFixed(2)}" height="${Math.max(sy,0.05).toFixed(2)}" fill="${FILL[p.role]||'#ddd'}" stroke="${p.hw?'none':stroke}" stroke-width="${sw.toFixed(2)}"${p.role==='hw'?' rx="0.2"':''}/>`; }).join('');
  return `<svg viewBox="${-pad} ${-pad} ${(W+2*pad).toFixed(2)} ${(H+2*pad).toFixed(2)}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${rects}</svg>`;
}
export { frontSVG };
