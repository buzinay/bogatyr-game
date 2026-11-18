const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ids=scene=>JSON.parse(fs.readFileSync('dist/content/'+scene+'.json')).map(a=>a.id);
const foundBefore=[...ids('izba'),...ids('glade')];
const forest=ids('forest');
const key='bogatyr-game:izba:v1';
const appUrl='http://127.0.0.1:4203/games/bogatyr/';

// Pick opaque pixels of each rendered sprite that are not behind a foreground layer.
async function targetPoint(page,id){
  return page.locator('#stage').evaluate(async (stage,id)=>{
    const rect=stage.getBoundingClientRect();
    const sprites=[...stage.querySelectorAll('.sprite')];
    await Promise.all(sprites.map(img=>img.decode()));
    const sprite=sprites.find(img=>img.dataset.artifact===id);
    const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
    ctx.canvas.width=1600;
    ctx.canvas.height=1200;
    const draw=img=>{
      const x=parseFloat(img.style.left)*16,y=parseFloat(img.style.top)*12;
      const width=parseFloat(img.style.width)*16,height=parseFloat(img.style.height)*12;
      const rotation=parseFloat(img.style.transform.slice(7))||0;
      ctx.save();ctx.translate(x+width/2,y+height/2);ctx.rotate(rotation*Math.PI/180);
      ctx.drawImage(img,-width/2,-height/2,width,height);ctx.restore();
    };
    draw(sprite);
    ctx.globalCompositeOperation='destination-out';
    for(const front of sprites){
      if(+front.style.zIndex>+sprite.style.zIndex)draw(front);
    }
    const pixels=ctx.getImageData(0,0,1600,1200).data;
    const path=stage.querySelector('[data-id="'+id+'"]');
    const box=path.getBBox();
    const scale=rect.width/1600;
    const root=stage.getRootNode();
    let best=null;
    for(let y=Math.max(2,box.y+2);y<Math.min(1198,box.y+box.height-2);y+=3){
      for(let x=Math.max(2,box.x+2);x<Math.min(1598,box.x+box.width-2);x+=3){
        const px=rect.left+x*scale,py=rect.top+y*scale;
        if(pixels[(Math.floor(y)*1600+Math.floor(x))*4+3]<=160)continue;
        if(!root.elementFromPoint(px,py)?.matches('.target'))continue;
        let score=0;
        for(const dy of [-6,0,6])for(const dx of [-6,0,6]){
          if(pixels[(Math.floor(y+dy)*1600+Math.floor(x+dx))*4+3]>160)score++;
        }
        if(!best||score>best.score){
          best={x:px,y:py,score};
          if(score===9)return best;
        }
      }
    }
    return best;
  },id);
}

