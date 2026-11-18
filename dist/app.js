const host = document.getElementById('bogatyr-game');
const root = host.attachShadow({mode:'open'});
const style = document.createElement('link');
style.rel = 'stylesheet'; style.href = new URL('./styles.css?v=forest-3', import.meta.url).href;
root.append(style);
const mount = document.createElement('div');
mount.className='loading'; mount.textContent='Загружаем игру…'; root.append(mount);
const KEY='bogatyr-game:izba:v1';
const BUILD='forest-3';
const sceneLabels={
  izba:{title:'Изба',task:'Найди 7 предметов и одень богатыря',resume:'Вернуться в избу',menu:'Ищем семь предметов в избе. Найденные вещи ждут в Сокровищнице.'},
  glade:{title:'Поляна',task:'Найди 11 объектов. Не забудь обе малины!',resume:'Вернуться на поляну',menu:'Ищем одиннадцать объектов на поляне. Найди все четыре вида оружия и выбери одно.'},
  forest:{title:'Лес',task:'Найди 9 объектов',resume:'Вернуться в лес',menu:'Ищем девять находок в лесу. Всё найденное можно рассмотреть в Сокровищнице.'}
};
const NS='http://www.w3.org/2000/svg';
const equipment=['chainmail','helmet','belt','ring','boots'];
const weapons=['sabre','sword','mace','spear'];
let scenes,allItems,scene='izba';
let config, artifacts, state, storageOK=true, saveNotice='', audio=null, activeCard=null;
let audioTimer=null;
const soundClips=new Map();
const pendingPlacements=new Set();
let hintId=null, zoom='fit', scale=1, returnFocus=null, drag=null, suppressClick=false;
let gesture=null, customScale=null, touchClickTimer=null;
const images = new Map();
const $=s=>root.querySelector(s);
const el=(tag,cls,text)=>{const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n;};
const url=path=>{const u=new URL(path,import.meta.url);u.searchParams.set('v',BUILD);return u.href;};
const fresh=()=>({schemaVersion:3,foundIds:[],equippedIds:[],screen:'izba',soundEnabled:true,weaponChoice:null});
const has=id=>state.foundIds.includes(id);
const worn=id=>state.equippedIds.includes(id);
const carried=id=>worn(id)||state.weaponChoice===id;
const sceneArtifacts=()=>artifacts.filter(a=>a.scene===scene);
const placementReady=id=>has(id)&&Boolean(config.items[id].placed)&&(!config.items[id].placeAfter||has(config.items[id].placeAfter));
const placed=id=>placementReady(id)&&!pendingPlacements.has(id);
const sceneSprites=id=>placed(id)?config.items[id].placed:config.items[id].hidden;
const izbaFinished=()=>artifacts.filter(a=>a.scene==='izba').every(a=>has(a.id))&&equipment.every(worn);
const gladeFinished=()=>artifacts.filter(a=>a.scene==='glade').every(a=>has(a.id))&&worn('shield')&&Boolean(state.weaponChoice);
const forestFinished=()=>artifacts.filter(a=>a.scene==='forest').every(a=>has(a.id));
const finished=()=>scene==='forest'?forestFinished():scene==='glade'?gladeFinished():izbaFinished();
const activeLayers=cfg=>[
  ...cfg.layers,
  ...(cfg.loadout||[]).filter(layer=>carried(layer.equipmentId))
];
function sceneLayers(cfg,id){
  const all=[cfg.background,...activeLayers(cfg)];
  for(const a of artifacts.filter(item=>item.scene===id)){
    const isCarried=carried(a.id);
    all.push(...(isCarried?cfg.items[a.id].worn:sceneSprites(a.id)).map(layer=>({
      ...layer,artifactId:isCarried?null:a.id,carriedId:isCarried?a.id:null
    })));
  }
  return all;
}
function enterScene(id){
  if(id==='glade'&&!izbaFinished())return;
  if(id==='forest'&&!gladeFinished())return;
  scene=id;config={...scenes[id],items:allItems,effects:scenes.izba.effects};
  state.screen=id;zoom='fit';customScale=null;hintId=null;gesture=null;drag=null;save();
  $('.speech').hidden=false;setScreen('game');focusHeading('#scene-title');
}
function readSave(){
  try{
    const raw=localStorage.getItem(KEY); if(!raw)return null;
    const data=JSON.parse(raw), ids=artifacts.map(a=>a.id);
    if(![1,2,3].includes(data.schemaVersion)||!Array.isArray(data.foundIds)||!Array.isArray(data.equippedIds)||
      new Set(data.foundIds).size!==data.foundIds.length||new Set(data.equippedIds).size!==data.equippedIds.length||
      data.foundIds.some(id=>!ids.includes(id))||data.equippedIds.some(id=>![...equipment,'shield'].includes(id)||!data.foundIds.includes(id))||
      !['izba','glade','forest','complete'].includes(data.screen)||typeof data.soundEnabled!=='boolean')throw Error('invalid');
    if(data.schemaVersion===1){data.screen='izba';data.weaponChoice=null;}
    if(data.weaponChoice!==null&&(!weapons.includes(data.weaponChoice)||!data.foundIds.includes(data.weaponChoice)))throw Error('invalid');
    const izbaIDs=artifacts.filter(a=>a.scene==='izba').map(a=>a.id);
    const ready=izbaIDs.every(id=>data.foundIds.includes(id))&&equipment.every(id=>data.equippedIds.includes(id));
    if((data.screen!=='izba'||data.foundIds.some(id=>!izbaIDs.includes(id)))&&!ready)throw Error('invalid');
    const gladeReady=artifacts.filter(a=>a.scene==='glade').every(a=>data.foundIds.includes(a.id))&&data.equippedIds.includes('shield')&&Boolean(data.weaponChoice);
    const forestIds=artifacts.filter(a=>a.scene==='forest').map(a=>a.id);
    if((['forest','complete'].includes(data.screen)||forestIds.some(id=>data.foundIds.includes(id)))&&!gladeReady)throw Error('invalid');
    if(data.schemaVersion===2&&data.screen==='complete')data.screen='forest';
    if(data.screen==='complete'&&!forestIds.every(id=>data.foundIds.includes(id)))throw Error('invalid');
    return {...fresh(),foundIds:data.foundIds,equippedIds:data.equippedIds,screen:data.screen,soundEnabled:data.soundEnabled,weaponChoice:data.weaponChoice};
  }catch(error){
    if(error.message==='invalid'||error instanceof SyntaxError)saveNotice='Сохранение не удалось прочитать. Можно начать новый поход.';
    else {storageOK=false;saveNotice='Браузер не разрешил сохранение. Можно играть до закрытия страницы.';}
    return null;
  }
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageOK=false;updateStorageNotice();}}
function updateStorageNotice(){const n=$('#storage-note'); if(n){n.hidden=storageOK;n.textContent='Прогресс хранится только до закрытия страницы: браузер запретил сохранение.';}}
function stopAudio(){clearTimeout(audioTimer);audioTimer=null;if(audio){audio.pause();audio.currentTime=0;audio=null;}}
function prepareSounds(){
  for(const [id,item]of Object.entries({...config.items,...config.effects})){
    if(!item.sound)continue;
    const clip=new Audio();clip.preload='auto';clip.src=url(item.sound);clip.volume=item.volume??1;
    clip.addEventListener('playing',()=>{if(audio===clip){clearTimeout(audioTimer);audioTimer=setTimeout(stopAudio,2000);}});
    clip.addEventListener('timeupdate',()=>{if(audio===clip&&clip.currentTime>=2)stopAudio();});
    clip.addEventListener('ended',()=>{if(audio===clip)stopAudio();});
    soundClips.set(id,clip);clip.load();
  }
}
function playSound(id){
  stopAudio();const file=(config.items[id]||config.effects?.[id])?.sound;if(!file||!state.soundEnabled)return;
  const clip=soundClips.get(id);if(!clip)return;audio=clip;
  clip.play().catch(()=>{if(audio===clip)stopAudio();});
}
function svgEl(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
function setScreen(name){
  stopAudio(); hintId=null;
  for(const id of ['start','game','complete'])$('#'+id).hidden=id!==name;
  if(name==='game'){render();resizeScene(true);}
  if(name==='complete')renderComplete();
}
function focusHeading(selector){const n=$(selector);n.tabIndex=-1;n.focus({preventScroll:true});}
function openDialog(dialog){returnFocus=root.activeElement;stopAudio();dialog.showModal();}
function restoreFocus(){
  let target=returnFocus;
  if(!target?.isConnected&&target?.dataset.id){
    const kind=target.classList.contains('target')?'.target':'.treasure';
    target=$(`${kind}[data-id="${target.dataset.id}"]`);
  }
  if(target?.isConnected&&target.getAttribute('tabindex')!=='-1')target.focus({preventScroll:true});
  else $('#treasury-toggle')?.focus({preventScroll:true});
}
function closeDialog(dialog){dialog.close();}
function button(text,handler,cls=''){const b=el('button',cls,text);b.type='button';b.addEventListener('click',handler);return b;}
function buildShell(saved){
  mount.className='app';
  mount.innerHTML=`
    <div id="storage-note" class="notice" hidden></div>
    <section id="start"><div class="intro"><div class="intro-copy"><div class="eyebrow">Глава 1 · СОБИРАЕМСЯ В ДОРОГУ</div><h2>Большой поход<br>начинается дома</h2><p>В этом камине спрятался целый былинный мир! Помоги богатырю собраться в дорогу, найди удивительные предметы и познакомься с обитателями леса. Все находки пригодятся, чтобы раскрыть тайну камина.</p><div class="intro-actions" id="start-actions"></div><p class="no-audio">Первая сцена · 7 находок · без спешки</p><p id="save-message" class="notice" hidden></p><p class="no-audio">Наведи курсор или нажми на предмет, чтобы услышать его звук.</p></div><div class="intro-art" aria-hidden="true"><img class="room" alt=""><img class="hero" alt=""></div></div></section>
    <section id="game" hidden aria-label="Сцена Изба"><div class="scene-head"><div class="scene-title"><span class="chapter">1</span><div><h2 id="scene-title">Изба</h2><p class="task">Найди 7 предметов и одень богатыря</p></div></div><div class="count" id="count" aria-live="polite"></div></div>
      <div class="toolbar"><button id="treasury-toggle" aria-controls="treasury" aria-expanded="false">Сокровищница · 0</button><button id="hint">Подсказка</button><span class="spacer"></span><button id="zoom-toggle">Крупнее</button><button id="sound" disabled title="Аудиофайлы ещё не добавлены">Звук: нет файлов</button><button id="speech-toggle">Реплика</button><button id="menu">Меню</button></div>
      <div class="field"><div class="viewport" id="viewport" tabindex="0" aria-label="Изба. Прокручивай сцену, чтобы осмотреть её целиком"><div class="surface"><div class="stage" id="stage"><div id="sprites"></div><svg class="hits" viewBox="0 0 1600 1200" id="hits" role="group" aria-label="Предметы в избе"></svg></div></div></div>
      <div class="speech"><button id="speech-close" aria-label="Скрыть реплику">×</button><div class="status" id="status" aria-live="polite"></div></div></div>
    </section>
    <section id="complete" class="complete" hidden><div class="seal">Все сборы завершены</div><h2>Первая сцена пройдена</h2><p>Ты нашёл все семь предметов и одел богатыря. Он готов к дороге!</p><img id="complete-hero" alt="Богатырь в найденном снаряжении"><p class="muted">Продолжение похода появится в следующей сборке.</p><button id="back" class="primary">Вернуться в избу</button><button id="complete-reset">Начать заново</button></section>
    <div class="sr-only" id="live" aria-live="polite"></div>
    <dialog id="treasury" aria-labelledby="treasury-title"><header class="dialog-head"><h2 id="treasury-title">Сокровищница</h2><button class="close" id="treasury-close" aria-label="Закрыть Сокровищницу">×</button></header><div class="dialog-body"><p>Нажми на найденный артефакт, чтобы открыть карточку.</p><div class="treasury-grid" id="treasury-grid"></div></div></dialog>
    <dialog id="card" aria-labelledby="card-title"><header class="dialog-head"><h2 id="card-title"></h2><button class="close" id="card-x" aria-label="Закрыть карточку">×</button></header><div class="dialog-body"><img class="card-picture" id="card-image" alt=""><p id="description"></p><button id="read-more" aria-expanded="false" aria-controls="reading">Читать ещё</button><div class="reading" id="reading" hidden><h3 id="reading-title"></h3><blockquote id="excerpt"></blockquote><small id="source-label"></small><br><a id="source" target="_blank" rel="noopener noreferrer">Открыть источник ↗</a></div><p class="card-note" id="card-note"></p></div><footer class="dialog-foot"><button id="equip" class="primary"></button><button id="card-close">Закрыть</button></footer></dialog>
    <dialog id="menu-dialog" aria-labelledby="menu-title"><header class="dialog-head"><h2 id="menu-title">Меню похода</h2><button class="close" id="menu-x" aria-label="Закрыть меню">×</button></header><div class="dialog-body menu-actions"><p>Ищем семь предметов в избе. Найденные вещи ждут в Сокровищнице.</p><button id="resume">Вернуться в избу</button><button id="restart">Начать заново</button><small>Прогресс сохраняется в этом браузере. На другом устройстве он не появится.</small></div></dialog>
    <dialog id="reset-dialog" aria-labelledby="reset-title"><header class="dialog-head"><h2 id="reset-title">Начать новый поход?</h2></header><div class="dialog-body"><p>Все находки и надетые вещи будут сброшены. Искать предметы можно будет снова.</p></div><footer class="dialog-foot"><button id="cancel-reset">Остаться в игре</button><button id="confirm-reset" class="primary">Да, начать заново</button></footer></dialog>`;
  $('.intro-art .room').src=url(config.background.image);$('.intro-art .hero').src=url(config.layers.find(s=>s.image.includes('hero-base')).image);
  $('.no-audio').textContent='Изба, Поляна и Лес · 27 находок';
  $('#start-actions').append(button('Начать поход',()=>{if(saved){askReset();}else{state=fresh();enterScene('izba');}},'primary'));
  if(saved)$('#start-actions').prepend(button('Продолжить',()=>{if(state.screen==='complete'){setScreen('complete');focusHeading('#complete h2');}else enterScene(state.screen);},'primary'));
  if(saveNotice){$('#save-message').hidden=false;$('#save-message').textContent=saveNotice;}
  updateStorageNotice();
  const hasAudio=Object.values(config.items).some(item=>Boolean(item.sound));
  $('#sound').disabled=!hasAudio;
  if(hasAudio){$('#sound').title='Включить или выключить звуковые эффекты';$('#sound').textContent=state.soundEnabled?'Звук: вкл.':'Звук: выкл.';}
  $('#sound').onclick=()=>{state.soundEnabled=!state.soundEnabled;stopAudio();save();$('#sound').textContent=state.soundEnabled?'Звук: вкл.':'Звук: выкл.';};
  $('#treasury-toggle').onclick=()=>openDialog($('#treasury'));
  $('#treasury-close').onclick=()=>closeDialog($('#treasury'));
  $('#speech-close').onclick=()=>{$('.speech').hidden=true;};
  $('#speech-toggle').onclick=()=>{$('.speech').hidden=!$('.speech').hidden;};

  $('#hint').onclick=showHint;
  $('#zoom-toggle').onclick=()=>{customScale=null;zoom=zoom==='fit'?'large':'fit';resizeScene(true);};
  $('#menu').onclick=()=>openDialog($('#menu-dialog'));
  for(const id of ['menu-x','resume'])$('#'+id).onclick=()=>closeDialog($('#menu-dialog'));
  $('#restart').onclick=()=>{$('#menu-dialog').close();askReset();};
  $('#complete-reset').onclick=askReset;
  $('#cancel-reset').onclick=()=>closeDialog($('#reset-dialog'));
  $('#confirm-reset').onclick=()=>{
    const sound=state.soundEnabled;state=fresh();state.soundEnabled=sound;save();$('#reset-dialog').close();if($('#treasury').open)$('#treasury').close();enterScene('izba');
  };
  $('#back').onclick=()=>enterScene('forest');
  const nav=el('div','menu-actions');
  nav.append(button('Изба',()=>{$('#menu-dialog').close();enterScene('izba');}));
  const gladeNav=button('Поляна',()=>{$('#menu-dialog').close();enterScene('glade');});gladeNav.id='menu-glade';nav.append(gladeNav);
  const forestNav=button('Лес',()=>{$('#menu-dialog').close();enterScene('forest');});
  forestNav.id='menu-forest';nav.append(forestNav);
  $('#menu-dialog .dialog-body').prepend(nav);
  $('#read-more').onclick=()=>{const open=$('#reading').hidden;$('#reading').hidden=!open;$('#read-more').textContent=open?'Свернуть':'Читать ещё';$('#read-more').setAttribute('aria-expanded',String(open));};
  for(const id of ['card-x','card-close'])$('#'+id).onclick=()=>closeDialog($('#card'));
  $('#equip').onclick=equipActive;
  for(const d of root.querySelectorAll('dialog')){
    d.addEventListener('cancel',e=>{e.preventDefault();closeDialog(d);});
    d.addEventListener('close',()=>{
      if(d.id==='treasury'&&$('#card').open)return;
      stopAudio();
      if(d.id==='card'){
        const revealed=pendingPlacements.size>0;
        const moved=[...pendingPlacements].some(id=>!carried(id)&&config.items[id].placementSound!==false);
        pendingPlacements.clear();activeCard=null;
        if(revealed)render();
        if(moved)playSound('success');
      }
      restoreFocus();
    });
  }
  const v=$('#viewport');
  $('.speech').hidden=false;
  const beginTouch=e=>{
    const touches=[...e.touches];if(!touches.length){gesture=null;return;}
    const rect=$('#stage').getBoundingClientRect();
    const x=touches.length>1?(touches[0].clientX+touches[1].clientX)/2:touches[0].clientX;
    const y=touches.length>1?(touches[0].clientY+touches[1].clientY)/2:touches[0].clientY;
    gesture={x,y,left:v.scrollLeft,top:v.scrollTop,scale,
      anchorX:(x-rect.left)/scale,anchorY:(y-rect.top)/scale,
      distance:touches.length>1?Math.hypot(touches[1].clientX-touches[0].clientX,touches[1].clientY-touches[0].clientY):0};
  };
  v.addEventListener('touchstart',e=>{clearTimeout(touchClickTimer);beginTouch(e);},{passive:true});
  v.addEventListener('touchmove',e=>{
    if(!gesture)return;e.preventDefault();
    const t=[...e.touches];
    if(t.length>1&&gesture.distance){
      const distance=Math.hypot(t[1].clientX-t[0].clientX,t[1].clientY-t[0].clientY);
      const fit=Math.min(v.clientWidth/1600,v.clientHeight/1200);
      customScale=Math.max(fit,Math.min(2,gesture.scale*distance/gesture.distance));
      zoom=customScale<=fit+.0001?'fit':'custom';resizeScene();
      const rect=$('#stage').getBoundingClientRect();
      v.scrollLeft+=rect.left+gesture.anchorX*scale-(t[0].clientX+t[1].clientX)/2;
      v.scrollTop+=rect.top+gesture.anchorY*scale-(t[0].clientY+t[1].clientY)/2;
      suppressClick=true;
    }else if(t.length===1){
      const dx=t[0].clientX-gesture.x,dy=t[0].clientY-gesture.y;
      if(Math.hypot(dx,dy)>7){v.scrollLeft=gesture.left-dx;v.scrollTop=gesture.top-dy;suppressClick=true;}
    }
  },{passive:false});
  const endTouch=e=>{beginTouch(e);touchClickTimer=setTimeout(()=>{suppressClick=false;},400);};
  v.addEventListener('touchend',endTouch);v.addEventListener('touchcancel',endTouch);
  v.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0)drag={x:e.clientX,y:e.clientY,left:v.scrollLeft,top:v.scrollTop,moved:false};});
  v.addEventListener('pointermove',e=>{if(!drag||e.buttons!==1)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>7){drag.moved=true;v.classList.add('dragging');v.scrollLeft=drag.left-dx;v.scrollTop=drag.top-dy;}});
  const endDrag=()=>{if(drag){suppressClick=drag.moved;drag=null;v.classList.remove('dragging');setTimeout(()=>{suppressClick=false;},0);}};
  v.addEventListener('pointerup',endDrag);v.addEventListener('pointerleave',endDrag);v.addEventListener('pointercancel',endDrag);
  new ResizeObserver(()=>resizeScene()).observe(v);
  window.addEventListener('resize',()=>resizeScene());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAudio();});
}
function askReset(){openDialog($('#reset-dialog'));}
function render(){
  const current=sceneArtifacts();
  const labels=sceneLabels[scene];
  $('#game').dataset.scene=scene;
  $('#scene-title').textContent=labels.title;
  $('#game').setAttribute('aria-label','Сцена '+$('#scene-title').textContent);
  $('#viewport').setAttribute('aria-label',$('#scene-title').textContent+'. Увеличивай и перемещай сцену, чтобы осмотреть её целиком');
  $('.task').textContent=labels.task;
  $('#hits').setAttribute('aria-label','Находки · '+labels.title);
  $('#count').textContent=`Найдено: ${current.filter(a=>has(a.id)).length}/${current.length}`;
  $('#treasury-toggle').textContent=`Сокровищница · ${state.foundIds.length}`;
  $('#menu-glade').disabled=!izbaFinished();
  $('#menu-forest').disabled=!gladeFinished();
  $('#resume').textContent=labels.resume;
  $('#menu-dialog .dialog-body > p').textContent=labels.menu;
  const sprites=$('#sprites');sprites.replaceChildren();
  for(const s of sceneLayers(config,scene)){const img=el('img','sprite');if(s.artifactId)img.dataset.artifact=s.artifactId;if(s.carriedId||s.equipmentId)img.dataset.carried=s.carriedId||s.equipmentId;img.alt='';img.draggable=false;img.src=url(s.image);Object.assign(img.style,{left:s.x/16+'%',top:s.y/12+'%',width:s.width/16+'%',height:s.height/12+'%',zIndex:String(s.z||0),transform:s.rotation?`rotate(${s.rotation}deg)`:''});sprites.append(img);}
  renderHits();renderTreasury();renderStatus();
}
function renderHits(){
  const hits=$('#hits');hits.replaceChildren();
  for(const im of root.querySelectorAll('[data-artifact]'))im.classList.toggle('lit',im.dataset.artifact===hintId);
  for(const a of sceneArtifacts()){
    if(carried(a.id))continue;
    if(placed(a.id)&&!sceneSprites(a.id).length){
      const [x,y]=config.items[a.id].placedMark;const mark=svgEl('text',{x,y,class:'found-mark','aria-hidden':'true'});mark.textContent='✓';hits.append(mark);continue;
    }
    const areas=itemAreas(a.id);
    const d=areas.map(p=>'M'+p.map(pt=>pt.join(',')).join('L')+'Z').join('');
    const path=svgEl('path',{d,role:'button',tabindex:'0','aria-label':a.title+(has(a.id)?', найдено':''),'data-id':a.id,class:'target'+(hintId===a.id?' hint':'')});
    const light=on=>{for(const im of root.querySelectorAll(`[data-artifact="${a.id}"]`))im.classList.toggle('lit',on||hintId===a.id);};
    path.addEventListener('pointerenter',e=>{light(true);if(e.pointerType==='mouse'&&!drag&&!$('#card').open&&audio!==soundClips.get('success'))playSound(a.id);});
    path.addEventListener('pointerleave',()=>light(false));
    path.addEventListener('focus',()=>light(true));
    path.addEventListener('blur',()=>light(false));
    path.addEventListener('click',e=>{
      if(suppressClick)return;
      if(e.detail>0&&a.id!=='ring'){
        const r=$('#stage').getBoundingClientRect(),x=(e.clientX-r.left)/scale,y=(e.clientY-r.top)/scale;
        if(!visibleHit(a.id,x,y)){
          if(scene==='forest'){
            const point=new DOMPoint(x,y);
            const next=[...hits.querySelectorAll('.target')].reverse().find(target=>
              target.isPointInFill(point)&&visibleHit(target.dataset.id,x,y));
            if(next)openCard(next.dataset.id);
          }
          return;
        }
      }
      openCard(a.id);
    });
    path.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openCard(a.id);}});
    path.addEventListener('focus',()=>{if(path.matches(':focus-visible'))revealItem(a.id);});
    hits.append(path);
    if(has(a.id)&&!(scene==='forest'&&pendingPlacements.has(a.id))){
      const [x,y]=placed(a.id)&&config.items[a.id].placedMark?config.items[a.id].placedMark:[areas[0][0][0]+8,areas[0][0][1]-10];const mark=svgEl('text',{x,y,class:'found-mark','aria-hidden':'true'});mark.textContent='✓';hits.append(mark);
    }
  }
}
function alphaAt(sprite,x,y){
  if(sprite.rotation){
    const cx=sprite.x+sprite.width/2,cy=sprite.y+sprite.height/2;
    const angle=-sprite.rotation*Math.PI/180,dx=x-cx,dy=y-cy;
    x=cx+dx*Math.cos(angle)-dy*Math.sin(angle);
    y=cy+dx*Math.sin(angle)+dy*Math.cos(angle);
  }
  if(x<sprite.x||y<sprite.y||x>=sprite.x+sprite.width||y>=sprite.y+sprite.height)return 0;
  const im=images.get(sprite.image);return im.alpha[Math.floor((y-sprite.y)/sprite.height*im.height)*im.width+Math.floor((x-sprite.x)/sprite.width*im.width)];
}
function visibleHit(id,x,y){
  const fronts=scene==='forest'?sceneLayers(config,scene):activeLayers(config);
  return sceneSprites(id).some(s=>alphaAt(s,x,y)>24&&!fronts.some(front=>
    front.artifactId!==id&&(front.z||0)>(s.z||0)&&alphaAt(front,x,y)>128
  ));
}
function itemAreas(id){
  if(!placed(id))return config.hitAreas[id];
  return config.items[id].placedHitAreas||sceneSprites(id).map(s=>[
    [s.x,s.y],[s.x+s.width,s.y],[s.x+s.width,s.y+s.height],[s.x,s.y+s.height]
  ]);
}
function renderTreasury(){
  const grid=$('#treasury-grid');grid.replaceChildren();
  for(const a of artifacts){
    if(!has(a.id)){if(a.scene!==scene)continue;const n=el('div','empty-slot','?');n.setAttribute('aria-label','Ещё не найдено');grid.append(n);continue;}
    const b=button('',()=>{$('#treasury').close();openCard(a.id);},'treasure');b.dataset.id=a.id;b.setAttribute('aria-label',a.title+', открыть карточку');
    const im=el('img');im.alt='';im.src=url(config.items[a.id].treasuryImage||config.items[a.id].cardImage);b.append(im,el('span','',a.title),el('span','equipped',state.weaponChoice===a.id?'✓ Выбрано':worn(a.id)?'✓ Надето':'✓ Найдено'));grid.append(b);
  }
}
function renderStatus(){
  if(scene==='forest'){renderForestStatus();return;}
  if(scene==='glade'){renderGladeStatus();return;}
  const box=$('#status');box.classList.toggle('success',finished());box.replaceChildren();
  if(finished()){
    box.append(el('p','','Теперь я готов! Гусли пусть дома дожидаются — будет что сыграть после похода. А мы пойдём на поляну: пора выбрать оружие и найти коня'));
    $('.speech').hidden=false;
    box.append(button('На поляну',()=>enterScene('glade'),'primary'));return;
  }
  if(sceneArtifacts().every(a=>has(a.id))){
    $('.speech').hidden=false;
    box.append(el('p','','Всё найдено! Теперь надень снаряжение на богатыря'));
    const list=el('div','missing');for(const a of artifacts.filter(a=>equipment.includes(a.id)&&!worn(a.id)))list.append(button(a.actionLabel+': '+a.title,()=>openCard(a.id)));box.append(list);return;
  }
  box.append(el('p','','В поход собрался, а сапоги ещё не надел! Помоги найти снаряжение. Заодно осмотримся: что ещё интересного есть в избе?'));

}
function renderGladeStatus(){
  const box=$('#status');box.replaceChildren();box.classList.toggle('success',gladeFinished());
  const allFound=sceneArtifacts().every(a=>has(a.id));
  if(gladeFinished()){
    $('.speech').hidden=false;
    box.append(el('p','','Всё готово! И оружие выбрали, и про соху узнали. А теперь — в лес. Там внимательный взгляд пригодится не меньше богатырской силы'));
    box.append(button('В лес',()=>enterScene('forest'),'primary'));
  }else if(allFound){
    $('.speech').hidden=false;box.append(el('p','','Всё найдено! '+(!worn('shield')?'Возьми щит. ':'')+(!state.weaponChoice?'Выбери оружие для богатыря.':'')));
    if(!worn('shield'))box.append(button('Взять щит',()=>openCard('shield')));
  }else box.append(el('p','','Доспехи на мне, а сборы ещё не закончены. Нужно выбрать оружие и подготовить коня. Осмотрись внимательно: на поляне найдутся вещи и для ратного дела, и для мирного труда'));
  if(has('horse')&&has('rein'))box.append(el('p','horse-ready','✓ Конь готов к дороге'));
  if(weapons.some(has)){
    box.append(el('p','','Сабля, меч, булава или копьё? Выбери, что богатырь возьмёт в этот поход. Из Леса можно вернуться на Поляну через «Меню» и сменить оружие.'));
    const choices=el('div','weapon-choices');
    for(const id of weapons){const a=artifacts.find(a=>a.id===id),b=button(a.title+(state.weaponChoice===id?' ✓':''),()=>openCard(id));b.disabled=!has(id);b.setAttribute('aria-pressed',String(state.weaponChoice===id));choices.append(b);}
    box.append(choices);
  }
}
function renderForestStatus(){
  const box=$('#status');
  const revealed=forestFinished()&&pendingPlacements.size===0;
  box.replaceChildren();box.classList.toggle('success',revealed);
  if(revealed){
    $('.speech').hidden=false;
    box.append(el('p','','Все находки собраны! Теперь вернёмся к камину. Посмотрим, какие тайны скрывают его фигурные детали'));
    box.append(button('Раскрыть тайну камина',()=>{
      state.screen='complete';save();setScreen('complete');focusHeading('#complete h2');
    },'primary'));
  }else if(!sceneArtifacts().some(a=>has(a.id))){
    box.append(el('p','','Вот так лес! Кто-то рычит, кто-то каркает, а кто-то поёт. Найдём всех и узнаем, кто нам встретился'));
  }else{
    box.append(el('p','','Загляни за деревья и присмотрись к краям леса.'));
  }
}
function openCard(id){
  if($('#card').open)return;
  const a=artifacts.find(a=>a.id===id);activeCard=id;
  if(!a||(!has(id)&&a.scene!==scene))return;
  const secondBerry=!has(id)&&id.startsWith('raspberry')&&has(id==='raspberry_1'?'raspberry_2':'raspberry_1');
  const first=!has(id);returnFocus=root.activeElement;
  if(first){
    const before=new Set(sceneArtifacts().filter(a=>placementReady(a.id)).map(a=>a.id));
    state.foundIds.push(id);save();
    for(const a of sceneArtifacts())if(placementReady(a.id)&&!before.has(a.id))pendingPlacements.add(a.id);
  }
  if(hintId===id)hintId=null;
  // Remember the triggering ID: rendering can replace the original scene/collection element.
  render();
  $('#card-title').textContent=a.title;$('#description').textContent=secondBerry?'Обе малины найдены!':a.description;$('#card-image').src=url(config.items[id].cardImage);$('#card-image').alt=a.title;
  $('#card-image').classList.toggle('mini',config.items[id].cardScale===0.2);
  const reading=a.moreReading;const available=reading&&['customer_supplied','approved'].includes(reading.status);
  $('#read-more').hidden=!available||secondBerry;$('#read-more').textContent='Читать ещё';$('#read-more').setAttribute('aria-expanded','false');$('#reading').hidden=true;
  if(available){$('#reading-title').textContent=reading.title;$('#excerpt').textContent=reading.excerpt;$('#source-label').textContent='Источник: '+reading.sourceLabel;$('#source').href=reading.sourceUrl;}
  $('#equip').hidden=!a.actionLabel||worn(id)||a.scene!==scene||state.weaponChoice===id;$('#equip').textContent=weapons.includes(id)?'Выбрать: '+a.title:a.actionLabel||'';
  $('#card-note').textContent=id==='tugarin'&&first?'Тугарин Змей! Запомним, кого встретили. Возможно, мы ещё увидимся':cardNote(id);
  $('#card .dialog-body').scrollTop=0;$('#card').showModal();playSound(id);
}
function cardNote(id){
  if(artifacts.find(a=>a.id===id)?.scene==='forest')return pendingPlacements.has(id)&&id!=='oak'?'✓ Найдено! Закрой карточку, чтобы увидеть находку в лесу.':'✓ Найдено!';
  if(pendingPlacements.has(id)&&!weapons.includes(id))return '✓ Найдено! После закрытия карточки предмет займёт своё место.';
  if(weapons.includes(id)){
    if(state.weaponChoice===id)return '✓ Это оружие выбрано для похода.';
    return scene==='glade'?'Выбери одно оружие в руки богатырю. Остальные находки останутся в Сокровищнице.':'Сменить оружие можно на Поляне.';
  }
  if(id==='shield')return worn(id)?'✓ Щит взят.':'Щит можно взять независимо от выбранного оружия.';
  if(id==='horse')return has('rein')?'✓ Конь стоит за богатырём. Повод найден, конь готов к дороге.':'✓ Конь теперь стоит за богатырём. Осталось найти повод.';
  if(id==='rein')return has('horse')?'✓ Повод надет на коня. Конь готов к дороге.':'✓ Повод найден. Найди коня, чтобы надеть на него повод.';
  if(artifacts.find(a=>a.id===id)?.scene==='glade')return '✓ Найдено! Предмет перемещён на своё место на поляне.';
  if(worn(id))return id==='belt'&&worn('chainmail')?'✓ Кушак надет под кольчугу. Он скрыт доспехом, но уже на богатыре.':'✓ Уже надето на богатыря.';
  if(id==='belt')return worn('chainmail')?'Кольчуга уже на богатыре. Он приподнимет её и подвяжет кушак снизу — снимать доспех не придётся. Кушак будет скрыт под кольчугой.':'Подвяжем кушак под кольчугу. Когда наденем доспех, он скроется под ним.';
  if(id==='chainmail'&&worn('belt'))return 'Кушак останется под кольчугой. Находка не потеряется, даже если её не видно.';
  if(id==='gusli')return '✓ Найдено! Гусли теперь стоят на лавке.';
  if(id==='cup')return '✓ Найдено! Кубок теперь стоит на полочке.';
  return 'Вещь уже найдена. Надень её сейчас или вернись к ней позже через Сокровищницу.';
}
function equipActive(){
  if(!activeCard||!has(activeCard)||artifacts.find(a=>a.id===activeCard)?.scene!==scene)return;
  if(weapons.includes(activeCard)){
    if(state.weaponChoice===activeCard)return;
    pendingPlacements.delete(activeCard);state.weaponChoice=activeCard;save();render();playSound('success');$('#equip').hidden=true;$('#card-note').textContent=cardNote(activeCard);$('#card-close').focus();return;
  }
  if(worn(activeCard)||![...equipment,'shield'].includes(activeCard))return;
  state.equippedIds.push(activeCard);save();render();
  playSound('success');
  $('#equip').hidden=true;$('#card-note').textContent=cardNote(activeCard);$('#live').textContent=artifacts.find(a=>a.id===activeCard).title+': надето';
  $('#card-close').focus();
}
function showHint(){
  const next=sceneArtifacts().find(a=>!has(a.id));
  if(!next){const missing=(scene==='izba'?equipment:['shield']).find(id=>!worn(id));if(missing)openCard(missing);else if(scene==='glade'&&!state.weaponChoice)openCard(weapons.find(has));else{$('.speech').hidden=false;renderStatus();}return;}
  hintId=next.id;renderHits();if(innerWidth<=700&&scale<.5){zoom='detail';resizeScene();}revealItem(next.id);
  $('#live').textContent='Подсказка: одна находка выделена светлой обводкой.';
}
function revealItem(id){
  if(placed(id)&&!sceneSprites(id).length)return;
  const areas=itemAreas(id);
  const p=areas.flat(),xs=p.map(t=>t[0]),ys=p.map(t=>t[1]);
  const x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;
  const v=$('#viewport'),stage=$('#stage');v.scrollLeft=stage.offsetLeft+x*scale-v.clientWidth/2;v.scrollTop=stage.offsetTop+y*scale-v.clientHeight/2;
}
function resizeScene(center=false){
  const v=$('#viewport');if(!v||$('#game').hidden||v.clientWidth===0)return;
  const top=v.getBoundingClientRect().top+scrollY;
  v.style.height=Math.max(220,innerHeight-top-12)+'px';
  const old=scale;
  const fit=Math.min(v.clientWidth/1600,v.clientHeight/1200);
  const width=zoom==='custom'?Math.max(fit,customScale)*1600:zoom==='fit'?fit*1600:Math.max(fit*1600,config.mobileDetailWidth)*(zoom==='large'?1.5:1);
  scale=width/1600;$('#stage').style.width=width+'px';$('#stage').style.height=width*.75+'px';
  const zoomButton=$('#zoom-toggle');
  zoomButton.innerHTML=`<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M6.5 10h7"/>${zoom==='fit'?'<path d="M10 6.5v7"/>':''}</svg><span>${zoom==='fit'?'Крупнее':'Показать целиком'}</span>`;
  if(center){v.scrollLeft=0;v.scrollTop=0;}else if(old!==scale){v.scrollLeft*=scale/old;v.scrollTop*=scale/old;}
}
function renderComplete(){
  $('#complete h2').textContent='Лес пройден';
  $('#complete > p').textContent='В Сокровищнице все 27 находок из Избы, Поляны и Леса.';
  $('#complete .muted').textContent='Камин-пазл появится в следующей сборке.';$('#back').textContent='Вернуться в лес';
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1200;const ctx=canvas.getContext('2d');
  const cfg={...scenes.forest,items:allItems};
  const layers=sceneLayers(cfg,'forest').sort((a,b)=>(a.z||0)-(b.z||0));
  for(const s of layers){ctx.save();ctx.translate(s.x+s.width/2,s.y+s.height/2);ctx.rotate((s.rotation||0)*Math.PI/180);ctx.drawImage(images.get(s.image).image,-s.width/2,-s.height/2,s.width,s.height);ctx.restore();}
  $('#complete-hero').src=canvas.toDataURL();
}
async function load(){
  try{
    const entries=await Promise.all(Object.keys(sceneLabels).map(async id=>{
      const responses=await Promise.all(['config','content'].map(folder=>fetch(url(folder+'/'+id+'.json'),{cache:'no-cache'})));
      if(responses.some(r=>!r.ok))throw Error('Не удалось загрузить данные сцены «'+sceneLabels[id].title+'».');
      const [cfg,content]=await Promise.all(responses.map(r=>r.json()));
      return {id,cfg,content};
    }));
    scenes=Object.fromEntries(entries.map(({id,cfg})=>[id,cfg]));
    allItems=Object.assign({},...entries.map(({cfg})=>cfg.items));
    artifacts=entries.flatMap(({id,content})=>content.map(a=>({...a,scene:id})));
    config={...scenes.izba,items:allItems,effects:scenes.izba.effects};
    prepareSounds();
    if(artifacts.length!==27||artifacts.some(a=>!config.items[a.id]))throw Error('Неполный комплект данных.');
    const paths=new Set([...Object.values(scenes).flatMap(c=>[c.background.image,...c.layers.map(s=>s.image),...(c.loadout||[]).map(s=>s.image)]),...Object.values(config.items).flatMap(a=>[a.cardImage,...(a.treasuryImage?[a.treasuryImage]:[]),...(a.placed||[]).map(s=>s.image),...a.hidden.map(s=>s.image),...a.worn.map(s=>s.image)])]);
    await Promise.all([...paths].map(path=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;const alpha=new Uint8Array(c.width*c.height);for(let i=0;i<alpha.length;i++)alpha[i]=data[i*4+3];images.set(path,{image,width:c.width,height:c.height,alpha});resolve();};
      image.onerror=()=>reject(Error('Не удалось загрузить изображение '+path));image.src=url(path);
    })));
    await Promise.all([['Lora','Lora.ttf','400 600'],['Golos Text','GolosText.ttf','400 900']].map(async([family,file,weight])=>{
      const face=new FontFace(family,`url("${url('assets/fonts/'+file)}")`,{weight});await face.load();document.fonts.add(face);
    }));
    const saved=readSave();state=saved||fresh();buildShell(saved);setScreen('start');
  }catch(error){mount.className='error';mount.replaceChildren(el('h2','','Не удалось открыть избу'),el('p','','Проверь подключение и наличие файлов игры. Затем попробуй ещё раз.'),el('small','',error.message),button('Повторить',()=>location.reload(),'primary'));}
}
load();
