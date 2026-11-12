"""Cubit Builder - scan a siding panel's STEP file into the siding library (data/siding.json).

A siding panel is one formed sheet extruded along its length. This reads the STEP (any length: a short sample is
enough), finds the extrusion direction from the two flat end caps, and records the cross-section exactly, edge by
edge (straight runs and bend arcs), in inches, with the panel's measurements:

  w        overall width across the panel (inches)       depth   back plane (against the wall) to the face
  t        sheet thickness                                bend    inside bend radius
  faces    the flats on the face, [x0, x1, y] from the left edge (the part you see)
  grooves  the rib bottoms that sit on the wall, [x0, x1]
  profile  every edge of the cross-section: {k:'L'|'A', a:[x,y], b:[x,y], c?:[x,y], r?}; x across from the left
           edge, y out from the wall (0 = the back plane)

    python3 tools/siding/scan_profile.py <file.step> --id rando-rib --name "Rando Rib" --cover 33 [--out data/siding.json]

The cover width (what each panel adds along the wall once lapped) isn't in a single panel's geometry exactly; pass
it with --cover (measured on the wall or from the maker's sheet). Re-scanning the same id replaces the entry."""
import argparse, json, math, os, hashlib, datetime
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE, TopAbs_WIRE
from OCP.BRepAdaptor import BRepAdaptor_Surface, BRepAdaptor_Curve
from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Line, GeomAbs_Circle, GeomAbs_Cylinder
from OCP.BRepTools import BRepTools_WireExplorer
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.TopoDS import TopoDS

MM = 25.4
r4 = lambda v: round(v, 4)

