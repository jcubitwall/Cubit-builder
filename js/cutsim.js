/* Cubit Builder — cutsim.js : runs a .tap file the way the ShopSabre would, without the machine.

   · timeOf(text)      rough time to cut: feeds from the file, rapids at an assumed machine speed, the 4 s spindle
                       dwell, a tool change, plus 15 % for acceleration on short moves. A guess until timed on the machine.
   · simulate(text,t)  sweeps the ¾″ bit along every move on a 1/16″ grid and keeps how deep it cut at each spot
                       (Z 0 = the bed, so depth from the face that is up = t − lowest Z). Can stop part-way (animation).
   · checkPanel(...)   puts the two sides of a panel together (exterior pass mirrored side to side onto the interior),
                       finds what goes right through, which pieces come loose, and whether every opening / trim strip /
                       part really drops out.
   · depthCanvas, panel3D  draw it: a depth map (2D) and the cut panel in 3D with ½″ OSB skins and the foam core.
*/
const RAPID_XY = 800, RAPID_Z = 400, TOOL_CHANGE = 10, ACCEL = 1.15;   // ipm, ipm, s — rough ShopSabre figures
const RES = 1/16, X0 = -1, Y0 = -1, NX = Math.round(50/RES), NY = Math.round(98/RES);
const BLANK_W = 48, BLANK_H = 96, OSB = 0.5, TOOL_D = 0.75;

/* every move as a list of points (arcs split up), with the feed and the time it takes */
function parse(text){
  const out=[]; let p={X:0,Y:0,Z:null}, F=180, Fz=150, t=0;
  for(const raw of text.split(/\r?\n/)){
    const s=raw.trim().toUpperCase(); if(!s) continue;
    let m;
    if((m=s.match(/^F([\d.]+)\s+XY/))){ F=+m[1]; continue; }
    if((m=s.match(/^F([\d.]+)\s+Z/))){ Fz=+m[1]; continue; }
    if(/^G4\b/.test(s)){ const d=+(s.match(/X\s*([\d.]+)/)?.[1]||0); t+=d; out.push({g:4, t0:t-d, t1:t, pts:[]}); continue; }
    if(/^T\d+/.test(s)){ t+=TOOL_CHANGE; continue; }
    if(!(m=s.match(/^G0?([0-3])\b/))) continue;
    const g=+m[1], w={}; (s.slice(m[0].length).match(/[XYZIJF]-?[\d.]+/g)||[]).forEach(k=>w[k[0]]=+k.slice(1));
    if(w.F!=null){ if(w.X==null && w.Y==null && w.Z!=null) Fz=w.F; else F=w.F; }
    const q={X:w.X??p.X, Y:w.Y??p.Y, Z:w.Z??p.Z};
    if(p.Z==null){ p=q; continue; }
    let pts=[], len=0;
    if(g===2||g===3){
      const cx=p.X+(w.I||0), cy=p.Y+(w.J||0), r=Math.hypot(p.X-cx,p.Y-cy);
      let a0=Math.atan2(p.Y-cy,p.X-cx), a1=Math.atan2(q.Y-cy,q.X-cx);
      if(g===2){ while(a1>=a0-1e-9) a1-=2*Math.PI; } else { while(a1<=a0+1e-9) a1+=2*Math.PI; }
      len=Math.abs(a1-a0)*r; const n=Math.max(4, Math.ceil(len/0.05));
      for(let i=0;i<=n;i++){ const a=a0+(a1-a0)*i/n; pts.push([cx+r*Math.cos(a), cy+r*Math.sin(a), p.Z+(q.Z-p.Z)*i/n]); }
    } else {
      const dxy=Math.hypot(q.X-p.X,q.Y-p.Y), dz=Math.abs(q.Z-p.Z); len=Math.hypot(dxy,dz);
      const n=Math.max(1, Math.ceil(Math.max(dxy,dz)/0.05));
      for(let i=0;i<=n;i++) pts.push([p.X+(q.X-p.X)*i/n, p.Y+(q.Y-p.Y)*i/n, p.Z+(q.Z-p.Z)*i/n]);
    }
    let dt;
    if(g===0){ const dxy=Math.hypot(q.X-p.X,q.Y-p.Y), dz=Math.abs(q.Z-p.Z); dt=Math.max(dxy/RAPID_XY, dz/RAPID_Z)*60; }
    else { const plunge = Math.hypot(q.X-p.X,q.Y-p.Y)<1e-6; dt = len/(plunge?Fz:F)*60; }
    dt*=ACCEL;
    out.push({g, pts, t0:t, t1:t+dt, len}); t+=dt; p=q;
  }
  return { moves:out, total:t };
}
const timeOf = text => parse(text).total;
const fmtTime = s => { s=Math.round(s); const h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60; return h ? `${h} h ${String(m).padStart(2,'0')} min` : m ? `${m} min ${String(x).padStart(2,'0')} s` : `${x} s`; };

