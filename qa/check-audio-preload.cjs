const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');
(async()=>{let b,s;try{
s=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4195'},windowsHide:true});await new Promise(r=>s.stdout.once('data',r));
b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const p=await b.newPage({viewport:{width:390,height:844},hasTouch:true});
await p.addInitScript(()=>{window.clips=[];const NativeAudio=Audio;window.Audio=function(...args){const a=new NativeAudio(...args);window.clips.push(a);return a;};});
await p.goto('http://127.0.0.1:4195/');await p.getByRole('button',{name:'Начать поход',exact:true}).click();
await p.waitForFunction(()=>window.clips.length===19&&window.clips.every(a=>a.readyState===4));
for(const id of ['chainmail','helmet','belt','ring','boots','gusli','cup']){
 const result=await p.evaluate(async id=>{
  const a=window.clips.find(a=>a.src.includes('/'+id+'-short.wav'));const start=performance.now();
  const played=new Promise(resolve=>a.addEventListener('playing',()=>resolve(performance.now()-start),{once:true}));
  document.querySelector('#bogatyr-game').shadowRoot.querySelector(`.target[data-id="${id}"]`).dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}));
  return {delay:await played,duration:a.duration};
 },id);
 if(result.duration>2.001)throw Error('Long audio '+id);console.log(id,JSON.stringify(result));
}
await p.locator('.target[data-id="cup"]').focus();await p.keyboard.press('Enter');await p.waitForTimeout(2200);
if(!await p.evaluate(()=>window.clips.every(a=>a.paused)))throw Error('Audio still playing');
if(await p.evaluate(()=>window.clips.length)!==19)throw Error('Audio elements recreated');
console.log('PASS: seven short files preloaded, reused and stopped.');
}finally{if(b)await b.close();if(s)s.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
