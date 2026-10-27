/* Cubit Builder — wall-rules.js : the wall builder's standing rules — default heights and depths, what's locked,
   and the electrical chases things snap to. Shared by the team (functions/api/wallrules.js); every wall built after
   a change uses it.

   Per kind of item:
     y      default height, inches from the floor (boxes and round items: to the centre; windows: the sill)
     ylock  true = the height can't be dragged or typed; a deliberate unlock on one item overrides it for that item only
     depth  default depth (pockets and boxes)        dlock  the same lock for the depth
     side   'free' (anywhere along the wall) · 'chase' (snaps to the centre of the nearest electrical chase) ·
            'fixed' (can't be moved sideways until unlocked on that item)
   An item unlocked on purpose carries free:{ y, x, depth } — it keeps its own value and the rule leaves it alone.

   Electrical chases: a 1″ vertical hole in the foam of every SIP panel, its centre 6″ in from each edge of the
   ORIGINAL 48″ panel and then every foot: 6″, 18″, 30″, 42″. A panel cut short keeps the chases measured from its
   factory edge (the joint side). */
const DEFAULTS = {
  plug:   { label:'Plug box',          y:18, ylock:true,  depth:3, dlock:true,  side:'chase' },
  switch: { label:'Switch box',        y:48, ylock:true,  depth:3, dlock:true,  side:'chase' },
  double: { label:'Double switch box', y:48, ylock:true,  depth:3, dlock:true,  side:'chase' },
  light:  { label:'Wall light box',    y:66, ylock:false, depth:3, dlock:true,  side:'chase' },
  pocket: { label:'Round pocket',      y:48, ylock:false, depth:3, dlock:false, side:'free'  },
  vent:   { label:'Round hole',        y:84, ylock:false,                       side:'free'  },
  window: { label:'Window sill',       y:36, ylock:false,                       side:'free'  },
  round:  { label:'Round window sill', y:36, ylock:false,                       side:'free'  },
};
const CHASE = { first:6, every:12, panel:48 };
const KEY='cubit-wall-rules';
let R=clone(DEFAULTS), remote=false;
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function merge(d, s){ const o=clone(d); Object.keys(o).forEach(k=>{ if(s && typeof s[k]==='object') Object.assign(o[k], s[k], {label:o[k].label}); }); return o; }
async function loadRules(){
  try{ const r=await fetch('api/wallrules',{cache:'no-store'}); if(r.ok && (r.headers.get('content-type')||'').includes('json')){ R=merge(DEFAULTS, await r.json()); remote=true; return R; } }catch(e){}
  try{ R=merge(DEFAULTS, JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){}
  return R;
}
async function saveRules(next){
  R=merge(DEFAULTS, next);
  const out={}; Object.entries(R).forEach(([k,v])=>{ const {label, ...rest}=v; out[k]=rest; });
  if(remote){ const r=await fetch('api/wallrules',{method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({rules:out})}); const o=await r.json().catch(()=>({})); if(!r.ok) throw new Error(o.error||`Server said ${r.status}`); }
  else { try{ localStorage.setItem(KEY, JSON.stringify(out)); }catch(e){} }
  return R;
}
const rules = () => R;
const ruleFor = kind => R[kind] || null;
const sharedRules = () => remote;
/* chase centres along a wall, inches from the left end seen from OUTSIDE. Panels are counted from the right-hand
   end (the short one at the left); L = full length, cut = [off the left, off the right] where it butts between walls */
function chases(L, cut=[0,0]){
  const lo=Math.max(0,cut[0]||0), hi=L-Math.max(0,cut[1]||0), out=[];
  for(let right=hi; right>lo+1e-6; right-=CHASE.panel){
    const left=Math.max(lo, right-CHASE.panel);
    for(let c=CHASE.first; c<CHASE.panel; c+=CHASE.every){ const x=right-c; if(x>left+0.5) out.push(+x.toFixed(4)); }
  }
  return out.sort((a,b)=>a-b);
}
const nearest = (list, x) => list.reduce((b,c)=>Math.abs(c-x)<Math.abs(b-x)?c:b, list[0]);
export { loadRules, saveRules, rules, ruleFor, sharedRules, chases, nearest, CHASE, DEFAULTS };
