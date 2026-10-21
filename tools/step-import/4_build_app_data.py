import json
ex=json.load(open('walls_extracted.json'))
PODS=[('A','L24',0,0,24),('B','P16',8,8,16),('C','L24',24,0,24),('D','L24',24,8,24),('E','L24',24,16,24)]
STEP2APP={'S':'W','N':'E','W':'S','E':'N'}
APP2STEP={v:k for k,v in STEP2APP.items()}
pods=[dict(n=n,t=t,x=x,z=z,len=L,x1=x+L,z1=z+8,i=i) for i,(n,t,x,z,L) in enumerate(PODS)]
def sides(p):
    return [dict(k='S',fixed=p['z'],a=p['x'],b=p['x1'],axis='x',n=(0,-1)),dict(k='N',fixed=p['z1'],a=p['x'],b=p['x1'],axis='x',n=(0,1)),
            dict(k='W',fixed=p['x'],a=p['z'],b=p['z1'],axis='z',n=(-1,0)),dict(k='E',fixed=p['x1'],a=p['z'],b=p['z1'],axis='z',n=(1,0))]
def cover(s,q):
    if s['k']=='S' and abs(q['z1']-s['fixed'])<1e-6: return (max(q['x'],s['a']),min(q['x1'],s['b']))
    if s['k']=='N' and abs(q['z']-s['fixed'])<1e-6: return (max(q['x'],s['a']),min(q['x1'],s['b']))
    if s['k']=='W' and abs(q['x1']-s['fixed'])<1e-6: return (max(q['z'],s['a']),min(q['z1'],s['b']))
    if s['k']=='E' and abs(q['x']-s['fixed'])<1e-6: return (max(q['z'],s['a']),min(q['z1'],s['b']))
    return None
def jsnum(v): return str(int(v)) if float(v).is_integer() else repr(v)
def p0_at_min(k): return k in ('N','W')
walls=[]; picks={}
for p in pods:
    for s in sides(p):
        covs=[(c,q) for q in pods if q is not p for c in [cover(s,q)] if c and c[1]-c[0]>=4-1e-6]
        segs=[(s['a'],s['b'])]
        for (c,d),q in covs:
            out=[]
            for a,b in segs:
                if d<=a or c>=b: out.append((a,b)); continue
                if c>a: out.append((a,c))
                if d<b: out.append((d,b))
            segs=out
        segs=[(a,b,'ext',None) for a,b in segs if b-a>=4-1e-6]+[(c,d,'int',q) for (c,d),q in covs]
        st=ex[p['n']+APP2STEP[s['k']]]
        for a,b,ty,q in segs:
            sa=(a-s['a'])*12; sb=(b-s['a'])*12; L=sb-sa
            ops=[]
            for o in st['openings']:
                u0=max(o['u0'],sa); u1=min(o['u1'],sb)
                if u1-u0<1: continue
                x = (u0-sa) if p0_at_min(s['k']) else (sb-u1)
                ops.append(dict(kind=o['kind'],x=round(x,4),y=round(o['z0'],4),w=round(u1-u0,4),h=round(o['z1']-o['z0'],4)))
            ops.sort(key=lambda o:o['x'])
            sid=f"{p['i']}{s['k']}{jsnum(a)}"+('i' if ty=='int' else '')
            wid=f"EXL-{p['n']}{s['k']}{'-'+str(int(a)) if len(segs)>1 else ''}{'i' if ty=='int' else ''}"
            name=f"Expanse (Leet) · pod {p['n']} {('to pod '+q['n']) if ty=='int' else 'exterior'}"
            walls.append(dict(id=wid,name=name,len=round(L/12),type=ty,t=6.5 if ty=='ext' else 4.5,openings=ops,inside=[],outside=[],source='Expanse STEP scan 2026-10-20'))
            picks[sid]=wid
            print(sid, wid, ty, round(L/12), [(o['kind'],o['x'],o['w'],o['y'],o['h']) for o in ops])
json.dump(dict(walls=walls,picks=picks),open('expanse_app.json','w'),indent=1)
