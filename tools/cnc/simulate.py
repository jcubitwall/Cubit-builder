"""Cut simulator for .tap files: sweeps a flat end mill along every move and records the lowest Z it reaches
on a fine grid (a height map of what the machine removes). compare(a, b) says how different two programs'
cuts are, so G-code the app writes can be checked against the shop's own files before it goes near the machine.
usage: python3 simulate.py ours.tap theirs.tap [tool_dia]"""
import re, sys, math
import numpy as np
RES = 1/32
X0, Y0, NX, NY = -4, -4, int(56/RES), int(104/RES)

def moves(text):
    pos = {'X':0.0,'Y':0.0,'Z':0.0}; out=[]
    for raw in text.splitlines():
        s = raw.strip().upper()
        m = re.match(r'G0?([0-3])\b', s)
        if not m: continue
        g = int(m.group(1)); w = dict((k, float(v)) for k, v in re.findall(r'([XYZIJ])(-?\d+\.?\d*)', s[m.end():]))
        new = {k: w.get(k, pos[k]) for k in 'XYZ'}
        if g in (2, 3):
            cx, cy = pos['X'] + w.get('I', 0), pos['Y'] + w.get('J', 0)
            a0 = math.atan2(pos['Y'] - cy, pos['X'] - cx); a1 = math.atan2(new['Y'] - cy, new['X'] - cx)
            rad = math.hypot(pos['X'] - cx, pos['Y'] - cy)
            if g == 2:
                while a1 >= a0 - 1e-9: a1 -= 2 * math.pi
            else:
                while a1 <= a0 + 1e-9: a1 += 2 * math.pi
            n = max(4, int(abs(a1 - a0) * rad / 0.02))
            pts = [(cx + rad * math.cos(a0 + (a1 - a0) * t / n), cy + rad * math.sin(a0 + (a1 - a0) * t / n),
                    pos['Z'] + (new['Z'] - pos['Z']) * t / n) for t in range(1, n + 1)]
        else:
            d = math.dist((pos['X'], pos['Y']), (new['X'], new['Y'])); n = max(1, int(d / 0.02))
            pts = [(pos['X'] + (new['X'] - pos['X']) * t / n, pos['Y'] + (new['Y'] - pos['Y']) * t / n,
                    pos['Z'] + (new['Z'] - pos['Z']) * t / n) for t in range(1, n + 1)]
        out.append((g, [(pos['X'], pos['Y'], pos['Z'])] + pts)); pos = new
    return out

def heightmap(text, dia=0.75, top=10.0):
    hm = np.full((NY, NX), top, dtype=np.float32); r = dia / 2; k = int(math.ceil(r / RES))
    yy, xx = np.mgrid[-k:k + 1, -k:k + 1]; disc = (xx * xx + yy * yy) * RES * RES <= r * r + 1e-9
    for g, pts in moves(text):
        for x, y, z in pts:
            if z >= top: continue
            i, j = int(round((y - Y0) / RES)), int(round((x - X0) / RES))
            a, b = hm[i - k:i + k + 1, j - k:j + k + 1], disc
            np.minimum(a, np.where(b, z, top), out=a)
    return hm

def compare(a, b, thick, dia=0.75):
    ha, hb = np.minimum(heightmap(a, dia), thick), np.minimum(heightmap(b, dia), thick)
    d = np.abs(ha - hb); bad = d > 0.02
    return {'cells_cut_a': int((ha < thick).sum()), 'cells_cut_b': int((hb < thick).sum()),
            'cells_differ': int(bad.sum()), 'max_diff_in': float(d.max()),
            'area_differ_sqin': float(bad.sum() * RES * RES)}

if __name__ == '__main__':
    a, b = open(sys.argv[1]).read(), open(sys.argv[2]).read()
    t = float(re.search(r'G0 Z(\d+\.\d+)', a).group(1)) - 1
    print(compare(a, b, t))
