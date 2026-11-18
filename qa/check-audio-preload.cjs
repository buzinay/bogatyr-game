const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {spawn}=require('node:child_process');
const {traceAudio}=require('./audio-probe.cjs');
(async()=>{let b,s;try{
s=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4195'},windowsHide:true});await new Promise(r=>s.stdout.once('data',r));
b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const p=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const requests=[];
p.on('request',request=>{const file=new URL(request.url()).pathname.split('/').pop();if(file.endsWith('.wav'))requests.push(file);});
await traceAudio(p);
await p.goto('http://127.0.0.1:4195/');await p.getByRole('button',{name:'Начать поход',exact:true}).click();
const ids=['chainmail','helmet','belt','ring','boots','gusli','cup'];
const expected=[...ids.map(id=>id+'-short.wav'),'mixkit-fast-small-sweep-transition-166.wav'].sort().join(',');
if(requests.slice().sort().join(',')!==expected)throw Error('Expected only Izba audio and the success effect: '+requests);
for(const id of ids){
 const before=await p.evaluate(()=>window.audioEvents.length);
 await p.locator(`.target[data-id="${id}"]`).dispatchEvent('pointerenter',{pointerType:'mouse'});
 await p.waitForFunction(({before,id})=>window.audioEvents.slice(before).some(event=>event.file===id+'-short.wav'),{before,id});
 const result=await p.evaluate(()=>window.audioEvents.at(-1));
 if(result.duration>2.001)throw Error('Long audio '+id);
}
await p.waitForFunction(()=>window.playing.size===0,{},{timeout:3000});
if(requests.slice().sort().join(',')!==expected)throw Error('Audio downloaded again during playback');
console.log('PASS: eight Izba audio requests, seven short clips decoded, cached once and stopped.');
}finally{if(b)await b.close();if(s)s.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
