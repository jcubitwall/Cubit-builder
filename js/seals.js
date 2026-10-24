/* Cubit Builder — seals.js : the rubber compression seal around every opening where two pods meet.

   The seal is ¾″ thick rubber padding (it fills the ¾″ space between pods), bonded to the OUTSIDE face of the pod's
   interior wall (the face toward the other pod) with an adhesive strip. Both pods get one around each opening:
     · the wall with the HIGHER letter gets the HIGHER seal, 2″ above (and 2″ further out than) the other wall's;
       e.g. a C wall meeting an A wall: C carries the high seal, A the low one. Same letter: the higher pod number.
     · shape: up both sides of the opening, over the head with a slight crown, then down the far side to the bottom,
       so water running down either wall is caught by one of the two seals and led around the opening.
   Low seal: 1½″ out from the rough opening (sides and head). High seal: 3½″ out. Crown: 1″ at the middle of the head.
   Above the wall every pod has its 11⅞″ LVL roof rim, wrapped on these sides by the roof's two layers of SilverBack
   (butyl skin). Where the head of a seal runs above the top of the wall it goes on the SilverBack over the rim, so
   there is always room for both seals, even over an opening that runs to the top of the wall. */
import { partnerOf } from './layout.js';
import { FRAME } from './config.js';

const SEAL = { t:0.75, w:1, low:1.5, rise:2, crown:1, r:3, name:'Rubber compression seal ¾″, adhesive back', rim:FRAME.lvl.roof };
const sealKinds = o => o.kind!=='vent';

/* which seal this wall carries: 'high' | 'low' | null (not between pods) */
function sealRole(slot, slots){
  if(!slot || slot.type!=='int' || !slots) return null;
  const me=slots.find(x=>x.id===slot.id) || slot;          // the same slot from this list (pods are matched by object)
  const pt=partnerOf(me, slots); if(!pt) return null;
  const a=slot.letter[0], b=pt.letter[0];
  if(a!==b) return a>b ? 'high' : 'low';
  return me.pod.i>pt.pod.i ? 'high' : 'low';
}
/* the seal's centre line around one opening, in wall face coords (x from the outside-left end, y up), inches */
function sealPath(o, role, L, H){
  const e = SEAL.low + (role==='high' ? SEAL.rise : 0);
  const xl=Math.max(0.6, o.x-e), xr=Math.min(L-0.6, o.x+o.w+e), yt=Math.min(H+SEAL.rim-SEAL.crown-1, o.y+o.h+e), r=Math.min(SEAL.r, (xr-xl)/4, yt/2), c=SEAL.crown;
  const P=[[xl,0],[xl,yt-r]];
  for(let i=1;i<=6;i++){ const a=Math.PI-(i/6)*Math.PI/2; P.push([xl+r+r*Math.cos(a), yt-r+r*Math.sin(a)]); }
  const span=(xr-r)-(xl+r);
  for(let i=1;i<20;i++){ const t=i/20; P.push([xl+r+span*t, yt+c*4*t*(1-t)]); }   // the crown
  for(let i=0;i<=6;i++){ const a=Math.PI/2-(i/6)*Math.PI/2; P.push([xr-r+r*Math.cos(a), yt-r+r*Math.sin(a)]); }
  P.push([xr,0]);
  const len=P.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-P[i][0], p[1]-P[i][1]), 0);
  return { pts:P, len, head:yt, out:e, onRim: yt>H };
}
function sealsFor(w, role, H){
  if(!role || !w) return [];
  const L = w.L ?? w.len*12;
  return (w.openings||[]).filter(sealKinds).map(o=>({ o, ...sealPath(o, role, L, H) }));
}
export { SEAL, sealRole, sealPath, sealsFor };
