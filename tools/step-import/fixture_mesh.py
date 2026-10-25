# Tessellate a fixture STEP (one mesh per solid, inches x100, y up, back of the piece at z=0) for the cabinet library.
# usage: python3 fixture_mesh.py in.step out.json '[["Part name",[ex,ey,ez]], ...]'  (one name per solid, in file order)
import sys, json
from OCP.STEPControl import STEPControl_Reader
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID, TopAbs_REVERSED
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.TopoDS import TopoDS
r=STEPControl_Reader(); r.ReadFile(sys.argv[1]); r.TransferRoots(); shp=r.OneShape()
b=Bnd_Box(); BRepBndLib.Add_s(shp,b); mn=b.CornerMin(); mx=b.CornerMax(); x0,y0,z0,x1,y1,z1=mn.X(),mn.Y(),mn.Z(),mx.X(),mx.Y(),mx.Z()
BRepMesh_IncrementalMesh(shp, 1.5, False, 0.5, True)
names=json.loads(sys.argv[3])
parts=[]; es=TopExp_Explorer(shp,TopAbs_SOLID); k=0
while es.More():
  P=[];I=[]; ef=TopExp_Explorer(es.Current(),TopAbs_FACE)
  while ef.More():
    f=TopoDS.Face(ef.Current()); loc=TopLoc_Location(); t=BRep_Tool.Triangulation_s(f,loc)
    if t is not None:
      tr=loc.Transformation(); base=len(P)//3; rev=f.Orientation()==TopAbs_REVERSED
      for i in range(1,t.NbNodes()+1):
        p=t.Node(i).Transformed(tr); P+=[ round((p.X()-x0)/25.4*100), round((p.Z()-z0)/25.4*100), round((p.Y()-y0)/25.4*100) ]
      for i in range(1,t.NbTriangles()+1):
        a,bb,c=t.Triangle(i).Get()
        # three.js: x right, y up, z toward the viewer; STEP x,y,z → our x, z(up)… mapping (x, Z, Y) is a mirror, so flip winding
        if not rev: bb,c=c,bb
        I+=[base+a-1, base+bb-1, base+c-1]
    ef.Next()
  nm,ex=names[k]
  parts.append({'name':nm,'ex':ex,'p':P,'i':I}); k+=1; es.Next()
json.dump({'w':round((x1-x0)/25.4,3),'h':round((z1-z0)/25.4,3),'d':round((y1-y0)/25.4,3),'q':100,'parts':parts}, open(sys.argv[2],'w'), separators=(',',':'))
print('ok', sum(len(p['i'])//3 for p in parts))
