/* Cubit Builder — approval.js : what goes on the one-page approval sheet with the selections and signatures
   (customers-ui.js): the plan as drawn (room names, sizes, outside dimensions), two 3D pictures (outside, and inside
   from above with the roof off) and the customer's price (cost + the markup set under Tools, when the price book has
   prices). Pictures are JPEGs, small enough to keep with the signed record. */
import { state } from './state.js';
import { planOverlay } from './blueprint.js';
import { renderViews } from './blueprint-ui.js';
import { homeCost } from './prices.js';

const shrink = (url, maxW=1100, q=0.82) => new Promise(res=>{ const im=new Image(); im.onload=()=>{ const k=Math.min(1, maxW/im.width), c=document.createElement('canvas'); c.width=Math.round(im.width*k); c.height=Math.round(im.height*k);
  const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height); g.drawImage(im,0,0,c.width,c.height); res(c.toDataURL('image/jpeg', q)); }; im.onerror=()=>res(null); im.src=url; });
async function planPicture(){
  try{ const O=planOverlay(null, 30, null); return await shrink('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(O.svg), 1300, 0.85); }catch(e){ return null; }
}
const markup = () => { try{ const v=parseFloat(localStorage.getItem('cubit-markup')); return isFinite(v) ? v : 0; }catch(e){ return 0; } };
function customerPrice(k=state.model){ try{ const c=homeCost(k); if(!c || !c.priced || !(c.total>0)) return null; return { price:Math.round(c.total*(1+markup()/100)), missing:c.missing }; }catch(e){ return null; } }
async function approvalPics(){
  const plan=await planPicture(); let outside=null, inside=null;
  try{ const V=renderViews(); if(V[0]) outside=await shrink(V[0], 1000, 0.8); if(V[3]) inside=await shrink(V[3], 1000, 0.8); }catch(e){}
  return { plan, outside, inside };
}
export { approvalPics, customerPrice };
