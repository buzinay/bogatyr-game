from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parent.parent
p=root/'dist/app.js'
s=p.read_text(encoding='utf-8').replace('izba-1','izba-2')
start=s.index('    <header class="masthead">');end=s.index('    <div id="storage-note"',start)
s=s[:start]+s[end:]
start=s.index('      <details class="treasury"');end=s.index('      <div class="viewport"',start)
s=s[:start]+s[end:]
s=s.replace('<div class="viewport" id="viewport"','<div class="field"><div class="viewport" id="viewport"')
start=s.index('      <div class="scene-help">');end=s.index('    </section>',start)
s=s[:start]+'      <div class="speech"><button id="speech-close" aria-label="Скрыть реплику">×</button><div class="status" id="status" aria-live="polite"></div></div></div>\n'+s[end:]
s=s.replace('<button id="menu">Меню</button>','<button id="speech-toggle">Реплика</button><button id="menu">Меню</button>')
start=s.index('    <footer class="footer">');end=s.index('    <div class="sr-only"',start)
s=s[:start]+s[end:]
s=s.replace('    <dialog id="card"','    <dialog id="treasury" aria-labelledby="treasury-title"><header class="dialog-head"><h2 id="treasury-title">Сокровищница</h2><button class="close" id="treasury-close" aria-label="Закрыть Сокровищницу">×</button></header><div class="dialog-body"><p>Нажми на найденный артефакт, чтобы открыть карточку.</p><div class="treasury-grid" id="treasury-grid"></div></div></dialog>\n    <dialog id="card"')
s=s.replace("$('#treasury-toggle').onclick=()=>{$('#treasury').open=!$('#treasury').open;};", "$('#treasury-toggle').onclick=()=>openDialog($('#treasury'));\n  $('#treasury-close').onclick=()=>closeDialog($('#treasury'));\n  $('#speech-close').onclick=()=>{$('.speech').hidden=true;};\n  $('#speech-toggle').onclick=()=>{$('.speech').hidden=!$('.speech').hidden;};")
s=s.replace("  $('#treasury').ontoggle=()=>{$('#treasury-toggle').setAttribute('aria-expanded',String($('#treasury').open));};",'')
s=s.replace("$('#treasury').open=false;", "if($('#treasury').open)$('#treasury').close();")
s=s.replace("const b=button('',()=>openCard(a.id),'treasure');", "const b=button('',()=>{$('#treasury').close();openCard(a.id);},'treasure');")
s=s.replace("box.append(button('На поляну'", "$('.speech').hidden=false;\n    box.append(button('На поляну'")
s=s.replace("    box.append(el('p','','Всё найдено!", "    $('.speech').hidden=false;\n    box.append(el('p','','Всё найдено!")
start=s.index("  box.append(el('small','','Нажимай")
end=s.index('\n',start);s=s[:start]+s[end:]
s=s.replace("if(scale<.5){zoom='detail';resizeScene();}","if(innerWidth<=700&&scale<.5){zoom='detail';resizeScene();}")
s=s.replace("  v.style.height=zoom==='fit'?Math.min(v.clientWidth*.75,innerHeight*(innerWidth<=700?.6:.65))+'px':'';", "  const top=v.getBoundingClientRect().top+scrollY;\n  v.style.height=Math.max(220,innerHeight-top-12)+'px';")
s=s.replace("  new ResizeObserver(()=>resizeScene()).observe(v);", "  new ResizeObserver(()=>resizeScene()).observe(v);\n  window.addEventListener('resize',()=>resizeScene());")
p.write_text(s,encoding='utf-8')
p=root/'dist/index.html';p.write_text(p.read_text(encoding='utf-8').replace('izba-1','izba-2'),encoding='utf-8')
cpath=root/'dist/config/izba.json';c=json.loads(cpath.read_text(encoding='utf-8'))
parts=c['items']['boots']['worn'];x=min(a['x'] for a in parts);y=min(a['y'] for a in parts);r=max(a['x']+a['width'] for a in parts);b=max(a['y']+a['height'] for a in parts)
im=Image.new('RGBA',(r-x,b-y))
for a in parts:im.alpha_composite(Image.open(root/'dist'/a['image']),(a['x']-x,a['y']-y))
im.save(root/'dist/assets/boots-card.png')
c['items']['boots']['cardImage']='assets/boots-card.png'
c['items']['helmet']['cardImage']=c['items']['helmet']['worn'][0]['image']
cpath.write_text(json.dumps(c,ensure_ascii=False,indent=2),encoding='utf-8')
