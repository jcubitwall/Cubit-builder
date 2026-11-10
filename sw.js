/* Cubit Builder — sw.js : the offline copy, so the app opens and works at a lot with weak or no signal.

   · The app's own files (pages, scripts, styles, data, images): the network first (always the newest when there is
     a connection), the copy on the device when the network is slow (3 s) or gone. Every file fetched is kept.
   · The libraries from cdnjs / jsDelivr (three.js, jsPDF…): versioned, so the kept copy is used straight away.
   · The team's data (GET /api/…): the network first, the last answer kept for when there's no connection.
     Saving (POST) always goes to the network; drafts are also kept in the browser and go up when the signal is back.
   tools/sw/build.py lists the files (sw-files.json) to keep on install and stamps VERSION; a new VERSION replaces the
   old copy. */
const VERSION='df93d1532cf2';
const CACHE='cubit-'+VERSION, API='cubit-api';
self.addEventListener('install', e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    try{ const r=await fetch('sw-files.json', { cache:'no-store' }); const L=(await r.json()).files||[];
      // a few at a time; a file that fails is fetched later when it's used
      // the libraries on other sites come back opaque (their script tags have no CORS), so they're put, not added
      const get=u=> /^https?:/.test(u) ? fetch(u, { mode:'no-cors' }).then(r=>c.put(u, r)) : c.add(new Request(u, { cache:'reload' }));
      for(let i=0;i<L.length;i+=12) await Promise.all(L.slice(i,i+12).map(u=>get(u).catch(()=>{}))); }catch(e){}
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{ for(const k of await caches.keys()) if(k.startsWith('cubit-') && k!==CACHE && k!==API) await caches.delete(k); await self.clients.claim(); })());
});
const keepable = r => r && r.ok && (r.type==='basic' || r.type==='cors');
async function networkFirst(req, cacheName, wait){
  const c=await caches.open(cacheName);
  const net=fetch(req).then(r=>{ if(keepable(r) && !r.redirected) c.put(req, r.clone()).catch(()=>{}); return r; });
  if(!wait) return net.catch(async()=>(await c.match(req, { ignoreSearch:false })) || Response.error());
  const timer=new Promise(res=>setTimeout(()=>res(null), wait));
  try{ const first=await Promise.race([net, timer]); if(first) return first; }catch(e){}
  const kept=await c.match(req); if(kept) return kept;
  return net.catch(()=>Response.error());
}
async function cacheFirst(req){
  const c=await caches.open(CACHE), kept=await c.match(req); if(kept) return kept;
  const r=await fetch(req); if(keepable(r) || r.type==='opaque') c.put(req, r.clone()).catch(()=>{}); return r;
}
self.addEventListener('fetch', e=>{
  const req=e.request; if(req.method!=='GET') return;
  const u=new URL(req.url);
  if(/^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.(googleapis|gstatic)\.com)$/.test(u.hostname)){ e.respondWith(cacheFirst(req)); return; }
  if(u.origin!==self.location.origin) return;
  if(u.pathname.includes('/cdn-cgi/')) return;   // Cloudflare's own sign-in pages
  if(u.pathname.includes('/api/')){ if(/[?&](photo|id|sig)=/.test(u.search)) return; e.respondWith(networkFirst(req, API, 0)); return; }
  e.respondWith(networkFirst(req, CACHE, 3000));
});
