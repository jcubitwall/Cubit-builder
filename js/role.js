/* Cubit Builder — role.js : what this person may do.
   On the private site the server says who you are (/api/me): 'admin' (everything, plus STEP uploads) or
   'viewer' (explore freely, but nothing is saved: no projects, no library changes, no uploads).
   Opened from a local server or anywhere without the API, the app runs as 'local' (everything except uploads). */
let ROLE='local', EMAIL=null;
const role = () => ROLE;
const canSave = () => ROLE!=='viewer';
const isAdmin = () => ROLE==='admin';
async function loadRole(){
  try{
    const r=await fetch('api/me',{cache:'no-store'});
    if(r.ok && (r.headers.get('content-type')||'').includes('json')){ const me=await r.json(); if(me.role==='admin'||me.role==='viewer'){ ROLE=me.role; EMAIL=me.email; } }
  }catch(e){}
  document.documentElement.classList.add('role-'+ROLE);
  return { role:ROLE, email:EMAIL };
}
const email = () => EMAIL;
export { role, canSave, isAdmin, loadRole, email };
