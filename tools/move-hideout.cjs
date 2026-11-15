// Moves/resizes delivery configuration only; never alters the artist's source files.
const fs=require('node:fs');
const path=require('node:path');
const file=path.resolve(__dirname,'../dist/config/izba.json');
const [id,dxText,dyText,factorText='1']=process.argv.slice(2);
const dx=Number(dxText),dy=Number(dyText),factor=Number(factorText);
const config=JSON.parse(fs.readFileSync(file,'utf8'));
if(!config.items[id]||dxText===undefined||dyText===undefined||![dx,dy,factor].every(Number.isFinite)||factor<=0){
  console.error('Usage: node tools/move-hideout.cjs ring 30 -10 [scale=1]');process.exit(1);
}
const sprites=config.items[id].hidden;
const anchorX=Math.min(...sprites.map(s=>s.x)),anchorY=Math.min(...sprites.map(s=>s.y));
const transform=([x,y])=>[Math.round(anchorX+(x-anchorX)*factor+dx),Math.round(anchorY+(y-anchorY)*factor+dy)];
for(const s of sprites){const [x,y]=transform([s.x,s.y]);const width=Math.round(s.width*factor),height=Math.round(s.height*factor);if(x<0||y<0||x+width>config.canvas.width||y+height>config.canvas.height){console.error('The object would extend beyond the scene. Configuration was not changed.');process.exit(1);}Object.assign(s,{x,y,width,height});}
config.hitAreas[id]=config.hitAreas[id].map(poly=>poly.map(transform));
fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
console.log('Updated',id,'in dist/config/izba.json. Worn equipment positions were not changed.');