/* the bit's footprint on the grid */
const DISC = (()=>{ const r=TOOL_D/2, k=Math.ceil(r/RES), o=[]; for(let j=-k;j<=k;j++) for(let i=-k;i<=k;i++) if((i*i+j*j)*RES*RES <= r*r+1e-9) o.push(j*NX+i); return {o, k}; })();

/* lowest Z at every spot, optionally only up to time `until` (seconds) */
function simulate(parsed, until=Infinity, hm=null, from=0){
  hm ||= new Float32Array(NX*NY).fill(99);
  const M=parsed.moves;
  for(let mi=from; mi<M.length; mi++){
    const mv=M[mi]; if(mv.t0>=until) return {hm, next:mi, tool:mv.pts[0]||null};
    if(!mv.pts.length){ if(mv.t1>until) return {hm, next:mi, tool:null}; continue; }   // dwell: spindle spinning up
    const pts=mv.pts, last = mv.t1<=until ? pts.length : Math.max(1, Math.floor(pts.length*(until-mv.t0)/(mv.t1-mv.t0)));
    for(let k=0;k<last;k++){ const [x,y,z]=pts[k]; if(z>=20) continue;
      const i=Math.round((x-X0)/RES), j=Math.round((y-Y0)/RES), c=j*NX+i;
      if(i<DISC.k || j<DISC.k || i>=NX-DISC.k || j>=NY-DISC.k) continue;
      for(const o of DISC.o){ if(hm[c+o]>z) hm[c+o]=z; } }
    if(mv.t1>until) return {hm, next:mi, tool:pts[last-1]};
  }
  return {hm, next:M.length, tool:null};
}
/* depth cut from the face that is up, on the blank only (48 × 96, 1/16″ cells) */
const BW=Math.round(BLANK_W/RES), BH=Math.round(BLANK_H/RES);
function depthOf(hm, t, mirror=false){
  const d=new Float32Array(BW*BH);
  for(let j=0;j<BH;j++) for(let i=0;i<BW;i++){
    const ii = mirror ? BW-1-i : i;                                   // exterior pass seen from the interior side
    const z=hm[(j+Math.round(-Y0/RES))*NX + ii+Math.round(-X0/RES)];
    d[j*BW+i]=Math.max(0, Math.min(t, t-z));
  }
  return d;
}
/* the whole panel after all its files: dI from the interior face, dE from the exterior face */
function checkPanel(files){
  const t=files[0].thick, P={t, dI:new Float32Array(BW*BH), dE:new Float32Array(BW*BH), time:0};
  files.forEach(f=>{ const pr=parse(f.text), {hm}=simulate(pr); P.time+=pr.total;
    const d=depthOf(hm, t, /E/.test(f.side)); const into = /E/.test(f.side) ? P.dE : P.dI; for(let k=0;k<d.length;k++) into[k]=Math.max(into[k],d[k]); });
  // what goes right through, and the loose pieces
  const thru=new Uint8Array(BW*BH); let nThru=0, nPocket=0, thin=0;
  for(let k=0;k<thru.length;k++){ const s=P.dI[k]+P.dE[k]; if(s>=t-1e-3){ thru[k]=1; nThru++; } else if(s>0.01){ nPocket++; if(t-s<0.3 && t-s>0.001) thin++; } }
  const lab=new Int32Array(BW*BH).fill(-1), sizes=[], boxes=[]; let n=0; const st=new Int32Array(BW*BH);
  for(let k0=0;k0<lab.length;k0++){ if(thru[k0]||lab[k0]>=0) continue;
    let sp=0, cnt=0, x0=BW, x1=0, y0=BH, y1=0; st[sp++]=k0; lab[k0]=n;
    while(sp){ const k=st[--sp], i=k%BW, j=(k/BW)|0; cnt++; if(i<x0)x0=i; if(i>x1)x1=i; if(j<y0)y0=j; if(j>y1)y1=j;
      if(i>0 && !thru[k-1] && lab[k-1]<0){ lab[k-1]=n; st[sp++]=k-1; }
      if(i<BW-1 && !thru[k+1] && lab[k+1]<0){ lab[k+1]=n; st[sp++]=k+1; }
      if(j>0 && !thru[k-BW] && lab[k-BW]<0){ lab[k-BW]=n; st[sp++]=k-BW; }
      if(j<BH-1 && !thru[k+BW] && lab[k+BW]<0){ lab[k+BW]=n; st[sp++]=k+BW; } }
    sizes.push(cnt); boxes.push([x0*RES,(x1+1)*RES,y0*RES,(y1+1)*RES]); n++; }
  // the panel itself: the piece that covers most of the finished panel outside the openings (an opening can be
  // bigger than what's left of the panel, so "largest piece" isn't enough)
  const W=files[0].width ?? BLANK_W, wastes=[]; files.filter(f=>!/E/.test(f.side)).forEach(f=>f.ops.forEach(o=>{ if(o.waste) wastes.push(o.waste); }));
  const keep=new Float64Array(n);
  for(let j=0;j<BH;j++){ const y=(j+0.5)*RES; for(let i=0;i<BW;i++){ const x=(i+0.5)*RES, L=lab[j*BW+i]; if(L<0 || x>W) continue;
    if(wastes.some(w=>x>w[0]&&x<w[1]&&y>w[2]&&y<w[3])) continue; keep[L]++; } }
  let main=0; for(let L=1;L<n;L++) if(keep[L]>keep[main]) main=L;
  const pieces = sizes.map((c,i)=>({i, area:c*RES*RES, box:boxes[i]})).filter(p=>p.i!==main && p.area>=1).sort((a,b)=>b.area-a.area);
  // every opening, trim strip and part must come away from the panel
  const warn=[], ok=[];
  files.filter(f=>!/E/.test(f.side)).forEach(f=>f.ops.forEach(o=>{ if(!o.waste) return;
    const [u0,u1,v0,v1]=o.waste, cx=Math.min(BW-1,Math.max(0,Math.round((u0+u1)/2/RES))), cy=Math.min(BH-1,Math.max(0,Math.round((v0+v1)/2/RES)));
    const L=lab[cy*BW+cx];
    if(thru[cy*BW+cx] || L!==main) ok.push(`${o.what}: cuts free`);
    else warn.push(`${o.what}: does NOT come free; something holds it to the panel`); }));
  if(thin*RES*RES>0.5) warn.push(`${(thin*RES*RES).toFixed(1)} sq in left less than 0.3″ thick (almost through)`);
  return Object.assign(P, { thru, lab, main, pieces, warn, ok, throughArea:nThru*RES*RES, pocketArea:nPocket*RES*RES });
}

