"""Read-only inventory of artist files and PSD layer records; no scene assembly."""
import sys, struct
from pathlib import Path
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
for p in Path('Поляна').glob('*.png'):
    im=Image.open(p)
    print(p.name, im.size, im.mode, im.getbbox())
p=next(Path('Поляна').glob('*.psd'))
data=p.read_bytes()
pos=26
for _ in range(2):
    n=struct.unpack_from('>I',data,pos)[0]; pos+=4+n
pos+=4
layer_size=struct.unpack_from('>I',data,pos)[0];pos+=4
count=abs(struct.unpack_from('>h',data,pos)[0]);pos+=2
print('PSD layers:',count)
for _ in range(count):
    top,left,bottom,right,channels=struct.unpack_from('>iiiiH',data,pos);pos+=18+channels*6+12
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
    pos=end
    print('LAYER',name, (left,top,right,bottom))
