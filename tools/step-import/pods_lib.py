"""Cubit Builder - pod library helpers.

A library pod is one pod with its own walls, floors and ceilings, described in the pod's own frame
(as if it were not turned), so it can be dropped into any home at any 90-degree turn:

  { "id": "L24-01", "name": "...", "t": "L24", "len": 24,
    "walls":  { "S": [ {"from": 0, "len": 24, "type": "ext", "wall": "W24-01"} ], "E": [...], "N": [...], "W": [...] },
    "layers": { "floor-ext": "FE24-01", "floor-int": "FI24-01", "ceiling-int": "CI24-01", "roof": "RF24-01" },
    "source": "..." }

`from` is in feet, measured from the LEFT end of that side seen from OUTSIDE the pod, so it does not
change when the pod is turned. Side S runs along the pod's length (x), with +z down the screen.

Usage on its own (rebuild data/pods.json from the shared projects):
    python3 -I tools/step-import/pods_lib.py --repo .
"""
import argparse, json, os

POD_LEN = {'L24': 24, 'P16': 16, 'P8': 8}
KINDS = ['floor-ext', 'floor-int', 'ceiling-int', 'roof']


def _slots(pods):
    """Same rules as js/layout.js slotsFor (pods not turned): returns slot dicts with id, pod, side, type, from, len."""
    P = []
    for i, p in enumerate(pods):
        L = POD_LEN[p['t']]
        rot = (p.get('rot') or 0) % 360
        w, d = (L, 8) if rot % 180 == 0 else (8, L)
        P.append(dict(i=i, x=p['x'], z=p['z'], x1=p['x'] + w, z1=p['z'] + d, rot=rot))
    out = []
    for p in P:
        sides = [('S', p['z'], p['x'], p['x1']), ('N', p['z1'], p['x'], p['x1']),
                 ('W', p['x'], p['z'], p['z1']), ('E', p['x1'], p['z'], p['z1'])]
        for k, f, a, b in sides:
            cov = []
            for q in P:
                if q is p: continue
                iv = None
                if k == 'S' and q['z1'] == f: iv = (max(q['x'], a), min(q['x1'], b))
                if k == 'N' and q['z'] == f: iv = (max(q['x'], a), min(q['x1'], b))
                if k == 'W' and q['x1'] == f: iv = (max(q['z'], a), min(q['z1'], b))
                if k == 'E' and q['x'] == f: iv = (max(q['z'], a), min(q['z1'], b))
                if iv and iv[1] - iv[0] > 0: cov.append(iv)
            segs = [(c, d_, 'int') for c, d_ in cov if d_ - c >= 4]
            rest = [(a, b)]
            for c, d_ in cov:
                n = []
                for s, e in rest:
                    if d_ <= s or c >= e: n.append((s, e)); continue
                    if c > s: n.append((s, c))
                    if d_ < e: n.append((d_, e))
                rest = n
            segs += [(s, e, 'ext') for s, e in rest if e - s >= 4]
            for s, e, ty in segs:
                frm = {'S': b - e, 'N': s - a, 'W': s - a, 'E': b - e}[k]   # from the left end seen from outside
                num = lambda v: str(int(v)) if float(v).is_integer() else repr(v)
                out.append(dict(id=f"{p['i']}{k}{num(s)}" + ('i' if ty == 'int' else ''), pod=p['i'], side=k, rot=p['rot'],
                                type=ty, frm=frm, len=e - s))
    return out


ROT_SIDE = {0: dict(S='S', E='E', N='N', W='W'), 90: dict(S='E', E='N', N='W', W='S'),
            180: dict(S='N', E='W', N='S', W='E'), 270: dict(S='W', E='S', N='E', W='N')}


def pods_from_model(model, source):
    """One library-pod description per pod of a saved home (model = {pods, picks, layerPicks})."""
    picks, lp = model.get('picks', {}), model.get('layerPicks', {})
    out = []
    for i, p in enumerate(model['pods']):
        walls = {'S': [], 'E': [], 'N': [], 'W': []}
        rot = (p.get('rot') or 0) % 360
        for s in _slots(model['pods']):
            if s['pod'] != i: continue
            local = next(k for k, v in ROT_SIDE[rot].items() if v == s['side'])
            walls[local].append(dict(**{'from': s['frm']}, len=s['len'], type=s['type'], wall=picks.get(s['id'])))
        for k in walls: walls[k].sort(key=lambda g: g['from'])
        layers = {k: lp.get(f'{i}:{k}') for k in KINDS if lp.get(f'{i}:{k}')}
        out.append(dict(t=p['t'], len=POD_LEN[p['t']], walls=walls, layers=layers, source=source, where=f'Pod {i + 1}'))
    return out


def _sig(p): return json.dumps([p['t'], p['walls'], p['layers']], sort_keys=True)


def merge_pods(lib, new, home_name):
    """Add the pods that aren't in the library yet. Returns how many were added."""
    added = 0
    have = {_sig(x) for x in lib}
    for p in new:
        if _sig(p) in have: continue
        n = 1 + sum(1 for x in lib if x['t'] == p['t'])
        p = dict(id=f"{p['t']}-{n:02d}", name=f"{p['len']}′ pod · {home_name} · {p.pop('where')}", **p)
        lib.append(p); have.add(_sig(p)); added += 1
    for p in lib: p.pop('where', None)
    return added


def write_pods(path, lib):
    with open(path, 'w') as f:
        f.write('[\n' + ',\n'.join('  ' + json.dumps(x, ensure_ascii=False) for x in lib) + '\n]\n')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--repo', default='.')
    a = ap.parse_args()
    path = os.path.join(a.repo, 'data/pods.json')
    try: lib = json.load(open(path))
    except FileNotFoundError: lib = []
    n = 0
    for proj in json.load(open(os.path.join(a.repo, 'data/projects.json'))):
        n += merge_pods(lib, pods_from_model(proj['model'], proj['name']), proj['name'])
    write_pods(path, lib)
    print(f'{n} new pods, {len(lib)} in the library')
