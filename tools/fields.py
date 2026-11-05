#!/usr/bin/env python3
"""Draw the page doodles as ambient "fields".

Each file in docs/assets/images/doodles is a small abstract composition in the
spirit of ambient record artwork: soft colour washes, film grain, one quiet
mark. Nothing is boxed. A radial feather dissolves every edge into the page,
so a field reads as a patch of weather beside the text rather than an object
(a sleeve, a disc) sitting on it.

Six families map to topics by file name. The same name always draws the same
picture (the file name seeds the random choices), so re-running this is safe.

    python3 tools/fields.py            # rewrite every doodle
    python3 tools/fields.py dice key-1 # just these
"""
import hashlib
import math
import random
import re
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / 'docs' / 'assets' / 'images' / 'doodles'
S = 160  # canvas

# The site palette (css/style.css :root) plus a few quiet relatives of it.
INK = '#2E2D2A'
PAPER = '#F2EFE8'
WASH = '#BCCDD3'
SAGE = '#8DA393'
LIMESTONE = '#CFC9BD'
GOLD = '#C7A04C'
RUST = '#8C4F2A'
ACCENT = '#A23A2A'
PALE = '#DCE3E2'
BLUSH = '#E2D3C6'
MIST = '#C9D3C8'
SLATE = '#9FB6BF'

FAMILIES = {
    # time, place, history: a horizon with weather above and ground below
    'horizon': ['hourglass', 'calendar', 'compass', 'signpost', 'city-hall', 'map-pin', 'open-book',
                'ledger-book', 'chain-of-blocks', 'block-', 'brick-wall', 'pickaxe', 'mining', 'timeline',
                'clock', 'history', 'road', 'mountain', 'sunrise', 'halving'],
    # keys, secrets, locks: tall quiet bands
    'band': ['key', 'padlock', 'seed', 'fingerprint', 'shield', 'vault', 'signing-pen', 'address-tag',
             'passphrase', 'crossed-keys', 'keyring', 'safe', 'backup', 'steel', 'metal'],
    # coins, value, energy: a warm glow
    'glow': ['coin', 'cap-21m', 'hand-holding', 'fee-gauge', 'lightning', 'energy', 'flame', 'speech-bubble',
             'boost', 'rocket', 'sat', 'banknote', 'piggy', 'money', 'battery', 'power', 'burning', 'gold'],
    # devices, screens, tools: layered translucent veils
    'veil': ['wallet', 'keypad', 'sbc', 'cpu', 'microsd', 'laptop', 'airgap', 'qr', 'chip', 'router',
             'magnifying', 'warning', 'eye', 'tor-onion', 'refresh', 'transaction', 'inbox', 'confirmation',
             'utxo', 'merkle', 'hash', 'computer', 'screen', 'phone', 'desktop', 'camera', 'usb', 'cable',
             'terminal', 'code', 'download', 'file', 'folder', 'document', 'paper', 'envelope'],
    # nodes, network, signal: a field of dots
    'halftone': ['node', 'network', 'mesh', 'broadcast', 'gossip', 'podcast', 'microphone', 'antenna',
                 'water-drop', 'wifi', 'signal', 'radio', 'wave', 'globe', 'world', 'map'],
    # people, meeting, community: drifting soft shapes
    'drift': ['people', 'handshake', 'person', 'group', 'meetup', 'community', 'chat', 'coffee', 'heart',
              'hand', 'friends', 'dice'],
}
DEFAULT = 'drift'


def family_for(name):
    for fam, keys in FAMILIES.items():
        if any(k in name for k in keys):
            return fam
    return DEFAULT


def rgb(hexcol):
    return tuple(int(hexcol[i:i + 2], 16) / 255 for i in (1, 3, 5))


def grain_matrix(hexcol, alpha):
    r, g, b = rgb(hexcol)
    return f'0 0 0 0 {r:.2f}  0 0 0 0 {g:.2f}  0 0 0 0 {b:.2f}  0 0 0 {alpha} 0'


