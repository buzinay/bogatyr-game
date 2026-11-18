const host = document.getElementById('bogatyr-game');
const root = host.attachShadow({mode:'open'});
const style = document.createElement('link');
style.rel = 'stylesheet'; style.href = new URL('./styles.css?v=fireplace-2', import.meta.url).href;
root.append(style);
const mount = document.createElement('div');
mount.className='loading'; mount.textContent='Загружаем игру…'; root.append(mount);
const KEY='bogatyr-game:izba:v1';
const BUILD='fireplace-1';
const sceneLabels={
  izba:{title:'Изба',task:'Найди 7 предметов и одень богатыря',resume:'Вернуться в избу',menu:'Ищем семь предметов в избе. Найденные вещи ждут в Сокровищнице.'},
  glade:{title:'Поляна',task:'Найди 11 объектов. Не забудь обе малины!',resume:'Вернуться на поляну',menu:'Ищем одиннадцать объектов на поляне. Найди все четыре вида оружия и выбери одно.'},
  forest:{title:'Лес',task:'Найди 9 объектов',resume:'Вернуться в лес',menu:'Ищем девять находок в лесу. Всё найденное можно рассмотреть в Сокровищнице.'}
};
const NS='http://www.w3.org/2000/svg';
const equipment=['chainmail','helmet','belt','ring','boots'];
const weapons=['sabre','sword','mace','spear'];
let scenes,allItems,scene='izba';
let puzzle,selectedArtifact=null,hintedPiece=null,puzzleFeedback='',inspectFromPuzzle=false;
let config, artifacts, state, storageOK=true, saveNotice='', audio=null, activeCard=null;
const AudioEngine=window.AudioContext||window.webkitAudioContext;
let soundContext=null;
const soundDownloads=new Map(),soundBuffers=new Map();
const pendingPlacements=new Set();
let hintId=null, zoom='fit', scale=1, returnFocus=null, drag=null, suppressClick=false;
let gesture=null, customScale=null, touchClickTimer=null;
const images = new Map();
const $=s=>root.querySelector(s);
const el=(tag,cls,text)=>{const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n;};
const url=path=>{const u=new URL(path,import.meta.url);u.searchParams.set('v',BUILD);return u.href;};
const fresh=()=>({schemaVersion:4,foundIds:[],equippedIds:[],screen:'izba',soundEnabled:true,weaponChoice:null,matches:{},puzzleRevealed:false});
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
const puzzleReady=()=>gladeFinished()&&forestFinished();
const inPuzzle=()=>state.screen==='puzzle';
const canvasSize=()=>inPuzzle()?puzzle:config.canvas;
const fitScale=v=>Math.min(v.clientWidth/canvasSize().width,v.clientHeight/canvasSize().height);
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
function enterPuzzle(){
  if(!puzzleReady())return;
  state.screen='puzzle';
  selectedArtifact=hintedPiece=null;puzzleFeedback='';
  zoom='fit';customScale=null;gesture=null;drag=null;
  save();setScreen('game');focusHeading('#scene-title');
}
function readSave(){
  try{
    const raw=localStorage.getItem(KEY); if(!raw)return null;
    const data=JSON.parse(raw), ids=artifacts.map(a=>a.id);
    if(![1,2,3,4].includes(data.schemaVersion)||!Array.isArray(data.foundIds)||!Array.isArray(data.equippedIds)||
      new Set(data.foundIds).size!==data.foundIds.length||new Set(data.equippedIds).size!==data.equippedIds.length||
      data.foundIds.some(id=>!ids.includes(id))||data.equippedIds.some(id=>![...equipment,'shield'].includes(id)||!data.foundIds.includes(id))||
      !['izba','glade','forest','complete','puzzle'].includes(data.screen)||typeof data.soundEnabled!=='boolean')throw Error('invalid');
    if(data.schemaVersion===1){data.screen='izba';data.weaponChoice=null;}
    if(data.weaponChoice!==null&&(!weapons.includes(data.weaponChoice)||!data.foundIds.includes(data.weaponChoice)))throw Error('invalid');
    const izbaIDs=artifacts.filter(a=>a.scene==='izba').map(a=>a.id);
    const ready=izbaIDs.every(id=>data.foundIds.includes(id))&&equipment.every(id=>data.equippedIds.includes(id));
    if((data.screen!=='izba'||data.foundIds.some(id=>!izbaIDs.includes(id)))&&!ready)throw Error('invalid');
    const gladeReady=artifacts.filter(a=>a.scene==='glade').every(a=>data.foundIds.includes(a.id))&&data.equippedIds.includes('shield')&&Boolean(data.weaponChoice);
    const forestIds=artifacts.filter(a=>a.scene==='forest').map(a=>a.id);
    if((['forest','complete','puzzle'].includes(data.screen)||forestIds.some(id=>data.foundIds.includes(id)))&&!gladeReady)throw Error('invalid');
    if(data.schemaVersion===2&&data.screen==='complete')data.screen='forest';
    if(data.schemaVersion===3&&data.screen==='complete')data.screen='puzzle';
    if(data.screen==='complete'||(data.screen==='puzzle'&&!forestIds.every(id=>data.foundIds.includes(id))))throw Error('invalid');
    const matches=data.schemaVersion===4?data.matches:{};
    if(!matches||typeof matches!=='object'||Array.isArray(matches))throw Error('invalid');
    const matched=Object.entries(matches);
    if((matched.length&&!forestIds.every(id=>data.foundIds.includes(id)))||
       new Set(Object.values(matches)).size!==matched.length||
       matched.some(([id,piece])=>!data.foundIds.includes(id)||!matchesPiece(id,piece)))throw Error('invalid');
    if(data.puzzleRevealed&&matched.length!==Object.keys(puzzle.pieces).length)throw Error('invalid');
    return {...fresh(),foundIds:data.foundIds,equippedIds:data.equippedIds,screen:data.screen,
      soundEnabled:data.soundEnabled,weaponChoice:data.weaponChoice,matches,puzzleRevealed:data.puzzleRevealed===true};
  }catch(error){
    if(error.message==='invalid'||error instanceof SyntaxError)saveNotice='Сохранение не удалось прочитать. Можно начать новый поход.';
    else {storageOK=false;saveNotice='Браузер не разрешил сохранение. Можно играть до закрытия страницы.';}
    return null;
  }
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageOK=false;updateStorageNotice();}}
function updateStorageNotice(){const n=$('#storage-note'); if(n){n.hidden=storageOK;n.textContent='Прогресс хранится только до закрытия страницы: браузер запретил сохранение.';}}
const soundItem=id=>allItems[id]||scenes.izba.effects?.[id];
function stopAudio(){
  const playback=audio;
  audio=null;
  playback?.stop?.();
}
function soundBytes(id){
  if(!soundDownloads.has(id)){
    const download=fetch(url(soundItem(id).sound)).then(response=>{
      if(!response.ok)throw Error('Audio unavailable');
      return response.arrayBuffer();
    });
    soundDownloads.set(id,download);
    download.catch(()=>soundDownloads.delete(id));
  }
  return soundDownloads.get(id);
}
function soundBuffer(id){
  if(!soundBuffers.has(id)){
    const decoded=soundBytes(id).then(bytes=>soundContext.decodeAudioData(bytes.slice(0)));
    soundBuffers.set(id,decoded);
    decoded.catch(()=>soundBuffers.delete(id));
  }
  return soundBuffers.get(id);
}
function awakenSound(){
  try{
    soundContext||=AudioEngine?new AudioEngine():null;
    if(soundContext)return soundContext.state==='running'?Promise.resolve():soundContext.resume();
  }catch{}
  return null;
}
function prepareSounds(screen,unlock=false){
  if(!state.soundEnabled||!AudioEngine)return;
  if(unlock)awakenSound()?.catch(()=>{});
  const ids=['success',...artifacts.filter(a=>a.scene===screen).map(a=>a.id)];
  for(const id of ids){
    if(soundItem(id)?.sound)(soundContext?soundBuffer(id):soundBytes(id)).catch(()=>{});
  }
}
function playMediaSound(item,playback){
  if(audio!==playback)return;
  const clip=new Audio(url(item.sound));clip.volume=item.volume??1;
  let timer;
  playback.stop=()=>{clearTimeout(timer);clip.pause();};
  clip.addEventListener('playing',()=>{timer=setTimeout(()=>{if(audio===playback)stopAudio();},2000);},{once:true});
  clip.addEventListener('ended',()=>{if(audio===playback)stopAudio();},{once:true});
  clip.play().catch(()=>{if(audio===playback)stopAudio();});
}
function playSound(id){
  stopAudio();
  const item=soundItem(id);
  if(!item?.sound||!state.soundEnabled)return;
  const playback={id,stop:null};
  audio=playback;
  // Resume on the tap itself so a slow download cannot lose browser activation.
  const running=awakenSound();
  if(!running){playMediaSound(item,playback);return;}
  Promise.all([running,soundBuffer(id)]).then(([,buffer])=>{
    if(audio!==playback)return;
    const source=soundContext.createBufferSource(),gain=soundContext.createGain();
    source.buffer=buffer;gain.gain.value=item.volume??1;
    source.connect(gain).connect(soundContext.destination);
    source.onended=()=>{
      source.disconnect();gain.disconnect();
      if(audio===playback)audio=null;
    };
    source.start(0,0,Math.min(2,buffer.duration));
    playback.stop=()=>source.stop();
  }).catch(()=>playMediaSound(item,playback));
}
function svgEl(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
function setScreen(name){
  stopAudio(); hintId=null;
  for(const id of ['start','game'])$('#'+id).hidden=id!==name;
  if(name==='game'){
    prepareSounds(state.screen,true);
    if(inPuzzle())renderPuzzle();else render();
    resizeScene(true);
  }
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
      <div id="puzzle-message" class="puzzle-message" hidden><strong id="puzzle-selection"></strong><p id="puzzle-feedback" role="status"></p></div>
      <div class="game-layout"><div class="field"><div class="viewport" id="viewport" tabindex="0" aria-label="Игровое поле"><div class="surface"><div class="stage" id="stage"><div id="sprites"></div><svg class="hits" viewBox="0 0 1600 1200" id="hits" role="group" aria-label="Предметы в избе"></svg></div></div></div>
      <div class="speech"><button id="speech-close" aria-label="Скрыть реплику">×</button><div class="status" id="status" aria-live="polite"></div></div></div>
      <aside id="puzzle-side" class="puzzle-side" aria-labelledby="puzzle-treasury-title" hidden><div class="puzzle-side-heading"><h3 id="puzzle-treasury-title">Сокровищница</h3><small class="puzzle-swipe-note">Листай вбок</small></div><div id="puzzle-list" class="puzzle-list"></div></aside></div>
    </section>
    <div class="sr-only" id="live" aria-live="polite"></div>
    <dialog id="treasury" aria-labelledby="treasury-title"><header class="dialog-head"><h2 id="treasury-title">Сокровищница</h2><button class="close" id="treasury-close" aria-label="Закрыть Сокровищницу">×</button></header><div class="dialog-body"><p>Нажми на найденный артефакт, чтобы открыть карточку.</p><div class="treasury-grid" id="treasury-grid"></div></div></dialog>
    <dialog id="card" aria-labelledby="card-title"><header class="dialog-head"><h2 id="card-title"></h2><button class="close" id="card-x" aria-label="Закрыть карточку">×</button></header><div class="dialog-body"><img class="card-picture" id="card-image" alt=""><p id="description"></p><button id="read-more" aria-expanded="false" aria-controls="reading">Читать ещё</button><div class="reading" id="reading" hidden><h3 id="reading-title"></h3><blockquote id="excerpt"></blockquote><small id="source-label"></small><br><a id="source" target="_blank" rel="noopener noreferrer">Открыть источник ↗</a></div><p class="card-note" id="card-note"></p></div><footer class="dialog-foot"><button id="equip" class="primary"></button><button id="card-close">Закрыть</button></footer></dialog>
    <dialog id="menu-dialog" aria-labelledby="menu-title"><header class="dialog-head"><h2 id="menu-title">Меню похода</h2><button class="close" id="menu-x" aria-label="Закрыть меню">×</button></header><div class="dialog-body menu-actions"><p>Ищем семь предметов в избе. Найденные вещи ждут в Сокровищнице.</p><button id="resume">Вернуться в избу</button><button id="restart">Начать заново</button><small>Прогресс сохраняется в этом браузере. На другом устройстве он не появится.</small></div></dialog>
    <dialog id="reset-dialog" aria-labelledby="reset-title"><header class="dialog-head"><h2 id="reset-title">Начать новый поход?</h2></header><div class="dialog-body"><p>Находки, снаряжение и найденные детали камина будут сброшены.</p></div><footer class="dialog-foot"><button id="cancel-reset">Остаться в игре</button><button id="confirm-reset" class="primary">Да, начать заново</button></footer></dialog>`;
  $('.intro-art .room').src=url(config.background.image);$('.intro-art .hero').src=url(config.layers.find(s=>s.image.includes('hero-base')).image);
  $('.no-audio').textContent='Изба, Поляна и Лес · 27 находок';
  $('#start-actions').append(button('Начать поход',()=>{if(saved){askReset();}else{state=fresh();enterScene('izba');}},'primary'));
  if(saved)$('#start-actions').prepend(button('Продолжить',()=>{if(inPuzzle())enterPuzzle();else enterScene(state.screen);},'primary'));
  if(saveNotice){$('#save-message').hidden=false;$('#save-message').textContent=saveNotice;}
  updateStorageNotice();
  const hasAudio=Object.values(config.items).some(item=>Boolean(item.sound));
  $('#sound').disabled=!hasAudio;
  if(hasAudio){$('#sound').title='Включить или выключить звуковые эффекты';$('#sound').textContent=state.soundEnabled?'Звук: вкл.':'Звук: выкл.';}
  $('#sound').onclick=()=>{
    state.soundEnabled=!state.soundEnabled;stopAudio();save();
    if(state.soundEnabled)prepareSounds(state.screen,true);
    $('#sound').textContent=state.soundEnabled?'Звук: вкл.':'Звук: выкл.';
  };
  $('#treasury-toggle').onclick=()=>openDialog($('#treasury'));
  $('#treasury-close').onclick=()=>closeDialog($('#treasury'));
  $('#speech-close').onclick=()=>{$('.speech').hidden=true;};
  $('#speech-toggle').onclick=()=>{$('.speech').hidden=!$('.speech').hidden;};

  $('#hint').onclick=()=>inPuzzle()?showPuzzleHint():showHint();
  $('#zoom-toggle').onclick=()=>{customScale=null;zoom=zoom==='fit'?'large':'fit';resizeScene(true);};
  $('#menu').onclick=()=>openDialog($('#menu-dialog'));
  for(const id of ['menu-x','resume'])$('#'+id).onclick=()=>closeDialog($('#menu-dialog'));
  $('#restart').onclick=()=>{$('#menu-dialog').close();askReset();};
  $('#cancel-reset').onclick=()=>closeDialog($('#reset-dialog'));
  $('#confirm-reset').onclick=()=>{
    const sound=state.soundEnabled;state=fresh();state.soundEnabled=sound;save();$('#reset-dialog').close();if($('#treasury').open)$('#treasury').close();enterScene('izba');
  };
  const nav=el('div','menu-actions');
  nav.append(button('Изба',()=>{$('#menu-dialog').close();enterScene('izba');}));
  const gladeNav=button('Поляна',()=>{$('#menu-dialog').close();enterScene('glade');});gladeNav.id='menu-glade';nav.append(gladeNav);
  const forestNav=button('Лес',()=>{$('#menu-dialog').close();enterScene('forest');});
  forestNav.id='menu-forest';nav.append(forestNav);
  const puzzleNav=button('Камин',()=>{$('#menu-dialog').close();enterPuzzle();});
  puzzleNav.id='menu-puzzle';nav.append(puzzleNav);
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
        if(inspectFromPuzzle){
          inspectFromPuzzle=false;
          openDialog($('#treasury'));
          return;
        }
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
      const fit=fitScale(v);
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
  $('#puzzle-message').hidden=$('#puzzle-side').hidden=$('#puzzle-list').hidden=true;
  $('#speech-toggle').hidden=false;
  $('#hint').disabled=false;
  $('#hits').setAttribute('viewBox','0 0 '+config.canvas.width+' '+config.canvas.height);
  $('#scene-title').textContent=labels.title;
  $('#game').setAttribute('aria-label','Сцена '+$('#scene-title').textContent);
  $('#viewport').setAttribute('aria-label',$('#scene-title').textContent+'. Увеличивай и перемещай сцену, чтобы осмотреть её целиком');
  $('.task').textContent=labels.task;
  $('#hits').setAttribute('aria-label','Находки · '+labels.title);
  $('#count').textContent=`Найдено: ${current.filter(a=>has(a.id)).length}/${current.length}`;
  $('#treasury-toggle').textContent=`Сокровищница · ${state.foundIds.length}`;
  $('#menu-glade').disabled=!izbaFinished();
  $('#menu-forest').disabled=!gladeFinished();
  $('#menu-puzzle').disabled=!puzzleReady();
  $('#treasury .dialog-body > p').textContent='Нажми на найденный артефакт, чтобы открыть карточку.';
  $('#treasury-grid').classList.remove('puzzle-list');
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
    path.addEventListener('pointerenter',e=>{light(true);if(e.pointerType==='mouse'&&!drag&&!$('#card').open&&audio?.id!=='success')playSound(a.id);});
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
function matchesPiece(artifactId,pieceId){
  const piece=puzzle.pieces[pieceId];
  return Boolean(piece?.artifact&&(piece.artifact===artifactId||
    (piece.artifact.startsWith('raspberry_')&&artifactId.startsWith('raspberry_'))));
}
const puzzleComplete=()=>Object.keys(state.matches).length===Object.keys(puzzle.pieces).length;
function renderPuzzle(){
  $('#game').dataset.scene='puzzle';
  $('#scene-title').textContent='Камин-пазл';
  $('#game').setAttribute('aria-label','Камин-пазл');
  $('.task').textContent='Выбери находку в Сокровищнице, а затем найди такую фигурную деталь на камине';
  $('#viewport').setAttribute('aria-label','Камин. Поле можно увеличивать и перемещать');
  $('#menu-dialog .dialog-body > p').textContent='Сопоставь находки с фигурными деталями камина.';
  $('#resume').textContent='Вернуться к камину';
  for(const id of ['glade','forest','puzzle'])$('#menu-'+id).disabled=false;
  $('.speech').hidden=$('#speech-toggle').hidden=true;
  $('#puzzle-message').hidden=$('#puzzle-side').hidden=$('#puzzle-list').hidden=false;
  $('#treasury .dialog-body > p').textContent='Выбери находку для сопоставления или открой её карточку.';
  const overlay=$('#hits');
  overlay.setAttribute('viewBox',`0 0 ${puzzle.width} ${puzzle.height}`);
  overlay.setAttribute('aria-label','Фигурные детали камина');
  overlay.replaceChildren();
  const photo=el('img','puzzle-photo');photo.src=url(puzzle.image);photo.alt='Камин Врубеля';
  const grid=el('img','puzzle-grid');grid.src=url(puzzle.grid);grid.alt='';grid.setAttribute('aria-hidden','true');
  for(const img of [photo,grid])img.draggable=false;
  $('#sprites').replaceChildren(photo,grid);
  for(const [id,piece] of Object.entries(puzzle.pieces)){
    const path=svgEl('path',{d:piece.path,role:'button',tabindex:'0','data-piece':id,class:'puzzle-piece','fill-rule':'evenodd'});
    path.addEventListener('click',()=>{if(!suppressClick)tryPuzzlePiece(id);});
    path.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();tryPuzzlePiece(id);}
    });
    path.addEventListener('focus',()=>{if(path.matches(':focus-visible'))revealPoint(...piece.anchor);});
    overlay.append(path);
    const mark=svgEl('text',{x:piece.anchor[0],y:piece.anchor[1],class:'puzzle-mark','aria-hidden':'true','data-mark':id});
    mark.textContent='✓';overlay.append(mark);
  }
  const collection=$('#treasury-grid');
  collection.classList.add('puzzle-list');
  buildPuzzleList(collection,true);
  buildPuzzleList($('#puzzle-list'),false);
  updatePuzzle();
}
function buildPuzzleList(list,modal){
  list.replaceChildren();
  for(const artifact of artifacts){
    const {id,title}=artifact;
    const row=el('div','puzzle-entry');
    const choose=button('',()=>{
      if(modal)$('#treasury').close();
      choosePuzzleArtifact(id);
    },'puzzle-choose');
    choose.dataset.choose=id;
    const thumb=el('img');thumb.alt='';thumb.src=url(allItems[id].treasuryImage||allItems[id].cardImage);
    choose.append(thumb,el('span','puzzle-name',title),el('span','puzzle-check','✓'));
    const inspect=button('О предмете',()=>{
      if(modal){
        inspectFromPuzzle=true;
        $('#treasury').close();
      }
      openCard(id);
    },'puzzle-inspect');
    inspect.dataset.inspect=id;
    inspect.setAttribute('aria-label','О предмете: '+title);
    row.append(choose,inspect);
    list.append(row);
  }
}
function updatePuzzle(){
  const count=Object.keys(state.matches).length,total=Object.keys(puzzle.pieces).length;
  $('#count').textContent=`Найдено на камине: ${count} из ${total}`;
  $('#treasury-toggle').textContent=`Сокровищница · ${state.foundIds.length}`;
  $('#hint').disabled=count===total;
  $('#puzzle-selection').hidden=!selectedArtifact;
  const selected=artifacts.find(a=>a.id===selectedArtifact);
  $('#puzzle-selection').textContent=selected?'Ищем: '+selected.title:'';
  const completion=state.puzzleRevealed
    ?'Так вот кто остался! У Тугарина нет своего места в пазле. В нашей истории он преградил дорогу — придётся вызвать его на поединок.'
    :'Все фигурные детали найдены! Но один персонаж остался! Кто это?';
  $('#puzzle-feedback').textContent=count===total?completion:puzzleFeedback;
  $('#puzzle-message').hidden=!selectedArtifact&&!$('#puzzle-feedback').textContent;
  const occupied=new Set(Object.values(state.matches));
  Object.keys(puzzle.pieces).forEach((id,index)=>{
    const matched=occupied.has(id);
    const path=$(`[data-piece="${id}"]`);
    path.classList.toggle('matched',matched);
    path.classList.toggle('hinted',id===hintedPiece);
    path.setAttribute('aria-label',`Фигурная деталь ${index+1}${matched?', найдена':''}`);
    $(`[data-mark="${id}"]`).style.visibility=matched?'visible':'hidden';
  });
  for(const choice of root.querySelectorAll('[data-choose]')){
    const id=choice.dataset.choose,matched=Boolean(state.matches[id]);
    choice.setAttribute('aria-pressed',String(id===selectedArtifact));
    choice.disabled=matched||(id==='tugarin'&&state.puzzleRevealed);
    choice.querySelector('.puzzle-check').hidden=!matched;
  }
}
function choosePuzzleArtifact(id){
  if(state.matches[id])return;
  hintedPiece=null;
  if(id==='tugarin'){
    selectedArtifact=null;
    if(puzzleComplete()){
      state.puzzleRevealed=true;save();
    }else puzzleFeedback='Для этой находки пока не видно места. Оставим её напоследок.';
  }else{
    selectedArtifact=id;
    puzzleFeedback='';
  }
  updatePuzzle();
  resizeScene();
}
function tryPuzzlePiece(id){
  if(puzzleComplete())return;
  if(!selectedArtifact)puzzleFeedback='Сначала выбери находку в Сокровищнице.';
  else if(Object.values(state.matches).includes(id))puzzleFeedback='Эта деталь уже найдена.';
  else if(!matchesPiece(selectedArtifact,id))puzzleFeedback='Присмотрись к контуру и попробуй ещё раз.';
  else {
    state.matches[selectedArtifact]=id;
    selectedArtifact=hintedPiece=null;
    puzzleFeedback='Верно! Деталь найдена.';
    save();playSound('success');
  }
  updatePuzzle();resizeScene();
}
function showPuzzleHint(){
  if(puzzleComplete())return;
  if(!selectedArtifact)selectedArtifact=artifacts.find(a=>a.id!=='tugarin'&&!state.matches[a.id]).id;
  const occupied=new Set(Object.values(state.matches));
  hintedPiece=Object.keys(puzzle.pieces).find(id=>!occupied.has(id)&&matchesPiece(selectedArtifact,id));
  puzzleFeedback='Посмотри на выделенную деталь.';
  updatePuzzle();
  if(scale<.65){zoom='detail';resizeScene();}
  if(hintedPiece)revealPoint(...puzzle.pieces[hintedPiece].anchor);
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
    box.append(button('Раскрыть тайну камина',enterPuzzle,'primary'));
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
  if(!inPuzzle())render();
  $('#card-title').textContent=a.title;$('#description').textContent=secondBerry?'Обе малины найдены!':a.description;$('#card-image').src=url(config.items[id].cardImage);$('#card-image').alt=a.title;
  $('#card-image').classList.toggle('mini',config.items[id].cardScale===0.2);
  const reading=a.moreReading;const available=reading&&['customer_supplied','approved'].includes(reading.status);
  $('#read-more').hidden=!available||secondBerry;$('#read-more').textContent='Читать ещё';$('#read-more').setAttribute('aria-expanded','false');$('#reading').hidden=true;
  if(available){$('#reading-title').textContent=reading.title;$('#excerpt').textContent=reading.excerpt;$('#source-label').textContent='Источник: '+reading.sourceLabel;$('#source').href=reading.sourceUrl;}
  $('#equip').hidden=inPuzzle()||!a.actionLabel||worn(id)||a.scene!==scene||state.weaponChoice===id;$('#equip').textContent=weapons.includes(id)?'Выбрать: '+a.title:a.actionLabel||'';
  $('#card-note').textContent=inPuzzle()?(state.matches[id]?'✓ Деталь найдена.':''):
    id==='tugarin'&&first?'Тугарин Змей! Запомним, кого встретили. Возможно, мы ещё увидимся':cardNote(id);
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
  if(inPuzzle())return;
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
  revealPoint(x,y);
}
function revealPoint(x,y){
  const v=$('#viewport'),stage=$('#stage');v.scrollLeft=stage.offsetLeft+x*scale-v.clientWidth/2;v.scrollTop=stage.offsetTop+y*scale-v.clientHeight/2;
}
function resizeScene(center=false){
  const v=$('#viewport');if(!v||$('#game').hidden||v.clientWidth===0)return;
  const top=v.getBoundingClientRect().top+scrollY,size=canvasSize();
  const side=$('#puzzle-side');
  const compact=inPuzzle()&&matchMedia('(max-width:959px)').matches;
  const height=innerHeight-top-12;
  if(compact){
    side.style.maxHeight='';
    const room=height-side.offsetHeight-8;
    const fullPicture=v.clientWidth*size.height/size.width+2;
    v.style.height=Math.max(140,zoom==='fit'?Math.min(room,fullPicture):room)+'px';
  }else{
    v.style.height=Math.max(220,height)+'px';
    if(inPuzzle())side.style.maxHeight=v.style.height;
  }
  const old=scale;
  const fit=fitScale(v);
  const detail=inPuzzle()?puzzle.width:config.mobileDetailWidth;
  const width=zoom==='custom'?Math.max(fit,customScale)*size.width:zoom==='fit'?fit*size.width:Math.max(fit*size.width,detail)*(zoom==='large'?1.5:1);
  scale=width/size.width;$('#stage').style.width=width+'px';$('#stage').style.height=scale*size.height+'px';
  const zoomButton=$('#zoom-toggle');
  zoomButton.innerHTML=`<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M6.5 10h7"/>${zoom==='fit'?'<path d="M10 6.5v7"/>':''}</svg><span>${zoom==='fit'?'Крупнее':'Показать целиком'}</span>`;
  if(center){v.scrollLeft=0;v.scrollTop=0;}else if(old!==scale){v.scrollLeft*=scale/old;v.scrollTop*=scale/old;}
}
async function load(){
  try{
    const puzzleData=fetch(url('config/puzzle.json')).then(response=>{
      if(!response.ok)throw Error('Не удалось открыть схему камина.');
      return response.json();
    });
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
    puzzle=await puzzleData;
    if(artifacts.length!==27||artifacts.some(a=>!config.items[a.id]))throw Error('Неполный комплект данных.');
    if(Object.keys(puzzle.pieces).length!==26||artifacts.some(a=>a.id!=='tugarin'&&!puzzle.pieces['piece_'+a.id]))throw Error('Не хватает фигурных деталей камина.');
    const saved=readSave();state=saved||fresh();
    prepareSounds(state.screen);
    const paths=new Set([...Object.values(scenes).flatMap(c=>[c.background.image,...c.layers.map(s=>s.image),...(c.loadout||[]).map(s=>s.image)]),...Object.values(config.items).flatMap(a=>[a.cardImage,...(a.treasuryImage?[a.treasuryImage]:[]),...(a.placed||[]).map(s=>s.image),...a.hidden.map(s=>s.image),...a.worn.map(s=>s.image)])]);
    paths.add(puzzle.image);paths.add(puzzle.grid);
    await Promise.all([...paths].map(path=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;const alpha=new Uint8Array(c.width*c.height);for(let i=0;i<alpha.length;i++)alpha[i]=data[i*4+3];images.set(path,{image,width:c.width,height:c.height,alpha});resolve();};
      image.onerror=()=>reject(Error('Не удалось загрузить изображение '+path));image.src=url(path);
    })));
    await Promise.all([['Lora','Lora.ttf','400 600'],['Golos Text','GolosText.ttf','400 900']].map(async([family,file,weight])=>{
      const face=new FontFace(family,`url("${url('assets/fonts/'+file)}")`,{weight});await face.load();document.fonts.add(face);
    }));
    buildShell(saved);setScreen('start');
  }catch(error){mount.className='error';mount.replaceChildren(el('h2','','Не удалось открыть избу'),el('p','','Проверь подключение и наличие файлов игры. Затем попробуй ещё раз.'),el('small','',error.message),button('Повторить',()=>location.reload(),'primary'));}
}
load();
