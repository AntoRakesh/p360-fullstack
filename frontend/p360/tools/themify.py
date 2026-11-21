"""Usage: python3 tools/themify.py projects   (idempotent; run after adding pages with raw hex colors)
Files containing the text 'themify: off' are skipped.

Convert hard-coded hex colors in projects/ into role-aware theme variables and
generate projects/shell/src/theme-palette.scss with light + dark values.

Roles: b = background/surface, f = foreground/text, l = line/border, a = auto (data/svg).
Accent family (violet hues) becomes oklch(... var(--ah)) so accent themes re-hue it.
"""
import math, os, re, sys

SRC = sys.argv[1]
OUT = os.path.join(SRC, 'shell', 'src', 'theme-palette.scss')

# ---------- color math ----------
def hex_rgb(h):
    h = h.lower()
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def rgb_oklch(r, g, b):
    r, g, b = lin(r), lin(g), lin(b)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (x ** (1 / 3) if x > 0 else 0 for x in (l, m, s))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    C = math.hypot(A, B)
    H = math.degrees(math.atan2(B, A)) % 360
    return L, C, H

ACCENT_H = 292.7  # hue of #7c3aed

def is_accent(L, C, H):
    return 268 <= H <= 318 and (C >= 0.07 or (L >= 0.93 and C >= 0.012))

def dark_lc(role, L, C):
    """Return dark-mode (L, C) for a role, or None to keep light value."""
    def surf(L, C):  # light surface -> dark elevated surface
        return min(0.40, 0.215 + (1 - L) * 1.55), min(C * 1.1, 0.075)
    def ink(L, C):   # dark ink -> light ink
        return max(L, 0.97 - 0.55 * L), C
    if role == 'b':
        if L >= 0.8: return surf(L, C)
        return None
    if role == 'f':
        if L < 0.75: return ink(L, C)
        return None
    if role == 'l':
        if L >= 0.8: return min(0.45, 0.30 + (1 - L) * 1.1), C * 0.8
        if L < 0.35: return ink(L, C)
        return None
    # auto
    if L >= 0.86: return surf(L, C)
    if L < 0.42: return ink(L, C)
    return None

def oklch(L, C, H, accent):
    if accent:
        d = H - ACCENT_H
        hue = f'calc(var(--ah) + {d:.1f})' if abs(d) >= 0.5 else 'var(--ah)'
        return f'oklch({L:.3f} calc({C:.3f} * var(--acm)) {hue})'
    return f'oklch({L:.3f} {C:.3f} {H:.1f})'

SPECIAL_DARK = {  # hand-tuned anchors
    ('b', 'ffffff'): 'var(--card)',
    ('a', 'ffffff'): 'var(--card)',
    ('b', 'f5f5fb'): 'var(--bg)',
}

# ---------- role detection ----------
CSS_PROP = re.compile(r'([a-z-]+)\s*:\s*[^;:{}"\'`]*$', re.I)
ATTR = re.compile(r'\b(fill|stroke|stop-color|color|flood-color)\s*=\s*"$')
KEY = re.compile(r'([A-Za-z_]\w*)\s*:\s*[\'"]$')

def role_for(before):
    m = ATTR.search(before)
    if m:
        return 'l' if m.group(1) == 'stroke' else 'a'
    if before.endswith(("'", '"', '`')):
        k = KEY.search(before)
        if k:
            key = k.group(1).lower()
            if re.search(r'bg|back|soft|tint|light|surface|fill', key): return 'b'
            if re.search(r'text|fg|ink|font', key): return 'f'
        return 'a'
    m = CSS_PROP.search(before[-160:])
    if m:
        p = m.group(1).lower()
        if p in ('color', 'caret-color', '-webkit-text-fill-color', 'text-decoration-color', 'accent-color'):
            return 'f'
        if p.startswith('background') or p in ('box-shadow',):
            return 'b'
        if p.startswith('border') or p.startswith('outline') or p in ('stroke', 'column-rule'):
            return 'l'
    return 'a'

HEX = re.compile(r'(?<![\w&])#([0-9a-fA-F]{6}|(?:fff|000|111|222|333|444|555|666|777|888|999|aaa|bbb|ccc|ddd|eee|FFF))\b(?![-\w])')
CONCAT = re.compile(r"""([\w$.\[\]()?!]+(?:\([^()]*\))?|\([^()]*\)) \+ '([0-9a-fA-F]{2})'""")

used = {}  # (role, hex6) -> True

def norm(h):
    h = h.lower()
    return ''.join(c * 2 for c in h) if len(h) == 3 else h

def convert(text, path):
    # alpha concat: X + '1f'  ->  'color-mix(in srgb, ' + X + ' 12%, transparent)'
    if path.endswith('.ts') and 'person-profile' not in path:
        def cc(m):
            pct = round(int(m.group(2), 16) / 255 * 100)
            return f"'color-mix(in srgb, ' + {m.group(1)} + ' {pct}%, transparent)'"
        text = CONCAT.sub(cc, text)
    out, last = [], 0
    for m in HEX.finditer(text):
        h = norm(m.group(1))
        before = text[max(0, m.start() - 200):m.start()]
        role = role_for(before)
        used[(role, h)] = True
        out.append(text[last:m.start()])
        out.append(f'var(--k{role}-{h})')
        last = m.end()
    out.append(text[last:])
    res = ''.join(out)
    for r, h in re.findall(r'var\(--k([bfla])-([0-9a-f]{6})\)', res):  # keep tokens from earlier runs
        used[(r, h)] = True
    return res

files = []
for root, _, names in os.walk(SRC):
    for n in names:
        if n.endswith(('.ts', '.scss', '.html', '.css')) and not n.endswith('.spec.ts') and n not in ('styles.scss', 'theme-palette.scss'):
            files.append(os.path.join(root, n))
files.append(os.path.join(SRC, 'shell', 'src', 'styles.scss'))

for p in files:
    t = open(p).read()
    if 'themify: off' in t:  # file opts out: fixed brand/illustration colors
        continue
    if p.endswith('styles.scss'):
        # keep the :root token block hand-written
        i = t.index('}') + 1
        head, body = t[:i], t[i:]
        new = head + convert(body, p)
    else:
        new = convert(t, p)
    if new != t:
        open(p, 'w').write(new)

# ---------- generate palette ----------
light, dark = [], []
for (role, h) in sorted(used, key=lambda k: (k[1], k[0])):
    L, C, H = rgb_oklch(*hex_rgb(h))
    acc = is_accent(L, C, H)
    name = f'--k{role}-{h}'
    light.append(f'  {name}: {oklch(L, C, H, True) if acc else "#" + h};')
    sp = SPECIAL_DARK.get((role, h))
    if sp:
        dark.append(f'  {name}: {sp};')
        continue
    d = dark_lc(role, L, C)
    if d is None:
        if acc:  # accent mid tones: slightly brighter on dark
            dark.append(f'  {name}: {oklch(min(0.82, L + 0.06), C, H, True)};')
        continue
    dark.append(f'  {name}: {oklch(d[0], d[1], H, acc)};')

with open(OUT, 'w') as f:
    f.write('// GENERATED by themify.py — role-aware color tokens (b=surface f=text l=line a=auto).\n')
    f.write('// Light values = original design; dark values derived in OKLCH. Accent hues follow --ah/--acm.\n')
    f.write(':root {\n' + '\n'.join(light) + '\n}\n\n')
    f.write(':root[data-mode="dark"] {\n' + '\n'.join(dark) + '\n}\n')
print(len(files), 'files;', len(used), 'tokens')
