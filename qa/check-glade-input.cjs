const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const {spawn}=require('node:child_process');const fs=require('node:fs');
const cfg=JSON.parse(fs.readFileSync('dist/config/glade.json'));
(async()=>{let b,s;try{
s=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4198'},windowsHide:true});await new Promise(r=>s.stdout.once('data',r));b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const width of [390,1366]){
const p=await b.newPage({viewport:{width,height:844},hasTouch:true});await p.goto('http://127.0.0.1:4198/');
await p.evaluate(()=>{const ids=['chainmail','helmet','belt','ring','boots','gusli','cup'];localStorage.setItem('bogatyr-game:izba:v1',JSON.stringify({schemaVersion:2,foundIds:ids,equippedIds:ids.slice(0,5),screen:'glade',soundEnabled:false,weaponChoice:null,weaponLocked:false}));});await p.reload();await p.getByRole('button',{name:'Продолжить',exact:true}).click();await p.locator('#speech-close').click();
if(width===390){
 const initial=await p.locator('#stage').boundingBox(),c=await p.context().newCDPSession(p),x=width/2,y=initial.y+initial.height/2;
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
 await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-90,y,id:1},{x:x+90,y,id:2}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 if((await p.locator('#stage').boundingBox()).width<initial.width*2)throw Error('Glade pinch');if(await p.locator('#card').isVisible())throw Error('Pinch opened card');await p.locator('#zoom-toggle').click();await p.waitForTimeout(450);
}
for(const id of ['rein','horse','sword','sabre','spear','mace','shield','plough','sun','raspberry_1','raspberry_2']){
 const bounds=await p.locator('#stage').boundingBox(),scale=bounds.width/1600;
 const polygons=[...cfg.hitAreas[id]].sort((a,b)=>(b[1][0]-b[0][0])-(a[1][0]-a[0][0]));let clicked=false;
 for(const poly of polygons.slice(0,20)){
  const x=bounds.x+(poly[0][0]+poly[1][0])/2*scale,y=bounds.y+(poly[0][1]+poly[2][1])/2*scale;
  if(width===390)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);
  if(await p.locator('#card').isVisible()){clicked=true;break;}
 }
 if(!clicked)throw Error('Cannot tap visible '+id+' at '+width);
 if(id==='sword'){await p.locator('#equip').click();if(await p.locator('[data-carried="sword"]').count()!==1)throw Error('Early weapon selection');}
 await p.locator('#card-close').click();await p.waitForTimeout(90);
}
if(await p.locator('#count').innerText()!=='Найдено: 11/11')throw Error('Tap counts');if(await p.locator('.horse-ready').count()!==1)throw Error('Reverse horse order');
if(!await p.locator('.speech').isVisible())throw Error('Completion reminder');
console.log('PASS',width,'all 11 visible hit areas with '+(width===390?'finger taps; pinch':'mouse clicks')+', reverse horse order, muted audio, completion reminder');await p.close();
}
}finally{if(b)await b.close();if(s)s.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
