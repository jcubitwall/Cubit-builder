#!/usr/bin/env python3
"""
Cubit Builder — STEP importer.

    python3 tools/step-import/import_step.py  "home.step"  --name "Tanja Leet · Expanse + 1"  [--repo .]  [--from expanse]

Reads a Shapr3D STEP export of a whole home and:
  1. finds every pod from the floor's bottom sheets (FRP);
  2. scans every pod wall with test rays (1" x 2" grid, edges refined to 1/64") for thickness and openings,
     and classifies openings from the window / door units in them;
  3. scans each pod's four horizontal layers — exterior floor, interior floor, interior ceiling, roof —
     for their 4x8 panel layout and any holes through them;
  4. adds every UNIQUE wall and layer to the shared library (data/walls.json, data/layers.json) — anything
     identical to a library item within 1/8" reuses that item;
  5. saves the home as a shared project in data/projects.json (slot picks point at the library items).
  6. adds each pod that isn't in the pod library yet to data/pods.json (see pods_lib.py).
  7. finds deck / porch frames outside the pods, adds new ones to data/decks.json and places them (decks_lib.py).

Needs:  pip install cadquery-ocp numpy
Axes:   app plan x = the pods' long axis, app plan z across; mapped with a proper rotation (never mirrored).
"""
import argparse, json, math, os, re, sys, time, collections, statistics, tempfile, datetime
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopoDS import TopoDS
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
from OCP.gp import gp_Lin, gp_Pnt, gp_Dir
from OCP.TopAbs import TopAbs_FACE
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder

IN = 25.4
UNIT = re.compile(r'^(Panorama Proto|Kitchen|Living|Door|Frame|Handle|Window)', re.I)
# heights above the bottom of the floor, inches (Cubit standard build-up)
WALL_Z = (10.56, 106.56)
LAYERS = {   # kind: (z bottom, z top, label)
    'floor-ext':   (0.00,   4.60,  'Exterior floor'),
    'floor-int':   (6.08,  10.56,  'Interior floor'),
    'ceiling-int': (106.60, 113.07, 'Interior ceiling'),
    'roof':        (113.07, 119.55, 'Roof'),
}
DEPTH = 8.0

def log(*a): print(*a, file=sys.stderr, flush=True)

# ------------------------------------------------------------------ read STEP
def read_step(path):
    t=time.time()
    r=STEPControl_Reader(); r.ReadFile(path); r.TransferRoots()
    tr=r.WS().TransferReader(); shape=r.OneShape()
    solids=[]; ex=TopExp_Explorer(shape,TopAbs_SOLID)
    while ex.More():
        s=TopoDS.Solid(ex.Current()); name=''
        try:
            e=tr.EntityFromShapeResult(s,-1)
            if e is not None: name=e.Name().ToCString()
        except Exception: pass
        b=Bnd_Box(); BRepBndLib.AddOptimal_s(s,b,False,False); mn=b.CornerMin(); mx=b.CornerMax()
        g=GProp_GProps(); BRepGProp.VolumeProperties_s(s,g)
        solids.append(dict(i=len(solids), name=name, shape=s, bbmm=[mn.X(),mn.Y(),mn.Z(),mx.X(),mx.Y(),mx.Z()], vol=g.Mass()))
        ex.Next()
    X0=min(s['bbmm'][0] for s in solids); Y0=min(s['bbmm'][1] for s in solids); Z0=min(s['bbmm'][2] for s in solids)
    for s in solids:
        b=s['bbmm']; s['b']=[(b[0]-X0)/IN,(b[1]-Y0)/IN,(b[2]-Z0)/IN,(b[3]-X0)/IN,(b[4]-Y0)/IN,(b[5]-Z0)/IN]
    log(f'read {len(solids)} solids in {time.time()-t:.1f}s')
    return solids, (X0,Y0,Z0)

class Rays:
    def __init__(self, origin): self.o=origin; self.cache={}
    def hits(self, solid, p, d, length):
        it=self.cache.get(solid['i'])
        if it is None:
            it=IntCurvesFace_ShapeIntersector(); it.Load(solid['shape'],1e-3); self.cache[solid['i']]=it
        X0,Y0,Z0=self.o
        it.Perform(gp_Lin(gp_Pnt(p[0]*IN+X0,p[1]*IN+Y0,p[2]*IN+Z0),gp_Dir(*d)),0,length*IN)
        return [it.WParameter(k)/IN for k in range(1,it.NbPnt()+1)]

