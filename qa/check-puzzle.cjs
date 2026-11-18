const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {traceAudio}=require('./audio-probe.cjs');
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const key='bogatyr-game:izba:v1';
const artifacts=['izba','glade','forest'].flatMap(id=>JSON.parse(fs.readFileSync('dist/content/'+id+'.json')));
const {pieces,width:boardWidth,height:boardHeight}=JSON.parse(fs.readFileSync('dist/config/puzzle.json'));
const appUrl='http://127.0.0.1:4204/games/bogatyr/';

async function run(browser,width,touch){
  const page=await browser.newPage({viewport:{width,height:touch?850:800},hasTouch:touch,isMobile:touch});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  await traceAudio(page);
  await page.goto(appUrl);
  await page.getByRole('button',{name:'Начать поход',exact:true}).waitFor();
  const save={schemaVersion:3,screen:touch?'complete':'forest',foundIds:artifacts.map(a=>a.id),
    equippedIds:['chainmail','helmet','belt','ring','boots','shield'],weaponChoice:'sword',soundEnabled:true};
  await page.evaluate(({key,save})=>localStorage.setItem(key,JSON.stringify(save)),{key,save});
  await page.reload();
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  if(!touch)await page.getByRole('button',{name:'Раскрыть тайну камина',exact:true}).click();
  await page.getByRole('heading',{name:'Камин-пазл',exact:true}).waitFor();
  const count=()=>page.locator('#count').innerText();
  const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const stage=page.locator('#stage');
  const assertCount=async value=>assert.equal(await count(),`Найдено на камине: ${value} из 26`);
  const choose=async id=>{
    const choice=page.locator(`#puzzle-list [data-choose="${id}"]`);
    if(touch)await choice.tap();
    else await choice.click();
  };
  const clickPoint=async (x,y)=>{
    const r=await stage.boundingBox();
    const px=r.x+x*r.width/boardWidth,py=r.y+y*r.height/boardHeight;
    if(touch)await page.touchscreen.tap(px,py);
    else await page.mouse.click(px,py);
  };
  const piece=async id=>clickPoint(...pieces['piece_'+id].anchor);
  const region=await stage.boundingBox(),viewport=await page.locator('#viewport').boundingBox();
  assert.ok(region.width<=viewport.width&&region.height<=viewport.height);
  assert.match(await page.locator('.task').innerText(),/в Сокровищнице/);
  assert.equal(await page.locator('.puzzle-piece').count(),26);
  assert.equal(await page.locator('#puzzle-list [data-choose]').count(),27);
  const tray=await page.locator('#puzzle-side').boundingBox();
  assert.ok(tray);
  await page.screenshot({path:`qa/puzzle-start-${width}.png`});
  if(touch){
    assert.ok(region.y-viewport.y<4&&tray.y>=viewport.y+viewport.height);
    assert.ok(tray.y+tray.height<=850);
    assert.equal(await page.locator('#treasury-toggle').isVisible(),false);
    const strip=page.locator('#puzzle-list');
    assert.ok(await strip.evaluate(list=>list.scrollWidth>list.clientWidth));
    await strip.evaluate(list=>list.addEventListener('scrollend',()=>{list.dataset.swipeDone='true';},{once:true}));
    const r=await strip.boundingBox(),x=r.x+r.width-25,y=r.y+35;
    const device=await page.context().newCDPSession(page);
    await device.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(const distance of [35,75,120])await device.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-distance,y}]});
    await device.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>{
      const list=document.querySelector('#bogatyr-game').shadowRoot.querySelector('#puzzle-list');
      return list.dataset.swipeDone==='true'&&list.scrollLeft>20;
    });
    await device.detach();
    assert.equal(await page.locator('#puzzle-selection').isVisible(),false);
  }else{
    assert.ok(tray.x>=viewport.x+viewport.width);
    assert.equal(await page.locator('#treasury-toggle').isVisible(),true);
  }
  await assertCount(0);
  await piece('sirin');
  assert.equal(await page.locator('#puzzle-feedback').innerText(),'Сначала выбери находку в Сокровищнице.');
  await choose('wolf');
  for(const point of [[550,220],[412,528],[685,528]]){
    await clickPoint(...point);
    assert.equal(await page.locator('#puzzle-feedback').innerText(),'');
    assert.match(await page.locator('#puzzle-selection').innerText(),/Волк/);
  }
  await piece('sirin');
  assert.match(await page.locator('#puzzle-feedback').innerText(),/попробуй/);
  assert.match(await page.locator('#puzzle-selection').innerText(),/Волк/);
  assert.deepEqual(await page.evaluate(()=>window.played),[]);
  await piece('wolf');
  await assertCount(1);
  await page.waitForFunction(()=>window.played[0]?.endsWith('166.wav'));
  await page.locator('#sound').click();
  await page.waitForFunction(()=>window.playing.size===0);
  await choose('tugarin');
  assert.match(await page.locator('#puzzle-feedback').innerText(),/Оставим её напоследок/);
  assert.equal(await page.locator('#puzzle-selection').isVisible(),false);
  await choose('raspberry_1');
  await piece('raspberry_2');
  await assertCount(2);
  await choose('raspberry_2');
  await piece('raspberry_2');
  await assertCount(2);
  assert.match(await page.locator('#puzzle-feedback').innerText(),/уже найдена/);
  await piece('raspberry_1');
  await assertCount(3);
  assert.equal((await state()).matches.raspberry_1,'piece_raspberry_2');
  await page.reload();
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await assertCount(3);
  await choose('ring');
  await page.locator('#puzzle-list [data-inspect="ring"]').click();
  await page.locator('#card').waitFor();
  assert.equal(await page.locator('#card-title').innerText(),'Перстень');
  assert.equal(await page.locator('#equip').isVisible(),false);
  await page.locator('#read-more').click();
  await page.locator('#excerpt').waitFor();
  await page.locator('#card-close').click();
  assert.equal(await page.locator('#puzzle-side').isVisible(),true);
  assert.equal(await page.locator('#treasury').isVisible(),false);
  assert.match(await page.locator('#puzzle-selection').innerText(),/Перстень/);
  await page.locator('#hint').click();
  await page.locator('[data-piece="piece_ring"].hinted').waitFor();
  await assertCount(3);
  await piece('ring');
  await assertCount(4);
  if((await page.locator('#zoom-toggle').innerText()).includes('Показать целиком'))await page.locator('#zoom-toggle').click();
  if(touch){
    const r=await stage.boundingBox(),x=width/2,y=r.y+r.height/2;
    const device=await page.context().newCDPSession(page);
    await device.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});
    await device.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-75,y,id:1},{x:x+75,y,id:2}]});
    await device.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok((await stage.boundingBox()).width>r.width*2);
    await assertCount(4);
    await page.locator('#zoom-toggle').click();
    await device.detach();
    await page.waitForTimeout(450);
  }
  const solved=new Set(Object.keys((await state()).matches));
  for(const {artifact:id} of Object.values(pieces)){
    if(solved.has(id))continue;
    await choose(id);
    if(!touch&&id==='helmet')await page.locator('[data-piece="piece_helmet"]').press('Enter');
    else await piece(id);
    solved.add(id);
    await assertCount(solved.size);
  }
  assert.equal(await page.locator('.puzzle-piece.matched').count(),26);
  assert.match(await page.locator('#puzzle-feedback').innerText(),/один персонаж остался/);
  await choose('tugarin');
  assert.match(await page.locator('#puzzle-feedback').innerText(),/У Тугарина нет своего места/);
  assert.equal((await state()).puzzleRevealed,true);
  assert.equal((await state()).matches.tugarin,undefined);
  await page.screenshot({path:`qa/puzzle-complete-${width}.png`});
  await page.locator('#menu').click();
  await page.locator('#menu-forest').click();
  await page.getByRole('button',{name:'Раскрыть тайну камина',exact:true}).click();
  await assertCount(26);
  assert.match(await page.locator('#puzzle-feedback').innerText(),/У Тугарина нет своего места/);
  await page.locator('#menu').click();
  await page.locator('#restart').click();
  await page.locator('#confirm-reset').click();
  assert.deepEqual((await state()).matches,{});
  assert.equal((await state()).soundEnabled,false);
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS',width,'26 matches, decorations, cards, hints, zoom, reload, reveal, reset');
}

(async()=>{
  let server,browser;
  try{
    server=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4204'},windowsHide:true});
    await new Promise((resolve,reject)=>{
      server.stdout.once('data',resolve);
      server.once('error',reject);
      server.once('exit',code=>reject(Error('Server stopped '+code)));
    });
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    for(const args of [[1366,false],[390,true],[320,true]])await run(browser,...args);
  }finally{
    if(browser)await browser.close();
    if(server)server.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
