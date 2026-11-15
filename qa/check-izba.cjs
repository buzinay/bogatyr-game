const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const candidates=[process.env.BOGATYR_NODE_MODULES,path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean);
let chromium;
for(const base of candidates){try{({chromium}=createRequire(path.join(base,'__qa.cjs'))('playwright'));break;}catch{}}
if(!chromium)throw Error('Set BOGATYR_NODE_MODULES to a directory containing Playwright.');
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const base='http://127.0.0.1:4187/';
const points={chainmail:[1105,120],helmet:[1095,673],belt:[990,277],ring:[953,880],boots:[1258,1000],gusli:[43,811],cup:[876,500]};
const ids=Object.keys(points),key='bogatyr-game:izba:v1';
const report={date:'2026-11-14',browser:'',checks:[],errors:[],requests:[]};
let browser,server;
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name);}
const saved=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
async function ready(page){await page.getByRole('button',{name:'Начать поход',exact:true}).waitFor();}
async function hit(page,id,touch=false){
  console.log('TARGET',id,touch?'touch':'mouse');
  await page.locator('#viewport').scrollIntoViewIfNeeded();
  const [x,y]=points[id];
  await page.evaluate(({x,y})=>{const r=document.querySelector('#bogatyr-game').shadowRoot,v=r.querySelector('#viewport'),s=r.querySelector('#stage');const scale=s.clientWidth/1600;v.scrollLeft=s.offsetLeft+x*scale-v.clientWidth/2;v.scrollTop=s.offsetTop+y*scale-v.clientHeight/2;},{x,y});
  const p=await page.evaluate(({x,y})=>{const r=document.querySelector('#bogatyr-game').shadowRoot,s=r.querySelector('#stage'),b=s.getBoundingClientRect(),v=r.querySelector('#viewport').getBoundingClientRect();return {x:b.left+x*b.width/1600,y:b.top+y*b.height/1200,v:{x:v.x,y:v.y,width:v.width,height:v.height}};},{x,y});
  assert(p.x>=p.v.x&&p.x<=p.v.x+p.v.width&&p.y>=p.v.y&&p.y<=p.v.y+p.v.height,id+' reachable');
  if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
  try{await page.locator('#card[open]').waitFor({timeout:2500});}catch(e){await page.screenshot({path:'qa/failed-hit.png',fullPage:true});console.log('FAILED POINT',p,await page.evaluate(p=>{const r=document.querySelector('#bogatyr-game').shadowRoot,e=r.elementFromPoint(p.x,p.y);return {tag:e?.tagName,id:e?.id,cls:e?.getAttribute('class'),data:e?.getAttribute('data-id'),vh:innerHeight};},p));throw e;}
  const title=await page.locator('#card-title').innerText();
  assert(title===({chainmail:'Кольчуга',helmet:'Шлем',belt:'Кушак',ring:'Перстень',boots:'Сапоги',gusli:'Гусли',cup:'Кубок'})[id],id+' correct target');
}
const close=page=>page.getByRole('button',{name:'Закрыть',exact:true}).click();
const equip=page=>page.locator('#equip').click();
async function newContext(size,mobile=false){const context=await browser.newContext({viewport:size,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/\.(mp3|ogg|wav)(\?|$)/.test(r.url()))report.requests.push(r.url());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});return {page,context};}
(async()=>{
  try{
    server=require('node:child_process').spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4187'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Preview exited '+code)));});
    browser=await chromium.launch({headless:true,executablePath:process.env.BOGATYR_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'});report.browser=browser.version();
    const {page,context}=await newContext({width:1366,height:768});
    await page.goto(base);await ready(page);await page.getByRole('button',{name:'Начать поход',exact:true}).click();
    await check('Desktop 1366×768: initial scene and real pointer hit on chainmail',async()=>{assert((await saved(page)).foundIds.length===0,'new 0');await page.screenshot({path:'qa/desktop-initial.png',fullPage:true});await hit(page,'chainmail');});
    await check('Card closed before wearing; collection reopens; repeated find not counted',async()=>{
      await close(page);assert((await saved(page)).foundIds.length===1,'one found');assert((await saved(page)).equippedIds.length===0,'not auto equipped');
      await page.locator('#treasury-toggle').click();await page.locator('.treasure[data-id="chainmail"]').click();assert((await saved(page)).foundIds.length===1,'no double count');
      await page.locator('#read-more').click();assert(await page.locator('#reading').isVisible(),'reading visible');assert(await page.locator('#excerpt').innerText()==='Крепки доспехи на могучих плечах,\nКуяк и панцирь — чиста серебра, А\nкольчуга на нем — красна золота.','exact excerpt');
      assert(await page.locator('#source').getAttribute('target')==='_blank','new tab');await page.locator('#read-more').click();await equip(page);await close(page);await page.locator('#treasury-toggle').click();
    });
    await check('Chainmail before belt: explanation and belt below armor independent of action order',async()=>{
      await hit(page,'belt');assert((await page.locator('#card-note').innerText()).includes('приподнимет'),'late belt explanation');await equip(page);assert((await page.locator('#card-note').innerText()).includes('скрыт'),'hidden belt explained');await close(page);
      const layers=await page.evaluate(()=>{const s=document.querySelector('#bogatyr-game').shadowRoot;return [...s.querySelectorAll('#sprites img')].map(i=>({src:i.src,z:+i.style.zIndex}));});
      assert(layers.find(i=>i.src.includes('belt-worn')).z<layers.find(i=>i.src.includes('chainmail-worn')).z,'belt under armor');assert(!layers.some(i=>i.src.includes('belt-hidden')),'hidden place gone');
    });
    await check('Reload mid-game: continue restores found and worn IDs',async()=>{
      const before=await saved(page);await page.reload();await ready(page);await page.getByRole('button',{name:'Продолжить',exact:true}).click();assert(JSON.stringify(await saved(page))===JSON.stringify(before),'same progress');
    });
    await check('Find all seven, leave equipment incomplete: transition blocked with actionable cards',async()=>{
      for(const id of ['helmet','ring','boots','gusli','cup']){await hit(page,id);await close(page);}
      assert((await saved(page)).foundIds.length===7,'7 found');assert((await saved(page)).equippedIds.length===2,'2 equipped');assert(await page.locator('#status .missing button').count()===3,'3 missing buttons');assert(await page.getByRole('button',{name:'На поляну',exact:true}).count()===0,'exit blocked');
    });
    await check('Complete desktop scene through missing-item cards and return from placeholder',async()=>{
      while(await page.locator('#status .missing button').count()){await page.locator('#status .missing button').first().click();await equip(page);await close(page);}
      await page.locator('#fit').click();await page.screenshot({path:'qa/desktop-dressed.png',fullPage:true});
      assert((await saved(page)).equippedIds.length===5,'5 worn');await page.getByRole('button',{name:'На поляну',exact:true}).click();assert(await page.getByRole('heading',{name:'Первая сцена пройдена'}).isVisible(),'complete screen');await page.screenshot({path:'qa/desktop-complete.png',fullPage:true});await page.getByRole('button',{name:'Вернуться в избу',exact:true}).click();assert((await saved(page)).equippedIds.length===5,'return retains');
    });
    await check('Keyboard: scene target opens by Enter, Escape closes and returns focus',async()=>{
      const target=page.locator('.target[data-id="gusli"]');await target.focus();await page.keyboard.press('Enter');await page.locator('#card[open]').waitFor();await page.keyboard.press('Escape');await page.locator('#card[open]').waitFor({state:'detached'});assert(await target.evaluate(e=>e===e.getRootNode().activeElement),'focus restored');
    });
    await check('Restart: cancel retains progress; confirm resets finds and equipment',async()=>{
      await page.locator('#menu').click();await page.locator('#restart').click();await page.locator('#cancel-reset').click();assert((await saved(page)).foundIds.length===7,'cancel retains');await page.locator('#menu').click();await page.locator('#restart').click();await page.locator('#confirm-reset').click();assert((await saved(page)).foundIds.length===0,'reset 0');assert((await saved(page)).equippedIds.length===0,'reset gear');
    });await context.close();
    const mobile=await newContext({width:390,height:844},true);const m=mobile.page;await m.goto(base);await ready(m);await m.getByRole('button',{name:'Начать поход',exact:true}).tap();
    await check('Native touch pan moves the scene without finding an artifact',async()=>{
      await m.locator('#viewport').scrollIntoViewIfNeeded();const box=await m.locator('#viewport').boundingBox();const y=Math.max(60,Math.min(750,box.y+box.height/2));
      const session=await mobile.context.newCDPSession(m);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width-60,y}]});
      for(let i=1;i<=8;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width-60-i*25,y}]});await m.waitForTimeout(20);}
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
      await m.locator('#viewport').evaluate(v=>new Promise(resolve=>{let last=v.scrollLeft,stable=0;const tick=()=>{const next=v.scrollLeft;stable=next===last?stable+1:0;last=next;if(stable>8)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
      assert(await m.locator('#viewport').evaluate(v=>v.scrollLeft>0),'scene moved');assert((await saved(m)).foundIds.length===0,'swipe not a find');assert(!await m.locator('#card').evaluate(d=>d.open),'no card from swipe');
    });
    await check('Phone 390×844 touch: all seven actual visible targets reached; dress in reverse order',async()=>{
      await m.screenshot({path:'qa/mobile-initial.png',fullPage:true});
      for(const id of ['boots','ring','helmet','belt','chainmail','gusli','cup']){await hit(m,id,true);if(['boots','ring','helmet','belt','chainmail'].includes(id))await equip(m);await close(m);}
      assert((await saved(m)).foundIds.length===7,'touch all found');assert((await saved(m)).equippedIds.length===5,'touch dressed');await m.setViewportSize({width:844,height:390});assert((await saved(m)).foundIds.length===7,'rotation retains progress');await m.setViewportSize({width:390,height:844});await m.locator('#fit').tap();await m.screenshot({path:'qa/mobile-dressed.png',fullPage:true});
      await m.getByRole('button',{name:'На поляну',exact:true}).tap();assert(await m.getByRole('heading',{name:'Первая сцена пройдена'}).isVisible(),'mobile complete');
    });await mobile.context.close();
    for(const [w,h]of [[320,700],[360,800],[768,1024],[844,390]]){
      const small=await newContext({width:w,height:h},true);await small.page.goto(base);await ready(small.page);await small.page.getByRole('button',{name:'Начать поход',exact:true}).click();
      await check(`Layout ${w}×${h}: no page overflow, hint reveals a target, card and controls fit`,async()=>{
        assert(await small.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
        await small.page.locator('#hint').click();assert(await small.page.locator('.target.hint').count()===1,'static hint');await hit(small.page,'ring',true);await small.page.locator('#read-more').click();
        const box=await small.page.locator('#card').boundingBox();assert(box.width<=w&&box.height<=h,'dialog fits');assert(await small.page.locator('#card-close').isVisible(),'close visible');await small.page.screenshot({path:`qa/card-${w}x${h}.png`,fullPage:true});await close(small.page);
      });await small.context.close();
    }
    const sub=await newContext({width:1366,height:768});
    await check('Static subdirectory URL: all resources and scene load',async()=>{await sub.page.goto(base+'games/bogatyr/');await ready(sub.page);await sub.page.getByRole('button',{name:'Начать поход',exact:true}).click();await hit(sub.page,'cup');});await sub.context.close();
    const bad=await newContext({width:390,height:844},true);
    await check('Corrupt save safely resets; localStorage denial allows play in memory',async()=>{
      await bad.page.goto(base);await ready(bad.page);await bad.page.evaluate(k=>localStorage.setItem(k,'{"oops":true}'),key);await bad.page.reload();await ready(bad.page);assert(await bad.page.locator('#save-message').isVisible(),'corruption explained');
      await bad.page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError');}});});await bad.page.reload();await ready(bad.page);await bad.page.getByRole('button',{name:'Начать поход',exact:true}).click();await hit(bad.page,'ring',true);await equip(bad.page);await close(bad.page);assert((await bad.page.locator('#count').innerText()).includes('1/7'),'memory progress');
    });await bad.context.close();
    const missing=await newContext({width:390,height:844},true);
    await check('Missing required graphic: readable error and retry recover',async()=>{
      await missing.page.route('**/assets/hero-base.png*',r=>r.abort());await missing.page.goto(base);await missing.page.getByRole('heading',{name:'Не удалось открыть избу'}).waitFor();await missing.page.unroute('**/assets/hero-base.png*');await missing.page.getByRole('button',{name:'Повторить',exact:true}).click();await ready(missing.page);
    });await missing.context.close();
    assert(report.requests.length===0,'No missing audio requests');assert(report.errors.length===0,'No browser/resource errors: '+report.errors.join('; '));report.checks.push('No audio requests, no page errors or HTTP errors in normal scenarios');
    report.result='PASS';
  }catch(e){report.result='FAIL';report.failure=e.stack;console.error(e);process.exitCode=1;}
  finally{if(browser)await browser.close();if(server)server.kill();fs.writeFileSync('qa/results.json',JSON.stringify(report,null,2));}
})();
