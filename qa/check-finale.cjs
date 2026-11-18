const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {traceAudio}=require('./audio-probe.cjs');
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const cards=['izba','glade','forest'].flatMap(id=>JSON.parse(fs.readFileSync('dist/content/'+id+'.json')));
const {pieces}=JSON.parse(fs.readFileSync('dist/config/puzzle.json'));
const key='bogatyr-game:izba:v1';

(async()=>{
  let server,browser;
  try{
    server=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4205'},windowsHide:true});
    await new Promise((resolve,reject)=>{
      server.stdout.once('data',resolve);
      server.once('error',reject);
      server.once('exit',reject);
    });
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    for(const [width,touch] of [[1366,false],[320,true]]){
      const page=await browser.newPage({viewport:{width,height:760},isMobile:touch,hasTouch:touch});
      const errors=[],requests=[];
      await traceAudio(page);
      page.on('pageerror',error=>errors.push(String(error)));
      page.on('response',response=>{if(response.status()>=400)errors.push(response.url());});
      page.on('request',request=>{if(request.url().includes('final-battle.mp4'))requests.push(request.url());});
      await page.goto('http://127.0.0.1:4205/games/bogatyr/');
      await page.locator('#intro-title').waitFor();
      const save={schemaVersion:4,screen:'puzzle',foundIds:cards.map(card=>card.id),
        equippedIds:['chainmail','helmet','belt','ring','boots','shield'],weaponChoice:touch?'sabre':'sword',soundEnabled:!touch,
        matches:Object.fromEntries(Object.entries(pieces).map(([id,piece])=>[piece.artifact,id])),puzzleRevealed:false};
      await page.evaluate(({key,save})=>localStorage.setItem(key,JSON.stringify(save)),{key,save});
      await page.reload();
      await page.getByRole('button',{name:'Продолжить',exact:true}).click();
      await page.getByRole('heading',{name:'Камин-пазл',exact:true}).waitFor();
      assert.equal(await page.locator('#puzzle-finale').isVisible(),false);
      if(touch)await page.setViewportSize({width,height:430});
      else await page.locator('#treasury-toggle').click();
      await page.locator((touch?'#puzzle-list':'#treasury-grid')+' [data-choose="tugarin"]').click();
      assert.deepEqual(requests,[]);
      const reveal=page.locator('#puzzle-message.puzzle-reveal');
      await reveal.waitFor();
      const inView=await reveal.evaluate(el=>{const rect=el.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight;});
      assert.ok(inView,'The reveal should scroll into view');
      if(touch){
        assert.deepEqual(await page.evaluate(()=>window.played),[]);
        await page.setViewportSize({width,height:760});
      }else await page.waitForFunction(()=>window.played.length===1&&window.played[0].endsWith('2964.wav'));
      await page.locator('#puzzle-finale').click();
      const video=page.locator('#finale-video');
      await video.waitFor();
      await page.waitForFunction(()=>{
        const video=document.querySelector('#bogatyr-game').shadowRoot.querySelector('#finale-video');
        return video.currentTime>.1&&!video.paused;
      });
      const metrics=await video.evaluate(v=>({duration:v.duration,muted:v.muted,inline:v.playsInline,w:v.getBoundingClientRect().width}));
      assert.ok(metrics.duration>12&&metrics.duration<14&&metrics.w<=width);
      assert.equal(metrics.muted,touch);
      assert.equal(metrics.inline,true);
      if(touch)await page.locator('#finale-skip').tap();
      await page.getByRole('heading',{name:'Поход завершён!',exact:true}).waitFor({timeout:16000});
      await page.locator('.finale-still').evaluate(img=>img.decode());
      assert.equal(await video.evaluate(v=>v.paused),true);
      await page.locator('#ending-collection').click();
      assert.equal(await page.locator('#treasury-grid .treasure').count(),27);
      await page.locator('#treasury-close').click();
      await page.reload();
      await page.getByRole('button',{name:'Продолжить',exact:true}).click();
      await page.getByRole('heading',{name:'Поход завершён!',exact:true}).waitFor();
      await page.locator('#ending-puzzle').click();
      assert.equal(await page.locator('#count').innerText(),'Найдено на камине: 26 из 26');
      assert.equal(await page.locator('#puzzle-finale').innerText(),'Итоги похода');
      await page.locator('#puzzle-finale').click();
      assert.equal(await video.isVisible(),false);
      await page.locator('#ending-reset').click();
      await page.locator('#confirm-reset').click();
      const reset=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
      assert.equal(reset.journeyFinished,false);
      assert.equal(reset.soundEnabled,!touch);
      assert.deepEqual(errors,[]);
      await page.close();
      console.log('PASS',width,touch?'inline muted playback and skip':'playback to the end','saved ending, collection, review and reset');
    }
  }finally{if(browser)await browser.close();if(server)server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
