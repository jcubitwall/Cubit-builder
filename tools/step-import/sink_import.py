"""Cubit Builder - import ONE kitchen sink from a STEP file into the cabinet library (data/sinks.json + data/sinks/<id>.json).

    python3 -I tools/step-import/sink_import.py sink.step --name "Blanco 33 double" --mount top|bottom --repo .

The file holds one sink, sitting level the way it's installed (rim on top), at its real size, its front toward −Y
(facing you in Shapr3D's front view). Kept:
  · the mesh (one per solid, like fixture_mesh.py), inches × 100, y up, x from its left end, z from its back;
  · `rim`: the sink's outline seen from above (the widest horizontal section near the top): a top-mount sink's
    countertop hole is cut `counter.lap` (¼″) inside it, all the way round, whatever its shape;
  · `open`: the bowl opening(s) at that height (the holes in that section): a bottom-mount sink's hole is these,
    less `counter.reveal` (¼″) each side, so the sink is recessed under the countertop.
The app does the rest exactly as for the built-in sinks: docking, the sink base's size and stretchers, the
countertop's hole in 3D and on the CNC.
"""
import argparse, datetime, json, math, os, re, sys
from OCP.STEPControl import STEPControl_Reader
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID, TopAbs_REVERSED, TopAbs_EDGE
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.TopoDS import TopoDS
from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
from OCP.gp import gp_Pln, gp_Pnt, gp_Dir
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.GCPnts import GCPnts_QuasiUniformDeflection

MM = 25.4


def read(step):
    r = STEPControl_Reader()
    if r.ReadFile(step) != 1: sys.exit('Could not read this STEP file.')
    r.TransferRoots(); return r.OneShape()


def bbox(shp):
    b = Bnd_Box(); BRepBndLib.Add_s(shp, b); mn, mx = b.CornerMin(), b.CornerMax()
    return mn.X(), mn.Y(), mn.Z(), mx.X(), mx.Y(), mx.Z()


def mesh(shp, B):
    x0, y1, z0 = B[0], B[4], B[2]   # ours: x = X, y = Z (up), z = −Y (front toward +z): a true rotation, no mirror
    BRepMesh_IncrementalMesh(shp, 0.8, False, 0.4, True)
    parts = []; es = TopExp_Explorer(shp, TopAbs_SOLID); k = 0
    while es.More():
        P = []; I = []; ef = TopExp_Explorer(es.Current(), TopAbs_FACE)
        while ef.More():
            f = TopoDS.Face(ef.Current()); loc = TopLoc_Location(); t = BRep_Tool.Triangulation_s(f, loc)
            if t is not None:
                tr = loc.Transformation(); base = len(P) // 3; rev = f.Orientation() == TopAbs_REVERSED
                for i in range(1, t.NbNodes() + 1):
                    p = t.Node(i).Transformed(tr)
                    P += [round((p.X() - x0) / MM * 100), round((p.Z() - z0) / MM * 100), round((y1 - p.Y()) / MM * 100)]
                for i in range(1, t.NbTriangles() + 1):
                    a, bb, c = t.Triangle(i).Get()
                    if rev: bb, c = c, bb
                    I += [base + a - 1, base + bb - 1, base + c - 1]
            ef.Next()
        k += 1; parts.append({'name': 'Sink' if k == 1 else f'Sink part {k}', 'ex': [0, 0, 0], 'p': P, 'i': I}); es.Next()
    return parts


def section(shp, zc, B):
    """the loops where a level plane at height zc (file units) cuts the sink: [[x, z]…] in inches (x from the left, z from the back)"""
    sec = BRepAlgoAPI_Section(shp, gp_Pln(gp_Pnt(0, 0, zc), gp_Dir(0, 0, 1)), False); sec.ComputePCurveOn1(True); sec.Approximation(True); sec.Build()
    if not sec.IsDone(): return []
    segs = []; ex = TopExp_Explorer(sec.Shape(), TopAbs_EDGE)
    while ex.More():
        c = BRepAdaptor_Curve(TopoDS.Edge(ex.Current())); d = GCPnts_QuasiUniformDeflection(c, 0.05)
        if d.IsDone() and d.NbPoints() > 1:
            pts = [((d.Value(i).X() - B[0]) / MM, (B[4] - d.Value(i).Y()) / MM) for i in range(1, d.NbPoints() + 1)]
            segs.append(pts)
        ex.Next()
    # chain the pieces into closed loops (ends within 0.01″)
    loops = []; tol = 0.01
    while segs:
        cur = segs.pop(0); grew = True
        while grew and math.dist(cur[0], cur[-1]) > tol:
            grew = False
            for i, s in enumerate(segs):
                if math.dist(cur[-1], s[0]) <= tol: cur += s[1:]; segs.pop(i); grew = True; break
                if math.dist(cur[-1], s[-1]) <= tol: cur += s[::-1][1:]; segs.pop(i); grew = True; break
                if math.dist(cur[0], s[-1]) <= tol: cur = s[:-1] + cur; segs.pop(i); grew = True; break
                if math.dist(cur[0], s[0]) <= tol: cur = s[::-1][:-1] + cur; segs.pop(i); grew = True; break
        if len(cur) > 3 and math.dist(cur[0], cur[-1]) <= tol: loops.append(cur[:-1])
    return loops


