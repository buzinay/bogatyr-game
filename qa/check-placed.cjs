const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');
(async()=>{let b,s;try{
s=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4196'},windowsHide:true});await new Promise(r=>s.stdout.once('data',r));
b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const width of [390,1366]){
const p=await b.newPage({viewport:{width,height:844}});await p.addInitScript(()=>{window.sweeps=0;const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(this.src.includes('166.wav')){window.sweeps++;window.sweepVolume=this.volume;}return play.call(this);};});
await p.goto('http://127.0.0.1:4196/');await p.getByRole('button',{name:'Начать поход',exact:true}).click();await p.locator('#speech-close').click();
const open=async id=>{await p.locator(`.target[data-id="${id}"]`).focus();await p.keyboard.press('Enter');await p.locator('#card').waitFor({state:'visible'});};
const close=async()=>{await p.locator('#card-close').click();await p.waitForTimeout(80);};
for(const id of ['gusli','cup']){
 await open(id);await close();
 const src=await p.locator(`[data-artifact="${id}"]`).getAttribute('src');if(!src.includes('-upright.png'))throw Error('Not relocated '+id);
}
if(await p.evaluate(()=>window.sweeps)!==2)throw Error('Move sound count');
await open('cup');await close();if(await p.evaluate(()=>window.sweeps)!==2)throw Error('Reopen swept');
await open('helmet');if(await p.evaluate(()=>window.sweeps)!==2)throw Error('Card swept');
await p.locator('#equip').click();if(await p.evaluate(()=>window.sweeps)!==3)throw Error('Equip sound missing');await close();
if(await p.evaluate(()=>window.sweepVolume)!==.35)throw Error('Volume');
await p.locator('#sound').click();await open('boots');await p.locator('#equip').click();await close();if(await p.evaluate(()=>window.sweeps)!==3)throw Error('Mute ignored');
await p.reload();await p.getByRole('button',{name:'Продолжить',exact:true}).click();if(await p.evaluate(()=>window.sweeps)!==0)throw Error('Reload swept');
for(const id of ['gusli','cup'])if(!(await p.locator(`[data-artifact="${id}"]`).getAttribute('src')).includes('-upright.png'))throw Error('Placement not restored');
await p.locator('#speech-close').click();await p.screenshot({path:`qa/placed-${width}.png`});console.log('PASS',width,'placements, sound once, no card sound, volume, mute, saved state');await p.close();
}
}finally{if(b)await b.close();if(s)s.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
