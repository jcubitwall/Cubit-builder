import sys, glob, os, json, csv
sys.path.insert(0, os.path.dirname(__file__))
from parse import parse, classify, D
R=0.1875
rows=[l.strip().split(',') for l in open(D+'PET Matt White 16mm.csv') if l.strip()]
CSV=[]
for r in rows:
    w,l=float(r[1]),float(r[2]); CSV.append(dict(w=w/25.4,l=l/25.4,name=r[3].strip(),cab=r[4],edge=r[5].split('#')[0],desc=r[7] if len(r)>7 else ''))
def match(w,l):
    best=None
    for c in CSV:
        for a,b,rot in ((c['w'],c['l'],False),(c['l'],c['w'],True)):
            e=abs(a-w)+abs(b-l)
            if best is None or e<best[0]: best=(e,c,rot)
    return best
out={}
for fn in sorted(glob.glob(D+'*.TAP')):
    sheet=os.path.basename(fn).split('16mm ')[1].replace('.TAP','')
    ops=[classify(o) for o in parse(fn)]
    parts=[o for o in ops if o['kind']=='profile' and o['zmin']<0 and not (o['x1']-o['x0']>47 and o['y1']-o['y0']>95)]
    res=[]
    for p in parts:
        x0,x1,y0,y1=p['x0']+R,p['x1']-R,p['y0']+R,p['y1']-R
        w,l=x1-x0,y1-y0
        e,c,rot=match(w,l)
        feats=[o for o in ops if o is not p and o['kind']!='profile' and o['x0']>=x0-0.3 and o['x1']<=x1+0.3 and o['y0']>=y0-0.3 and o['y1']<=y1+0.3]
        res.append(dict(sheet=sheet, w=round(w,4), l=round(l,4), x0=x0,y0=y0, cab=c['cab'], name=c['name'], err=round(e,3), rot=rot, notch=p['n']>12,
          feats=[dict(k=f['kind'],t=f['name'],depth=f['depth'],x0=round(f['x0']-x0,4),x1=round(f['x1']-x0,4),y0=round(f['y0']-y0,4),y1=round(f['y1']-y0,4)) for f in feats]))
    out[sheet]=res
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'parts.json'),'w'), indent=1)
for s,res in out.items():
    print(s)
    for r in res: print('  %-6s %-18s %7.3f x %7.3f err%.3f rot=%s notch=%s feats=%d'%(r['cab'],r['name'],r['w'],r['l'],r['err'],r['rot'],r['notch'],len(r['feats'])))
