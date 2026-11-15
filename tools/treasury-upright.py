from pathlib import Path
from PIL import Image
import json
r=Path(__file__).resolve().parent.parent
p=r/'dist/config/izba.json';c=json.loads(p.read_text(encoding='utf-8'))
for id in ['chainmail','helmet','belt']:
    c['items'][id]['treasuryImage']=c['items'][id]['worn'][0]['image']
for id,angle in [('ring',90),('cup',-25),('gusli',25)]:
    im=Image.open(r/'dist'/c['items'][id]['cardImage']).convert('RGBA').rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
    im=im.crop(im.getbbox());target='assets/'+id+'-upright.png';im.save(r/'dist'/target);c['items'][id]['treasuryImage']=target
c['items']['boots']['treasuryImage']=c['items']['boots']['cardImage']
p.write_text(json.dumps(c,ensure_ascii=False,indent=2),encoding='utf-8')
