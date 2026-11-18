const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');
const {traceAudio}=require('./audio-probe.cjs');
(async()=>{let browser,server;try{
 server=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4192'},windowsHide:true});await new Promise(r=>server.stdout.once('data',r));
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:844}});const failures=[];
  await traceAudio(page,{fallback:true});
  page.on('response',r=>{if(r.status()>=400)failures.push(r.url());});
  await page.goto('http://127.0.0.1:4192/');await page.getByRole('button',{name:'Начать поход',exact:true}).click();
  await page.locator('#speech-close').click();
  for(const id of ['chainmail','helmet','belt','ring','boots','gusli','cup']){
   const target=page.locator(`.target[data-id="${id}"]`);
   await target.dispatchEvent('pointerenter',{pointerType:'mouse'});
   await page.waitForFunction(file=>window.played.at(-1)===file,id+'-short.wav');
   await page.waitForTimeout(2200);
   if(await page.evaluate(()=>window.playing.size))throw Error('Sound exceeds two seconds: '+id);
   await target.focus();await page.keyboard.press('Enter');
   await page.waitForFunction(()=>window.playing.size>0);
   await page.locator('#card-close').click();
   await page.waitForFunction(()=>window.playing.size===0);
  }
  const count=await page.evaluate(()=>window.played.length);await page.locator('#sound').click();
  await page.locator('.target[data-id="cup"]').dispatchEvent('pointerenter',{pointerType:'mouse'});
  if(await page.evaluate(()=>window.played.length)!==count)throw Error('Mute ignored');
  if(failures.length)throw Error('Failed requests: '+failures.join(','));
  console.log('PASS '+width+': 7 real files decode/play; hover, click, 2-second limit, close and mute.');await page.close();
 }
}finally{if(browser)await browser.close();if(server)server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
