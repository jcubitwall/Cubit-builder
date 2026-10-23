"""Cubit Builder — exact cut reader for SIP panels (walls, floors, ceilings).

Instead of sampling the panel with rays on a grid (which squares off round holes and misses anything small), this
reads the solids' real geometry:

  1. Every flat face lying across the panel's thickness marks a depth where something changes (a pocket floor, a
     rebate, a skin). Those depths split the thickness into bands.
  2. In the middle of each band the panel's bodies are cut by a plane (an exact B-rep section). The section's edges —
     lines, arcs, circles, splines — are traced finely (0.002″) into the shape of the material at that depth.
  3. Removed = the panel's outline minus the material, band by band. What is removed in every band goes right
     through; what is removed only in the bands next to one face is a pocket from that face, as deep as those bands.

Each cut comes back as an exact outline (shapely polygon, panel inches) with the face it opens on and its depth, plus
the ¾″ bit's tool paths: the profile ⅜″ inside a through cut, and the clearing rings of a pocket."""
import math
from functools import reduce
from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
from OCP.gp import gp_Pln, gp_Pnt, gp_Dir
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
from OCP.GCPnts import GCPnts_QuasiUniformDeflection
from OCP.GeomAbs import GeomAbs_Plane
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.ShapeAnalysis import ShapeAnalysis_FreeBounds
from OCP.OCP.collections import HSequence_TopoDS_Shape as TopTools_HSequenceOfShape
from OCP.BRepTools import BRepTools_WireExplorer
from shapely.geometry import LineString, Polygon, MultiPolygon, box
from shapely.ops import linemerge, unary_union, polygonize

IN = 25.4
TOOL_R = 0.375
_edge = lambda e: TopoDS.Edge_s(e) if hasattr(TopoDS, 'Edge_s') else TopoDS.Edge(e)
_face = lambda f: TopoDS.Face_s(f) if hasattr(TopoDS, 'Face_s') else TopoDS.Face(f)
AX = {'x': 0, 'y': 1, 'z': 2}

def levels(shape, axis, origin):
    """depths (inches, file coords) of the flat faces lying across `axis`"""
    k = AX[axis]; out = []
    ex = TopExp_Explorer(shape, TopAbs_FACE)
    while ex.More():
        f = _face(ex.Current()); a = BRepAdaptor_Surface(f)
        if a.GetType() == GeomAbs_Plane:
            n = a.Plane().Axis().Direction(); comp = [abs(n.X()), abs(n.Y()), abs(n.Z())]
            if comp[k] > 0.9999:
                b = Bnd_Box(); BRepBndLib.Add_s(f, b); mn = b.CornerMin()
                out.append(([mn.X(), mn.Y(), mn.Z()][k] - origin[k]) / IN)
        ex.Next()
    return out

def section(shape, axis, level, origin):
    """the material of one solid where a plane across `axis` at `level` cuts it, as 2D polygons in the other two
    coordinates (in x, y, z order), inches relative to the origin"""
    k = AX[axis]; P = [0, 0, 0]; P[k] = level * IN + origin[k]; D = [0, 0, 0]; D[k] = 1
    sec = BRepAlgoAPI_Section(shape, gp_Pln(gp_Pnt(*P), gp_Dir(*D)), False); sec.Build()
    if not sec.IsDone(): return None
    # join the section's edges into closed wires (with a small tolerance), then trace each wire in order
    seq = TopTools_HSequenceOfShape(); ex = TopExp_Explorer(sec.Shape(), TopAbs_EDGE)
    while ex.More(): seq.Append(ex.Current()); ex.Next()
    if seq.Length() == 0: return None
    wires = ShapeAnalysis_FreeBounds.ConnectEdgesToWires_s(seq, 0.01 * IN, False)
    rings = []
    for wi in range(1, wires.Length() + 1):
        w = TopoDS.Wire_s(wires.Value(wi)) if hasattr(TopoDS, 'Wire_s') else TopoDS.Wire(wires.Value(wi))
        pts = []; we = BRepTools_WireExplorer(w)
        while we.More():
            e = we.Current(); c = BRepAdaptor_Curve(e)
            d = GCPnts_QuasiUniformDeflection(c, 0.002 * IN)
            if d.IsDone() and d.NbPoints() >= 2:
                seg = []
                for i in range(1, d.NbPoints() + 1):
                    p = d.Value(i); q = [(p.X() - origin[0]) / IN, (p.Y() - origin[1]) / IN, (p.Z() - origin[2]) / IN]
                    seg.append(tuple(q[j] for j in range(3) if j != k))
                # keep the edge running the way the wire does
                if pts and math.dist(pts[-1], seg[-1]) < math.dist(pts[-1], seg[0]): seg = seg[::-1]
                pts += seg if not pts else seg[1:]
            we.Next()
        if len(pts) >= 3:
            g = Polygon(pts).buffer(0)
            if not g.is_empty: rings.append(g)
    if not rings: return None
    # even–odd: a ring inside a ring is a hole, a ring inside that is material again
    return reduce(lambda a, b: a.symmetric_difference(b), rings).buffer(0)