def cloud(rng, wide):
    """An uneven, soft-edged patch: a few overlapping ellipses, blurred, with
    the edge roughened by noise. Never a circle, never a square."""
    cx, cy = S / 2 + rng.uniform(-6, 6), S / 2 + rng.uniform(-6, 6)
    parts = []
    main_rx, main_ry = (64, 40) if wide else (rng.uniform(46, 56), rng.uniform(40, 52))
    parts.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{main_rx:.1f}" ry="{main_ry:.1f}" '
                 f'transform="rotate({rng.uniform(-28, 28):.1f} {cx:.1f} {cy:.1f})" fill="#fff"/>')
    for i in range(rng.choice([2, 3])):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(22, 40)
        ex, ey = cx + math.cos(a) * d, cy + math.sin(a) * d * (0.7 if wide else 1)
        parts.append(f'<ellipse cx="{ex:.1f}" cy="{ey:.1f}" rx="{rng.uniform(22, 36):.1f}" ry="{rng.uniform(16, 28):.1f}" '
                     f'transform="rotate({rng.uniform(-40, 40):.1f} {ex:.1f} {ey:.1f})" fill="#fff" opacity="0.9"/>')
    return ''.join(parts)


def defs(seed, rng, wide=False):
    return (
        '<defs>'
        '<filter id="soft" x="-30%" y="-30%" width="160%" height="160%">'
        '<feGaussianBlur stdDeviation="7" result="blur"/>'
        f'<feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="{seed}" result="n"/>'
        '<feDisplacementMap in="blur" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G"/>'
        '</filter>'
        f'<mask id="m"><g filter="url(#soft)">{cloud(rng, wide)}</g></mask>'
        '<filter id="b1" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14"/></filter>'
        '<filter id="b2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>'
        '<filter id="b3" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.5"/></filter>'
        '<filter id="g" x="0" y="0" width="100%" height="100%">'
        f'<feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="3" seed="{seed}" stitchTiles="stitch"/>'
        f'<feColorMatrix type="matrix" values="{grain_matrix(INK, 0.5)}"/></filter>'
        '<pattern id="h" width="4.6" height="4.6" patternUnits="userSpaceOnUse">'
        f'<circle cx="2.3" cy="2.3" r="0.95" fill="{INK}"/></pattern>'
        '</defs>'
    )


def rect(x, y, w, h, fill, **kw):
    attrs = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}" {attrs}/>'


def circle(cx, cy, r, fill, **kw):
    attrs = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" {attrs}/>'


def line(x1, y1, x2, y2, stroke, width, opacity):
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" '
            f'stroke-width="{width}" opacity="{opacity}" stroke-linecap="round"/>')


def hairline(rng):
    """The one red mark: a short, thin horizontal tick somewhere quiet."""
    x = rng.uniform(34, 98)
    y = rng.uniform(40, 120)
    w = rng.uniform(12, 24)
    return rect(x, y, w, 0.9, ACCENT, opacity=0.9)


def horizon(rng):
    h = rng.uniform(84, 104)
    sky = rng.choice([WASH, PALE, SLATE, MIST])
    ground = rng.choice([SAGE, LIMESTONE, MIST, SAGE])
    sun = rng.choice([GOLD, GOLD, RUST])
    sx = rng.uniform(48, 112)
    sy = h - rng.uniform(16, 34)
    return [
        rect(-30, -30, S + 60, h + 30, sky, opacity=1, filter='url(#b2)'),
        rect(-30, h, S + 60, S, ground, opacity=1, filter='url(#b3)'),
        circle(sx, sy, rng.uniform(7, 10), sun, opacity=0.95, filter='url(#b3)'),
        line(10, h, S - 10, h, INK, 0.55, 0.45),
    ], True


def band(rng):
    base = rng.choice([MIST, WASH, LIMESTONE, PALE])
    marks = [rect(-30, -30, S + 60, S + 60, base, opacity=1, filter='url(#b1)')]
    x = rng.uniform(30, 52)
    for i in range(rng.choice([2, 3])):
        w = rng.uniform(10, 26)
        fill, op = rng.choice([(INK, 0.6), (SAGE, 0.9), (SLATE, 0.95), (INK, 0.45), (RUST, 0.55)])
        blur = rng.choice(['url(#b2)', 'url(#b3)'])
        marks.append(rect(x, -30, w, S + 60, fill, opacity=op, filter=blur))
        x += w + rng.uniform(8, 22)
    marks.append(hairline(rng))
    return marks, False


