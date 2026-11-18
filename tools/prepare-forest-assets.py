"""Copy original Forest layers and extract card text from the project spec."""

import json
import math
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'Лес'
EXPORT = ROOT / 'qa' / 'forest-layers'
DIST = ROOT / 'dist'
ASSETS = DIST / 'assets' / 'forest'
ASSETS.mkdir(parents=True, exist_ok=True)
layers = json.loads((EXPORT / 'layers.json').read_text(encoding='utf-8'))
spec = (ROOT / 'BOGATYR_GAME_SPEC.md').read_text(encoding='utf-8')


def asset(source, name):
    filename = name + '.png'
    shutil.copyfile(source, ASSETS / filename)
    return 'assets/forest/' + filename


def sprite(image, box, z):
    x, y, right, bottom = box
    return dict(image=image, x=x, y=y, width=right-x, height=bottom-y, z=z)


def layer(index, name, z):
    info = layers[index]
    return sprite(asset(EXPORT / info['file'], name), info['crop'], z)


def weapon(index, id, grip, anchor, scale, rotation):
    s = layer(index, id, 34)
    width, height = s['width']*scale, s['height']*scale
    dx, dy = (grip[0]-.5)*width, (grip[1]-.5)*height
    angle = math.radians(rotation)
    s.update(equipmentId=id, rotation=rotation, width=round(width, 2), height=round(height, 2),
             x=round(anchor[0]-width/2-dx*math.cos(angle)+dy*math.sin(angle), 2),
             y=round(anchor[1]-height/2-dx*math.sin(angle)-dy*math.cos(angle), 2))
    return s


def bounds(s):
    x, y = s['x'], s['y']
    right, bottom = x+s['width'], y+s['height']
    return [[x, y], [right, y], [right, bottom], [x, bottom]]


def card_text(id, title):
    section = re.search(rf'^### {id}\n(.*?)(?=^#|\Z)', spec, re.M | re.S)[1]
    description = re.search(r'^\*\*Определение:\*\* (.+)$', section, re.M)[1]
    reading_title = re.search(r'^\*\*Читать ещё — (.+)\*\*$', section, re.M)[1]
    excerpt = '\n'.join(re.findall(r'^> (.*)$', section, re.M))
    source = re.search(r'^Источник: <([^>]+)>', section, re.M)[1]
    return dict(id=id, title=title, description=description, contentStatus='customer_supplied',
                moreReading=dict(title=reading_title, excerpt=excerpt, sourceUrl=source,
                                 sourceLabel=urlsplit(source).netloc, status='customer_supplied',
                                 sourceVerification='not_checked'))


# Layers and coordinates are taken from the two artist compositions.
finds = [
    ('oak', 'Дуб', 'Дуб карточка.png', 4, 4),
    ('bear', 'Медведь', 'Медведь карточка.png', 25, 12),
    ('nightingale', 'Соловей-разбойник', None, 20, 22),
    ('raven', 'Чёрный ворон', 'Ворон карточка.png', 17, 16),
    ('sirin', 'Птица Сирин', 'Сирин карточка.png', 9, 7),
    ('wolf', 'Волк', 'Волк карточка.png', 2, 11),
    ('snake', 'Змея', 'Змея карточка.png', 19, 18),
    ('gorynych', 'Змей Горыныч', 'Змей Горыныч карточка.png', 6, 5),
    ('tugarin', 'Тугарин Змей', 'Тугарин карточка.png', 3, 3),
]

cfg = dict(
    canvas=dict(width=1600, height=1200),
    mobileDetailWidth=800,
    background=sprite(asset(SOURCE / 'Лес_фон.png', 'background'), [0, 0, 1600, 1200], 0),
    layers=[
        layer(10, 'rider', 35),
        layer(23, 'tree-front', 45),
    ],
    loadout=[
        dict(layer(26, 'shield', 36), equipmentId='shield'),
        weapon(27, 'spear', (.51, .43), (985, 433), .90, -17),
        weapon(28, 'mace', (.48, .28), (1021, 433), .89, 151),
        weapon(29, 'sword', (.09, .22), (972, 483), .774, -140),
        weapon(30, 'sabre', (.09, .68), (974, 478), .828, -123),
    ],
    items={},
    hitAreas={},
)
marks = {
    'oak': [1460, 120], 'bear': [674, 539], 'nightingale': [408, 564],
    'raven': [94, 174], 'sirin': [623, 87], 'wolf': [109, 407],
    'snake': [533, 980], 'gorynych': [1249, 36], 'tugarin': [1455, 421],
}
for id, title, card, hidden_index, placed_index in finds:
    revealed = (layer(4, 'oak-front', 33) if id == 'oak'
                else layer(placed_index, id + '-revealed', 46 if id == 'nightingale' else 31))
    hidden = revealed if id == 'oak' else layer(hidden_index, id + '-hidden', 52 if id in {'wolf', 'sirin'} else 30)
    item = dict(hidden=[hidden], placed=[revealed], worn=[], placedMark=marks[id],
                cardImage=asset(SOURCE / card, id + '-card') if card else revealed['image'],
                sound=f'assets/audio/{id}-short.wav')
    areas = [bounds(hidden)]
    if id == 'oak':
        # The same tree is clickable on the right before and after discovery.
        areas = [[[1320, 0], [1600, 0], [1600, 409], [1510, 350], [1420, 228]]]
        item.update(placedHitAreas=areas, placementSound=False)
    if id == 'tugarin':
        # The references provide the revealed rider only. Hide a copy by the right tree.
        hidden.update(x=1480, y=363, z=32)
    cfg['items'][id] = item
    cfg['hitAreas'][id] = areas


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


write_json(DIST / 'config' / 'forest.json', cfg)
write_json(DIST / 'content' / 'forest.json', [card_text(id, title) for id, title, *_ in finds])
