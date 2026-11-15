const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');
(async()=>{let b,s;try{
s=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4193'},windowsHide:true});await new Promise(r=>s.stdout.once('data',r));
b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const width of [320,390,768,1366]){
 const p=await b.newPage({viewport:{width,height:844},hasTouch:true});await p.goto('http://127.0.0.1:4193/');await p.getByRole('button',{name:'Начать поход',exact:true}).click();
 const v=await p.locator('#viewport').boundingBox(),stage=await p.locator('#stage').boundingBox();
 if(stage.width>v.width||stage.height>v.height)throw Error('Initial scene clipped');
 if(width<=700){
  if(!await p.locator('.speech').isVisible())throw Error('Initial speech hidden');
  const speech=await p.locator('.speech').boundingBox();
  if(Math.abs(speech.width/v.width-.95)>.02||speech.y+speech.height>v.y+v.height)throw Error('Mobile speech layout');
 }
 const c=await p.context().newCDPSession(p),y=stage.y+stage.height/2,x=width/2;
 const touch=async(type,d)=>c.send('Input.dispatchTouchEvent',{type,touchPoints:d?[{x:x-d,y,id:1},{x:x+d,y,id:2}]:[]});
 await touch('touchStart',35);await touch('touchMove',90);await touch('touchEnd',0);
 const enlarged=await p.locator('#stage').boundingBox();if(enlarged.width<stage.width*2)throw Error('Pinch did not enlarge');
 if(await p.locator('#card').isVisible())throw Error('Pinch opened card');
 await p.locator('#zoom-toggle').click();const restored=await p.locator('#stage').boundingBox();if(Math.abs(restored.width-stage.width)>1)throw Error('Fit reset failed');
 await p.locator('#speech-close').click();
 for(const id of ['chainmail','helmet','belt','ring','boots','gusli','cup']){
  await p.locator(`.target[data-id="${id}"]`).focus();await p.keyboard.press('Enter');await p.locator('#card').waitFor({state:'visible'});await p.locator('#card-close').click();await p.locator('#card').waitFor({state:'hidden'});await p.waitForTimeout(80);
 }
 if(!await p.locator('.speech').isVisible())throw Error('Equipment reminder did not reopen '+width+' '+await p.locator('#count').innerText());
 if(await p.locator('.speech .missing button').count()!==5)throw Error('Equipment reminder incomplete');
 await p.reload();await p.getByRole('button',{name:'Продолжить',exact:true}).click();
 if(!await p.locator('.speech').isVisible()||await p.locator('.speech .missing button').count()!==5)throw Error('Saved equipment reminder missing');
 console.log('PASS',width,'initial fit, open speech, pinch, fit reset, reminder after 7 finds and reload');await p.close();
}
}finally{if(b)await b.close();if(s)s.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