# ------------------------------------------------------------------ round holes, read exactly from the solid
_CYL={}
def cylinders(solid, origin):
    """Round features of a solid, read exactly from its cylindrical faces whose axis runs along x, y or z (the ray
    grid would square them off, and miss anything under ~3″). Returns, in the file's inches relative to the origin:
      {type:'circle', ax, c:(a,b), r, lo, hi}           a full round hole / recess
      {type:'slot',   ax, c:(a,b), c2:(a,b), r, lo, hi} a slot with round ends (a chase), centre line c → c2
    ax = the axis, c = the other two coordinates in x,y,z order, lo/hi = extent along the axis."""
    if solid['i'] in _CYL: return _CYL[solid['i']]
    X0,Y0,Z0=origin; full={}; halves=[]
    ex=TopExp_Explorer(solid['shape'], TopAbs_FACE)
    while ex.More():
        f=ex.Current(); a=BRepAdaptor_Surface(TopoDS.Face_s(f) if hasattr(TopoDS,'Face_s') else TopoDS.Face(f))
        if a.GetType()==GeomAbs_Cylinder:
            cy=a.Cylinder(); d=cy.Axis().Direction(); loc=cy.Axis().Location(); r=cy.Radius()/IN
            comps=[abs(d.X()),abs(d.Y()),abs(d.Z())]; k=comps.index(max(comps))
            if comps[k]>0.999 and 0.1<r<30:
                b=Bnd_Box(); BRepBndLib.Add_s(f,b); mn=b.CornerMin(); mx=b.CornerMax()
                P=[(loc.X()-X0)/IN,(loc.Y()-Y0)/IN,(loc.Z()-Z0)/IN]; lo=[(mn.X()-X0)/IN,(mn.Y()-Y0)/IN,(mn.Z()-Z0)/IN][k]; hi=[(mx.X()-X0)/IN,(mx.Y()-Y0)/IN,(mx.Z()-Z0)/IN][k]
                c=tuple(P[i] for i in range(3) if i!=k)
                u0,u1=a.FirstUParameter(),a.LastUParameter(); span=abs(u1-u0)
                pm=a.Value((u0+u1)/2,(a.FirstVParameter()+a.LastVParameter())/2); M=[(pm.X()-X0)/IN,(pm.Y()-Y0)/IN,(pm.Z()-Z0)/IN]
                mid=tuple(M[i] for i in range(3) if i!=k)
                key=('xyz'[k], round(c[0]*8), round(c[1]*8), round(r*16))
                e=full.get(key)
                if e: e['span']+=span; e['lo']=min(e['lo'],lo); e['hi']=max(e['hi'],hi); e['mids'].append(mid)
                else: full[key]=dict(ax='xyz'[k], c=c, r=r, lo=lo, hi=hi, span=span, mids=[mid])
        ex.Next()
    out=[]
    for e in full.values():
        if e['span']>=2*math.pi-0.15: out.append(dict(type='circle', ax=e['ax'], c=e['c'], r=e['r'], lo=e['lo'], hi=e['hi']))
        elif abs(e['span']-math.pi)<0.25: halves.append(e)
    # pair half-cylinders facing away from each other into slots
    used=set()
    for i,A in enumerate(halves):
        if i in used: continue
        best=None
        for j,B in enumerate(halves):
            if j<=i or j in used or B['ax']!=A['ax'] or abs(B['r']-A['r'])>1e-3: continue
            v=(A['c'][0]-B['c'][0], A['c'][1]-B['c'][1]); L=math.hypot(*v)
            if L<1e-3: continue
            ma=(A['mids'][0][0]-A['c'][0], A['mids'][0][1]-A['c'][1]); mb=(B['mids'][0][0]-B['c'][0], B['mids'][0][1]-B['c'][1])
            if ma[0]*v[0]+ma[1]*v[1]>0 and -(mb[0]*v[0]+mb[1]*v[1])>0 and (best is None or L<best[0]): best=(L,j)
        if best:
            B=halves[best[1]]; used.update({i,best[1]})
            out.append(dict(type='slot', ax=A['ax'], c=A['c'], c2=B['c'], r=A['r'], lo=min(A['lo'],B['lo']), hi=max(A['hi'],B['hi'])))
    _CYL[solid['i']]=out; return out

# ------------------------------------------------------------------ the floor's bottom
def rebase_floor(solids, origin):
    """Every Cubit floor stands on a steel frame (2″ × 3″ tube) with 2 mm ACM sheets under it. Whether or not the
    model draws them, heights are measured from the bottom of the exterior SIP floor: if the frame / ACM are drawn,
    the lowest 4½″ SIP slab sits higher than the bottom of the file, so move the zero up to it."""
    big=lambda s:(s['b'][3]-s['b'][0])>40 and (s['b'][4]-s['b'][1])>40
    slabs=[s for s in solids if big(s) and 3.5<s['b'][5]-s['b'][2]<6.0 and s['b'][2]<8]
    if not slabs: return solids, origin
    dz=min(s['b'][2] for s in slabs)
    if dz<0.5: return solids, origin
    log(f'  floor frame / ACM drawn under the floor: heights measured from {dz:.2f}″ up (bottom of the exterior SIP floor)')
    X0,Y0,Z0=origin
    for s in solids: s['b'][2]-=dz; s['b'][5]-=dz
    return solids, (X0,Y0,Z0+dz*IN)

