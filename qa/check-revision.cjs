const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');const fs=require('node:fs');
(async()=>{let b,s;try{
s=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4191'},windowsHide:true});await new Promise(r=>s.stdout.once('data',r));
b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const [width,height]of [[1366,768],[1920,1080],[390,844],[320,700]]){
 const ctx=await b.newContext({viewport:{width,height}});const p=await ctx.newPage();await p.goto('http://127.0.0.1:4191/');await p.getByRole('button',{name:'Начать поход',exact:true}).click();
 const layout=await p.locator('#viewport').boundingBox();if(layout.y+layout.height>height+1)throw Error('field outside screen '+width);
 if(width>700){const stage=await p.locator('#stage').boundingBox();if(stage.y+stage.height>height||stage.height>layout.height||stage.width>layout.width)throw Error('stage clipped');}
 if(!await p.evaluate(()=>document.fonts.check('16px Lora')&&document.fonts.check('16px "Golos Text"')))throw Error('Fonts unavailable');
 const before=await p.locator('#zoom-toggle').innerText();await p.locator('#zoom-toggle').click();if(await p.locator('#zoom-toggle').innerText()===before)throw Error('Zoom label unchanged');if(await p.locator('#zoom-toggle svg').count()!==1)throw Error('Missing zoom icon');await p.locator('#zoom-toggle').click();
 await p.locator('#speech-close').click();
 for(const id of ['boots','helmet']){await p.locator(`.target[data-id="${id}"]`).focus();await p.keyboard.press('Enter');const ratio=await p.locator('#card-image').evaluate(i=>i.naturalWidth/i.naturalHeight);if(id==='boots'&&ratio<1)throw Error('boots not paired');if(id==='helmet'&&ratio<0.8)throw Error('helmet not upright');await p.locator('#card-close').click();}
 await p.locator('#treasury-toggle').click();await p.locator('#treasury[open]').waitFor();await p.locator('.treasure[data-id="boots"]').click();await p.locator('#card[open]').waitFor();await p.locator('#card-close').click();
 await p.screenshot({path:`qa/revision-${width}.png`,fullPage:true});console.log('PASS',width,height,'field fits; popup and corrected images work');await ctx.close();
}
}finally{if(b)await b.close();if(s)s.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
