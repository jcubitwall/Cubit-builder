"""Cubit Builder - decks (porch frames) from a STEP file.

A deck is a frame of members sitting at floor level outside every pod. Frames built side by side touch,
so a group of touching solids is split wherever two parallel members sit back to back.

Each deck is described in its own frame, like a pod:
  local x  along the LEDGER side (the side that docks to a pod or another deck), 0 .. W inches
  local z  outward from the ledger, 0 .. D inches          (the ledger is the deck's own "S" side, on top at rot 0)

  { "id": "DK08x10-01", "name": "...", "w": 8, "d": 10,          nominal feet (w along the ledger)
    "W": 96, "D": 120, "h": 7.25, "z": 0,                        actual inches; z = bottom above floor bottom
    "lumber": {"t": 1.5, "h": 7.25},
    "rims": {"ledger": true, "left": true, "right": true, "far": true},
    "joists": {"run": "x", "at": [17.5, ...]},                   near face of each joist, inches from the ledger
    "notch": 1.5, "notches": [[0,0],[1,0],[0,1],[1,1]],          corners notched for the steel corner: [x end, z end]
    "source": "..." }

On a home a deck is { "lib": id, "x": ft, "z": ft, "rot": 0|90|180|270 } (x/z = top-left of its footprint).
rot follows pods: the ledger faces S (top) at 0, E at 90, N at 180, W at 270.
"""
import collections, json

from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.gp import gp_Pnt
from OCP.TopAbs import TopAbs_IN, TopAbs_ON

IN = 25.4
SIDE_ROT = {'S': 0, 'E': 90, 'N': 180, 'W': 270}


class Frame:
    """STEP <-> app plan coordinates (inches), the same mapping find_pods uses."""
    def __init__(self, pods, orient):
        self.orient = orient; self.Ymax = max(p['y1'] for p in pods)
    def to_app(self, x, y): return (y, x) if self.orient == 'y' else (x, self.Ymax - y)
    def to_step(self, ax, az): return (az, ax) if self.orient == 'y' else (ax, self.Ymax - az)
    def box(self, b):
        a = self.to_app(b[0], b[1]); c = self.to_app(b[3], b[4])
        return [min(a[0], c[0]), min(a[1], c[1]), max(a[0], c[0]), max(a[1], c[1])]


def _inside(cls, origin, p):
    X0, Y0, Z0 = origin
    q = gp_Pnt(p[0] * IN + X0, p[1] * IN + Y0, p[2] * IN + Z0)
    for s, c in cls:
        b = s['b']
        if not (b[0] - 0.01 <= p[0] <= b[3] + 0.01 and b[1] - 0.01 <= p[1] <= b[4] + 0.01 and b[2] - 0.01 <= p[2] <= b[5] + 0.01):
            continue
        c.Perform(q, 1e-3)
        if c.State() in (TopAbs_IN, TopAbs_ON): return True
    return False


def _runs(hit, a, b, step=0.0625):
    out, inside, st, t = [], False, a, a
    while t <= b + 1e-9:
        h = hit(t)
        if h and not inside: st = t
        if not h and inside: out.append((round(st - a, 3), round(t - st, 3)))
        inside, t = h, t + step
    if inside: out.append((round(st - a, 3), round(b - st, 3)))
    return out