def scan(path):
    rd = STEPControl_Reader(); rd.ReadFile(path); rd.TransferRoots(); s = rd.OneShape()
    # the end caps: the two flat faces square to a main axis that sit at the very start and end of that axis
    b = Bnd_Box(); BRepBndLib.Add_s(s, b); lo, hi = b.CornerMin(), b.CornerMax()
    LO = (lo.X(), lo.Y(), lo.Z()); HI = (hi.X(), hi.Y(), hi.Z())
    planes, radii = [], set()
    e = TopExp_Explorer(s, TopAbs_FACE)
    while e.More():
        f = TopoDS.Face(e.Current()); a = BRepAdaptor_Surface(f)
        if a.GetType() == GeomAbs_Plane:
            d = a.Plane().Axis().Direction(); g = GProp_GProps(); BRepGProp.SurfaceProperties_s(f, g); m = g.CentreOfMass()
            planes.append((f, (d.X(), d.Y(), d.Z()), g.Mass(), (m.X(), m.Y(), m.Z())))
        elif a.GetType() == GeomAbs_Cylinder: radii.add(round(a.Cylinder().Radius(), 4))
        e.Next()
    caps, ax = None, None
    for k in range(3):
        at = [p for p in planes if abs(abs(p[1][k]) - 1) < 1e-6]
        ends = [p for p in at if abs(p[3][k]-LO[k]) < 1e-4] , [p for p in at if abs(p[3][k]-HI[k]) < 1e-4]
        if len(ends[0]) == 1 and len(ends[1]) == 1 and abs(ends[0][0][2]-ends[1][0][2]) < 1e-3*ends[0][0][2]:
            if caps is None or ends[0][0][2] > caps[0][2]: caps, ax = (ends[0][0], ends[1][0]), k
    if not caps: raise SystemExit('No pair of matching end caps: is this one extruded panel?')
    u, v = [k for k in range(3) if k != ax]          # the cross-section plane
    span = [HI[k]-LO[k] for k in range(3)]
    if span[u] < span[v]: u, v = v, u                 # u = across the panel, v = its depth
    cap = caps[0][0]
    g = GProp_GProps(); BRepGProp.VolumeProperties_s(s, g)
    # the edges of one cap, in order
    w = TopExp_Explorer(cap, TopAbs_WIRE); wire = TopoDS.Wire(w.Current())
    P = lambda p: (p.X(), p.Y(), p.Z())
    to2 = lambda q: ((q[u]-LO[u])/MM, (q[v]-LO[v])/MM)
    segs = []; we = BRepTools_WireExplorer(wire)
    while we.More():
        ed = we.Current(); c = BRepAdaptor_Curve(ed); t = c.GetType()
        a_, b_ = to2(P(c.Value(c.FirstParameter()))), to2(P(c.Value(c.LastParameter())))
        sg = {'k': 'L' if t == GeomAbs_Line else 'A', 'a': [r4(a_[0]), r4(a_[1])], 'b': [r4(b_[0]), r4(b_[1])]}
        if t == GeomAbs_Circle:
            ci = c.Circle(); cc = to2(P(ci.Location())); sg['c'] = [r4(cc[0]), r4(cc[1])]; sg['r'] = r4(ci.Radius()/MM)
        elif t != GeomAbs_Line: raise SystemExit(f'Unexpected edge type {t} in the cross-section')
        segs.append(sg); we.Next()
    # which side faces out: the face is the side with the most material far from the back
    W, D = span[u]/MM, span[v]/MM
    ys = sorted({round(y, 4) for sg in segs for y in (sg['a'][1], sg['b'][1])})
    flats = {}
    for sg in segs:
        if sg['k'] == 'L' and abs(sg['a'][1]-sg['b'][1]) < 1e-4:
            flats.setdefault(round(sg['a'][1], 4), []).append(sorted((sg['a'][0], sg['b'][0])))
    top_y = max(flats); bot_y = min(flats)
    if sum(b-a for a, b in flats[top_y]) < sum(b-a for a, b in flats[bot_y]):   # the wide flats are the face: flip so y grows outward
        for sg in segs:
            for k in ('a', 'b', 'c'):
                if k in sg: sg[k][1] = r4(D - sg[k][1])
        flats = {r4(D-y): v_ for y, v_ in flats.items()}; top_y, bot_y = max(flats), min(flats)
    levels = sorted(flats)
    thick = levels[1] - levels[0]                     # the back of the sheet and its other side
    over = lambda p, q: min(p[1], q[1]) - max(p[0], q[0]) > 1e-3
    # the face: flats on the outer side of the sheet (nothing of the same sheet just above them)
    faces = sorted([[r4(a), r4(b), r4(y)] for y, L in flats.items() if y > D/2 for a, b in L
                    if not any(abs(y2-(y+thick)) < 2e-3 and over((a, b), q) for y2, L2 in flats.items() for q in L2)])
    grooves = sorted([[r4(a), r4(b)] for a, b in flats[bot_y]])
    area = g.Mass() / (span[ax])
    return dict(w=r4(W), depth=r4(D), t=r4(thick), bend=r4(min(radii)/MM) if radii else 0, sample=r4(span[ax]/MM),
                area=r4(area/MM/MM), faces=faces, grooves=grooves, profile=segs,
                faceLevels=sorted({f[2] for f in faces}))

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('step'); ap.add_argument('--id', required=True); ap.add_argument('--name', required=True)
    ap.add_argument('--cover', type=float, required=True); ap.add_argument('--maker', default='')
    ap.add_argument('--material', default='Metal'); ap.add_argument('--out', default='data/siding.json')
    A = ap.parse_args()
    R = scan(A.step)
    sha = hashlib.sha256(open(A.step, 'rb').read()).hexdigest()[:16]
    item = dict(id=A.id, name=A.name, maker=A.maker, material=A.material, cover=A.cover, **R,
                source=dict(file=os.path.basename(A.step), sha256=sha, scanned=datetime.date.today().isoformat(),
                            note='cross-section measured from the STEP end cap; inches; y = 0 is the back (against the wall)'))
    L = json.load(open(A.out)) if os.path.exists(A.out) else []
    L = [x for x in L if x['id'] != A.id] + [item]
    json.dump(L, open(A.out, 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({k: v for k, v in item.items() if k not in ('profile',)}, indent=1))
