"""Cubit Builder - import ONE wall from a STEP file into the wall library (data/walls.json).

    python3 -I tools/step-import/import_step.py wall.step --kind wall --name "Kitchen wall" --repo .

The file holds a single wall standing upright: its thin horizontal dimension is the thickness
(about 6.5" exterior, 4.5" interior), the long one its length (a multiple of 4'), the vertical one 96".
Openings are found with the same ray grid and unit names as whole-home imports.

Which face is OUTSIDE: the face nearest a solid named "OSB out" if there is one; otherwise the face
towards -Y (Shapr3D's front view). Opening x positions are measured from the left end seen from outside.
"""
import json, os, sys, datetime
import import_step as I


def run(step, name, repo='.'):
    solids, origin = I.read_step(step)
    rays = I.Rays(origin)
    body = [s for s in solids if not I.UNIT.match(s['name'])]
    if not body: sys.exit('No wall found in this file.')
    b = [min(s['b'][k] for s in body) for k in range(3)] + [max(s['b'][k + 3] for s in body) for k in range(3)]
    dx, dy, dz = b[3] - b[0], b[4] - b[1], b[5] - b[2]
    if dz < 80 or dz > 110: sys.exit(f'A wall should stand about 96" tall; this one is {dz:.1f}". Check the file is upright.')
    along = 'x' if dx >= dy else 'y'
    thick = dy if along == 'x' else dx
    length = dx if along == 'x' else dy
    if thick > 12: sys.exit(f'This looks thicker than a wall ({thick:.1f}"). Upload one wall per file, or upload a pod / home.')
    # outside face
    out = [s for s in body if s['name'].lower().startswith('osb out')]
    if along == 'x':
        mid = (b[1] + b[4]) / 2
        lo_side = (sum((s['b'][1] + s['b'][4]) / 2 for s in out) / len(out) < mid) if out else True
        side = 'S' if lo_side else 'N'
    else:
        mid = (b[0] + b[3]) / 2
        lo_side = (sum((s['b'][0] + s['b'][3]) / 2 for s in out) / len(out) < mid) if out else True
        side = 'W' if lo_side else 'E'
    # scan it as one side of a pretend pod lying just inside the wall
    I.WALL_Z = (b[2], b[2] + 96.0)
    I.DEPTH = thick + 2
    pod = dict(x0=b[0], y0=b[1], x1=b[3], y1=b[4], len=round(length / 12), long=along)
    sc = I.scan_wall(solids, rays, pod, side)
    L = sc['ub'] - sc['ua']
    # left end seen from outside: S and E faces read along +axis, N and W faces read the other way
    same = side in ('S', 'E')
    nominal = max(4, round(L / 48) * 4)
    # the library stores walls edge to edge (pod corner to pod corner). A long wall butts between the end
    # walls, so its body is shorter than its nominal length: centre it (the end walls take the rest)
    off = (nominal * 12 - L) / 2 if nominal * 12 - L > 1 else 0
    ops = []
    for o in sc['openings']:
        x = (o['u0'] if same else L - o['u1']) + off
        ops.append(dict(kind=o['kind'], x=round(x, 4), y=round(o['z0'], 4), w=round(o['u1'] - o['u0'], 4), h=round(o['z1'] - o['z0'], 4)))
    ops.sort(key=lambda o: o['x'])
    ty = 'int' if thick <= 5.5 else 'ext'
    w = dict(len=nominal, type=ty, t=6.5 if ty == 'ext' else 4.5, openings=ops, inside=[], outside=[])
    path = os.path.join(repo, 'data/walls.json')
    walls = json.load(open(path))
    hit = next((x for x in walls if I.same_wall(x, w)), None)
    added = 0
    if not hit:
        n = 1 + sum(1 for x in walls if x['len'] == w['len'] and x.get('type', 'ext') == w['type'])
        today = datetime.date.today().isoformat()
        hit = dict(id=f"{'I' if ty == 'int' else 'W'}{w['len']:02d}-{n:02d}", name=name.strip() or I.describe_wall(w), **w,
                   source=f"{name} (STEP {today})")
        if not name.strip(): hit['name'] = I.describe_wall(w)
        walls.append(hit); added = 1
        with open(path, 'w') as f:
            f.write('[\n' + ',\n'.join('  ' + json.dumps(x, ensure_ascii=False) for x in walls) + '\n]\n')
    note = '' if out else ' (no "OSB out" body found: the -Y / -X face was taken as outside)'
    print(json.dumps(dict(kind='wall', wall=hit['id'], new_walls=added, length_in=round(L, 2), thickness_in=round(thick, 2),
                          type=ty, openings=len(ops), outside_face=side + note,
                          fitted=(f'long wall, {round(L,2)}" body centred in {nominal}\'' if off else 'runs the full length'))))
    return 0
