/* Cubit Builder — zoomview.js : tap any drawing (wall elevations, plans, sections) to open it full screen,
   fitted to the screen, then pinch or double-tap to zoom and drag to move around. On a phone the drawings
   on the sheet are shrunk to fit the width, so the whole wall is always visible at a glance. */
let ov=null, box=null, s=1, tx=0, ty=0, fit=1;
const pts=new Map(); let last=null, lastTap=0;
function apply(){ box.style.transform=`translate(${tx}px,${ty}px) scale(${s})`; }
function fitIt(){
  const W=innerWidth, H=innerHeight-56, svg=box.firstElementChild, vb=svg.viewBox.baseVal;
  const w=vb.width||svg.clientWidth, h=vb.height||svg.clientHeight;
  fit=Math.min(W/w, H/h)*0.96; s=fit; svg.setAttribute('width', w); svg.setAttribute('height', h);
  tx=(W-w*s)/2; ty=56+(H-h*s)/2; apply();
}
function zoomAt(f, cx, cy){ const ns=Math.min(fit*12, Math.max(fit*0.8, s*f)); tx=cx-(cx-tx)*(ns/s); ty=cy-(cy-ty)*(ns/s); s=ns; apply(); }
function open(svg){
  if(!ov){
    ov=document.createElement('div'); ov.className='zoomview'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-label','Drawing, zoomable');
    ov.innerHTML=`<div class="zv-bar"><span>Pinch or double-tap to zoom · drag to move</span><button class="btn ghost" data-zv="fit">Fit</button><button class="btn" data-zv="close">Close</button></div><div class="zv-box"></div>`;
    document.body.appendChild(ov); box=ov.querySelector('.zv-box');
    ov.querySelector('[data-zv="close"]').onclick=close;
    ov.querySelector('[data-zv="fit"]').onclick=fitIt;
    ov.addEventListener('pointerdown', e=>{ if(e.target.closest('.zv-bar')) return; ov.setPointerCapture(e.pointerId); pts.set(e.pointerId,[e.clientX,e.clientY]); last=null;
      if(pts.size===1){ const now=Date.now(); if(now-lastTap<300){ s>fit*1.5 ? fitIt() : zoomAt(2.5, e.clientX, e.clientY); lastTap=0; } else lastTap=now; } });
    ov.addEventListener('pointermove', e=>{ if(!pts.has(e.pointerId)) return; const prev=pts.get(e.pointerId); pts.set(e.pointerId,[e.clientX,e.clientY]);
      if(pts.size===1){ tx+=e.clientX-prev[0]; ty+=e.clientY-prev[1]; apply(); }
      else if(pts.size===2){ const [a,b]=[...pts.values()], d=Math.hypot(a[0]-b[0],a[1]-b[1]), m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        if(last){ zoomAt(d/last.d, m[0], m[1]); tx+=m[0]-last.m[0]; ty+=m[1]-last.m[1]; apply(); } last={d,m}; } });
    const up=e=>{ pts.delete(e.pointerId); last=null; };
    ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
    ov.addEventListener('wheel', e=>{ e.preventDefault(); zoomAt(e.deltaY<0?1.15:1/1.15, e.clientX, e.clientY); }, {passive:false});
    addEventListener('keydown', e=>{ if(e.key==='Escape' && !ov.hidden) close(); });
    addEventListener('resize', ()=>{ if(!ov.hidden) fitIt(); });
  }
  const c=svg.cloneNode(true); c.removeAttribute('style'); c.style.display='block';
  box.innerHTML=''; box.appendChild(c); ov.hidden=false; document.documentElement.classList.add('zv-lock'); fitIt();
}
function close(){ ov.hidden=true; box.innerHTML=''; pts.clear(); document.documentElement.classList.remove('zv-lock'); }
function initZoomView(){
  document.addEventListener('click', e=>{ const svg=e.target.closest('.elev svg'); if(svg && !e.target.closest('a,button')) open(svg); });
}
export { initZoomView };
