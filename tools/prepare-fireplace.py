"""Align the supplied fireplace photo and trace the supplied orange cut lines."""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
OUT = DIST / 'assets' / 'fireplace'
SOURCE = ROOT / 'Камин'
OUT.mkdir(parents=True, exist_ok=True)
photo = Image.open(SOURCE / 'фото камина.png').convert('RGBA')
grid = Image.open(SOURCE / 'Паззл_камин_силуэты.png').convert('RGB')
width, height = grid.size
rgb = np.asarray(grid).astype(np.int32)

# One interior point of each named cut. The three decorative pieces are omitted.
seeds = {
    'sirin': (668, 139), 'wolf': (440, 120), 'raspberry_1': (164, 124),
    'sabre': (829, 155), 'raspberry_2': (939, 127), 'shield': (310, 144),
    'spear': (622, 240), 'sun': (251, 238), 'gusli': (370, 245),
    'ring': (866, 244), 'chainmail': (688, 340), 'horse': (910, 331),
    'gorynych': (443, 363), 'cup': (171, 344), 'mace': (774, 473),
    'rein': (824, 405), 'snake': (629, 447), 'belt': (306, 432),
    'sword': (915, 454), 'bear': (450, 450), 'plough': (181, 450),
    'boots': (942, 569), 'nightingale': (350, 592), 'oak': (810, 593),
    'raven': (188, 617), 'helmet': (758, 203),
}


def align_photo():
    """Fit the black outer cut line to the boundary of the supplied photo."""
    outline = np.max(rgb, axis=2) < 96
    outline[:3] = outline[-3:] = False
    outline[:, :3] = outline[:, -3:] = False
    y, x = np.where(outline)
    x, y = x[::2] - width / 2, y[::2] - height / 2
    alpha = np.asarray(photo.getchannel('A')) >= 128
    edge = alpha & ~np.asarray(Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)))
    distances = np.where(edge, 0., 32.)
    for _ in range(32):
        distances = np.minimum.reduce([distances] + [
            np.roll(distances, (dy, dx), (0, 1)) + np.hypot(dx, dy)
            for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
        ])

    def score(params):
        a, b, c, d, e, f = params
        xs = np.rint(a * x + b * y + c).astype(int).clip(0, photo.width - 1)
        ys = np.rint(d * x + e * y + f).astype(int).clip(0, photo.height - 1)
        return distances[ys, xs].mean()

    fit = [.99, 0., 545., 0., .99, 398.]
    best = score(fit)
    for factor in (1, .5, .25, .125):
        steps = np.array([.008, .008, 4., .008, .008, 4.]) * factor
        while True:
            changed = False
            for i, step in enumerate(steps):
                for sign in (-1, 1):
                    trial = fit.copy()
                    trial[i] += step * sign
                    value = score(trial)
                    if value < best:
                        fit, best, changed = trial, value, True
            if not changed:
                break
    a, b, c, d, e, f = fit
    print(f'Outer edge average alignment error: {best:.2f} px')
    return photo.transform(grid.size, Image.Transform.AFFINE,
                           (a, b, c - a * width / 2 - b * height / 2,
                            d, e, f - d * width / 2 - e * height / 2),
                           Image.Resampling.BICUBIC)


def simplify(points, tolerance=1.15):
    """Keep the contour geometry while removing raster stair steps."""
    start, end = np.asarray(points[0]), np.asarray(points[-1])
    line = end - start
    relative = np.asarray(points) - start
    length = np.hypot(*line)
    distances = (np.abs(relative[:, 0] * line[1] - relative[:, 1] * line[0]) / length
                 if length else np.hypot(relative[:, 0], relative[:, 1]))
    index = int(distances.argmax())
    if distances[index] <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def trace(region):
    """Follow directed pixel edges around the enclosed original contour."""
    yy, xx = np.where(region)
    edges = {}
    for x, y in zip(map(int, xx), map(int, yy)):
        if not region[y - 1, x]:
            edges.setdefault((x, y), []).append((x + 1, y))
        if not region[y, x + 1]:
            edges.setdefault((x + 1, y), []).append((x + 1, y + 1))
        if not region[y + 1, x]:
            edges.setdefault((x + 1, y + 1), []).append((x, y + 1))
        if not region[y, x - 1]:
            edges.setdefault((x, y + 1), []).append((x, y))
    loops = []
    while edges:
        start = next(iter(edges))
        points, point = [], start
        while True:
            points.append(point)
            following = edges[point].pop()
            if not edges[point]:
                del edges[point]
            point = following
            if point == start:
                break
        if len(points) > 8:
            loop = simplify(points + [start])[:-1]
            if len(loop) >= 3:
                loops.append(loop)
    return ' '.join('M' + 'L'.join(f'{x},{y}' for x, y in loop) + 'Z' for loop in loops)


orange = (rgb[:, :, 0] > 220) & (rgb[:, :, 0] - rgb[:, :, 2] >= 44) & (rgb[:, :, 1] > rgb[:, :, 2])
mask = Image.fromarray(orange.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
claimed = np.zeros((height, width), dtype=bool)
pieces = {}
for id, seed in seeds.items():
    area = mask.copy()
    assert area.getpixel(seed) == 0, id
    ImageDraw.floodfill(area, seed, 128)
    area = np.asarray(area) == 128
    assert 250 < area.sum() < 15000 and not (area & claimed).any(), id
    claimed |= area
    pieces['piece_' + id] = dict(artifact=id, path=trace(area), anchor=seed)

aligned = align_photo()
aligned.save(OUT / 'fireplace.png', optimize=True)
# White is a matte in the supplied cut drawing. Remove it without moving any lines.
opacity = 255 - rgb.min(axis=2)
unmatted = (255 - (255 - rgb) * 255 // np.maximum(opacity[..., None], 1)).clip(0, 255)
overlay = np.dstack((unmatted, opacity)).astype(np.uint8)
overlay[:3] = overlay[-3:] = 0
overlay[:, :3] = overlay[:, -3:] = 0
Image.fromarray(overlay).save(OUT / 'cut-grid.png', optimize=True)
config = dict(width=width, height=height, image='assets/fireplace/fireplace.png',
              grid='assets/fireplace/cut-grid.png', pieces=pieces)
(DIST / 'config' / 'puzzle.json').write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