# ------------------------------------------------------------------ pods
def find_pods(solids):
    big=lambda s:(s['b'][3]-s['b'][0])>40 and (s['b'][4]-s['b'][1])>40
    sheets=[s for s in solids if s['b'][2]<0.3 and s['b'][5]-s['b'][2]<1.0 and big(s)]   # FRP / ACM sheets under the floor
    if not sheets:
        # no FRP bottom sheet drawn: use the exterior floor itself (the lowest SIP slabs, about 4½″ thick), as in the
        # panel-by-panel models (whole floor as one body, or one body per 4 × 8 panel)
        sheets=[s for s in solids if s['b'][2]<0.3 and 2.5<s['b'][5]-s['b'][2]<7.0 and big(s)]
        if sheets: log(f'  no FRP sheet: found the pods from {len(sheets)} exterior floor bodies')
    # union sheets that touch (pods are separated by the 5/8" joint)
    par=list(range(len(sheets)))
    def f(a):
        while par[a]!=a: par[a]=par[par[a]]; a=par[a]
        return a
    for i,a in enumerate(sheets):
        for j in range(i+1,len(sheets)):
            b=sheets[j]
            ox=min(a['b'][3],b['b'][3])-max(a['b'][0],b['b'][0]); oy=min(a['b'][4],b['b'][4])-max(a['b'][1],b['b'][1])
            if ox>-0.15 and oy>-0.15 and (ox>1 or oy>1): par[f(i)]=f(j)
    groups=collections.defaultdict(list)
    for i,s in enumerate(sheets): groups[f(i)].append(s)
    pods=[]
    for g in groups.values():
        x0=min(s['b'][0] for s in g); y0=min(s['b'][1] for s in g); x1=max(s['b'][3] for s in g); y1=max(s['b'][4] for s in g)
        dx,dy=x1-x0,y1-y0
        L=round(max(dx,dy)/96)*96; W=round(min(dx,dy)/96)*96
        if W!=96 or L not in (96,192,288): log('  skipping odd floor group', round(dx,2), round(dy,2)); continue
        pods.append(dict(x0=x0,y0=y0,x1=x1,y1=y1,len=L//12,long='y' if dy>=dx else 'x'))
    if not pods: sys.exit('No pods found: no floor at the bottom of the model (an FRP sheet, or the 4½″ exterior floor, 8′ wide and 8′, 16′ or 24′ long).')
    orient=collections.Counter(p['long'] for p in pods).most_common(1)[0][0]
    if any(p['long']!=orient and p['len']>8 for p in pods): sys.exit('Pods run in different directions; rotated pods are not supported yet.')
    Ymax=max(p['y1'] for p in pods)
    for p in pods:   # app coords (inches): x along the long axis, z across
        if orient=='y': p['ax'],p['az']=p['y0'],p['x0']
        else:           p['ax'],p['az']=p['x0'],Ymax-p['y1']
    ax0=min(p['ax'] for p in pods); az0=min(p['az'] for p in pods)
    for p in pods:
        p['nx']=round((p['ax']-ax0)/96)*8; p['nz']=round((p['az']-az0)/96)*8
        p['t']={24:'L24',16:'P16',8:'P8'}[p['len']]
    pods.sort(key=lambda p:(p['nx'],p['nz']))
    for i,p in enumerate(pods): p['i']=i
    return pods, orient

# STEP side -> app side, and whether the STEP u-axis runs the same way as the app axis
def side_map(orient):
    if orient=='y': return {'S':('W',True),'N':('E',True),'W':('S',True),'E':('N',True)}
    return {'W':('W',True),'E':('E',True),'S':('N',True),'N':('S',True)}   # app x = STEP x; app z = -STEP y
def u_same_dir(orient, step_side):
    # along-wall axis: STEP S/N walls run along STEP x, W/E along STEP y
    if orient=='y': return True
    return step_side in ('S','N')       # STEP y runs opposite to app z

# ------------------------------------------------------------------ walls
def scan_wall(solids, rays, pod, side):
    x0,y0,x1,y1=pod['x0'],pod['y0'],pod['x1'],pod['y1']
    if side in 'SN': ua,ub=x0,x1; line=y0 if side=='S' else y1; a,b=sorted([line,line+(DEPTH if side=='S' else -DEPTH)])
    else:            ua,ub=y0,y1; line=x0 if side=='W' else x1; a,b=sorted([line,line+(DEPTH if side=='W' else -DEPTH)])
    cands=[s for s in solids if not UNIT.match(s['name']) and s['b'][5]>WALL_Z[0]+0.4 and s['b'][2]<WALL_Z[1]-0.3 and
           ((side in 'SN' and s['b'][4]>=a-0.2 and s['b'][1]<=b+0.2 and s['b'][3]>=ua and s['b'][0]<=ub) or
            (side in 'WE' and s['b'][3]>=a-0.2 and s['b'][0]<=b+0.2 and s['b'][4]>=ua and s['b'][1]<=ub))]
    def ray(u,z):
        if side=='S': o=(u,y0-0.1,z); d=(0,1,0)
        if side=='N': o=(u,y1+0.1,z); d=(0,-1,0)
        if side=='W': o=(x0-0.1,u,z); d=(1,0,0)
        if side=='E': o=(x1+0.1,u,z); d=(-1,0,0)
        lo=(min(o[0],o[0]+d[0]*DEPTH),min(o[1],o[1]+d[1]*DEPTH)); hi=(max(o[0],o[0]+d[0]*DEPTH),max(o[1],o[1]+d[1]*DEPTH))
        hs=[]
        for c in cands:
            bb=c['b']
            if bb[0]>hi[0] or bb[3]<lo[0] or bb[1]>hi[1] or bb[4]<lo[1] or bb[2]>z or bb[5]<z: continue
            hs+=rays.hits(c,o,d,DEPTH)
        return (min(hs)-0.1, max(hs)-0.1) if hs else None
    solid=lambda u,z: ray(u,z) is not None
    C=int(math.floor(ub-ua)); zs=[WALL_Z[0]+1+2*k for k in range(48)]
    grid=[[solid(ua+ci+0.5,z) for z in zs] for ci in range(C)]
    depths=collections.Counter()
    for ci in range(0,C,6):
        h=ray(ua+ci+0.5,WALL_Z[0]+48)
        if h: depths[round(h[1]*16)/16]+=1
    ops=openings_from_grid(grid, zs, lambda q: solid(ua+q[0], q[1]), ua, C, side, pod, solids)
    depth=depths.most_common(1)[0][0] if depths else None
    # round holes, recesses and chase slots, exactly as drawn: axis across the wall
    ax='y' if side in 'SN' else 'x'; blind=[]
    if depth:
        seen=set()
        for c in cands:
            for cy in cylinders(c, ORIGIN):
                if cy['ax']!=ax or cy['hi']<a-0.2 or cy['lo']>b+0.2: continue
                u,zc=cy['c']; u2,z2=cy.get('c2',cy['c']); r=cy['r']
                if not (ua-0.1<min(u,u2) and max(u,u2)<ub+0.1 and WALL_Z[0]<min(zc,z2) and max(zc,z2)<WALL_Z[1]): continue
                key=(cy['type'],round(u*8),round(zc*8),round(u2*8),round(z2*8),round(r*16))
                if key in seen: continue
                seen.add(key)
                U0,U1=min(u,u2)-ua-r, max(u,u2)-ua+r; Z0_,Z1_=min(zc,z2)-r-WALL_Z[0], max(zc,z2)+r-WALL_Z[0]
                ops=[o for o in ops if not (o['u0']>=U0-1.5 and o['u1']<=U1+1.5 and o['z0']>=Z0_-2 and o['z1']<=Z1_+2)]   # the grid's squared-off copy
                span=cy['hi']-cy['lo']
                feat = dict(shape='round', d=2*r) if cy['type']=='circle' else dict(shape='slot', w=2*r, ends=[[u-ua, zc-WALL_Z[0]],[u2-ua, z2-WALL_Z[0]]])
                if span>=depth*0.85:
                    ops.append(dict(kind='vent', u0=U0, u1=U1, z0=Z0_, z1=Z1_, **feat))
                else:
                    outer = abs(cy['lo']-line)<0.4 or abs(cy['hi']-line)<0.4   # opens on the outside face
                    blind.append(dict(u=(u+u2)/2-ua, z=(zc+z2)/2-WALL_Z[0], depth=round(span,3), face='outside' if outer else 'inside', **feat))
        n_r=sum(1 for o in ops if o.get('shape')); 
        if blind or n_r: log(f"  {side}: {n_r} round holes / slots through, {len(blind)} round recesses / chases")
    return dict(ua=ua,ub=ub,openings=ops,depth=depth,blind=blind)

def components(grid, C, R):
    seen=[[False]*R for _ in range(C)]; comps=[]
    for ci in range(C):
        for ri in range(R):
            if grid[ci][ri] or seen[ci][ri]: continue
            st=[(ci,ri)]; cells=[]
            while st:
                a,b=st.pop()
                if a<0 or b<0 or a>=C or b>=R or seen[a][b] or grid[a][b]: continue
                seen[a][b]=True; cells.append((a,b)); st+=[(a+1,b),(a-1,b),(a,b+1),(a,b-1)]
            comps.append(cells)
    return comps

def bisect(f,lo,hi,n=14):
    flo=f(lo)
    for _ in range(n):
        m=(lo+hi)/2
        if f(m)==flo: lo=m
        else: hi=m
    return (lo+hi)/2

def openings_from_grid(grid, zs, solid_at, ua, C, side, pod, solids):
    R=len(zs); out=[]
    units=[s for s in solids if UNIT.match(s['name']) and not s['name'].lower().startswith('handle') and '**3' not in s['name']]
    for cells in components(grid,C,R):
        bycol=collections.defaultdict(list); byrow=collections.defaultdict(list)
        for a,b in cells: bycol[a].append(b); byrow[b].append(a)
        wide=[a for a in bycol if len(bycol[a])>=2] or list(bycol); tall=[b for b in byrow if len(byrow[b])>=3] or list(byrow)
        c0=min(min(byrow[b]) for b in tall); c1=max(max(byrow[b]) for b in tall)
        r0=int(statistics.median([min(bycol[a]) for a in wide])); r1=int(statistics.median([max(bycol[a]) for a in wide]))
        wc=c1-c0+1; hr=(r1-r0+1)*2
        if wc<3 or hr<4: continue
        um=(c0+c1+1)/2; zm=(zs[r0]+zs[r1])/2
        left = 0 if c0==0 else bisect(lambda u: solid_at((u,zm)), c0-0.5, c0+0.5)
        right= C if c1==C-1 else bisect(lambda u: solid_at((u,zm)), c1+0.5, c1+1.5)
        bottom= WALL_Z[0] if r0==0 else bisect(lambda z: solid_at((um,z)), zs[r0]-2, zs[r0])
        top   = WALL_Z[1] if r1==R-1 else bisect(lambda z: solid_at((um,z)), zs[r1], zs[r1]+2)
        kind='opening'
        for un in units:
            b=un['b']; lineval = (pod['y0'] if side=='S' else pod['y1']) if side in 'SN' else (pod['x0'] if side=='W' else pod['x1'])
            if side in 'SN': ok = b[0]<ua+right-1 and b[3]>ua+left+1 and abs((b[1]+b[4])/2-lineval)<10
            else:            ok = b[1]<ua+right-1 and b[4]>ua+left+1 and abs((b[0]+b[3])/2-lineval)<10
            if ok and b[2]<top and b[5]>bottom:
                n=un['name'].lower()
                kind = 'door' if n.startswith('door') else 'patio' if n.startswith('panorama') else 'window'
        if kind=='opening' and wc<=14 and hr<=8: kind='vent'
        if kind=='opening' and bottom-WALL_Z[0]<0.5 and right-left<50 and top-WALL_Z[0]<90: kind='door'
        out.append(dict(kind=kind,u0=left,u1=right,z0=bottom-WALL_Z[0],z1=top-WALL_Z[0]))
    return out

# ------------------------------------------------------------------ horizontal layers
def scan_layer(solids, rays, pod, kind, step=2.0):
    zb,zt,_=LAYERS[kind]
    x0,y0,x1,y1=pod['x0'],pod['y0'],pod['x1'],pod['y1']
    cands=[s for s in solids if not UNIT.match(s['name']) and s['b'][2]<zt-0.05 and s['b'][5]>zb+0.05 and
           s['b'][3]>x0+0.2 and s['b'][0]<x1-0.2 and s['b'][4]>y0+0.2 and s['b'][1]<y1-0.2]
    if not cands: return None
    def solid(x,y):
        for c in cands:
            bb=c['b']
            if bb[0]>x or bb[3]<x or bb[1]>y or bb[4]<y: continue
            if rays.hits(c,(x,y,zb-0.05),(0,0,1),zt-zb+0.1): return True
        return False
    nx=int((x1-x0)//step); ny=int((y1-y0)//step)
    grid=[[solid(x0+(i+0.5)*step, y0+(j+0.5)*step) for j in range(ny)] for i in range(nx)]
    holes=[]
    for cells in components(grid,nx,ny):
        if len(cells)<2: continue
        i0=min(c[0] for c in cells); i1=max(c[0] for c in cells); j0=min(c[1] for c in cells); j1=max(c[1] for c in cells)
        xm=x0+(i0+i1+1)/2*step; ym=y0+(j0+j1+1)/2*step
        L = x0 if i0==0 else bisect(lambda x: solid(x,ym), x0+(i0-0.5)*step, x0+(i0+0.5)*step)
        Rr= x1 if i1==nx-1 else bisect(lambda x: solid(x,ym), x0+(i1+0.5)*step, x0+(i1+1.5)*step)
        B = y0 if j0==0 else bisect(lambda y: solid(xm,y), y0+(j0-0.5)*step, y0+(j0+0.5)*step)
        T = y1 if j1==ny-1 else bisect(lambda y: solid(xm,y), y0+(j1+0.5)*step, y0+(j1+1.5)*step)
        holes.append((L,B,Rr,T))
    # round holes, recesses and chase slots, exactly as drawn (vertical axis)
    seen=set()
    for c in cands:
        for cy in cylinders(c, ORIGIN):
            if cy['ax']!='z' or cy['hi']<zb-0.2 or cy['lo']>zt+0.2: continue
            (cx,cyy)=cy['c']; (cx2,cy2)=cy.get('c2',cy['c']); r=cy['r']
            if not (x0<min(cx,cx2) and max(cx,cx2)<x1 and y0<min(cyy,cy2) and max(cyy,cy2)<y1): continue
            key=(cy['type'],round(cx*8),round(cyy*8),round(cx2*8),round(cy2*8),round(r*16))
            if key in seen: continue
            seen.add(key)
            L_,B_,R_,T_=min(cx,cx2)-r,min(cyy,cy2)-r,max(cx,cx2)+r,max(cyy,cy2)+r
            holes=[h for h in holes if not (len(h)==4 and h[0]>=L_-2.5 and h[2]<=R_+2.5 and h[1]>=B_-2.5 and h[3]<=T_+2.5)]
            span=min(cy['hi'],zt)-max(cy['lo'],zb)
            face = 'through' if span>=(zt-zb)*0.8 else ('top' if cy['hi']>=zt-0.4 else 'bottom')
            holes.append((L_,B_,R_,T_, cy['type'], 2*r, round(span,3), face, [(cx,cyy),(cx2,cy2)]))
    # panel seams along the pod length: the outer OSB sheets of this layer
    skin=[s for s in cands if s['b'][5]-s['b'][2]<0.7 and (s['b'][3]-s['b'][0])>40 and (s['b'][4]-s['b'][1])>40]
    along = 'y' if pod['long']=='y' else 'x'
    L=(y1-y0) if along=='y' else (x1-x0)
    raw=sorted((s['b'][1] if along=='y' else s['b'][0]) - (y0 if along=='y' else x0) for s in skin)
    seams=[]
    for e in raw:                       # panel joints inside the layer, merged within 1"
        if e<3 or e>L-3: continue
        if seams and e-seams[-1]<1: continue
        seams.append(round(e*8)/8)
    return dict(holes=holes, seams=seams)

# ------------------------------------------------------------------ app slots (same rules as js/layout.js)
def app_slots(pods):
    P=[dict(i=p['i'],x=p['nx'],z=p['nz'],x1=p['nx']+p['len'],z1=p['nz']+8,len=p['len']) for p in pods]
    out=[]
    for p in P:
        sides=[('S',p['z'],p['x'],p['x1']),('N',p['z1'],p['x'],p['x1']),('W',p['x'],p['z'],p['z1']),('E',p['x1'],p['z'],p['z1'])]
        for k,f,a,b in sides:
            cov=[]
            for q in P:
                if q is p: continue
                iv=None
                if k=='S' and q['z1']==f: iv=(max(q['x'],a),min(q['x1'],b))
                if k=='N' and q['z']==f:  iv=(max(q['x'],a),min(q['x1'],b))
                if k=='W' and q['x1']==f: iv=(max(q['z'],a),min(q['z1'],b))
                if k=='E' and q['x']==f:  iv=(max(q['z'],a),min(q['z1'],b))
                if iv and iv[1]-iv[0]>0: cov.append((iv,q))
            for (c,d),q in cov:
                if d-c>=4: out.append(dict(pod=p['i'],side=k,a=c,b=d,type='int',other=q['i'],sa=a))
            segs=[(a,b)]
            for (c,d),q in cov:
                n=[]
                for s,e in segs:
                    if d<=s or c>=e: n.append((s,e)); continue
                    if c>s: n.append((s,c))
                    if d<e: n.append((d,e))
                segs=n
            for s,e in segs:
                if e-s>=4: out.append(dict(pod=p['i'],side=k,a=s,b=e,type='ext',sa=a))
    for s in out:
        num=lambda v: str(int(v)) if float(v).is_integer() else repr(v)
        s['id']=f"{s['pod']}{s['side']}{num(s['a'])}"+('i' if s['type']=='int' else '')
    return out

# ------------------------------------------------------------------ library
def r16(v): return round(v*16)/16
def wall_sig(w): return (w['len'],w['type'],tuple((o['kind'],o.get('shape',''),r16(o['x']),r16(o['y']),r16(o['w']),r16(o['h'])) for o in w['openings']),
                          tuple((i.get('shape',''),r16(i['x']),r16(i['y']),r16(i.get('d',0))) for i in w.get('inside',[])+w.get('outside',[])))
def same_wall(a,b):
    if a['len']!=b['len'] or a.get('type','ext')!=b.get('type','ext') or len(a['openings'])!=len(b['openings']): return False
    return all(oa['kind']==ob['kind'] and all(abs(oa[k]-ob[k])<=0.125 for k in ('x','y','w','h')) for oa,ob in zip(a['openings'],b['openings']))
def same_layer(a,b):
    if a['kind']!=b['kind'] or a['len']!=b['len'] or len(a['holes'])!=len(b['holes']): return False
    return all(ha.get('shape')==hb.get('shape') and all(abs(ha[k]-hb[k])<=0.125 for k in ('x','z','w','d')) for ha,hb in zip(a['holes'],b['holes']))
def describe_wall(w):
    c=collections.Counter(o['kind'] for o in w['openings'])
    names={'window':'window','door':'door','patio':'patio door','opening':'cased opening','vent':'vent'}
    order=['door','patio','window','opening','vent']
    parts=[f"{c[k]} {names[k]}{'s' if c[k]>1 else ''}" for k in order if c.get(k)]
    return f"{w['len']}′ {'interior' if w['type']=='int' else 'exterior'} · " + (', '.join(parts) if parts else 'solid')

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('step'); ap.add_argument('--name',required=True); ap.add_argument('--repo',default='.')
    ap.add_argument('--id',default=None); ap.add_argument('--from',dest='base',default='')
    ap.add_argument('--unit-type',default=''); ap.add_argument('--hand',default='L'); ap.add_argument('--swing',default='in')
    ap.add_argument('--kind',choices=['home','pod','wall','unit'],default='home',
                    help='home: a whole home (saved as a shared project); pod: one pod for the pod library; wall: one wall for the wall library')
    a=ap.parse_args()
    if a.kind=='unit':
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import unit_import
        return unit_import.run(a.step, a.name, a.unit_type, a.hand, a.swing, a.repo)
    if a.kind=='wall':
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import wall_import
        return wall_import.run(a.step, a.name, a.repo)
    global ORIGIN
    solids,origin=read_step(a.step); solids,origin=rebase_floor(solids,origin); rays=Rays(origin); ORIGIN=origin
    pods,orient=find_pods(solids)
    if a.kind=='pod' and len(pods)!=1: sys.exit(f'Expected one pod in a pod file, found {len(pods)}. Upload it as a home instead.')
    log(f'{len(pods)} pods, long axis = STEP {orient}: '+', '.join(f"Pod {p['i']+1} {p['len']}′ @({p['nx']},{p['nz']})" for p in pods))
    smap=side_map(orient)
    today=datetime.date.today().isoformat(); source=f"{a.name} (STEP {today})"
    # ---- walls
    slots=app_slots(pods); picks={}; new_walls=[]
    for p in pods:
        for step_side,(app_side,_) in smap.items():
            sc=scan_wall(solids,rays,p,step_side)
            Lside=(p['len'] if app_side in 'SN' else 8)*12
            same=u_same_dir(orient,step_side)
            log(f"  Pod {p['i']+1} {app_side}: {len(sc['openings'])} openings, depth {sc['depth']}")
            if sc['depth'] is None:     # no wall drawn on this side (e.g. a floor-only file): don't invent one
                log(f"  Pod {p['i']+1} {app_side}: no wall in the file, skipped"); continue
            for s in [s for s in slots if s['pod']==p['i'] and s['side']==app_side]:
                sa=(s['a']-s['sa'])*12; sb=(s['b']-s['sa'])*12
                p0_min = app_side in ('N','W')
                ops=[]
                for o in sc['openings']:
                    a0,a1 = (o['u0'],o['u1']) if same else (Lside-o['u1'],Lside-o['u0'])
                    u0=max(a0,sa); u1=min(a1,sb)
                    if u1-u0<1: continue
                    x=(u0-sa) if p0_min else (sb-u1)
                    extra={}
                    if o.get('shape')=='round': extra=dict(shape='round', d=round(o['d'],4))
                    if o.get('shape')=='slot':
                        fx=lambda uu: ((uu if same else Lside-uu)-sa) if p0_min else (sb-(uu if same else Lside-uu))
                        extra=dict(shape='slot', sw=round(o['w'],4), ends=[[round(fx(e[0]),4), round(e[1],4)] for e in o['ends']])
                    ops.append(dict(kind=o['kind'],x=round(x,4),y=round(o['z0'],4),w=round(u1-u0,4),h=round(o['z1']-o['z0'],4), **extra))
                ops.sort(key=lambda o:o['x'])
                ins=[]; outs=[]; WL=sb-sa
                for bl in sc.get('blind',[]):
                    uu = bl['u'] if same else Lside-bl['u']
                    if not (sa<=uu<=sb): continue
                    xo=(uu-sa) if p0_min else (sb-uu)          # from the outside-left end
                    item=dict(kind='hole' if bl['shape']=='round' else 'chase', shape=bl['shape'], depth=bl['depth'], y=round(bl['z'],4), **({'d':round(bl['d'],4)} if bl['shape']=='round' else {'sw':round(bl['w'],4), 'ends':bl['ends']}))
                    if bl['face']=='outside': outs.append(dict(item, x=round(xo,4)))
                    else: ins.append(dict(item, x=round(WL-xo,4)))   # inside items: from the inside-left end
                w=dict(len=round((sb-sa)/12),type=s['type'],t=6.5 if s['type']=='ext' else 4.5,openings=ops,inside=ins,outside=outs)
                new_walls.append((s['id'],w))
    # ---- layers
    layer_picks={}; new_layers=[]
    for p in pods:
        for kind,(zb,zt,label) in LAYERS.items():
            sc=scan_layer(solids,rays,p,kind)
            if not sc: log(f"  Pod {p['i']+1} {label}: not found"); continue
            holes=[]
            for h in sc['holes']:
                (L,B,R,T)=h[:4]
                if orient=='y': hx,hz,hw,hd = B-p['y0'], L-p['x0'], T-B, R-L
                else:           hx,hz,hw,hd = L-p['x0'], p['y1']-T, R-L, T-B
                hole=dict(x=round(hx,4),z=round(hz,4),w=round(hw,4),d=round(hd,4))
                if len(h)>4:
                    blind_ = {} if h[7]=='through' else {'depth':h[6], 'face':h[7]}
                    if h[4]=='circle': hole.update(shape='round', dia=round(h[5],4), **blind_)
                    else:
                        tr=(lambda X,Y: (Y-p['y0'], X-p['x0'])) if orient=='y' else (lambda X,Y: (X-p['x0'], p['y1']-Y))
                        hole.update(shape='slot', sw=round(h[5],4), ends=[[round(v,4) for v in tr(*e)] for e in h[8]], **blind_)
                holes.append(hole)
            holes.sort(key=lambda h:(h['x'],h['z']))
            seams=sc['seams'] if orient=='y' else [round(p['len']*12-s,2) for s in sc['seams']][::-1]
            lay=dict(kind=kind,len=p['len'],t=round(zt-zb,3),z=zb,holes=holes,seams=seams)
            new_layers.append((f"{p['i']}:{kind}",lay))
            log(f"  Pod {p['i']+1} {label}: {len(holes)} holes")
    # ---- merge into the library
    R=a.repo
    walls=json.load(open(os.path.join(R,'data/walls.json')))
    try: layers=json.load(open(os.path.join(R,'data/layers.json')))
    except FileNotFoundError: layers=[]
    added_w=added_l=0
    for sid,w in new_walls:
        hit=next((x for x in walls if same_wall(x,w)),None)
        if not hit:
            n=1+sum(1 for x in walls if x['len']==w['len'] and x.get('type','ext')==w['type'])
            w=dict(id=f"{'I' if w['type']=='int' else 'W'}{w['len']:02d}-{n:02d}", name=describe_wall(w), **w, source=source)
            walls.append(w); hit=w; added_w+=1
        picks[sid]=hit['id']
    KIND_CODE={'floor-ext':'FE','floor-int':'FI','ceiling-int':'CI','roof':'RF'}
    for lid,l in new_layers:
        hit=next((x for x in layers if same_layer(x,l)),None)
        if not hit:
            n=1+sum(1 for x in layers if x['kind']==l['kind'] and x['len']==l['len'])
            l=dict(id=f"{KIND_CODE[l['kind']]}{l['len']:02d}-{n:02d}", name=f"{l['len']}′ {LAYERS[l['kind']][2].lower()} · "+(f"{len(l['holes'])} hole{'s' if len(l['holes'])>1 else ''}" if l['holes'] else 'no holes'), **l, source=source)
            layers.append(l); hit=l; added_l+=1
        layer_picks[lid]=hit['id']
    with open(os.path.join(R,'data/walls.json'),'w') as f: f.write('[\n'+',\n'.join('  '+json.dumps(x,ensure_ascii=False) for x in walls)+'\n]\n')
    with open(os.path.join(R,'data/layers.json'),'w') as f: f.write('[\n'+',\n'.join('  '+json.dumps(x,ensure_ascii=False) for x in layers)+'\n]\n')
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    # ---- decks (porch frames): measured, added to data/decks.json, placed in the project
    import decks_lib
    dk=decks_lib.find_decks(solids,pods,log)
    dres=decks_lib.describe_all(dk,pods,origin,orient)
    dp=os.path.join(R,'data/decks.json')
    try: dlib=json.load(open(dp))
    except FileNotFoundError: dlib=[]
    dids,added_d=decks_lib.merge_decks(dlib,[r[0] for r in dres],source)
    decks_lib.write_decks(dp,dlib)
    deck_places=[{k:v for k,v in d.items() if not k.startswith('_')} for d in decks_lib.place([r[1] for r in dres],dids,pods)]
    for d,(lib,pl) in zip(deck_places,dres): log(f"  Deck {d['lib']} at ({d['x']},{d['z']}) turned {d['rot']}°, {round(pl['gap'] or 0,2)}″ from its neighbour")
    # ---- project
    pid=a.id or re.sub(r'[^a-z0-9]+','-',a.name.lower()).strip('-')
    try: projects=json.load(open(os.path.join(R,'data/projects.json')))
    except FileNotFoundError: projects=[]
    sizes=collections.Counter(p['len'] for p in pods)
    proj=dict(id=pid,name=a.name,saved=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'),from_=a.base,
              model=dict(name=a.name.split('·')[-1].strip(), size=' + '.join(f"{n}×{l}" if n>1 else str(l) for l,n in sorted(sizes.items(),reverse=True)),
                         pods=[dict(t=p['t'],x=p['nx'],z=p['nz']) for p in pods], decks=deck_places, picks=picks, layerPicks=layer_picks,
                         note=f"Scanned from {os.path.basename(a.step)} on {today}."),
              picks={},wallA={},faces={},inset=6)
    proj['from']=proj.pop('from_')
    projects=[p for p in projects if p.get('id')!=pid]+[proj]
    if a.kind=='home':   # a pod file only feeds the libraries
        json.dump(projects,open(os.path.join(R,'data/projects.json'),'w'),indent=2,ensure_ascii=False)
    # ---- pod library: every pod of this home that isn't in data/pods.json yet
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import pods_lib
    pp=os.path.join(R,'data/pods.json')
    try: plib=json.load(open(pp))
    except FileNotFoundError: plib=[]
    # a file with only floors (or ceilings) in it fills the layer library; it isn't a whole pod
    added_p=pods_lib.merge_pods(plib, pods_lib.pods_from_model(proj['model'], source), a.name) if new_walls else 0
    pods_lib.write_pods(pp, plib)
    print(json.dumps(dict(kind=a.kind, project=pid if a.kind=='home' else None, pods=len(pods),walls=len(new_walls),new_walls=added_w,layers=len(new_layers),new_layers=added_l,new_pods=added_p,decks=len(deck_places),new_decks=added_d)))

if __name__=='__main__': main()
