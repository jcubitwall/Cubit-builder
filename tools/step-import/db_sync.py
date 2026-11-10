"""Cubit Builder - the STEP import's copy of the library (used by .github/workflows/import-step.yml).

The library lives in the databases now, not in the repo. The scan scripts still work on files, so:
  pull   fetch the library the scan adds to (walls, layers, pods, decks, projects, units, sinks) through the job's
         one-hour signed link (JOB_URL + &seed=1) and write it into a scratch data/ folder for the scan
  push   send back every set the scan changed, each sink's meshes (data/sinks/<id>.json → set sinks/<id>), and the
         import log line (imports.json, written by run_job.py), through the same link (POST); nothing is committed.
The scratch folder is thrown away with the runner."""
import json, os, sys, urllib.request

SETS = ['walls', 'layers', 'pods', 'decks', 'projects', 'units', 'sinks']

def call(url, body=None):
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), method='GET' if body is None else 'POST',
                                 headers={'content-type': 'application/json', 'user-agent': 'cubit-step-import'})
    with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())

def pull(url, root):
    os.makedirs(os.path.join(root, 'data', 'sinks'), exist_ok=True)
    sets = call(url + '&seed=1')['sets']
    for s in SETS:
        v = sets.get(s, [] if s != 'sinks' else [])
        json.dump(v, open(os.path.join(root, 'data', f'{s}.json'), 'w'), ensure_ascii=False)
    json.dump(sets, open(os.path.join(root, '.pulled.json'), 'w'), ensure_ascii=False)
    print('pulled', {s: len(sets.get(s) or []) for s in SETS})

def push(url, root):
    before = json.load(open(os.path.join(root, '.pulled.json')))
    out = {}
    for s in SETS:
        p = os.path.join(root, 'data', f'{s}.json')
        if not os.path.exists(p): continue
        v = json.load(open(p))
        if s == 'sinks':
            for e in v:   # each sink's meshes become their own set; the list points the app at it
                f = e.get('file', '')
                if f.startswith('data/sinks/'):
                    sid = e['id']; out[f'sinks/{sid}'] = json.load(open(os.path.join(root, f))); e['file'] = f'api/seed/sinks/{sid}'
        if v != before.get(s, []): out[s] = v
    log = os.path.join(root, 'data', 'imports.json')
    entry = (json.load(open(log)) or [None])[0] if os.path.exists(log) else None
    r = call(url, {'sets': out, 'entry': entry})
    print('pushed', [w['set'] for w in r.get('written', [])], 'log:', (entry or {}).get('status'))

if __name__ == '__main__':
    op, url = sys.argv[1], os.environ['JOB_URL']
    root = sys.argv[2] if len(sys.argv) > 2 else '.'
    {'pull': pull, 'push': push}[op](url, root)