/* ---- drawing ---- */
const COL = { panel:[236,224,198], pocket:[47,138,87], ext:[122,63,176], thru:[34,38,36], bg:[244,239,230] };
/* depth map of one pass (hm from simulate) or of the whole panel (P from checkPanel) */
function depthCanvas(canvas, src, t, opts={}){
  const ctx=canvas.getContext('2d'); canvas.width=BW; canvas.height=BH;
  const img=ctx.createImageData(BW,BH), D=img.data;
  for(let j=0;j<BH;j++) for(let i=0;i<BW;i++){
    const k=j*BW+i, o=((BH-1-j)*BW+i)*4;                               // y up
    let c;
    if(src.dI){ const di=src.dI[k], de=src.dE[k];
      if(di+de>=t-1e-3) c=COL.thru; else if(de>0.01) c=mix(COL.panel,COL.ext,0.35+0.65*de/t); else if(di>0.01) c=mix(COL.panel,COL.pocket,0.35+0.65*di/t); else c=COL.panel; }
    else { const d=src[k]; c = d>=t-1e-3 ? COL.thru : d>0.01 ? mix(COL.panel, opts.ext?COL.ext:COL.pocket, 0.35+0.65*d/t) : COL.panel; }
    D[o]=c[0]; D[o+1]=c[1]; D[o+2]=c[2]; D[o+3]=255;
  }
  ctx.putImageData(img,0,0);
}
const mix=(a,b,f)=>[a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];

