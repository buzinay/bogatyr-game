"""Extract existing PSD pixel layers for inspection. Never edits artist originals."""
from pathlib import Path
import struct, sys, json, zlib
from PIL import Image, ImageOps, ImageDraw, ImageFont
sys.stdout.reconfigure(encoding='utf-8')
data=next(Path('Поляна').glob('*.psd')).read_bytes(); pos=26
for _ in range(2):
    n=struct.unpack_from('>I',data,pos)[0];pos+=4+n
pos+=4; n=struct.unpack_from('>I',data,pos)[0];pos+=4
count=abs(struct.unpack_from('>h',data,pos)[0]);pos+=2;records=[]
for i in range(count):
    top,left,bottom,right,nc=struct.unpack_from('>iiiiH',data,pos);pos+=18
    channels=[]
    for _ in range(nc):
        cid,size=struct.unpack_from('>hI',data,pos);pos+=6;channels.append((cid,size))
    blend=data[pos+4:pos+8].decode('ascii');opacity=data[pos+8];flags=data[pos+10];pos+=12
    size=struct.unpack_from('>I',data,pos)[0];pos+=4;end=pos+size
    n=struct.unpack_from('>I',data,pos)[0];pos+=4+n
    n=struct.unpack_from('>I',data,pos)[0];pos+=4+n
    n=data[pos];name=data[pos+1:pos+1+n].decode('cp1251',errors='replace');pos+=(1+n+3)//4*4
    while pos+12<=end:
        sig=data[pos:pos+4];key=data[pos+4:pos+8];n=struct.unpack_from('>I',data,pos+8)[0];pos+=12
        if sig not in (b'8BIM',b'8B64'):break
        if key==b'luni':
            length=struct.unpack_from('>I',data,pos)[0];name=data[pos+4:pos+4+length*2].decode('utf-16-be')
        pos+=n+(n%2)
    pos=end;records.append(dict(index=i,name=name,bounds=[left,top,right,bottom],channels=channels,blend=blend,opacity=opacity,visible=not bool(flags&2)))
def unpack(raw):
    out=bytearray();p=0
    while p<len(raw):
        n=raw[p];p+=1
        if n<128:out.extend(raw[p:p+n+1]);p+=n+1
        elif n>128:out.extend(raw[p:p+1]*(257-n));p+=1
    return bytes(out)
out=Path('qa/glade-layers');out.mkdir(exist_ok=True);thumbs=[]
for r in records:
    l,t,right,b=r['bounds'];w,h=right-l,b-t;planes={}
    for cid,size in r.pop('channels'):
        raw=data[pos:pos+size];pos+=size
        if not w or not h:continue
        comp=struct.unpack_from('>H',raw)[0]
        if comp==0:pixels=raw[2:]
        elif comp==1:pixels=unpack(raw[2+h*2:])
        elif comp==2:pixels=zlib.decompress(raw[2:])
        else:raise ValueError(('Unsupported PSD compression',comp))
        if cid in [-1,0,1,2]:planes[cid]=Image.frombytes('L',(w,h),pixels)
    if not all(c in planes for c in [0,1,2]):continue
    im=Image.merge('RGBA',[planes[0],planes[1],planes[2],planes.get(-1,Image.new('L',(w,h),255))]);box=im.getbbox()
    if not box:continue
    cropped=im.crop(box);file=f'{r["index"]:02}.png';cropped.save(out/file)
    r.update(file=file,crop=[l+box[0],t+box[1],l+box[2],t+box[3]])
    thumbs.append((r,cropped));print(r['index'],r['name'],r['crop'],r['blend'],r['visible'])
(out/'layers.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
for start in range(0,len(thumbs),20):
    batch=thumbs[start:start+20];sheet=Image.new('RGB',(1000,((len(batch)+4)//5)*230),'#d9d5c5');draw=ImageDraw.Draw(sheet)
    for i,(r,im) in enumerate(batch):
        thumb=ImageOps.contain(im,(180,175));x=(i%5)*200;y=(i//5)*230
        sheet.paste(thumb,(x+(200-thumb.width)//2,y),thumb);draw.text((x+4,y+180),f'{r["index"]}: {r["name"]}',fill='black',font=font)
    sheet.save(out/f'contact-{start//20}.jpg')
