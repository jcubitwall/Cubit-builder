"""Run one uploaded STEP import (used by .github/workflows/import-step.yml) and log it to data/imports.json.

Reads the job from the environment: JOB_ID, JOB_KIND (wall | pod | home), JOB_NAME, JOB_FILE, JOB_BY.
Whatever happens, an entry is written to data/imports.json (newest first) so the app can show it."""
import datetime, json, os, re, subprocess, sys

def main(step):
    here = os.path.dirname(os.path.abspath(__file__))
    kind, name = os.environ['JOB_KIND'], os.environ['JOB_NAME']
    if kind not in ('wall', 'pod', 'home'): sys.exit('kind must be wall, pod or home')
    entry = dict(id=os.environ['JOB_ID'], kind=kind, name=name, file=os.environ.get('JOB_FILE', ''), by=os.environ.get('JOB_BY', ''),
                 started=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'))
    cmd = [sys.executable, '-I', os.path.join(here, 'import_step.py'), step, '--kind', kind, '--name', name, '--repo', '.']
    if kind == 'home': cmd += ['--id', re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or entry['id']]
    p = subprocess.run(cmd, capture_output=True, text=True)
    lines = [l for l in p.stdout.strip().splitlines() if l.startswith('{')]
    if p.returncode == 0 and lines:
        entry.update(status='done', summary=json.loads(lines[-1]))
    else:
        tail = (p.stderr or p.stdout).strip().splitlines()[-6:]
        entry.update(status='failed', error='\n'.join(tail) or f'exit {p.returncode}')
    entry['finished'] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    log = 'data/imports.json'
    try: items = json.load(open(log))
    except FileNotFoundError: items = []
    items = [entry] + [i for i in items if i.get('id') != entry['id']]
    json.dump(items[:200], open(log, 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(entry, indent=1))
    return 0   # a failed scan is reported in the log, not as a failed workflow

if __name__ == '__main__': sys.exit(main(sys.argv[1]))