/* the cut panel in 3D: interior face up, ½″ OSB skins and the foam core coloured by depth */
function panel3D(host, P){
  const THREE=window.THREE; host.innerHTML='';
  const W=host.clientWidth||400, H=host.clientHeight||420;
  const renderer=new THREE.WebGLRenderer({antialias:true, alpha:true}); renderer.setPixelRatio(Math.min(2,devicePixelRatio)); renderer.setSize(W,H); host.appendChild(renderer.domElement);
  const scene=new THREE.Scene(), cam=new THREE.PerspectiveCamera(35, W/H, 0.5, 2000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8576, 0.85)); const sun=new THREE.DirectionalLight(0xffffff,0.75); sun.position.set(40,-60,120); scene.add(sun);
  // a coarser grid for the mesh (every 3rd cell ≈ 3/16″)
  const S=3, gw=Math.floor(BW/S), gh=Math.floor(BH/S), t=P.t;
  const at=(i,j)=>{ const k=Math.min(BH-1,j*S)*BW+Math.min(BW-1,i*S); return k; };
  const surf=(top)=>{
    const pos=new Float32Array((gw+1)*(gh+1)*3), col=new Float32Array((gw+1)*(gh+1)*3), idx=[];
    for(let j=0;j<=gh;j++) for(let i=0;i<=gw;i++){ const k=at(i,j), v=j*(gw+1)+i;
      const lift = P.lab[k]>=0 && P.lab[k]!==P.main ? 10 : 0;          // loose pieces float above the panel, as if lifted out
      const z = (top ? t-P.dI[k] : P.dE[k]) + lift, d = top ? P.dI[k] : P.dE[k];
      pos[v*3]=i*S*RES; pos[v*3+1]=j*S*RES; pos[v*3+2]=z;
      const c = d<0.01 ? (top?[0.80,0.66,0.45]:[0.72,0.58,0.40]) : d<OSB ? [0.66,0.48,0.28] : d<t-OSB ? [0.95,0.95,0.92] : [0.66,0.48,0.28];
      col.set(c, v*3); }
    for(let j=0;j<gh;j++) for(let i=0;i<gw;i++){ const a=j*(gw+1)+i, b=a+1, c=a+gw+1, d=c+1;
      const ks=[at(i,j),at(i+1,j),at(i,j+1),at(i+1,j+1)];
      if(ks.some(k=>P.thru[k])) continue;                                   // a cut right through: no skin across it
      if(new Set(ks.map(k=>P.lab[k])).size>1) continue;
      if(top) idx.push(a,b,d, a,d,c); else idx.push(a,d,b, a,c,d); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3));
    g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.9, side:THREE.DoubleSide}));
  };
  // side walls wherever the panel ends: the blank's edges and every cut right through, in OSB / foam / OSB bands
  const walls=()=>{
    const solid=(i,j)=>{ if(i<0||j<0||i>=gw||j>=gh) return -2; const ks=[at(i,j),at(i+1,j),at(i,j+1),at(i+1,j+1)];
      if(ks.some(k=>P.thru[k])) return -2; const L=P.lab[ks[0]]; return ks.every(k=>P.lab[k]===L) ? L : -2; };
    const pos=[], col=[], OS=[0.66,0.48,0.28], FO=[0.95,0.95,0.92];
    const vtx=(i,j)=>{ const k=at(i,j), lift=P.lab[k]>=0&&P.lab[k]!==P.main?10:0; return [i*S*RES, j*S*RES, P.dE[k]+lift, t-P.dI[k]+lift, lift]; };
    const quad=(a,b,za0,za1,zb0,zb1,c)=>{ if(za1-za0<1e-4 && zb1-zb0<1e-4) return;
      const A0=[a[0],a[1],za0],A1=[a[0],a[1],za1],B0=[b[0],b[1],zb0],B1=[b[0],b[1],zb1];
      [A0,B0,B1, A0,B1,A1].forEach(v=>{ pos.push(...v); col.push(...c); }); };
    const wall=(a,b)=>{ // a, b: [x, y, zBottom, zTop, lift]; bands at 0.5 above the bottom face and 0.5 below the top face
      const cl=(z,v)=>Math.min(v[3],Math.max(v[2],z)), b1=v=>cl(v[4]+OSB,v), b2=v=>cl(v[4]+t-OSB,v);
      quad(a,b, a[2],b1(a), b[2],b1(b), OS); quad(a,b, b1(a),b2(a), b1(b),b2(b), FO); quad(a,b, b2(a),a[3], b2(b),b[3], OS); };
    for(let j=0;j<gh;j++) for(let i=0;i<gw;i++){ const L=solid(i,j); if(L<0) continue;
      if(solid(i-1,j)!==L) wall(vtx(i,j+1), vtx(i,j));
      if(solid(i+1,j)!==L) wall(vtx(i+1,j), vtx(i+1,j+1));
      if(solid(i,j-1)!==L) wall(vtx(i,j), vtx(i+1,j));
      if(solid(i,j+1)!==L) wall(vtx(i+1,j+1), vtx(i,j+1)); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(col,3)); g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.9, side:THREE.DoubleSide}));
  };
  const grp=new THREE.Group(); grp.add(surf(true)); grp.add(surf(false)); grp.add(walls());
  grp.position.set(-BLANK_W/2, -BLANK_H/2, -t/2); scene.add(grp);
  cam.position.set(38, -118, 105); cam.up.set(0,0,1); cam.lookAt(0,0,0);
  const ctl=new THREE.OrbitControls(cam, renderer.domElement); ctl.target.set(0,0,0); ctl.update();
  const draw=()=>renderer.render(scene,cam); ctl.addEventListener('change', draw); draw();
  return { dispose(){ ctl.dispose(); renderer.dispose(); host.innerHTML=''; } };
}
export { parse, timeOf, fmtTime, simulate, depthOf, checkPanel, depthCanvas, panel3D, BW, BH, RES, X0, Y0, NX };
