#!/usr/bin/env python3
"""Cubit Builder — tools/sw/build.py : keeps the offline copy and the fast start up to date.

Run after adding or renaming a file (or before a release):  python3 tools/sw/build.py
  · sw-files.json  every file the app can load (pages, scripts, styles, data, images, fonts), for the service worker
                   (sw.js) to keep on the device, so the app opens and works with no signal
  · sw.js          its VERSION, a hash of all those files, so a changed site replaces the old offline copy
  · index.html     the block between <!-- modulepreload --> markers: every module main.js loads at start, fetched
                   all at once instead of one import after another (the slow part of a first load on LTE)
Forgetting to run it is harmless: the service worker still fetches fresh files first and keeps what it fetched."""
import hashlib, json, os, re, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(ROOT)
SKIP_DIRS = {'tools', 'functions', 'docs', '.git', 'node_modules', 'workers'}
EXT = {'.html', '.js', '.css', '.json', '.png', '.svg', '.jpg', '.jpeg', '.webp', '.woff', '.woff2', '.webmanifest', '.ttf', '.otf'}
files = []
for d, dirs, fs in os.walk('.'):
    dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.startswith('.')]
    for f in fs:
        p = os.path.join(d, f)[2:]
        if os.path.splitext(f)[1].lower() in EXT and p not in ('sw.js', 'sw-files.json', 'package.json', 'package-lock.json', 'migrate.html') and os.path.getsize(p) < 8_000_000:
            files.append(p.replace(os.sep, '/'))
files.sort()
h = hashlib.sha1()
for p in files:
    with open(p, 'rb') as fh: h.update(p.encode()); h.update(fh.read())
version = h.hexdigest()[:12]
# the libraries index.html loads from other sites (three.js, OrbitControls, jsPDF, fonts)
cdn = re.findall(r'<(?:script|link)[^>]+(?:src|href)="(https://(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com)[^"]+)"', open('index.html').read())
# the Cubit catalogue, now served from the database (functions/api/seed): kept on install like the app's own files
SEED = ['walls', 'models', 'layers', 'pods', 'decks', 'units', 'families', 'brands', 'stores', 'projects', 'submodels', 'sinks',
        'fixtures-lifepodgo-shower', 'fixtures-maax-biarritz', 'fixtures-maax-biarritz-85']
files = [f for f in files if not f.startswith('data/')] + [f'api/seed/{s}' for s in SEED]
with open('sw-files.json', 'w') as fh: json.dump({'version': version, 'files': ['./'] + files + cdn}, fh, indent=0)
sw = open('sw.js').read()
sw = re.sub(r"const VERSION='[^']*';", f"const VERSION='{version}';", sw, count=1)
open('sw.js', 'w').write(sw)
# the modules main.js loads at start (static imports, followed)
IMP = re.compile(r"""^\s*import\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}/[^'"]+\.js)['"]""", re.M)
seen, todo = [], ['js/main.js']
while todo:
    p = os.path.normpath(todo.pop(0)).replace(os.sep, '/')
    if p in seen or not os.path.exists(p): continue
    seen.append(p)
    for m in IMP.finditer(open(p).read()):
        todo.append(os.path.join(os.path.dirname(p), m.group(1)))
block = '\n'.join(f'<link rel="modulepreload" href="{p}">' for p in seen)
html = open('index.html').read()
html = re.sub(r'<!-- modulepreload -->.*?<!-- /modulepreload -->', lambda m: f'<!-- modulepreload -->\n{block}\n<!-- /modulepreload -->', html, flags=re.S)
open('index.html', 'w').write(html)
print(f'{len(files)} files · version {version} · {len(seen)} modules preloaded')
