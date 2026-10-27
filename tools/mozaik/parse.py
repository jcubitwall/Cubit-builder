import re, glob, json, math, sys, os
import os
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),"test-kitchen")+"/"
T=0.63  # 16mm = 0.6299
def parse(fn):
    tool=None; name=None; x=y=z=None; mode='G0'; feed=None
    ops=[]; cur=None
    def flush():
        nonlocal cur
        if cur and len(cur['pts'])>0: ops.append(cur)
        cur=None
    for raw in open(fn):
        line=raw.strip()
        if not line: continue
        if line.startswith('('):
            if tool is not None and name is None: name=line.strip('()')
            continue
        m=re.match(r'^[Tt](\d+)',line)
        if m: flush(); tool=int(m.group(1)); name=None; continue
        words=dict((k.upper(),float(v)) for k,v in re.findall(r'([A-Za-z])(-?\d*\.?\d+)',line))
        g=None
        for gg in re.findall(r'[Gg](\d+)',line): g=int(gg)
        if g in (0,1,2,3): mode='G%d'%g
        nx=words.get('X',x); ny=words.get('Y',y); nz=words.get('Z',z)
        if 'G' in words and words['G']==4: continue
        if mode=='G0':
            # retract ends an op
            if nz is not None and nz>=0.99: flush()
            x,y,z=nx,ny,nz; continue
        if nz is not None and z is not None and nz<0.99 and (cur is None):
            cur={'tool':tool,'name':name,'start':(x,y),'pts':[(x,y,z)],'arcs':0}
        if cur is not None:
            if mode in('G2','G3'): cur['arcs']+=1
            cur['pts'].append((nx,ny,nz))
        x,y,z=nx,ny,nz
    flush()
    return ops
def classify(o):
    P=o['pts']; xs=[p[0] for p in P]; ys=[p[1] for p in P]; zs=[p[2] for p in P]
    zmin=min(zs); dx=max(xs)-min(xs); dy=max(ys)-min(ys)
    if dx<1e-3 and dy<1e-3: kind='drill'
    elif o['tool']==1 and zmin<0.05: kind='profile'
    else: kind='route'
    return dict(kind=kind, tool=o['tool'], name=o['name'], zmin=round(zmin,4), depth=round(T-zmin,4), x0=min(xs),x1=max(xs),y0=min(ys),y1=max(ys), arcs=o['arcs'], n=len(P))
if __name__=='__main__':
    for fn in sorted(glob.glob(D+'*.TAP')):
        ops=[classify(o) for o in parse(fn)]
        from collections import Counter
        c=Counter((o['kind'],o['name'],o['zmin']) for o in ops)
        print(os.path.basename(fn))
        for k,v in sorted(c.items(), key=lambda kv:(str(kv[0]))): print('   ',k,v)
