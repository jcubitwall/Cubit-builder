/* Cubit Builder — role.js : what this person may do.
   The server says who you are (/api/me). Lowest to highest:
     user     look at everything: explode, zoom, walls, labels, production guidance. Nothing is saved.
     sales    + customers, swap walls and windows, add / move / turn pods, cabinets, basic choices with a client,
                save to Purgatory or to a customer, sign and lock a customer's home
     editor   + panel builder (move windows, plugs, holes), the libraries, deleting, adopting into Cubit Homes,
                replacing a Cubit Home, unlocking a signed home
     admin    + app settings, the team list (⋯ → Team), STEP uploads
   Opened from a local server (no API) the app runs as 'local': everything except uploads. */
const RANK = { user:0, viewer:0, sales:1, editor:2, admin:3, local:2 };
const NAME = { user:'User', viewer:'User', sales:'Salesperson', editor:'Editor', admin:'Admin', local:'Local' };
let ROLE='local', EMAIL=null;
const role = () => ROLE;
const atLeast = r => (RANK[ROLE]??0) >= RANK[r];
const canSave = () => atLeast('sales');     // build with a client: anything that saves
const canEdit = () => atLeast('editor');    // change walls, libraries, delete, adopt
const isAdmin = () => ROLE==='admin';
const roleName = (r=ROLE) => NAME[r] || r;
async function loadRole(){
  try{
    const r=await fetch('api/me',{cache:'no-store'});
    if(r.ok && (r.headers.get('content-type')||'').includes('json')){ const me=await r.json(); if(me.role in RANK && me.role!=='local'){ ROLE = me.role==='viewer' ? 'user' : me.role; EMAIL=me.email; } }
  }catch(e){}
  document.documentElement.classList.add('role-'+ROLE);
  return { role:ROLE, email:EMAIL };
}
const email = () => EMAIL;
export { role, canSave, canEdit, isAdmin, atLeast, roleName, loadRole, email };
