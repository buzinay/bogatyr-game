const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');const fs=require('node:fs');
const {traceAudio}=require('./audio-probe.cjs');
(async()=>{let browser,server;try{
 server=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4200'},windowsHide:true});await new Promise(r=>server.stdout.once('data',r));
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 for(const [mobile,scene,fallback] of [[true,'izba',false],[true,'glade',false],[false,'izba',false],[false,'glade',false],[true,'izba',true]]){
  const p=await browser.newPage({viewport:{width:mobile?390:1366,height:844},hasTouch:mobile,isMobile:mobile});
  await traceAudio(p,{fallback});
  const id=scene==='izba'?'gusli':'horse',cfg=JSON.parse(fs.readFileSync('dist/config/'+scene+'.json'));
  let release;
  const audioGate=new Promise(resolve=>{release=resolve;});
  if(mobile&&!fallback)await p.route(url=>url.pathname.endsWith('/'+id+'-short.wav'),async route=>{
    await audioGate;
    await route.continue();
  });
  await p.goto('http://127.0.0.1:4200/');
  if(scene==='glade'){
   await p.evaluate(()=>{const ids=['chainmail','helmet','belt','ring','boots','gusli','cup'];localStorage.setItem('bogatyr-game:izba:v1',JSON.stringify({schemaVersion:2,foundIds:ids,equippedIds:ids.slice(0,5),screen:'glade',weaponChoice:null,weaponLocked:false,soundEnabled:true}));});await p.reload();
  }
  await p.getByRole('button',{name:scene==='glade'?'Продолжить':'Начать поход',exact:true}).click();await p.locator('#speech-close').click();
  const before=await p.locator(`[data-artifact="${id}"]`).getAttribute('src');
  const bounds=await p.locator('#stage').boundingBox(),scale=bounds.width/1600;
  const polygons=[...cfg.hitAreas[id]].sort((a,b)=>(b[1][0]-b[0][0])-(a[1][0]-a[0][0]));
  for(const poly of polygons.slice(0,20)){
   const x=bounds.x+(poly[0][0]+poly[1][0])/2*scale,y=bounds.y+(poly[0][1]+poly[2][1])/2*scale;
   if(mobile)await p.touchscreen.tap(x,y);else{await p.mouse.move(x,y);await p.mouse.click(x,y);}
   if(await p.locator('#card').isVisible())break;
  }
  await p.locator('#card').waitFor({state:'visible'});
  if(mobile&&!fallback&&await p.evaluate(()=>window.played.length))throw Error('Unexpected sound while the artifact is still downloading');
  release();
  await p.waitForFunction(file=>window.played.at(-1)===file,id+'-short.wav');
  if(await p.locator(`[data-artifact="${id}"]`).getAttribute('src')!==before)throw Error('Item moved before closing');
  if(await p.evaluate(()=>window.played.some(s=>s.includes('166.wav'))))throw Error('Early sweep');
  await p.locator('#read-more').click();if(await p.evaluate(()=>window.played.some(s=>s.includes('166.wav'))))throw Error('Reading swept');
  await p.locator('#card-close').click();
  await p.waitForFunction(()=>window.played.filter(s=>s.endsWith('166.wav')).length===1);
  if(await p.locator(`[data-artifact="${id}"]`).getAttribute('src')===before)throw Error('Item not moved on close');
  if(await p.evaluate(()=>window.played.filter(s=>s.includes('166.wav')).length)!==1)throw Error('Sweep count after move');
  await p.locator('#treasury-toggle').click();await p.locator(`.treasure[data-id="${id}"]`).click();
  await p.waitForFunction(file=>window.played.at(-1)===file,id+'-short.wav');
  await p.waitForTimeout(100);
  if(!await p.evaluate(()=>window.playing.size===1))throw Error('Treasury close interrupted artifact');
  await p.locator('#card-close').click();await p.waitForTimeout(100);
  if(await p.evaluate(()=>window.played.filter(s=>s.includes('166.wav')).length)!==1)throw Error('Repeated move sweep');
  const gear=scene==='izba'?'helmet':'sword';await p.locator(`.target[data-id="${gear}"]`).focus();await p.keyboard.press('Enter');await p.locator('#equip').click();
  await p.waitForFunction(()=>window.played.filter(s=>s.endsWith('166.wav')).length===2);
  await p.locator('#card-close').click();
  if(await p.evaluate(()=>window.played.filter(s=>s.includes('166.wav')).length)!==2)throw Error('Equip should sweep once');
  await p.locator('#sound').click();const count=await p.evaluate(()=>window.played.length);
  const next=scene==='izba'?'cup':'sun';await p.locator(`.target[data-id="${next}"]`).focus();await p.keyboard.press('Enter');await p.locator('#card-close').click();await p.waitForTimeout(100);
  if(await p.evaluate(()=>window.played.length)!==count)throw Error('Mute ignored');
  await p.reload();await p.getByRole('button',{name:'Продолжить',exact:true}).click();if(await p.evaluate(()=>window.played.length)!==0)throw Error('Reload played sound');
  console.log('PASS',fallback?'fallback':mobile?'touch, cold delayed audio':'mouse',scene,'artifact on first open, move/sweep on close, repeat, reading, equip once, mute, reload');await p.close();
 }
}finally{if(browser)await browser.close();if(server)server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
