import sys, json, time
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopoDS import TopoDS
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.BRepTools import BRepTools
t=time.time()
r=STEPControl_Reader(); r.ReadFile(sys.argv[1]); r.TransferRoots()
ws=r.WS(); tr=ws.TransferReader(); shape=r.OneShape()
out=[]; ex=TopExp_Explorer(shape,TopAbs_SOLID)
while ex.More():
    s=TopoDS.Solid(ex.Current()); name=''
    try:
        e=tr.EntityFromShapeResult(s,-1)
        if e is not None: name=e.Name().ToCString()
    except Exception: name='?'
    b=Bnd_Box(); BRepBndLib.AddOptimal_s(s,b,False,False); mn=b.CornerMin(); mx=b.CornerMax()
    g=GProp_GProps(); BRepGProp.VolumeProperties_s(s,g); c=g.CentreOfMass()
    idx=len(out); BRepTools.Write_s(s, f'brep/{idx}.brep')
    out.append(dict(i=idx,name=name,bb=[mn.X(),mn.Y(),mn.Z(),mx.X(),mx.Y(),mx.Z()],vol=g.Mass(),c=[c.X(),c.Y(),c.Z()]))
    ex.Next()
json.dump(out,open(sys.argv[2],'w'))
print(len(out),'solids',time.time()-t,file=sys.stderr)
