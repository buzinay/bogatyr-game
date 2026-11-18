const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');const fs=require('node:fs');
const key='bogatyr-game:izba:v1',izba=['chainmail','helmet','belt','ring','boots','gusli','cup'],gear=izba.slice(0,5);
(async()=>{let b,s;try{
s=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4197'},windowsHide:true});await new Promise(r=>s.stdout.once('data',r));
b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const [width,height]of (process.argv.includes('--desktop')?[[1366,768]]:process.argv.includes('--mobile')?[[390,844]]:[[320,700],[390,844],[768,1024],[1366,768],[844,390]])){
 const p=await b.newPage({viewport:{width,height},hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(String(e)));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 await p.goto('http://127.0.0.1:4197/games/bogatyr/');await p.getByRole('button',{name:'Начать поход',exact:true}).click();
 await p.locator('#menu').click();if(await p.locator('#menu-glade').isEnabled())throw Error('Glade unlocked early');await p.locator('#resume').click();
 await p.evaluate(({key,izba,gear})=>localStorage.setItem(key,JSON.stringify({schemaVersion:1,foundIds:izba,equippedIds:gear,screen:'complete',soundEnabled:true})),{key,izba,gear});await p.reload();await p.getByRole('button',{name:'Продолжить',exact:true}).click();
 if(await p.locator('#count').innerText()!=='Найдено: 7/7')throw Error('Old save lost');await p.getByRole('button',{name:'На поляну',exact:true}).click();
 if(await p.locator('#count').innerText()!=='Найдено: 0/11')throw Error('Glade counter');
 const vp=await p.locator('#viewport').boundingBox(),st=await p.locator('#stage').boundingBox();if(st.width>vp.width||st.height>vp.height)throw Error('Scene clipped');
 await p.screenshot({path:`qa/glade-initial-${width}.png`});await p.locator('#speech-close').click();
 const open=async id=>{await p.locator(`.target[data-id="${id}"]`).focus();await p.keyboard.press('Enter');await p.locator('#card').waitFor({state:'visible'});};
 const close=async()=>{await p.locator('#card-close').click();await p.waitForTimeout(90);};
 await open('sword');await close();if(await p.locator('[data-carried="sword"]').count())throw Error('Closing card chose weapon');
 await open('horse');await close();
 if(!(await p.locator('[data-artifact="horse"]').getAttribute('src')).includes('horse-placed.png'))throw Error('Standing horse missing');
 if(!(await p.locator('[data-artifact="rein"]').getAttribute('src')).includes('rein-hidden.png'))throw Error('Rein attached before found');
 await open('rein');await close();if(await p.locator('.horse-ready').count()!==1)throw Error('Horse readiness');
 if(await p.locator('[data-artifact="rein"]').count()!==1||!(await p.locator('[data-artifact="rein"]').getAttribute('src')).includes('rein-placed.png'))throw Error('Attached rein missing or duplicated');
 await open('raspberry_2');if(!(await p.locator('#description').innerText()).includes('Две малины'))throw Error('First berry content');
 if(!await p.locator('#card-image').evaluate(im=>im.classList.contains('mini')&&im.getBoundingClientRect().height<=34))throw Error('Berry not reduced');
 await close();await open('raspberry_1');if(await p.locator('#description').innerText()!=='Обе малины найдены!')throw Error('Second berry');await close();
 for(const id of ['sabre','mace','spear','shield','plough','sun']){await open(id);await close();}
 if(await p.locator('#count').innerText()!=='Найдено: 11/11')throw Error('11 finds');if(await p.getByRole('button',{name:'В лес',exact:true}).count())throw Error('Exit early');
 if(!await p.locator('.speech').isVisible())throw Error('Missing instruction');
 await p.locator('#treasury-toggle').click();await p.locator('.treasure[data-id="raspberry_1"]').click();if(!(await p.locator('#description').innerText()).includes('Две малины'))throw Error('Full berry missing');await close();
 for(const id of ['sabre','sword','mace','spear','sabre']){
  await p.locator('#treasury-toggle').click();await p.locator(`.treasure[data-id="${id}"]`).click();await p.locator('#equip').click();await close();
  const carried=await p.locator('[data-carried]').evaluateAll(ns=>[...new Set(ns.map(n=>n.dataset.carried))]);if(carried.length!==1||carried[0]!==id)throw Error('Multiple weapons '+carried);
  if(id==='sword'){
   const sword=await p.locator('[data-carried="sword"][src*="sword-worn"]').evaluate(im=>({src:im.src,z:Number(im.style.zIndex)}));
   if(!sword.src.includes('sword-worn.png')||sword.z<=40)throw Error('Sword layer must be in front of torso');
  }
  const save=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);if(save.weaponChoice!==id||save.foundIds.length!==18)throw Error('Weapon state');
  await p.reload();await p.getByRole('button',{name:'Продолжить',exact:true}).click();if(await p.locator(`[data-carried="${id}"]`).count()!==(id==='sword'?2:1))throw Error('Weapon not restored');
  await p.locator('#speech-close').click();await p.screenshot({path:`qa/glade-${id}-${width}.png`});
 }
 await p.locator('#treasury-toggle').click();await p.locator('.treasure[data-id="shield"]').click();await p.locator('#equip').click();await close();
 for(const id of ['spear','sword','sabre']){
  await p.locator('#treasury-toggle').click();await p.locator(`.treasure[data-id="${id}"]`).click();await p.locator('#equip').click();await close();
  const sheath=await p.locator('[data-carried="sword"][src*="sword-sheath"]').count();if(sheath!==(id==='sword'?1:0))throw Error('Sheath selection');
  if(id==='spear'){
   const z=await p.locator('[data-carried="spear"]').evaluate(im=>Number(im.style.zIndex));const shield=await p.locator('[data-carried="shield"]').evaluateAll(ns=>Math.max(...ns.map(n=>Number(n.style.zIndex))));if(z<=shield)throw Error('Spear behind shield');
  }
  await p.locator('#speech-close').click();await p.screenshot({path:`qa/glade-equipped-${id}-${width}.png`});
  await p.locator('#speech-toggle').click();
 }
 await p.screenshot({path:`qa/glade-ready-${width}.png`});await p.getByRole('button',{name:'В лес',exact:true}).click();await p.getByRole('heading',{name:'Лес',exact:true}).waitFor();
 await p.locator('#menu').click();await p.locator('#menu-glade').click();await p.locator('#treasury-toggle').click();await p.locator('.treasure[data-id="sword"]').click();await p.locator('#equip').click();await close();
 await p.getByRole('button',{name:'В лес',exact:true}).click();
 await p.locator('[data-carried="sword"]').waitFor();
 if(await p.locator('[data-carried="sabre"]').count())throw Error('Forest kept the previous weapon');
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS',width,height,'migration, gating, 11 finds, berries, horse, all weapons/reload, shield, weapon change after Forest, assets');await p.close();
}
}finally{if(b)await b.close();if(s)s.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
