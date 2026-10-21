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

# ------------------------------------------------------------------ pods
def find_pods(solids):
    sheets=[s for s in solids if s['b'][2]<0.3 and s['b'][5]-s['b'][2]<1.0 and (s['b'][3]-s['b'][0])>40 and (s['b'][4]-s['b'][1])>40]
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
    if not pods: sys.exit('No pods found: the floor bottom sheets (FRP) were not recognised.')
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
    return dict(ua=ua,ub=ub,openings=ops,depth=depths.most_common(1)[0][0] if depths else None)

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
def wall_sig(w): return (w['len'],w['type'],tuple((o['kind'],r16(o['x']),r16(o['y']),r16(o['w']),r16(o['h'])) for o in w['openings']))
def same_wall(a,b):
    if a['len']!=b['len'] or a.get('type','ext')!=b.get('type','ext') or len(a['openings'])!=len(b['openings']): return False
    return all(oa['kind']==ob['kind'] and all(abs(oa[k]-ob[k])<=0.125 for k in ('x','y','w','h')) for oa,ob in zip(a['openings'],b['openings']))
def same_layer(a,b):
    if a['kind']!=b['kind'] or a['len']!=b['len'] or len(a['holes'])!=len(b['holes']): return False
    return all(all(abs(ha[k]-hb[k])<=0.125 for k in ('x','z','w','d')) for ha,hb in zip(a['holes'],b['holes']))
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
    ap.add_argument('--kind',choices=['home','pod','wall'],default='home',
                    help='home: a whole home (saved as a shared project); pod: one pod for the pod library; wall: one wall for the wall library')
    a=ap.parse_args()
    if a.kind=='wall':
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import wall_import
        return wall_import.run(a.step, a.name, a.repo)
    solids,origin=read_step(a.step); rays=Rays(origin)
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
            for s in [s for s in slots if s['pod']==p['i'] and s['side']==app_side]:
                sa=(s['a']-s['sa'])*12; sb=(s['b']-s['sa'])*12
                p0_min = app_side in ('N','W')
                ops=[]
                for o in sc['openings']:
                    a0,a1 = (o['u0'],o['u1']) if same else (Lside-o['u1'],Lside-o['u0'])
                    u0=max(a0,sa); u1=min(a1,sb)
                    if u1-u0<1: continue
                    x=(u0-sa) if p0_min else (sb-u1)
                    ops.append(dict(kind=o['kind'],x=round(x,4),y=round(o['z0'],4),w=round(u1-u0,4),h=round(o['z1']-o['z0'],4)))
                ops.sort(key=lambda o:o['x'])
                w=dict(len=round((sb-sa)/12),type=s['type'],t=6.5 if s['type']=='ext' else 4.5,openings=ops,inside=[],outside=[])
                new_walls.append((s['id'],w))
    # ---- layers
    layer_picks={}; new_layers=[]
    for p in pods:
        for kind,(zb,zt,label) in LAYERS.items():
            sc=scan_layer(solids,rays,p,kind)
            if not sc: log(f"  Pod {p['i']+1} {label}: not found"); continue
            holes=[]
            for (L,B,R,T) in sc['holes']:
                if orient=='y': hx,hz,hw,hd = B-p['y0'], L-p['x0'], T-B, R-L
                else:           hx,hz,hw,hd = L-p['x0'], p['y1']-T, R-L, T-B
                holes.append(dict(x=round(hx,4),z=round(hz,4),w=round(hw,4),d=round(hd,4)))
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
    added_p=pods_lib.merge_pods(plib, pods_lib.pods_from_model(proj['model'], source), a.name)
    pods_lib.write_pods(pp, plib)
    print(json.dumps(dict(kind=a.kind, project=pid if a.kind=='home' else None, pods=len(pods),walls=len(new_walls),new_walls=added_w,layers=len(new_layers),new_layers=added_l,new_pods=added_p,decks=len(deck_places),new_decks=added_d)))

if __name__=='__main__': main()
