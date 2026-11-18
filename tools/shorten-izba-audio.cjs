// Produce short WAV copies with Chrome's built-in decoder; originals stay intact.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{let server,browser;try{
 const scene=process.argv[2]||'izba';
 if(scene!=='forest'){
  server=spawn(process.execPath,['tools/serve.cjs'],{env:{...process.env,BOGATYR_PORT:'4194'},windowsHide:true});
  await new Promise(r=>server.stdout.once('data',r));
 }
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage();
 if(server)await page.goto('http://127.0.0.1:4194/');
 const configPath=path.resolve('dist/config/'+scene+'.json'),config=JSON.parse(fs.readFileSync(configPath));
 const credits=scene==='forest'
  ?new Map([...fs.readFileSync('AUDIO_CREDITS.md','utf8').matchAll(/^\| `([a-z_\d]+)`[^|]*\| `([^\r\n`]+)`/gm)].map(([,id,file])=>[id,file]))
  :null;
 for(const [id,item]of Object.entries(config.items)){
  if(!item.sound||(!credits&&item.sound.endsWith('-short.wav')))continue;
  const original=credits?fs.readFileSync(path.join('Звуки',credits.get(id))).toString('base64'):null;
  const pcm=await page.evaluate(async ({file,original})=>{
   const ctx=new AudioContext({sampleRate:24000});
   const data=original?Uint8Array.from(atob(original),c=>c.charCodeAt(0)).buffer:await (await fetch(file)).arrayBuffer();
   const buffer=await ctx.decodeAudioData(data);
   const length=Math.min(buffer.length,Math.floor(buffer.sampleRate*2)),channels=buffer.numberOfChannels,samples=[];
   for(let i=0;i<length;i++){
    let value=0;for(let c=0;c<channels;c++)value+=buffer.getChannelData(c)[i]/channels;
    samples.push(Math.round(Math.max(-1,Math.min(1,value))*32767));
   }
   await ctx.close();return {rate:buffer.sampleRate,samples};
  },{file:item.sound,original});
  const wav=Buffer.alloc(44+pcm.samples.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(pcm.rate,24);wav.writeUInt32LE(pcm.rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);pcm.samples.forEach((v,i)=>wav.writeInt16LE(v,44+i*2));
  const file='assets/audio/'+id+'-short.wav';fs.writeFileSync(path.join('dist',file),wav);console.log(id,wav.length,'bytes');item.sound=file;
 }
 fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
}finally{if(browser)await browser.close();if(server)server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
