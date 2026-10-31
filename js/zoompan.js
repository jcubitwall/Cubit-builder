/* Cubit Builder — zoompan.js : pinch to zoom and two fingers to slide, on the panel builder's drawing.

   attachZoom(svg, Z) works on the SVG's viewBox, so everything stays sharp at any zoom and taps / drags still land
   in the drawing's own inches. Z = { k, x, y } is the builder's zoom (kept across redraws): k ≥ 1, and x, y the
   offset of the view from the whole-panel view, in drawing units.
     · two fingers: pinch to zoom round the point between them, slide to move (the view travels with the fingers' direction, as in Shapr3D)   (svg._pinch is true meanwhile, so
       the builder ignores the first finger's drag)
     · trackpad pinch / ctrl + wheel: zoom round the pointer; wheel or trackpad swipe while zoomed: move
     · the + / − / Fit buttons in the corner; double-tap with two fingers: back to the whole panel */
let PINCH=false;
const pinching = () => PINCH;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
function baseOf(svg){ if(!svg.dataset.base) svg.dataset.base=svg.getAttribute('viewBox'); return svg.dataset.base.split(/[\s,]+/).map(Number); }
function apply(svg, Z){
  const [bx,by,bw,bh]=baseOf(svg), w=bw/Z.k, h=bh/Z.k;
  Z.x=clamp(Z.x, -bw*0.1, bw-w+bw*0.1); Z.y=clamp(Z.y, -bh*0.1, bh-h+bh*0.1);
  if(Z.k<=1.0001){ Z.k=1; Z.x=0; Z.y=0; }
  svg.setAttribute('viewBox', `${bx+Z.x} ${by+Z.y} ${w} ${h}`);
  const lab=svg.parentElement?.querySelector('.zp-k'); if(lab) lab.textContent = Z.k>1.01 ? `${Math.round(Z.k*100)}%` : 'Fit';
}
/* client point → drawing units for a given viewBox (preserveAspectRatio meet, centred) */
function toSvg(svg, cx, cy, vb){
  const r=svg.getBoundingClientRect(), s=Math.min(r.width/vb[2], r.height/vb[3]);
  const ox=r.left+(r.width-vb[2]*s)/2, oy=r.top+(r.height-vb[3]*s)/2;
  return [vb[0]+(cx-ox)/s, vb[1]+(cy-oy)/s, s];
}
function zoomAt(svg, Z, k, cx, cy){
  const [bx,by,bw,bh]=baseOf(svg), vb=svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
  const [px,py]=toSvg(svg, cx, cy, vb), k2=clamp(k,1,16), w=bw/k2, h=bh/k2;
  // keep (px,py) under the same screen point
  const fx=(px-vb[0])/vb[2], fy=(py-vb[1])/vb[3];
  Z.k=k2; Z.x=px-fx*w-bx; Z.y=py-fy*h-by; apply(svg, Z);
}
function attachZoom(svg, Z){
  if(!svg) return; baseOf(svg); apply(svg, Z);
  // corner buttons
  const host=svg.parentElement; host.style.position='relative';
  host.querySelector('.zp-bar')?.remove();
  const bar=document.createElement('div'); bar.className='zp-bar';
  bar.innerHTML=`<button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="fit" class="zp-k" aria-label="Whole panel">Fit</button><button type="button" data-z="in" aria-label="Zoom in">+</button>`;
  host.appendChild(bar);
  bar.addEventListener('pointerdown', e=>e.stopPropagation());
  bar.onclick=e=>{ const b=e.target.closest('[data-z]'); if(!b) return; const r=svg.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
    if(b.dataset.z==='fit'){ Z.k=1; apply(svg,Z); } else zoomAt(svg, Z, Z.k*(b.dataset.z==='in'?1.5:1/1.5), cx, cy); };
  apply(svg, Z);
  // two-finger pinch / slide: listened for on the dialog (it outlives every redraw), before the drawing sees the touch
  const root=svg.closest('dialog')||document.body; root._zpZ=Z;
  if(!root._zp){ root._zp=true;
    const pts=new Map(); let g=null, lastTwo=0;
    const cur=()=>root.querySelector('.wb-svg');
    const mid=()=>{ const a=[...pts.values()]; return [(a[0].x+a[1].x)/2, (a[0].y+a[1].y)/2, Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y)]; };
    root.addEventListener('pointerdown', e=>{ if(e.pointerType!=='touch' || !e.target.closest?.('.wb-stage') || e.target.closest('.zp-bar')) return;
      pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pts.size>=2){ e.stopImmediatePropagation(); e.preventDefault(); PINCH=true; const v=cur(); if(!v) return; v._pinch=true;
        const [mx,my,d]=mid(); g={ mx, my, d, k:root._zpZ.k, vb:v.getAttribute('viewBox').split(/[\s,]+/).map(Number) };
        const now=performance.now(); if(now-lastTwo<320){ root._zpZ.k=1; apply(v,root._zpZ); g=null; } lastTwo=now; } }, true);
    root.addEventListener('pointermove', e=>{ if(!pts.has(e.pointerId)) return; pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(!g || pts.size<2) return; e.preventDefault(); e.stopImmediatePropagation();
      const v=cur(); if(!v) return; const Z=root._zpZ, [mx,my,d]=mid();
      const [bx,by,bw,bh]=baseOf(v), k2=clamp(g.k*d/Math.max(1,g.d),1,16), w=bw/k2, h=bh/k2;
      const [px,py]=toSvg(v, g.mx, g.my, g.vb);
      const r=v.getBoundingClientRect(), sc=Math.min(r.width/w, r.height/h), ox=r.left+(r.width-w*sc)/2, oy=r.top+(r.height-h*sc)/2;
      // zoom round where the fingers started; sliding the two fingers moves the view the way Shapr3D does (the
      // drawing slides opposite to the fingers)
      Z.k=k2; Z.x=px-(g.mx-ox)/sc-bx+(mx-g.mx)/sc; Z.y=py-(g.my-oy)/sc-by+(my-g.my)/sc; apply(v, Z); }, true);
    const up=e=>{ if(!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if(pts.size<2) g=null;
      if(PINCH){ e.stopImmediatePropagation(); if(!pts.size) setTimeout(()=>{ PINCH=false; const v=cur(); if(v) v._pinch=false; }, 80); } };
    root.addEventListener('pointerup', up, true); root.addEventListener('pointercancel', up, true);
  }
  // trackpad / mouse
  svg.addEventListener('wheel', e=>{ e.preventDefault();
    if(e.ctrlKey || e.metaKey) zoomAt(svg, Z, Z.k*Math.exp(-e.deltaY*0.01), e.clientX, e.clientY);
    else if(Z.k>1){ const vb=svg.getAttribute('viewBox').split(/[\s,]+/).map(Number), [, , s]=toSvg(svg,0,0,vb); Z.x+=e.deltaX/s; Z.y+=e.deltaY/s; apply(svg,Z); }
    else zoomAt(svg, Z, Z.k*Math.exp(-e.deltaY*0.0025), e.clientX, e.clientY); }, { passive:false });
  // Safari trackpad pinch
  let gs=1; svg.addEventListener('gesturestart', e=>{ e.preventDefault(); gs=Z.k; });
  svg.addEventListener('gesturechange', e=>{ e.preventDefault(); zoomAt(svg, Z, gs*e.scale, e.clientX, e.clientY); });
}
export { attachZoom, pinching };
