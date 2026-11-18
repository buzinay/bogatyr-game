const fs=require('node:fs');
const path=require('node:path');

function signature(bytes){
  let hash=2166136261;
  for(const byte of bytes)hash=Math.imul(hash^byte,16777619);
  return hash>>>0;
}
const folder=path.join(__dirname,'../dist/assets/audio');
const known=Object.fromEntries(fs.readdirSync(folder).filter(file=>file.endsWith('.wav')).map(file=>
  [signature(fs.readFileSync(path.join(folder,file))),file]));

async function traceAudio(page,{fallback=false}={}){
  await page.addInitScript(({known,hashSource,fallback})=>{
    const hash=Function('return ('+hashSource+')')();
    window.played=[];
    window.playing=new Set();
    window.audioEvents=[];
    const record=(file,source,duration)=>{
      window.played.push(file);
      window.audioEvents.push({file,time:performance.now(),duration});
      window.playing.add(source);
      source.addEventListener('ended',()=>window.playing.delete(source),{once:true});
    };
    const htmlPlay=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){
      this.addEventListener('playing',()=>record(new URL(this.src).pathname.split('/').pop(),this,this.duration),{once:true});
      this.addEventListener('pause',()=>window.playing.delete(this),{once:true});
      return htmlPlay.call(this);
    };
    if(fallback){
      window.AudioContext=window.webkitAudioContext=undefined;
      return;
    }
    const labels=new WeakMap(),decode=BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData=function(bytes){
      const file=known[hash(new Uint8Array(bytes))];
      return decode.call(this,bytes).then(buffer=>{labels.set(buffer,file);return buffer;});
    };
    const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(when,offset,duration){
      const result=start.call(this,when,offset,duration);
      record(labels.get(this.buffer),this,duration);
      return result;
    };
  },{known,hashSource:signature.toString(),fallback});
}
module.exports={traceAudio};
