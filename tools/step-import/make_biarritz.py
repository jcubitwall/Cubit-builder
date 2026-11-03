"""Cubit Builder - the MAAX Biarritz 30 x 32 x 75 shower kit (model 100726-000-002-000), drawn from MAAX's dimension
drawing (Home Depot 1000161589) as a two-solid STEP: the shower base and the wall surround.

    python3 -I tools/step-import/make_biarritz.py out.step

Inches (written as mm). X across the front (29 3/4), Y from the back (32), Z up (74 1/4). The kit is symmetric, so it
reads the same either way round.
From the drawing: 29 3/4 x 32 outside; 74 1/4 high with a 3/4 nailing flange at the top; 23 3/4 door opening between
3" front returns 3/4 thick; base curb 5" high, 2 1/4" deep; drain centred, 14 7/8 from the left and from the back,
1" drain clearance; the lower walls (corner seats) end in a ledge 39 5/8 up; the back corners of the base and lower
walls are rounded (the curve meets the sides 9 5/8 from the back); above the ledge the back corners are chamfered.
Read off the drawing where it gives no figure (wall faces, chamfer, floor depth): close, not to the 1/16.
"""
import sys, math
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakePrism
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon, BRepBuilderAPI_MakeFace
from OCP.gp import gp_Pnt, gp_Vec, gp_Ax2, gp_Dir
from OCP.TopoDS import TopoDS_Compound
from OCP.BRep import BRep_Builder
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static

MM = 25.4
W, D, H = 29.75, 32.0, 74.25
CURB_H, CURB_D = 5.0, 2.25          # base curb at the front
RET_W, RET_T = 3.0, 0.75            # front returns: (29 3/4 - 23 3/4) / 2 wide
SIDE, BACK = 2.0, 1.5               # inside faces of the side and back walls, from the outside
LEDGE = 39.625                      # top of the lower walls (corner seats)
R = 8.125                           # back corners of the base well and lower walls: meets the sides 9 5/8 from the back
CH = 4.4                            # chamfer of the upper back corners (3 1/8 across the corner)
FLOOR = 2.0                         # base floor, at the walls
DRAIN = (14.875, 14.875); DRAIN_R = 1.75


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
    f = BRepBuilderAPI_MakeFace(p.Wire()).Face()
    return BRepPrimAPI_MakePrism(f, gp_Vec(0, 0, (z1-z0)*MM)).Shape()


def rounded_back(x0, y0, x1, y1, r, z0, z1, rf=0.0):
    """a rectangle with its two back corners (y0) rounded r (and the front ones rf), as a prism z0..z1"""
    parts = [box(x0+r, y0, z0, x1-r, y1, z1), box(x0, y0+r, z0, x1, y1-rf, z1), cyl(x0+r, y0+r, z0, r, z1-z0), cyl(x1-r, y0+r, z0, r, z1-z0)]
    if rf: parts += [box(x0+rf, y1-rf, z0, x1-rf, y1, z1), cyl(x0+rf, y1-rf, z0, rf, z1-z0), cyl(x1-rf, y1-rf, z0, rf, z1-z0)]
    return fuse(*parts)


def base():
    b = box(0, 0, 0, W, D, CURB_H)
    well = rounded_back(SIDE, BACK, W-SIDE, D-CURB_D, R, FLOOR, CURB_H+0.01, rf=1.0)
    dish = cyl(DRAIN[0], DRAIN[1], FLOOR-0.25, 6.0, 0.26)          # the floor falls to the drain
    hole = cyl(DRAIN[0], DRAIN[1], -0.01, DRAIN_R, FLOOR+0.02)
    return cut(b, well, dish, hole)


def walls():
    s = box(0, 0, CURB_H, W, D, H)
    # inside: below the ledge the back corners are rounded (corner seats); above it they're chamfered
    low = rounded_back(SIDE, BACK, W-SIDE, D-RET_T+0.01, R, CURB_H-0.01, LEDGE)
    up = prism([(SIDE+CH, BACK), (W-SIDE-CH, BACK), (W-SIDE, BACK+CH), (W-SIDE, D-RET_T+0.01), (SIDE, D-RET_T+0.01), (SIDE, BACK+CH)], LEDGE-0.01, H+0.01)
    door = box(RET_W, D-RET_T-0.02, CURB_H-0.01, W-RET_W, D+0.01, H+0.01)       # 23 3/4 door opening between the returns
    # outside: the walls are a shell on the studs; the space behind the corner seats is hollow
    return cut(s, low, up, door)


def main(out):
    c = TopoDS_Compound(); bld = BRep_Builder(); bld.MakeCompound(c)
    bld.Add(c, base()); bld.Add(c, walls())
    Interface_Static.SetCVal_s('write.step.unit', 'MM')
    w = STEPControl_Writer(); w.Transfer(c, STEPControl_AsIs); w.Write(out)
    print('ok', out)


if __name__ == '__main__':
    main(sys.argv[1])
