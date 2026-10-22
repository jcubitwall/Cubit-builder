"""Cubit Builder - import ONE window or door from a STEP file into the window & door library (data/units.json).

    python3 -I tools/step-import/import_step.py unit.step --kind unit --unit-type casement --hand L --name "Casement 24x60" --repo .

The file holds one unit standing upright, modelled at its real size (the unit, not the rough opening).
Its size is read from the bounding box: the vertical side is the height, the longer horizontal side the
width, the shorter one the depth. Type and handing come from the upload form (seen from outside).
"""
import json, os, sys, datetime
import import_step as I

TYPES = {'picture': ('WN', 'PI'), 'casement': ('WN', 'CA'), 'awning': ('WN', 'AW'), 'single': ('WN', 'SH'),
         'slider': ('WN', 'SL'), 'entry': ('DR', 'EN'), 'patio': ('DR', 'PA')}
HANDED = {'casement', 'slider', 'entry', 'patio'}


def run(step, name, utype, hand='L', swing='in', repo='.'):
    if utype not in TYPES: sys.exit(f'Unknown window / door type "{utype}".')
    solids, _ = I.read_step(step)
    if not solids: sys.exit('No solid bodies found in this file.')
    b = [min(s['b'][k] for s in solids) for k in range(3)] + [max(s['b'][k + 3] for s in solids) for k in range(3)]
    dx, dy, dz = b[3] - b[0], b[4] - b[1], b[5] - b[2]
    note = ''
    if dz < min(dx, dy):   # modelled lying flat: take the two big sides as width x height
        w, h, d = max(dx, dy), min(dx, dy), dz
        note = ' (the file lay flat: the longer side was taken as the width; check it)'
    else:
        w, h, d = max(dx, dy), dz, min(dx, dy)
    if not (8 <= h <= 110 and 8 <= w <= 200 and d <= 14):
        sys.exit(f'This does not look like one window or door: {w:.1f}" wide, {h:.1f}" high, {d:.1f}" deep. Upload one unit per file, standing upright.')
    r8 = lambda v: round(v * 8) / 8
    u = dict(type=utype, w=r8(w), h=r8(h), d=r8(d))
    if utype in HANDED: u['hand'] = 'R' if hand == 'R' else 'L'
    if utype == 'entry': u['swing'] = 'out' if swing == 'out' else 'in'
    path = os.path.join(repo, 'data/units.json')
    try: units = json.load(open(path))
    except FileNotFoundError: units = []
    hit = next((x for x in units if not x.get('sample') and x['type'] == utype and abs(x['w'] - u['w']) <= 0.125 and abs(x['h'] - u['h']) <= 0.125), None)
    added = 0
    if not hit:
        a, c = TYPES[utype]
        base = f"{a}-{c}-{int(round(u['w'])):02d}{int(round(u['h'])):02d}"
        n = 1 + sum(1 for x in units if x['id'].startswith(base) and not x.get('sample'))
        hit = dict(id=f'{base}-{n:02d}', name=name.strip() or f"{utype.title()} {u['w']:g} x {u['h']:g}", **u,
                   source=f"{name} (STEP {datetime.date.today().isoformat()})")
        units.append(hit); added = 1
        with open(path, 'w') as f:
            f.write('[\n' + ',\n'.join('  ' + json.dumps(x, ensure_ascii=False) for x in units) + '\n]\n')
    print(json.dumps(dict(kind='unit', unit=hit['id'], new_units=added, type=utype, w=u['w'], h=u['h'], d=u['d'], note=note.strip())))
    return 0
