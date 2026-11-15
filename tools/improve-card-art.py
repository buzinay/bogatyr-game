from pathlib import Path
from PIL import Image
import json, unicodedata
root=Path(__file__).resolve().parent.parent
src=root/'Богатырь исходные картинки'; out=root/'dist/assets'
def find(name):
    n=unicodedata.normalize('NFC',name)
    return next(p for p in src.glob('*.png') if unicodedata.normalize('NFC',p.name)==n)
def crop(name,id):
    im=Image.open(find(name)).convert('RGBA'); im=im.crop(im.getbbox()); target=out/(id+'-card-hq.png'); im.save(target,optimize=True); return 'assets/'+target.name
cpath=root/'dist/config/izba.json'; c=json.loads(cpath.read_text(encoding='utf-8'))
for id,file in [('chainmail','Игра_кольчуга.png'),('helmet','Игра_шлем.png'),('ring','Игра_перстень.png'),('gusli','Игра_гусли.png')]:
    image=crop(file,id); c['items'][id]['cardImage']=image; c['items'][id]['treasuryImage']=image
# The supplied source already contains both boots in one high resolution PNG.
image=crop('Игра_сапоги.png','boots'); c['items']['boots']['cardImage']=image; c['items']['boots']['treasuryImage']=image
cpath.write_text(json.dumps(c,ensure_ascii=False,indent=2),encoding='utf-8')
print('Updated high-resolution card art:',', '.join(['chainmail','helmet','boots','ring','gusli']))