def glow(rng):
    base = rng.choice([WASH, SLATE, BLUSH, MIST])
    warm = rng.choice([GOLD, GOLD, RUST, GOLD])
    cx, cy = rng.uniform(58, 102), rng.uniform(58, 102)
    r = rng.uniform(24, 32)
    marks = [
        rect(-30, -30, S + 60, S + 60, base, opacity=1, filter='url(#b1)'),
        circle(cx, cy, r, warm, opacity=0.95, filter='url(#b2)'),
        circle(cx, cy, r * 0.55, warm, opacity=0.6, filter='url(#b1)'),
        circle(rng.uniform(30, 130), rng.uniform(30, 130), 1.7, INK, opacity=0.75),
    ]
    return marks, False


def veil(rng):
    base = rng.choice([SLATE, WASH, SAGE, MIST])
    marks = [rect(-30, -30, S + 60, S + 60, base, opacity=1, filter='url(#b1)')]
    for i in range(2):
        w, h = rng.uniform(46, 76), rng.uniform(52, 86)
        x, y = rng.uniform(28, 86), rng.uniform(24, 72)
        a = rng.uniform(-10, 10)
        fill, op = rng.choice([(PALE, 0.9), (LIMESTONE, 0.9), (BLUSH, 0.85), (PAPER, 0.9), (INK, 0.35)])
        # blurred enough that the panes read as light, not as cards
        marks.append(
            f'<g transform="rotate({a:.1f} {x + w / 2:.1f} {y + h / 2:.1f})">'
            + rect(x, y, w, h, fill, opacity=op, filter='url(#b2)') + '</g>'
        )
    y = rng.uniform(44, 116)
    marks.append(line(rng.uniform(22, 40), y, rng.uniform(100, 136), y + rng.uniform(-6, 6), INK, 0.55, 0.5))
    return marks, False


def halftone(rng):
    base = rng.choice([SAGE, MIST, WASH, SLATE])
    cx, cy = rng.uniform(64, 96), rng.uniform(64, 96)
    r = rng.uniform(40, 54)
    marks = [
        rect(-30, -30, S + 60, S + 60, base, opacity=1, filter='url(#b1)'),
        # the dots share the cloud mask, so they thin out before any edge forms
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="url(#h)" opacity="0.55" mask="url(#m)"/>',
        circle(rng.uniform(34, 126), rng.uniform(34, 126), rng.uniform(4, 6), GOLD, opacity=0.95, filter='url(#b3)'),
    ]
    return marks, False


def drift(rng):
    base = rng.choice([BLUSH, MIST, LIMESTONE, WASH])
    marks = [rect(-30, -30, S + 60, S + 60, base, opacity=1, filter='url(#b1)')]
    for i in range(rng.choice([4, 5, 6])):
        fill, op = rng.choice([(SAGE, 0.9), (WASH, 1), (SLATE, 0.95), (RUST, 0.5), (GOLD, 0.6), (INK, 0.3)])
        marks.append(circle(rng.uniform(34, 126), rng.uniform(34, 126), rng.uniform(9, 19), fill,
                            opacity=op, filter=rng.choice(['url(#b2)', 'url(#b2)', 'url(#b1)'])))
    marks.append(hairline(rng))
    return marks, False


DRAW = {'horizon': horizon, 'band': band, 'glow': glow, 'veil': veil, 'halftone': halftone, 'drift': drift}


def draw(name):
    seed = int(hashlib.sha256(name.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)
    fam = family_for(name)
    marks, wide = DRAW[fam](rng)
    body = ''.join(marks)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">'
        + defs(seed % 997, rng, wide)
        + '<g mask="url(#m)">' + body
        + f'<rect width="{S}" height="{S}" filter="url(#g)" opacity="0.32"/>'
        + '</g></svg>\n'
    ), fam


def main(argv):
    names = [re.sub(r'\.svg$', '', a) for a in argv] or sorted(p.stem for p in DIR.glob('*.svg'))
    counts = {}
    for name in names:
        svg, fam = draw(name)
        (DIR / f'{name}.svg').write_text(svg)
        counts[fam] = counts.get(fam, 0) + 1
    print(f'wrote {len(names)} fields:', ', '.join(f'{k} {v}' for k, v in sorted(counts.items())))


if __name__ == '__main__':
    main(sys.argv[1:])