async function run(browser,width,height,weapon,legacyComplete){
  const touch=width<=768;
  const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  await page.addInitScript(()=>{
    window.played=[];
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){
      window.played.push(this.src.split('/').pop().split('?')[0]);
      return play.call(this);
    };
  });
  await page.goto(appUrl);
  await page.getByRole('button',{name:'Начать поход',exact:true}).waitFor();
  const save={schemaVersion:2,screen:legacyComplete?'complete':'glade',weaponLocked:legacyComplete,
    weaponChoice:weapon,foundIds:foundBefore,equippedIds:['chainmail','helmet','belt','ring','boots','shield'],soundEnabled:true};
  await page.evaluate(({key,save})=>localStorage.setItem(key,JSON.stringify(save)),{key,save});
  await page.reload();
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  if(!legacyComplete)await page.getByRole('button',{name:'В лес',exact:true}).click();
  assert.equal(await page.locator('#scene-title').innerText(),'Лес');
  assert.equal(await page.locator('#count').innerText(),'Найдено: 0/9');
  const stage=await page.locator('#stage').boundingBox(),viewport=await page.locator('#viewport').boundingBox();
  assert.ok(stage.width<=viewport.width&&stage.height<=viewport.height);
  assert.deepEqual(await page.locator('[data-carried]').evaluateAll(ns=>ns.map(n=>n.dataset.carried)),['shield',weapon]);
  const oakSprites=page.locator('#sprites img[src*="/oak-"]');
  assert.equal(await oakSprites.count(),1);
  assert.match(await oakSprites.first().getAttribute('src'),/oak-front\.png/);
  assert.ok(await oakSprites.first().evaluate(img=>parseFloat(img.style.left)>70));
  assert.ok(await page.locator('.target[data-id="oak"]').evaluate(path=>path.getBBox().x>1300));
  if(weapon==='spear'){
    const spear=await page.locator('[data-carried="spear"]').evaluate(img=>({
      left:parseFloat(img.style.left),rotation:img.style.transform,z:+img.style.zIndex
    }));
    assert.ok(spear.left<62&&spear.z<35);
    assert.equal(spear.rotation,'rotate(-17deg)');
  }
  await page.screenshot({path:`qa/forest-initial-${width}-${weapon}.png`});
  await page.locator('#speech-close').click();
  const firstPath=page.locator('.target[data-id="tugarin"]');
  if(width===390){
    const device=await page.context().newCDPSession(page);
    const x=width/2,y=stage.y+stage.height/2;
    await device.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
    await device.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-80,y,id:1},{x:x+80,y,id:2}]});
    await device.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok((await page.locator('#stage').boundingBox()).width>stage.width*2);
    assert.equal(await page.locator('#card').isVisible(),false);
    await page.locator('#zoom-toggle').click();
    await device.detach();
    await page.waitForTimeout(450);
  }
  await page.locator('#hint').click();
  await page.locator('.target.hint').waitFor();
  if((await page.locator('#zoom-toggle').innerText()).includes('Показать целиком')){
    await page.locator('#zoom-toggle').click();
  }
  // Find Tugarin while audio is enabled, then check all nine finds with real pointer input.
  for(const [index,id] of ['tugarin',...forest.filter(id=>id!=='tugarin')].entries()){
    await page.locator('[data-artifact="'+id+'"]').evaluate(img=>img.decode());
    const point=await targetPoint(page,id);
    assert.ok(point,'No reachable visible pixel for '+id+' at '+width);
    if(touch)await page.touchscreen.tap(point.x,point.y);
    else await page.mouse.click(point.x,point.y);
    await page.locator('#card').waitFor({timeout:2500});
    assert.ok((await page.locator('#card-image').getAttribute('src')).includes('/'+(id==='nightingale'?'nightingale-revealed':id+'-card')+'.png'));
    assert.equal(await page.locator('#count').innerText(),`Найдено: ${index+1}/9`);
    assert.match(await page.locator('[data-artifact="'+id+'"]').getAttribute('src'),id==='oak'?/oak-front\.png/ : /-hidden\.png/);
    assert.equal(await page.locator('.found-mark').count(),index);
    if(index===0){
      assert.match(await page.locator('#card-note').innerText(),/Запомним, кого встретили/);
      assert.equal(await page.evaluate(()=>window.played.at(-1)),'tugarin-short.wav');
      assert.equal(await page.evaluate(()=>window.played.some(name=>name.endsWith('166.wav'))),false);
      await page.locator('#read-more').click();
      await page.locator('#excerpt').waitFor();
    }
    await page.locator('#card-close').click();
    await page.waitForFunction(id=>document.querySelector('#bogatyr-game').shadowRoot.querySelector('[data-artifact="'+id+'"]').src.includes(id==='oak'?'oak-front':'-revealed'),id);
    if(id==='oak'){
      await page.waitForFunction(count=>document.querySelector('#bogatyr-game').shadowRoot.querySelectorAll('.found-mark').length===count,index+1);
      assert.equal(await oakSprites.count(),1);
      const oak=await targetPoint(page,id);
      assert.ok(oak);
      if(touch)await page.touchscreen.tap(oak.x,oak.y);
      else await page.mouse.click(oak.x,oak.y);
      assert.equal(await page.locator('#card-title').innerText(),'Дуб');
      await page.locator('#card-close').click();
      assert.equal(await page.locator('#count').innerText(),`Найдено: ${index+1}/9`);
    }
    if(index===0){
      assert.equal(await page.evaluate(()=>window.played.filter(name=>name.endsWith('166.wav')).length),1);
      await page.locator('#sound').click();
    }
  }
  assert.equal(await page.locator('.found-mark').count(),9);
  assert.equal(await page.evaluate(()=>window.played.filter(name=>name.endsWith('166.wav')).length),1);
  await page.screenshot({path:`qa/forest-complete-${width}-${weapon}.png`});
  await page.getByRole('button',{name:'Раскрыть тайну камина',exact:true}).click();
  await page.getByRole('heading',{name:'Лес пройден',exact:true}).waitFor();
  await page.reload();
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByRole('button',{name:'Вернуться в лес',exact:true}).click();
  assert.equal(await page.locator('#count').innerText(),'Найдено: 9/9');
  await page.locator('#treasury-toggle').click();
  assert.equal(await page.locator('.treasure').count(),27);
  await page.locator('.treasure[data-id="tugarin"]').click();
  assert.equal(await page.locator('#card-note').innerText(),'✓ Найдено!');
  if(touch)await page.locator('#card-close').tap();
  else {
    await page.locator('#card').evaluate(dialog=>{
      window.cardClosed=false;
      dialog.addEventListener('close',()=>{window.cardClosed=true;},{once:true});
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>window.cardClosed);
    await firstPath.press('Enter');
    await page.locator('#card').waitFor();
    assert.equal(await page.locator('#card-title').innerText(),'Тугарин Змей');
    await page.locator('#card-close').click();
  }
  if(width===1366||width===390){
    const replacement=weapon==='sword'?'spear':'sword';
    await page.locator('#menu').click();
    await page.locator('#menu-glade').click();
    await page.locator('#treasury-toggle').click();
    await page.locator('.treasure[data-id="'+replacement+'"]').click();
    await page.locator('#equip').click();
    await page.locator('#card-close').click();
    await page.getByRole('button',{name:'В лес',exact:true}).click();
    assert.deepEqual(await page.locator('[data-carried]').evaluateAll(ns=>ns.map(n=>n.dataset.carried)),['shield',replacement]);
    assert.equal(await page.locator('#count').innerText(),'Найдено: 9/9');
    assert.equal(await page.locator('.found-mark').count(),9);
    await page.reload();
    await page.getByRole('button',{name:'Продолжить',exact:true}).click();
    assert.deepEqual(await page.locator('[data-carried]').evaluateAll(ns=>ns.map(n=>n.dataset.carried)),['shield',replacement]);
    assert.equal(await page.locator('#count').innerText(),'Найдено: 9/9');
  }
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS',width,height,weapon,touch?'touch':'mouse','9 finds, cards, reveal, audio, save, 27 treasures');
}

(async()=>{
  let server,browser;
  try{
    server=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4203'},windowsHide:true});
    await new Promise((resolve,reject)=>{
      server.stdout.once('data',resolve);
      server.once('error',reject);
      server.once('exit',code=>reject(Error('Server stopped '+code)));
    });
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const cases=[[1366,768,'sword',false],[320,700,'sabre',true],[390,844,'mace',false],[768,1024,'spear',false]];
    for(const args of cases)await run(browser,...args);
  }finally{
    if(browser)await browser.close();
    if(server)server.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
