// Copy artist-provided audio unchanged; update configuration and documentation.
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const files=fs.readdirSync(path.join(base,'Звуки'));
const ids={chainmail:'284809',helmet:'266303',belt:'350430',ring:'871',boots:'420849',gusli:'564684',cup:'105939',sword:'1485',saber:'1487',sabre:'1487',spear:'432148',shield:'7118',horse:'85',reins:'46399',rein:'46399',plough:'27585',sun:'2344',mace:'820',raspberry_1:'383725',raspberry_2:'383725',oak:'482874',bear:'191995',nightingale:'605',raven:'14440',sirin:'451643',wolf:'1773',snake:'95241',gorynych:'390285'};
const match=id=>files.find(f=>new RegExp('-'+ids[id]+'\\.(mp3|wav)$','i').test(f));
for(const id of Object.keys(ids))if(!match(id))throw Error('Missing audio: '+id);
const configPath=path.join(base,'dist/config/izba.json');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
fs.mkdirSync(path.join(base,'dist/assets/audio'),{recursive:true});
for(const id of Object.keys(config.items)){
  const file=match(id);fs.copyFileSync(path.join(base,'Звуки',file),path.join(base,'dist/assets/audio',file));
  config.items[id].sound='assets/audio/'+file;
}
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
const credits=path.join(base,'AUDIO_CREDITS.md');
let text=fs.readFileSync(credits,'utf8');
text=text.split('\n').map(line=>{
  const id=line.match(/^\| `([^`]+)`/);if(!id||!ids[id[1]])return line;
  const cells=line.split('|');cells[2]=' `'+match(id[1])+'` ';cells[6]=' — (дата скачивания не указана) ';
  return cells.join('|');
}).join('\n');
text=text.replace('Пока звуковые файлы не подключены.','Звуки семи предметов избы подключены из локальной папки dist/assets/audio. Воспроизведение ограничено двумя секундами.');
fs.writeFileSync(credits,text);
const app=path.join(base,'dist/app.js');
fs.writeFileSync(app,fs.readFileSync(app,'utf8').replace('Звуков в этой версии пока нет.','Наведи курсор или нажми на предмет, чтобы услышать его звук.'));
const html=path.join(base,'dist/index.html');fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace('app.js?v=izba-4','app.js?v=izba-audio-1'));
console.log('Verified '+Object.keys(ids).length+' artifact mappings; connected 7 scene sounds.');
