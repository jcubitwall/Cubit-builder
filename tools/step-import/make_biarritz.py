"""Cubit Builder - MAAX Biarritz one piece alcove showers, drawn from MAAX's dimension drawings as STEP files.

    python3 -I tools/step-import/make_biarritz.py p40 out.step     # Biarritz P40, 30 x 32 (100726-000-002-000)
    python3 -I tools/step-import/make_biarritz.py p85 out.step     # Biarritz 85, 36 x 35 (100973-000-002)

Inches (written as mm). X across the front, Y from the back, Z up. Symmetric, so it reads the same either way round.
Two solids, the base and the walls, though it's one piece (the app keeps them together).

The shape, the same on both (from the drawings and MAAX's photos):
  · a curb at the front, a 3/4 thick return each side of the door opening, a nailing flange at the top;
  · each back corner: a rounded column from the base up to a ledge (its top is one of the 2 built-in shelves,
    curved at the front), then an angled corner panel above it, square again near the top;
  · centre drain.
Read off the drawings where they give no figure (wall faces, column radius, chamfer, floor fall): close, not exact.
"""
import sys
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakePrism
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon, BRepBuilderAPI_MakeFace
from OCP.gp import gp_Pnt, gp_Vec, gp_Ax2, gp_Dir
from OCP.TopoDS import TopoDS_Compound
from OCP.BRep import BRep_Builder
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static

MM = 25.4
PRESETS = {
  # P40: 29 3/4 x 32 x 74 1/4 (3/4 flange), door 23 3/4, curb 5 high 2 1/4 deep, ledge 39 5/8, drain 14 7/8 / 14 7/8
  'p40': dict(W=29.75, D=32.0, H=74.25, DOOR=23.75, CURB_H=5.0, CURB_D=2.25, LEDGE=39.625, CH_TOP=73.5,
              SIDE=1.8125, BACK=1.25, R=7.25, CH=5.0, DRAIN=(14.875, 14.875)),
  # 85: 35 5/8 x 34 7/8 x 74 3/4 (1" flange), door 27 1/2, 32 inside, threshold 4 3/8, drain 17 3/4 / 16 1/8,
  # ledge ~41 3/8, the angled corners stop ~71 up
  'p85': dict(W=35.625, D=34.875, H=74.75, DOOR=27.5, CURB_H=4.375, CURB_D=3.75, LEDGE=41.375, CH_TOP=70.875,
              SIDE=1.8125, BACK=1.25, R=9.5, CH=8.0, DRAIN=(17.75, 16.125)),
}
RET_T, FLOOR, DRAIN_R = 0.75, 2.0, 1.75


def box(x0, y0, z0, x1, y1, z1):
    return BRepPrimAPI_MakeBox(gp_Pnt(x0*MM, y0*MM, z0*MM), gp_Pnt(x1*MM, y1*MM, z1*MM)).Shape()


def cyl(x, y, z0, r, h):
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x*MM, y*MM, z0*MM), gp_Dir(0, 0, 1)), r*MM, h*MM).Shape()


def fuse(*S):
    a = S[0]
    for b in S[1:]: a = BRepAlgoAPI_Fuse(a, b).Shape()
    return a


def cut(a, *S):
    for b in S: a = BRepAlgoAPI_Cut(a, b).Shape()
    return a


def prism(pts, z0, z1):
    p = BRepBuilderAPI_MakePolygon()
    for x, y in pts: p.Add(gp_Pnt(x*MM, y*MM, z0*MM))
    p.Close()
    return BRepPrimAPI_MakePrism(BRepBuilderAPI_MakeFace(p.Wire()).Face(), gp_Vec(0, 0, (z1-z0)*MM)).Shape()


def build(P):
    W, D, H, S, B, R, C = P['W'], P['D'], P['H'], P['SIDE'], P['BACK'], P['R'], P['CH']
    ret = (W-P['DOOR'])/2
    inner = lambda z0, z1, front: box(S, B, z0, W-S, front, z1)
    cols = lambda z0, z1: [cyl(S, B, z0, R, z1-z0), cyl(W-S, B, z0, R, z1-z0)]      # the rounded corner columns
    # base: the curb and a well whose back corners go round the columns, the floor falling to the drain
    base = cut(box(0, 0, 0, W, D, P['CURB_H']),
               cut(inner(FLOOR, P['CURB_H']+0.01, D-P['CURB_D']), *cols(FLOOR-0.01, P['CURB_H']+0.02)),
               cyl(*P['DRAIN'], FLOOR-0.25, 6.0, 0.26), cyl(*P['DRAIN'], -0.01, DRAIN_R, FLOOR+0.02))
    # walls: columns up to the ledge (the shelves), angled corners above, square near the top
    front = D-RET_T+0.01
    low = cut(inner(P['CURB_H']-0.01, P['LEDGE'], front), *cols(P['CURB_H']-0.02, P['LEDGE']+0.01))
    mid = prism([(S+C, B), (W-S-C, B), (W-S, B+C), (W-S, front), (S, front), (S, B+C)], P['LEDGE']-0.01, P['CH_TOP'])
    top = inner(P['CH_TOP']-0.01, H+0.01, front)
    door = box(ret, D-RET_T-0.02, P['CURB_H']-0.01, W-ret, D+0.01, H+0.01)
    walls = cut(box(0, 0, P['CURB_H'], W, D, H), low, mid, top, door)
    return base, walls


def main(name, out):
    base, walls = build(PRESETS[name])
    c = TopoDS_Compound(); bld = BRep_Builder(); bld.MakeCompound(c); bld.Add(c, base); bld.Add(c, walls)
    Interface_Static.SetCVal_s('write.step.unit', 'MM')
    w = STEPControl_Writer(); w.Transfer(c, STEPControl_AsIs); w.Write(out)
    print('ok', name, out)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