def _union_groups(items, joinable):
    par = list(range(len(items)))
    def f(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if joinable(items[i], items[j]): par[f(i)] = f(j)
    g = collections.defaultdict(list)
    for i, s in enumerate(items): g[f(i)].append(s)
    return list(g.values())


def find_decks(solids, pods, log=print):
    def in_pod(s):
        b = s['b']
        return any(b[0] < p['x1'] - 0.5 and b[3] > p['x0'] + 0.5 and b[1] < p['y1'] - 0.5 and b[4] > p['y0'] + 0.5 for p in pods)
    out = [s for s in solids if not in_pod(s) and s['b'][2] < 12]

    def joinable(a, b):
        A, B = a['b'], b['b']
        ov = [min(A[k + 3], B[k + 3]) - max(A[k], B[k]) for k in range(3)]
        if min(ov) < -0.05: return False
        touch = [k for k in range(3) if ov[k] <= 0.05]          # axis they meet along
        if len(touch) != 1: return min(ov) > 0.05              # overlapping solids join; edge/corner contact doesn't
        k = touch[0]
        if any(ov[m] <= 0.05 for m in range(3) if m != k): return False
        # two thin members back to back belong to different frames
        thin = lambda S: S[k + 3] - S[k] <= 2.5
        return not (thin(A) and thin(B))
    decks = []
    for g in _union_groups(out, joinable):
        b = [min(s['b'][k] for s in g) for k in range(3)] + [max(s['b'][k + 3] for s in g) for k in range(3)]
        if b[3] - b[0] < 36 or b[4] - b[1] < 36: continue
        decks.append(dict(b=b, solids=g))
    log(f'{len(decks)} deck frame(s) found')
    return decks


def _ledger(box, others):
    """world side of `box` facing the nearest neighbour (app inches): returns (gap, side)"""
    x0, z0, x1, z1 = box; gaps = []
    for (a0, b0, a1, b1) in others:
        if b0 < z1 - 1 and b1 > z0 + 1: gaps += [(x0 - a1, 'W'), (a0 - x1, 'E')]
        if a0 < x1 - 1 and a1 > x0 + 1: gaps += [(z0 - b1, 'S'), (b0 - z1, 'N')]
    gaps = [g for g in gaps if g[0] > -0.5]
    return min(gaps) if gaps else (None, 'S')


def describe_all(decks, pods, origin, orient):
    """Measure every deck. Returns [(lib_entry_without_id, placement)] with placement in app inches."""
    F = Frame(pods, orient)
    pod_boxes = [F.box([p['x0'], p['y0'], 0, p['x1'], p['y1'], 0]) for p in pods]
    deck_boxes = [F.box(d['b']) for d in decks]
    out = []
    for n, d in enumerate(decks):
        box = deck_boxes[n]
        gap, side = _ledger(box, pod_boxes)
        if gap is None or gap > 3:      # not against a pod: docks to the nearest deck
            g2 = _ledger(box, [b for k, b in enumerate(deck_boxes) if k != n])
            if g2[0] is not None and (gap is None or g2[0] < gap): gap, side = g2
        lib, rot = measure(d, box, side, origin, F)
        out.append((lib, dict(box=box, rot=rot, gap=gap)))
    return out


def measure(d, box, side, origin, F):
    cls = [(s, BRepClass3d_SolidClassifier(s['shape'])) for s in d['solids']]
    z0, z1 = d['b'][2], d['b'][5]; H = z1 - z0; zm = z0 + H / 2
    x0, a0, x1, a1 = box
    rot = SIDE_ROT[side]
    W, D = (x1 - x0, a1 - a0) if rot % 180 == 0 else (a1 - a0, x1 - x0)

    def app(u, v):    # local (x along the ledger, z outward) -> app plan point
        if rot == 0: return (x0 + u, a0 + v)
        if rot == 90: return (x1 - v, a0 + u)
        if rot == 180: return (x1 - u, a1 - v)
        return (x0 + v, a1 - u)
    def hit(u, v):
        ax, az = app(u, v); sx, sy = F.to_step(ax, az)
        return _inside(cls, origin, (sx, sy, zm))
    across = _runs(lambda t: hit(W * 0.37, t), 0, D)      # members met walking out from the ledger
    along = _runs(lambda t: hit(t, D * 0.37), 0, W)       # members met walking along the ledger
    run = 'x' if len(across) >= len(along) else 'z'
    t = min([r[1] for r in across + along] or [1.5])
    rims = dict(ledger=bool(across and across[0][0] < 0.1), far=bool(across and across[-1][0] + across[-1][1] > D - 0.1),
                left=bool(along and along[0][0] < 0.1), right=bool(along and along[-1][0] + along[-1][1] > W - 0.1))
    js = across if run == 'x' else along
    lim = D if run == 'x' else W
    a_rim, b_rim = (rims['ledger'], rims['far']) if run == 'x' else (rims['left'], rims['right'])
    joists = [j[0] for j in js if not (a_rim and j[0] < 0.1) and not (b_rim and j[0] + j[1] > lim - 0.1)]
    # corner notches: an empty square at the corner, sized by walking along each edge just inside it
    notches, size = [], 0.0
    for cu in (0, 1):
        for cv in (0, 1):
            pu = lambda k: k if cu == 0 else W - k
            pv = lambda k: k if cv == 0 else D - k
            if hit(pu(0.1), pv(0.1)): continue
            su = next((k for k in [i / 16 for i in range(2, 97)] if hit(pu(k), pv(0.1))), 0)
            sv = next((k for k in [i / 16 for i in range(2, 97)] if hit(pu(0.1), pv(k))), 0)
            if su and sv:
                notches.append([cu, cv]); size = max(size, round(min(su, sv) * 16) / 16)
    lib = dict(w=round(W / 12), d=round(D / 12), W=round(W, 3), D=round(D, 3), h=round(H, 3), z=round(z0, 3),
               lumber=dict(t=round(t * 8) / 8, h=round(H * 8) / 8), rims=rims, joists=dict(run=run, at=joists),
               notch=size, notches=sorted(notches))
    # a square frame with its joists running out from the ledger is the same frame turned: keep joists along x
    if run == 'z' and abs(W - D) < 0.2:
        lib['joists']['run'] = 'x'
        lib['rims'] = dict(ledger=rims['right'], far=rims['left'], left=rims['ledger'], right=rims['far'])
        lib['joists']['at'] = sorted(round(W - j - t, 3) for j in joists)
        rot = (rot + 90) % 360
        lib['notches'] = sorted([[cv, 1 - cu] for cu, cv in notches])
    return lib, rot


def same_deck(a, b, tol=0.125):
    near = lambda x, y: abs(x - y) <= tol + 1e-9
    return (a['w'] == b['w'] and a['d'] == b['d'] and near(a['W'], b['W']) and near(a['D'], b['D']) and near(a['h'], b['h'])
            and a['rims'] == b['rims'] and a['joists']['run'] == b['joists']['run'] and a['notches'] == b['notches']
            and near(a['notch'], b['notch']) and len(a['joists']['at']) == len(b['joists']['at'])
            and all(near(x, y) for x, y in zip(a['joists']['at'], b['joists']['at'])))


def _oc(d):
    a = d['joists']['at']
    g = sorted(round(b - x) for x, b in zip(a, a[1:]))
    return g[len(g) // 2] if g else 0


def merge_decks(lib, new, source):
    """Add decks that aren't in the library yet. Returns (library id per deck, how many were added)."""
    ids, added = [], 0
    for d in new:
        hit = next((x for x in lib if same_deck(x, d)), None)
        if not hit:
            n = 1 + sum(1 for x in lib if x['w'] == d['w'] and x['d'] == d['d'])
            nominal = round(d['lumber']['h'] + 0.75)
            name = f"{d['w']}′ × {d['d']}′ deck frame · 2×{nominal}" + (f" · joists {_oc(d)}″ o.c." if _oc(d) else '')
            hit = dict(id=f"DK{d['w']:02d}x{d['d']:02d}-{n:02d}", name=name, **d, source=source)
            lib.append(hit); added += 1
        ids.append(hit['id'])
    return ids, added


def place(placements, ids, pods):
    """Deck placements on the app's nominal grid (feet). Decks sit flush against the pod or deck their ledger
    faces; along that side they snap to the 8′ grid."""
    out = []
    ax0 = min(p['ax'] for p in pods); az0 = min(p['az'] for p in pods)
    for pl, did in zip(placements, ids):
        x0, z0, x1, z1 = pl['box']
        rot = pl['rot']
        # nominal size in feet
        w = (x1 - x0); d = (z1 - z0)
        nx = (x0 - ax0) / 12; nz = (z0 - az0) / 12
        # along the 8′ grid, flush across: round each edge to the nearest 8′ line or pod edge
        nx = round(nx / 8) * 8 if rot % 180 == 0 or abs(nx - round(nx / 8) * 8) < 0.5 else round(nx * 8) / 8
        nz = round(nz / 8) * 8 if rot % 180 == 90 or abs(nz - round(nz / 8) * 8) < 0.5 else round(nz * 8) / 8
        out.append(dict(lib=did, x=nx, z=nz, rot=rot, _w=w / 12, _d=d / 12))
    return out


def write_decks(path, lib):
    with open(path, 'w') as f:
        f.write('[\n' + ',\n'.join('  ' + json.dumps(x, ensure_ascii=False) for x in lib) + '\n]\n')