def area(L): return 0.5 * sum(L[i][0] * L[(i + 1) % len(L)][1] - L[(i + 1) % len(L)][0] * L[i][1] for i in range(len(L)))


def thin(L, tol=0.003):
    """simplify a closed loop (Douglas-Peucker, 0.003″): curves stay smooth, straight runs become one segment"""
    def rdp(P):
        if len(P) < 3: return P
        a, b = P[0], P[-1]; lab = math.dist(a, b) or 1e-9; k, dm = 0, -1
        for i in range(1, len(P) - 1):
            p = P[i]; dd = abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / lab
            if dd > dm: k, dm = i, dd
        return rdp(P[:k + 1])[:-1] + rdp(P[k:]) if dm > tol else [a, b]
    far = max(range(len(L)), key=lambda i: math.dist(L[0], L[i]))
    out = rdp(L[:far + 1])[:-1] + rdp(L[far:] + [L[0]])[:-1]
    return [[round(p[0], 4), round(p[1], 4)] for p in out]


def run(step, name, mount, repo='.'):
    if mount not in ('top', 'bottom'): sys.exit('Mount must be top or bottom.')
    shp = read(step); B = bbox(shp)
    w, d, h = (B[3] - B[0]) / MM, (B[4] - B[1]) / MM, (B[5] - B[2]) / MM
    if not (8 <= w <= 72 and 8 <= d <= 36 and 3 <= h <= 16):
        sys.exit(f'This does not look like one kitchen sink sitting level: {w:.1f}" wide, {d:.1f}" deep, {h:.1f}" high.')
    # the rim: the widest section in the top inch; the openings: the holes in that same section
    best = None
    for k in range(1, 41):
        zc = B[5] - k * 0.025 * MM
        loops = section(shp, zc, B)
        if not loops: continue
        outer = max(loops, key=lambda L: abs(area(L)))
        if best is None or abs(area(outer)) > abs(area(best[0])) + 1e-6: best = (outer, [L for L in loops if L is not outer], zc)
    if not best: sys.exit('Could not find the sink\'s rim: is it sitting level, rim on top?')
    rim = thin(best[0]); opens = [thin(L) for L in best[1] if abs(area(L)) > 4]
    if not opens: sys.exit('Found the rim but no bowl opening inside it. Is the sink open at the top?')
    sid = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:40] or 'sink'
    os.makedirs(os.path.join(repo, 'data', 'sinks'), exist_ok=True)
    fx = {'w': round(w, 3), 'h': round(h, 3), 'd': round(d, 3), 'q': 100, 'rim': rim, 'open': opens, 'parts': mesh(shp, B)}
    json.dump(fx, open(os.path.join(repo, 'data', 'sinks', f'{sid}.json'), 'w'), separators=(',', ':'))
    reg_path = os.path.join(repo, 'data', 'sinks.json')
    try: reg = json.load(open(reg_path))
    except FileNotFoundError: reg = []
    entry = {'id': sid, 'k': 'SKS-' + sid.upper(), 'name': name, 'mount': mount, 'w': fx['w'], 'h': fx['h'], 'd': fx['d'], 'file': f'data/sinks/{sid}.json',
             'bowls': len(opens), 'added': datetime.date.today().isoformat()}
    new = not any(r['id'] == sid for r in reg)
    reg = [r for r in reg if r['id'] != sid] + [entry]
    json.dump(reg, open(reg_path, 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({'kind': 'sink', 'sink': name, 'new_sink': new, 'mount': mount, 'w': fx['w'], 'd': fx['d'], 'h': fx['h'], 'bowls': len(opens)}))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('step'); ap.add_argument('--name', required=True); ap.add_argument('--mount', default='top'); ap.add_argument('--repo', default='.')
    a = ap.parse_args(); run(a.step, a.name, a.mount, a.repo)
