import json,re,math,time
from OCP.BRepTools import BRepTools
from OCP.BRep import BRep_Builder
from OCP.TopoDS import TopoDS_Shape
from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
from OCP.gp import gp_Lin, gp_Pnt, gp_Dir
IN=25.4
d=json.load(open('solids.json'))
z0=min(x['bb'][2] for x in d); X0=min(x['bb'][0] for x in d); Y0=min(x['bb'][1] for x in d)
def loc(b): return [(b[0]-X0)/IN,(b[1]-Y0)/IN,(b[2]-z0)/IN,(b[3]-X0)/IN,(b[4]-Y0)/IN,(b[5]-z0)/IN]
UNIT=re.compile(r'^(Panorama Proto|Kitchen|Living|Door|Frame|Handle)')
# wall material: anything in the wall band that is not a window/door unit
cand=[]
for x in d:
    b=loc(x['bb'])
    if b[5]<11 or b[2]>106.3: continue
    if UNIT.match(x['name']): continue
    cand.append(dict(i=x['i'],name=x['name'],b=b))
units=[dict(name=x['name'],b=loc(x['bb'])) for x in d if UNIT.match(x['name'])]
cache={}
def inter(i):
    if i not in cache:
        s=TopoDS_Shape(); BRepTools.Read_s(s,f"brep/{i}.brep",BRep_Builder())
        it=IntCurvesFace_ShapeIntersector(); it.Load(s,1e-3); cache[i]=it
    return cache[i]
PODS={'A':(0,1.02,96,289.02),'B':(96.67,97.01,192.67,289.01),'C':(0,289.47,96,577.47),'D':(96.67,289.47,192.67,577.47),'E':(193.3,289.65,289.3,577.65)}
DEPTH=8.0
def ray(side,pod,u,z):
    """shoot from just outside the pod edge inward; return (entry,exit) depth in inches or None"""
    x0,y0,x1,y1=pod
    if side=='S': o=(u,y0-0.1,z); dv=(0,1,0)
    if side=='N': o=(u,y1+0.1,z); dv=(0,-1,0)
    if side=='W': o=(x0-0.1,u,z); dv=(1,0,0)
    if side=='E': o=(x1+0.1,u,z); dv=(-1,0,0)
    ox,oy,oz=o; ex,ey,ez=ox+dv[0]*DEPTH,oy+dv[1]*DEPTH,oz
    lo=[min(ox,ex),min(oy,ey)]; hi=[max(ox,ex),max(oy,ey)]
    hits=[]
    for c in wallcands:
        b=c['b']
        if b[0]>hi[0] or b[3]<lo[0] or b[1]>hi[1] or b[4]<lo[1] or b[2]>z or b[5]<z: continue
        it=inter(c['i'])
        lin=gp_Lin(gp_Pnt(ox*IN+X0,oy*IN+Y0,oz*IN+z0),gp_Dir(*dv))
        it.Perform(lin,0,DEPTH*IN)
        for k in range(1,it.NbPnt()+1): hits.append(it.WParameter(k)/IN)
    if not hits: return None
    return (min(hits)-0.1, max(hits)-0.1)
result={}
t=time.time()
for pn,pod in PODS.items():
    x0,y0,x1,y1=pod
    for side in 'SNWE':
        if side in 'SN': ua,ub=x0,x1; line=y0 if side=='S' else y1
        else: ua,ub=y0,y1; line=x0 if side=='W' else x1
        # candidates near this side
        if side in 'SN': wallcands=[c for c in cand if c['b'][4]>=min(line,line+(DEPTH if side=='S' else -DEPTH))-0.2 and c['b'][1]<=max(line,line+(DEPTH if side=='S' else -DEPTH))+0.2 and c['b'][3]>=ua and c['b'][0]<=ub]
        else: wallcands=[c for c in cand if c['b'][3]>=min(line,line+(DEPTH if side=='W' else -DEPTH))-0.2 and c['b'][0]<=max(line,line+(DEPTH if side=='W' else -DEPTH))+0.2 and c['b'][4]>=ua and c['b'][1]<=ub]
        L=ub-ua; cols=int(math.floor(L)); zs=[11.5+2*k for k in range(48)]
        grid=[]; depths=[]
        for ci in range(cols):
            u=ua+ci+0.5; row=[]
            for z in zs:
                h=ray(side,pod,u,z); row.append(h is not None)
                if h: depths.append(round(h[1]*16)/16)
            grid.append(row)
        result[f'{pn}{side}']=dict(pod=pn,side=side,ua=ua,ub=ub,grid=grid,zs=zs,depths=depths)
        print(pn,side,round(L,2),'filled',sum(map(sum,grid)),'/',cols*len(zs), round(time.time()-t,1),flush=True)
json.dump(result,open('wallgrid.json','w'))
