import json,re,math
exec(open('walls.py').read().split('result={}')[0])   # reuse loaders, ray(), PODS, cand, units
r=json.load(open('wallgrid.json'))
ZB,ZT=10.56,106.56
def cands_for(pn,side):
    x0,y0,x1,y1=PODS[pn]
    if side in 'SN':
        ua,ub=x0,x1; line=y0 if side=='S' else y1; a,b=sorted([line,line+(DEPTH if side=='S' else -DEPTH)])
        return [c for c in cand if c['b'][4]>=a-0.2 and c['b'][1]<=b+0.2 and c['b'][3]>=ua and c['b'][0]<=ub]
    ua,ub=y0,y1; line=x0 if side=='W' else x1; a,b=sorted([line,line+(DEPTH if side=='W' else -DEPTH)])
    return [c for c in cand if c['b'][3]>=a-0.2 and c['b'][0]<=b+0.2 and c['b'][4]>=ua and c['b'][1]<=ub]
def solid(pn,side,u,z):
    return ray(side,PODS[pn],u,z) is not None
def bis(f,lo,hi):  # f(lo) != f(hi); find boundary
    flo=f(lo)
    for _ in range(14):
        m=(lo+hi)/2
        if f(m)==flo: lo=m
        else: hi=m
    return (lo+hi)/2
out={}
for k,w in r.items():
    pn,side=w['pod'],w['side']; ua=w['ua']
    global wallcands
    import builtins
    globals()['wallcands']=cands_for(pn,side)
    g=w['grid']; zs=w['zs']; C=len(g); R=len(zs)
    seen=[[False]*R for _ in range(C)]; ops=[]
    for ci in range(C):
        for ri in range(R):
            if g[ci][ri] or seen[ci][ri]: continue
            st=[(ci,ri)]; cells=[]
            while st:
                a,b=st.pop()
                if a<0 or b<0 or a>=C or b>=R or seen[a][b] or g[a][b]: continue
                seen[a][b]=True; cells.append((a,b)); st+= [(a+1,b),(a-1,b),(a,b+1),(a,b-1)]
            # robust bounds: medians of per-column / per-row extents, so hairline slivers don't stretch the opening
            import statistics as stt, collections as cl
            bycol=cl.defaultdict(list); byrow=cl.defaultdict(list)
            for a,b in cells: bycol[a].append(b); byrow[b].append(a)
            wide=[a for a in bycol if len(bycol[a])>=2] or list(bycol)
            tall=[b for b in byrow if len(byrow[b])>=3] or list(byrow)
            c0=min(min(byrow[b]) for b in tall); c1=max(max(byrow[b]) for b in tall)
            r0=int(stt.median([min(bycol[a]) for a in wide])); r1=int(stt.median([max(bycol[a]) for a in wide]))
            ops.append((c0,c1,r0,r1,len(cells)))
    res=[]
    for c0,c1,r0,r1,n in ops:
        wcols=c1-c0+1; hrows=(r1-r0+1)*2
        if wcols<3 or hrows<4: continue
        tiny = wcols<=14 and hrows<=8
        if c0==0 and wcols<=8 and False: pass
        um=ua+(c0+c1+1)/2; zm=(zs[r0]+zs[r1])/2
        # refine horizontal edges at mid height, vertical edges at mid width
        left = ua if c0==0 else bis(lambda u: solid(pn,side,u,zm), ua+c0-1+0.5, ua+c0+0.5)
        right= ua+C if c1==C-1 else bis(lambda u: solid(pn,side,u,zm), ua+c1+0.5, ua+c1+1+0.5)
        bottom= ZB if r0==0 else bis(lambda z: solid(pn,side,um,z), zs[r0]-2, zs[r0])
        top   = ZT if r1==R-1 else bis(lambda z: solid(pn,side,um,z), zs[r1], zs[r1]+2)
        # which unit sits in it
        kind='opening'; unit=''
        for un in units:
            b=un['b']
            if side in 'SN': ok = b[0]<right-1 and b[3]>left+1 and abs((b[1]+b[4])/2-(PODS[pn][1] if side=='S' else PODS[pn][3]))<10
            else: ok = b[1]<right-1 and b[4]>left+1 and abs((b[0]+b[3])/2-(PODS[pn][0] if side=='W' else PODS[pn][2]))<10
            if ok and b[2]<top and b[5]>bottom and not un['name'].startswith('Handle') and '**3' not in un['name']:
                unit=un['name']; n=un['name']
                kind = 'door' if n.startswith('Door') else 'patio' if n.startswith('Panorama') else 'window'
        if tiny and kind=='opening': kind='vent'
        if kind=='opening' and bottom-ZB<0.5 and right-left<50 and top-ZB<90: kind='door'; unit='interior door rough opening'
        res.append(dict(u0=round(left-ua,4),u1=round(right-ua,4),z0=round(bottom-ZB,4),z1=round(top-ZB,4),kind=kind,unit=unit))
    # thickness per column (mode of exit depth)
    out[k]=dict(pod=pn,side=side,ua=ua,ub=w['ub'],openings=res,depth=w['depths'])
    print(k, [(round(o['u0'],3),round(o['u1'],3),round(o['z0'],3),round(o['z1'],3),o['kind']) for o in res])
json.dump(out,open('walls_extracted.json','w'))
