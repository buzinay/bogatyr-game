from PIL import Image,ImageOps,ImageDraw,ImageFont
from pathlib import Path
files=[p for p in Path('Богатырь исходные картинки').glob('*.png') if 'Игра_' in p.name]
out=Image.new('RGB',(1000,((len(files)+4)//5)*240),'white')
d=ImageDraw.Draw(out);f=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
for i,p in enumerate(files):
    im=Image.open(p).convert('RGBA');crop=im.crop(im.getbbox());thumb=ImageOps.contain(crop,(180,190));x=(i%5)*200+10;y=(i//5)*240
    out.paste(thumb,(x+(180-thumb.width)//2,y),thumb);d.text((x,y+195),p.name,fill='black',font=f)
out.save('qa/artifacts-contact.jpg')