def _clean(g, w=0.01):
    """drop slivers and seams thinner than about 2w (panel joints, tolerance gaps)"""
    if g.is_empty: return g
    g = g.buffer(-w, join_style=2).buffer(w, join_style=2)
    if g.is_empty: return g
    return unary_union([p for p in _polys(g) if p.area > 0.004])

def _polys(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, MultiPolygon): return list(g.geoms)
    return [p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon)]

def cuts(bodies, axis, outline, s0, s1, origin, outside_low=True):
    """All cuts in a panel made of `bodies` (solids) between depths s0..s1 along `axis`. `outline`: the panel's
    shapely outline in the same 2D coords. outside_low: the face at s0 is the 'outside' (or 'bottom').
    Returns [{face:'through'|'outside'|'inside', depth, poly}] (depth = how deep from that face)."""
    lv = sorted(set(round(v, 3) for b in bodies for v in levels(b['shape'], axis, origin) if s0 + 0.02 < v < s1 - 0.02))
    edges = [s0] + [v for i, v in enumerate(lv) if i == 0 or v - lv[i - 1] > 0.02] + [s1]
    bands = [(a, b) for a, b in zip(edges, edges[1:]) if b - a > 0.02]
    if not outside_low: bands = bands[::-1]
    removed = []
    for a, b in bands:
        mid = (a + b) / 2; mats = []
        for bd in bodies:
            bb = bd['b']; k = AX[axis]
            if bb[k] - 0.01 <= mid <= bb[k + 3] + 0.01:
                m = section(bd['shape'], axis, mid, origin)
                if m is not None and not m.is_empty: mats.append(m)
        mat = unary_union(mats) if mats else Polygon()
        removed.append(_clean(outline.difference(mat)))
    if not removed: return []
    thick = [abs(b - a) for a, b in bands]
    through = _clean(reduce(lambda a, b: a.intersection(b), removed))
    out = [dict(face='through', depth=round(sum(thick), 3), poly=p) for p in _polys(through)]
    for face, R, T in (('outside', removed, thick), ('inside', removed[::-1], thick[::-1])):
        acc = None
        for j in range(len(R) - 1):
            acc = R[0] if acc is None else acc.intersection(R[j])
            nxt = acc.intersection(R[j + 1])
            here = _clean(acc.difference(nxt).difference(through))
            for p in _polys(here): out.append(dict(face=face, depth=round(sum(T[:j + 1]), 3), poly=p))
    return out

def describe(poly):
    """rect / round / poly, with what the app and the CNC need"""
    x0, y0, x1, y1 = poly.bounds; w, h = x1 - x0, y1 - y0
    full = Polygon(poly.exterior)            # judge the outline; anything inside it is its own cut
    if full.area >= 0.998 * w * h:
        return dict(shape='rect', x=x0, y=y0, w=w, h=h)
    r = (w + h) / 4
    if abs(w - h) < 0.01 and abs(full.area - math.pi * r * r) < 0.01 * full.area:
        # the traced points lie on the true circle: its size is their distance from the centre (the area of the
        # traced polygon is a hair smaller than the circle's)
        c = full.centroid; pts = list(full.exterior.coords)[:-1]
        R = sum(math.dist((c.x, c.y), q) for q in pts) / len(pts)
        return dict(shape='round', x=c.x - R, y=c.y - R, w=2 * R, h=2 * R, d=2 * R)
    return dict(shape='poly', x=x0, y=y0, w=w, h=h, path=[[round(a, 4), round(b, 4)] for a, b in full.simplify(0.002).exterior.coords])

def toolpaths(poly, face):
    """the ¾″ bit's paths: through → the profile ⅜″ inside the outline; pocket → clearing rings from the middle out"""
    ring = lambda g: [[[round(a, 4), round(b, 4)] for a, b in p.exterior.coords] for p in _polys(g)]
    poly = Polygon(poly.exterior)
    first = poly.buffer(-TOOL_R, join_style=1)
    if first.is_empty: return []          # narrower than the bit: flagged by the app
    if face == 'through': return ring(first)
    rings = []; g = first
    while not g.is_empty:
        rings = ring(g) + rings; g = g.buffer(-0.3, join_style=1)
    return rings

BOXES = [(2.375, 3.375), (2.375, 3.625), (4.125, 3.625), (4.625, 3.375), (5.0, 5.0), (2.875, 3.625)]
def is_box(w, h):
    return any((abs(w-a) < 0.3 and abs(h-b) < 0.3) or (abs(w-b) < 0.3 and abs(h-a) < 0.3) for a, b in BOXES)
