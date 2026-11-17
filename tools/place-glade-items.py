"""Apply found-object composition using existing artist layers, preserving originals."""
from pathlib import Path
import json,shutil
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
cfgpath=ROOT/'dist/config/glade.json';cfg=json.loads(cfgpath.read_text(encoding='utf-8'))
layers=json.loads((ROOT/'qa/glade-layers/layers.json').read_text(encoding='utf-8'))
manifestpath=ROOT/'GLADE_ASSET_MANIFEST.json';manifest=json.loads(manifestpath.read_text(encoding='utf-8'))
def sprite(index,name,z):
    if isinstance(index,str):
        matches=[r for r in layers if r['name']==index]
        if len(matches)!=1:raise ValueError('Expected one PSD layer: '+index)
        index=matches[0]['index']
    layer=layers[index];file='assets/glade/'+name+'.png';shutil.copyfile(ROOT/'qa/glade-layers'/layer['file'],ROOT/'dist'/file)
    l,t,r,b=layer['crop'];s=dict(image=file,x=l,y=t,width=r-l,height=b-t,z=z)
    manifest[:]=[m for m in manifest if m.get('image')!=file]
    manifest.append(dict(**s,source='Поляна/Поляна_собери богатыря.psd',layerIndex=index,layerName=layer['name']))
    return s
items=cfg['items']
for id,index in [('raspberry_1','Малина Левая'),('raspberry_2','Малина Правая'),('sun','Layer 46'),('plough','Соха Снятая')]:
    items[id]['placed']=[sprite(index,id+'-placed',36)]
items['horse']['placed']=[sprite('Лошадь Большая','horse-placed',37)]
items['horse']['placedMark']=[980,260]
items['rein'].update(placed=[sprite('Повод Большой','rein-placed',38)],placeAfter='horse',placedMark=[1020,345])
items['sword']['worn']=[sprite('Ножны','sword-sheath',41),sprite('Меч В Руке','sword-worn',42)]
items['spear']['worn']=[sprite('Копье В Правой','spear-worn',42)]
items['sabre']['worn']=[sprite('Сабля В Правой','sabre-worn',42)]
for id,x,y,h in [('spear',1260,520,570),('sword',1310,780,300),('sabre',1410,780,290),('mace',1510,850,230)]:
    image=items[id]['cardImage'];w0,h0=Image.open(ROOT/'dist'/image).size
    items[id]['placed']=[dict(image=image,x=x,y=y,width=round(h*w0/h0),height=h,z=38)]
for id in ['raspberry_1','raspberry_2']:items[id]['cardScale']=0.2
for entry in manifest:
    if 'layerIndex' not in entry:continue
    box=[entry['x'],entry['y'],entry['x']+entry['width'],entry['y']+entry['height']]
    matches=[r for r in layers if r['name']==entry['layerName'] and r.get('crop')==box]
    if len(matches)==1:entry['layerIndex']=matches[0]['index']
cfgpath.write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
manifestpath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Updated found positions, sword in hand and separate standing horse/rein from revised PSD. Originals unchanged.')
