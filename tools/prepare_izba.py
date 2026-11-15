"""Create cropped delivery copies; artist originals are read-only inputs. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageChops
import json, re, unicodedata, hashlib

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'Изба'
OUT = ROOT / 'dist'
ASSETS = OUT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
(OUT / 'config').mkdir(exist_ok=True)
(OUT / 'content').mkdir(exist_ok=True)

def source(name, folder=SOURCE):
    return next(p for p in folder.iterdir() if unicodedata.normalize('NFC', p.name) == unicodedata.normalize('NFC', name))

manifest = []
def asset(name, file, folder=SOURCE):
    p = source(file, folder)
    im = Image.open(p).convert('RGBA')
    box = im.getbbox()
    im.crop(box).save(ASSETS / (name + '.png'), optimize=True)
    manifest.append({'file': 'assets/' + name + '.png', 'source': str(p.relative_to(ROOT)), 'sourceSha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'canvas': list(im.size), 'crop': list(box), 'status': 'customer_supplied'})
    x,y,r,b=box
    return {'image': 'assets/' + name + '.png', 'x':x,'y':y,'width':r-x,'height':b-y}

background=asset('izba-background','Изба_фон.png')
hero=asset('hero-base','Богатырь_раздетый.png')
stove=asset('stove-front','Печка.png')
bench=asset('bench-front','Лавка.png')
pillow=asset('pillow-front','Подушка .png')
items={}
for id,hidden,worn,z in [
    ('chainmail','Кольчуга спрятанная.png',['Кольчуга одетая.png'],10),
    ('helmet','Шлем спрятанный.png',['Шлем одетый.png'],30),
    ('belt','Пояс спрятанный.png',['Пояс одетый.png'],20),
    ('ring','Кольцо спрятанное.png',['Кольцо одетое.png'],38),
    ('boots','Сапог левый спрятанный.png',['Сапог левый одетый.png','Сапог правый одетый.png'],30),
    ('gusli','Гусли спрятанные.png',[],38),
    ('cup','Кубок спрятанный.png',[],10),
]:
    sprites=[dict(asset(id+'-hidden',hidden),z=z)]
    if id=='boots': sprites.append(dict(asset('boots-right-hidden','Сапог правый спрятанный.png'),z=z))
    if id=='cup': sprites[0].update(x=851,y=465)
    if id=='ring': sprites[0].update(x=918,y=850,width=80,height=58)
    wornsprites=[dict(asset(id+'-worn-'+str(i),name),z={'belt':41,'chainmail':42,'helmet':44,'boots':43,'ring':45}[id]) for i,name in enumerate(worn)]
    card=asset('ring-card','Перстень.png')['image'] if id=='ring' else sprites[0]['image']
    if id=='gusli': card=asset('gusli-card','Игра_гусли.png',ROOT/'Богатырь исходные картинки')['image']
    items[id]={'hidden':sprites,'worn':wornsprites,'cardImage':card,'sound':None}

parts=items['boots']['worn']
x=min(a['x'] for a in parts); y=min(a['y'] for a in parts)
r=max(a['x']+a['width'] for a in parts); b=max(a['y']+a['height'] for a in parts)
pair=Image.new('RGBA',(r-x,b-y))
for a in parts: pair.alpha_composite(Image.open(OUT/a['image']),(a['x']-x,a['y']-y))
pair.save(ASSETS/'boots-card.png')
items['boots']['cardImage']='assets/boots-card.png'
items['helmet']['cardImage']=items['helmet']['worn'][0]['image']
config={'canvas':{'width':1600,'height':1200},'mobileDetailWidth':800,'background':background,'layers':[dict(stove,z=15),dict(pillow,z=25),dict(bench,z=35),dict(hero,z=40)],'items':items,
  'hitAreas':{
    'chainmail':[[[1028,102],[1168,87],[1193,146],[1110,155],[1048,148],[1028,165]]],
    'helmet':[[[970,619],[1054,646],[1128,696],[1116,742],[1065,757],[980,739],[974,706],[1016,711],[1069,680],[1053,658],[995,638]]],
    'belt':[[[953,188],[1028,180],[1037,214],[1006,216],[981,267],[958,332],[947,331],[960,267],[978,217],[955,218]],[[1014,231],[1017,262],[1003,309],[986,335],[984,314],[995,269]]],
    'ring':[[[912,841],[1002,841],[1002,917],[912,917]]],
    'boots':[[[1220,873],[1263,899],[1315,883],[1318,1091],[1289,1124],[1246,1116],[1220,1091]],[[1038,882],[1090,890],[1137,920],[1150,1016],[1086,1055],[1044,1040]]],
    'gusli':[[[0,786],[98,789],[111,799],[78,851],[0,848]]],
    'cup':[[[852,479],[894,465],[897,525],[882,531],[867,520]]]
  }}
# Derive editable hit polygons from visible alpha, subtracting real foreground layers.
# Small 4px strips preserve silhouettes without including transparent PNG margins.
for id,item in items.items():
    if id=='ring': continue  # Deliberate touch allowance for the smallest artifact.
    mask=Image.new('L',(1600,1200))
    for sprite in item['hidden']:
        a=Image.open(OUT/sprite['image']).getchannel('A').resize((sprite['width'],sprite['height']))
        full=Image.new('L',(1600,1200));full.paste(a,(sprite['x'],sprite['y']))
        for front in config['layers']:
            if front['z']<=sprite['z']:continue
            fa=Image.open(OUT/front['image']).getchannel('A')
            cover=Image.new('L',(1600,1200));cover.paste(fa,(front['x'],front['y']))
            full=ImageChops.multiply(full,ImageChops.invert(cover))
        mask=ImageChops.lighter(mask,full)
    box=mask.getbbox(); polys=[]
    for y in range(box[1],box[3],4):
        start=None
        for x in range(box[0],box[2]+4,4):
            active=x<box[2] and mask.crop((x,y,min(x+4,1600),min(y+4,1200))).getextrema()[1]>24
            if active and start is None:start=x
            if not active and start is not None:
                polys.append([[start,y],[x,y],[x,min(y+4,1200)],[start,min(y+4,1200)]]);start=None
    config['hitAreas'][id]=polys
(OUT/'config'/'izba.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'ASSET_MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')

spec=(ROOT/'BOGATYR_GAME_SPEC.md').read_text(encoding='utf-8')
titles={'chainmail':'Кольчуга','helmet':'Шлем','belt':'Кушак','ring':'Перстень','boots':'Сапоги','gusli':'Гусли','cup':'Кубок'}
content=[]
for id,title in titles.items():
    block=re.search(r'^### '+id+r'\s*\n(.*?)(?=^### |^## |\Z)',spec,re.M|re.S).group(1)
    description=re.search(r'\*\*Определение:\*\* (.*)',block).group(1)
    readingtitle=re.search(r'\*\*Читать ещё — (.*?)\*\*',block).group(1)
    excerpt='\n'.join(re.findall(r'^> ?(.*)$',block,re.M))
    url=re.search(r'Источник: <(.*?)>',block).group(1)
    content.append({'id':id,'title':title,'description':description,'contentStatus':'customer_supplied','moreReading':{'title':readingtitle,'excerpt':excerpt,'sourceUrl':url,'sourceLabel':url.split('/')[2],'status':'customer_supplied','sourceVerification':'not_checked'},'actionLabel':{'belt':'Подпоясать','boots':'Обуть'}.get(id,'Надеть') if id not in ['gusli','cup'] else None})
(OUT/'content'/'izba.json').write_text(json.dumps(content,ensure_ascii=False,indent=2),encoding='utf-8')
print('Prepared',len(manifest),'image copies; 7 exact card texts; originals unchanged.')
